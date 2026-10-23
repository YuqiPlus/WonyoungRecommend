import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCatalog, documentsFor, trackRevisions, renderDiscovery, validateCatalog } from '../build-discovery.mjs';
import { prepareSearch, searchDocuments, normalizeSearch } from '../../site/search-model.mjs';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [home, timeline, photocards, brands, search, siteUpdates] = await Promise.all([
  read('content/home-template.html'), read('content/timeline.json'), read('content/photocards.json'), read('content/brands.json'), read('content/search-template.html'), read('content/site-updates.json')
]);
const catalog = await buildCatalog({ picks: home, timeline, photocards, brands }, JSON.parse(siteUpdates));
const prepared = prepareSearch(catalog.documents);

test('all four catalogs are searchable and dates preserve their actual meaning', () => {
  const counts = { picks: 6, timeline: JSON.parse(timeline).entries.length, photocards: JSON.parse(photocards).albums.length, brands: JSON.parse(brands).brands.reduce((sum, brand) => sum + brand.events.length, 0) };
  for (const [type, total] of Object.entries(counts)) assert.equal(catalog.documents.filter(doc => doc.type === type).length, total);
  for (const doc of catalog.documents) assert.ok(doc.url.startsWith('./'));
  const planned = catalog.documents.find(doc => doc.id === 'photocards:looks-can-kill');
  assert.equal(planned.dateLabel, JSON.parse(photocards).albums.find(album => album.id === 'looks-can-kill').status === 'announced' ? '预定发售' : '专辑发行');
  assert.equal(planned.date, '2026-10-26');
  assert.equal(planned.addedAt, '2026-10-15');
  assert.equal(catalog.documents.find(doc => doc.id === 'timeline:2018-produce48-introduction').addedAt, '2026-10-14');
  assert.ok(catalog.updates.some(update => update.id === 'site-search'));
});

test('search handles exact titles, aliases, accents, Korean and compound Chinese queries', () => {
  assert.equal(searchDocuments(prepared, { q: 'IVE SWITCH' }).results[0].id, 'photocards:ive-switch');
  assert.equal(searchDocuments(prepared, { q: 'wave' }).results[0].id, 'photocards:wave');
  assert.ok(searchDocuments(prepared, { q: 'Kerastase' }).results.some(doc => doc.title.includes('KÉRASTASE')));
  assert.ok(searchDocuments(prepared, { q: 'IZONE', type: 'photocards' }).results.length > 0);
  assert.ok(searchDocuments(prepared, { q: '살롱드립' }).results.length > 0);
  const subtitles = searchDocuments(prepared, { q: 'B站中字' }).results;
  assert.ok(subtitles.length > 0);
  assert.ok(subtitles.every(doc => doc.keywords.includes('Bilibili') && doc.keywords.includes('中字')));
  assert.ok(searchDocuments(prepared, { q: '2024综艺' }).results.every(doc => doc.year === '2024'));
  assert.equal(normalizeSearch('I’VE / IZ*ONE'), normalizeSearch('IVE IZONE'));
});

test('combined filters, facet counts and sorting are consistent and deterministic', () => {
  const found = searchDocuments(prepared, { q: '2024', type: 'photocards', year: '2024' });
  assert.equal(found.results.length, 2);
  assert.ok(found.counts.timeline > 0);
  assert.equal(found.counts.all, Object.keys(found.counts).filter(key => key !== 'all').reduce((sum, key) => sum + found.counts[key], 0));
  assert.equal(searchDocuments(prepared, { q: 'not-a-real-program-name' }).results.length, 0);
  const oldest = searchDocuments(prepared, { sort: 'oldest' }).results;
  assert.equal(oldest[0].year, '2018');
  const updated = searchDocuments(prepared, { sort: 'updated' }).results;
  assert.ok(updated.every((doc, i) => !i || updated[i - 1].updatedAt >= doc.updatedAt));
  assert.deepEqual(searchDocuments(prepareSearch([...catalog.documents].reverse()), { q: 'Miu Miu' }).results, searchDocuments(prepared, { q: 'Miu Miu' }).results);
});

test('brand results open the historical evidence date instead of a later role', () => {
  const dyson = searchDocuments(prepared, { q: '戴森', year: '2025' }).results;
  assert.equal(dyson.length, 1);
  assert.equal(new URL(dyson[0].url, 'https://20040831.xyz/').searchParams.get('asof'), '2025-04-08');
  assert.match(dyson[0].summary, /韩国美发设备大使/);
  assert.doesNotMatch(dyson[0].summary, /亚太美发设备大使/);
});

test('revision tracking ignores rebuilds and reordering, retains additions, edits and removals', () => {
  const one = { id: 'old', record: { title: 'Old program', date: '2018-01-01' } };
  const two = { id: 'new', record: { title: 'Another program', date: '2020-01-01' } };
  const revisions = [
    { date: '2026-10-14', type: 'timeline', documents: [one] },
    { date: '2026-10-15', type: 'timeline', documents: [two, { ...one, record: { date: '2018-01-01', title: 'Old program' } }] },
    { date: '2026-10-16', type: 'timeline', documents: [one, two] },
    { date: '2026-10-23', type: 'timeline', documents: [{ ...one, record: { ...one.record, title: 'Corrected program' } }] }
  ];
  const tracked = trackRevisions(revisions);
  assert.equal(tracked.changes.length, 3);
  assert.deepEqual(tracked.metadata.get('old'), { addedAt: '2026-10-14', updatedAt: '2026-10-23', revisionDates: ['2026-10-14', '2026-10-23'] });
  assert.deepEqual(tracked.changes[2].modified, ['old']);
  assert.deepEqual(tracked.changes[2].removed, ['new']);
  assert.deepEqual(tracked.changes[0].added, ['old']);
});

test('all source destinations are rendered without JavaScript and unsafe content stays text', () => {
  const html = renderDiscovery(catalog, home, search);
  assert.equal((html.search.match(/data-result-id="/g) || []).length, catalog.documents.length);
  assert.equal((html.home.match(/class="update-card"/g) || []).length, 6);
  assert.match(html.home, /id="home-search"/);
  assert.match(html.home, /id="pick-love-dive"/);
  assert.doesNotMatch(html.home + html.search, /\{\{[A-Z_]+\}\}/);
  const value = structuredClone(catalog);
  value.documents[0].title = '</script><img src=x onerror="alert(1)">';
  const safe = renderDiscovery(value, home, search).search;
  assert.doesNotMatch(safe, /<img src=x/);
  const embedded = safe.match(/<script type="application\/json" id="global-search-data">(.*?)<\/script>/s)[1];
  assert.doesNotMatch(embedded, /</);
  assert.ok(JSON.parse(embedded).some(doc => doc.title === value.documents[0].title));
  assert.equal(documentsFor('picks', home).length, 6);
});

test('duplicate IDs, invalid revision dates and external destinations fail validation', () => {
  for (const mutate of [
    docs => { docs.push(structuredClone(docs[0])); },
    docs => { docs[0].url = 'javascript:alert(1)'; },
    docs => { docs[0].url = 'https://external.example/'; },
    docs => { docs[0].updatedAt = '2026-02-30'; }
  ]) { const docs = structuredClone(catalog.documents); mutate(docs); assert.throws(() => validateCatalog(docs)); }
});
