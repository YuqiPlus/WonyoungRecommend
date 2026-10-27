import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateAlbums, filterAlbums } from '../../site/albums-model.mjs';
import { renderAlbums } from '../build-albums.mjs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const data = JSON.parse(read('content/albums.json'));
const cards = JSON.parse(read('content/photocards.json'));
const template = read('content/albums-template.html');
const find = id => data.albums.find(album => album.id === id);

test('formal discography covers both groups and every existing Korean/Japanese comeback', () => {
  validateAlbums(data);
  assert.equal(data.albums.length, 24);
  assert.equal(data.albums.filter(album => album.era === 'izone').length, 9);
  assert.equal(data.albums.filter(album => album.era === 'ive').length, 15);
  assert.deepEqual(data.albums.map(album => album.id).sort(), cards.albums.map(album => album.id).sort());
  assert.equal(find('color-iz').date, '2018-10-29');
  assert.equal(find('looks-can-kill').date, '2026-10-26');
  assert.equal(cards.albums.find(album => album.id === 'looks-can-kill').status, 'released');
  assert.ok(cards.albums.find(album => album.id === 'looks-can-kill').rows.every(row => row.count === null));
});

test('track lists preserve standard editions, solo songs and Japanese edition differences', () => {
  assert.equal(find('revive').tracks.length, 12);
  assert.equal(find('revive').tracks[6].title, '8 (JANGWONYOUNG Solo)');
  assert.equal(find('looks-can-kill').tracks.length, 6);
  assert.equal(find('suki-to-iwasetai').date, '2019-02-06');
  assert.equal(find('suki-to-iwasetai').digitalDate, '2019-02-05');
  assert.equal(find('suki-to-iwasetai').tracks.length, 3);
  assert.deepEqual(find('suki-to-iwasetai').alternateEditions.map(edition => edition.tracks[2].title), ['猫になりたい', 'ダンスを思い出すまで']);
  assert.match(find('buenos-aires').note, /不代表任一张实体 CD/);
  assert.match(find('color-iz').note, /不含实体 CD 限定曲/);
});

test('cover assets are real local JPEGs and every release offers a sourced listening and video link', () => {
  for (const album of data.albums) {
    const image = readFileSync(new URL(`../../site/assets/albums/${album.cover.asset}`, import.meta.url));
    assert.equal(image.readUInt16BE(0), 0xffd8);
    assert.ok(image.length > 10000);
    assert.ok(album.listen.every(link => link.url.startsWith('https://music.apple.com/')));
    assert.ok(album.sources.some(link => link.url === album.listen[0].url));
    assert.ok(album.videos.every(video => video.url.includes('youtube.com/watch?v=')));
  }
});

test('combined filters and song queries find the intended album without duplicating prereleases', () => {
  assert.equal(filterAlbums(data.albums, { era: 'ive', market: 'jp', type: 'ep' }).length, 4);
  assert.equal(filterAlbums(data.albums, { era: 'izone', market: 'kr' }).length, 5);
  assert.equal(filterAlbums(data.albums, { year: '2024' }).length, 2);
  assert.equal(filterAlbums(data.albums, { type: 'album' }).length, 4);
  assert.equal(filterAlbums(data.albums, { q: 'JANGWONYOUNG Solo' })[0].id, 'revive');
  assert.equal(filterAlbums(data.albums, { q: 'IZONE FIESTA', market: 'kr' })[0].id, 'bloom-iz');
  assert.equal(filterAlbums(data.albums, { q: '猫になりたい' }).some(album => album.id === 'suki-to-iwasetai'), true);
  assert.equal(filterAlbums(data.albums, { q: 'a missing song title' }).length, 0);
  assert.equal(filterAlbums(data.albums, { order: 'oldest' })[0].id, 'color-iz');
  assert.equal(filterAlbums(data.albums)[0].id, 'looks-can-kill');
  assert.deepEqual(filterAlbums([...data.albums].reverse()), filterAlbums(data.albums));
});

test('all covers, tracks, source notes and crosslinks remain usable without client-side JavaScript', () => {
  const html = renderAlbums(data, template, cards);
  assert.equal((html.match(/data-album-id=/g) || []).length, 24);
  assert.match(html, /元英 SOLO/);
  assert.match(html, /Type B 数字版/);
  assert.match(html, /数字单曲、合作曲、OST、混音/);
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}|<iframe/);
  for (const album of data.albums) {
    assert.ok(html.includes(`href="./photocards.html#${album.id}"`));
    for (const track of album.tracks) assert.ok(html.includes(track.url.replaceAll('&', '&amp;')));
  }
  assert.equal(renderAlbums(data, '{{ALBUMS}}', { albums: [] }).includes('href="./photocards.html#'), false);
});

test('duplicate records, invalid dates, out-of-order tracks and unsafe assets/links fail validation', () => {
  for (const mutate of [
    d => d.albums.push(structuredClone(d.albums[0])),
    d => { d.albums[0].date = '2026-02-30'; },
    d => { d.albums[0].date = '2099-01-01'; },
    d => { d.albums[0].tracks[0].number = 2; },
    d => { d.albums[0].tracks = []; },
    d => { d.albums[0].tracks[0].duration = -10; },
    d => { d.albums[0].cover.asset = '../private.jpg'; },
    d => { d.albums[0].cover.url = 'javascript:alert(1)'; },
    d => { d.albums[0].sources[0].url = 'https://user:pass@example.com/'; },
    d => { d.albums[0].videos[0].url = 'https://www.youtube.com/watch?v=not-a-real-id'; },
    d => { d.albums[0].highlights = ['Not on this record']; }
  ]) { const value = structuredClone(data); mutate(value); assert.throws(() => validateAlbums(value)); }
});

test('album titles and embedded JSON cannot inject executable HTML', () => {
  const value = structuredClone(data);
  value.albums[0].title = '</script><img src=x onerror="alert(1)">';
  const html = renderAlbums(value, template, cards);
  assert.doesNotMatch(html, /<img src=x|<script>alert/);
  assert.match(html, /&lt;\/script&gt;/);
  const embedded = html.match(/<script type="application\/json" id="albums-data">(.*?)<\/script>/s)[1];
  assert.doesNotMatch(embedded, /</);
  assert.ok(JSON.parse(embedded).some(album => album.title === value.albums[0].title));
});
