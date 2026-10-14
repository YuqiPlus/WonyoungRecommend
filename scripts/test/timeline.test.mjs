import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateArchive, renderArchive, videoPlatform, videoCover, escapeHTML } from '../build-timeline.mjs';

const data = JSON.parse(readFileSync(new URL('../../content/timeline.json', import.meta.url), 'utf8'));
const template = readFileSync(new URL('../../content/timeline-template.html', import.meta.url), 'utf8');
const copy = () => structuredClone(data);

test('archive covers 2018–2026 with dated, sourced videos and both group eras', () => {
  validateArchive(data);
  assert.deepEqual([...new Set(data.entries.map(entry => entry.date.slice(0, 4)))].sort(), ['2018','2019','2020','2021','2022','2023','2024','2025','2026']);
  for (const era of ['beginning', 'izone', 'ive']) assert.ok(data.entries.some(entry => entry.era === era));
  for (const entry of data.entries) {
    assert.ok(entry.sources.some(source => source.url === entry.videos[0].url));
    for (const video of entry.videos) {
      const url = new URL(video.url);
      assert.ok(['www.youtube.com', 'www.bilibili.com'].includes(url.hostname));
      assert.ok(video.published <= data.updated);
    }
  }
});

test('invalid dates, duplicate records, missing evidence and unsafe links fail the build', () => {
  const changes = [
    d => { d.entries[0].date = '2023-02-29'; },
    d => { d.entries[0].date = '2099-01-01'; },
    d => { d.entries[0].dateType = 'recorded'; },
    d => { d.entries.push(structuredClone(d.entries[0])); },
    d => { d.entries[0].sources = []; },
    d => { d.entries[0].videos = []; },
    d => { d.entries[0].videos[0].url = 'javascript:alert(1)'; },
    d => { d.entries[0].sources[0].url = 'https://private:credential@example.com/'; },
    d => { d.entries[0].videos[0].channelId = ''; },
    d => { d.entries[0].videos[0].published = '2099-01-01'; }
  ];
  for (const change of changes) { const value = copy(); change(value); assert.throws(() => validateArchive(value)); }
});

test('all records and video links are readable in static HTML without player embeds', () => {
  const html = renderArchive(data, template);
  assert.equal((html.match(/data-timeline-entry /g) || []).length, data.entries.length);
  for (const entry of data.entries) {
    assert.ok(html.includes(`id="${entry.id}"`));
    for (const video of entry.videos) assert.ok(html.includes(`href="${escapeHTML(video.url)}"`));
  }
  assert.doesNotMatch(html, /<iframe|<video|\{\{[A-Z_]+\}\}/);
  assert.equal((html.match(/loading="lazy"/g) || []).length, data.entries.reduce((sum, entry) => sum + entry.videos.length, 0));
  assert.match(html, /referrerpolicy="no-referrer"/);
  assert.match(html, /data-timeline-controls hidden/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('cross-platform links retain attribution, actual format, subtitles and verified covers', () => {
  const pairs = data.entries.filter(entry => new Set(entry.videos.map(videoPlatform)).size === 2);
  assert.ok(pairs.length > 0);
  for (const entry of pairs) {
    for (const video of entry.videos.filter(video => videoPlatform(video) === 'bilibili')) {
      assert.match(videoCover(video), /^https:\/\/i[0-2]\.hdslb\.com\/bfs\/archive\//);
      assert.ok(entry.sources.some(source => source.url === video.url));
    }
  }
  const html = renderArchive(data, template);
  assert.match(html, /data-platforms="youtube bilibili"/);
  assert.match(html, /粉丝分享/);
  assert.match(html, /id="timeline-platform"/);
});

test('untrusted video hosts, malformed Bilibili pages and external thumbnail hosts are rejected', () => {
  const base = data.entries.flatMap(entry => entry.videos).find(video => videoPlatform(video) === 'bilibili');
  assert.ok(base);
  for (const change of [
    v => { v.url = 'https://www.youtube.com.evil.example/watch?v=12345678901'; },
    v => { v.url = 'https://www.bilibili.com/video/not-a-video/'; },
    v => { v.url += '?p=0'; },
    v => { v.thumbnail = 'https://tracking.example/image.jpg'; },
    v => { v.thumbnail = 'https://i0.hdslb.com.evil.example/bfs/archive/a.jpg'; },
    v => { v.sourceRole = 'official'; },
    v => { v.uploaderId = ''; },
    v => { v.subtitles = 'invented'; }
  ]) {
    const value = copy(); const video = structuredClone(base); change(video);
    value.entries[0].videos.push(video);
    assert.throws(() => validateArchive(value));
  }
});

test('archive text and search attributes cannot introduce HTML', () => {
  const value = copy();
  value.entries[0].title = '<img src=x onerror="alert(1)">';
  value.entries[0].summary = '</p><script>alert(2)</script>';
  const html = renderArchive(value, '{{ENTRIES}}');
  assert.doesNotMatch(html, /<img src=x|<script>alert/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test('input order does not change the published chronology', () => {
  const reversed = copy(); reversed.entries.reverse();
  const html = renderArchive(data, template);
  assert.equal(renderArchive(reversed, template), html);
  assert.ok(html.indexOf('id="2026-wonyoung-lying-interview"') < html.indexOf('id="2018-produce48-introduction"'));
});
