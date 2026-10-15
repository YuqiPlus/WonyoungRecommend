import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { countCards, validatePhotocards, renderPhotocards } from '../build-photocards.mjs';

const data = JSON.parse(readFileSync(new URL('../../content/photocards.json', import.meta.url), 'utf8'));
const template = readFileSync(new URL('../../content/photocards-template.html', import.meta.url), 'utf8');

test('both eras and markets have sourced release records with existing local boards', () => {
  validatePhotocards(data);
  for (const era of ['izone', 'ive']) for (const market of ['kr', 'jp']) assert.ok(data.albums.some(album => album.era === era && album.market === market));
  assert.equal(Math.min(...data.albums.map(album => Number(album.date.slice(0, 4)))), 2018);
  for (const board of Object.values(data.boards)) assert.ok(existsSync(new URL(`../../site/assets/photocards/${board.asset}`, import.meta.url)));
});

test('unknown counts stay pending and are not represented as zero or mixed with benefits', () => {
  assert.deepEqual(countCards([{ count: 5 }, { count: null }, { count: 2 }]), { known: 7, pending: 1 });
  const album = data.albums.find(album => album.id === 'lucid-dream');
  assert.deepEqual(countCards(album.rows.filter(row => row.category === 'album')), { known: 0, pending: 1 });
  assert.deepEqual(countCards(album.rows.filter(row => row.category === 'benefit')), { known: 4, pending: 0 });
  const html = renderPhotocards({ ...data, albums: [album] }, '{{ALBUMS}}');
  assert.match(html, /<dt>专辑卡<\/dt><dd><span>待核<\/span>/);
  assert.match(html, /data-board="configuration"/);
  assert.match(html, /全员特典配置/);
  assert.doesNotMatch(html, /<td>0 款/);
});

test('invalid counts, future release claims, duplicate IDs, unsafe sources and asset paths are rejected', () => {
  const mutations = [
    d => { d.albums.push(structuredClone(d.albums[0])); },
    d => { d.albums[0].rows[0].count = -1; },
    d => { d.albums[0].rows[0].count = 0; },
    d => { d.albums[0].rows[0].count = 1.5; },
    d => { d.albums[0].rows[0].category = 'all'; },
    d => { d.albums[0].date = '2020-02-30'; },
    d => { d.albums[0].date = '2099-01-01'; },
    d => { d.albums.find(album => album.status === 'announced').rows[0].count = 1; },
    d => { d.albums[0].sources[0].url = 'javascript:alert(1)'; },
    d => { d.boards.izone.source = 'https://secret:password@example.com/'; },
    d => { d.boards.izone.asset = '../private.jpg'; },
    d => { d.albums[0].board = 'nonexistent'; }
  ];
  for (const mutate of mutations) { const value = structuredClone(data); mutate(value); assert.throws(() => validatePhotocards(value)); }
});

test('all albums, counts, local full-size boards and credits are present without JavaScript', () => {
  const html = renderPhotocards(data, template);
  assert.equal((html.match(/data-pc-album /g) || []).length, data.albums.length);
  assert.equal((html.match(/data-card-row /g) || []).length, data.albums.reduce((sum, album) => sum + album.rows.length, 0));
  for (const album of data.albums) assert.ok(html.includes(`id="${album.id}"`));
  for (const board of Object.values(data.boards)) { assert.ok(html.includes(`href="./assets/photocards/${board.asset}"`)); assert.ok(html.includes(board.author)); }
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}|<iframe/);
  assert.match(html, /不代表完整全卡数量/);
  assert.match(html, /尚未发售/);
  const reverse = structuredClone(data); reverse.albums.reverse();
  assert.equal(renderPhotocards(reverse, template), html);
});

test('source text cannot inject HTML, attributes or executable image URLs', () => {
  const value = structuredClone(data);
  value.albums[0].title = '<img src=x onerror="alert(1)">';
  value.albums[0].rows[0].label = '</th><script>alert(1)</script>';
  value.boards.izone.author = '" onmouseover="alert(1)';
  const html = renderPhotocards(value, '{{ALBUMS}}');
  assert.doesNotMatch(html, /<img src=x|<script>alert|data-author="" onmouseover/);
  assert.match(html, /&lt;img src=x/);
});
