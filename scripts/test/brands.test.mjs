import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderBrands } from '../build-brands.mjs';
import { brandSnapshot, validateBrands, shanghaiToday, contractEnd } from '../../site/brands-model.mjs';

const data = JSON.parse(readFileSync(new URL('../../content/brands.json', import.meta.url), 'utf8'));
const template = readFileSync(new URL('../../content/brands-template.html', import.meta.url), 'utf8');
const find = id => data.brands.find(brand => brand.id === id);
const official = { label: 'Official announcement', url: 'https://example.com/announcement', kind: 'official' };
const event = (date, kind, extras = {}) => ({ date, kind, role: 'Brand ambassador', scope: 'Korea', title: 'Public record', summary: 'A sourced record.', sources: [official], ...extras });
const example = events => ({ id: 'example', name: 'Example', category: 'fashion', tone: 'rose', aliases: [], note: 'Contract term is not inferred.', events });

test('all published brand records have dates, classifications and labelled public evidence', () => {
  validateBrands(data);
  assert.ok(data.brands.some(brand => brand.events.some(item => item.sources.some(source => source.kind === 'official'))));
  for (const category of ['fashion', 'beauty', 'jewelry', 'lifestyle']) assert.ok(data.brands.some(brand => brand.category === category));
  assert.equal(brandSnapshot(find('dior-appearance'), data.updated).state, 'appearance');
  assert.equal(brandSnapshot(find('innisfree'), data.updated).state, 'review');
  assert.equal(contractEnd(brandSnapshot(find('innisfree'), data.updated)), '未公开');
});

test('past snapshots preserve earlier roles and exclude later appointments and sources', () => {
  const before = brandSnapshot(find('dyson'), '2026-04-07');
  const after = brandSnapshot(find('dyson'), '2026-04-08');
  assert.equal(before.role, '韩国美发设备大使');
  assert.equal(before.events.length, 1);
  assert.equal(after.role, '亚太美发设备大使');
  assert.equal(after.events.length, 2);
  assert.equal(brandSnapshot(find('ugg'), '2026-09-16'), null);
  assert.equal(brandSnapshot(find('tommy-jeans'), '2025-01-01').role, '韩国广告模特');
});

test('180-day aging requests review without inventing an end or treating an appearance as renewal', () => {
  const brand = example([event('2026-01-01', 'appointment'), event('2026-06-29', 'appearance', { role: 'Event guest' })]);
  assert.equal(brandSnapshot(brand, '2026-06-30').state, 'recent');
  const older = brandSnapshot(brand, '2026-07-01');
  assert.equal(older.state, 'review');
  assert.equal(older.role, 'Brand ambassador');
  assert.equal(older.evidence.date, '2026-01-01');
  assert.equal(older.end, null);
  assert.equal(brandSnapshot(example([event('2026-06-29', 'appearance')]), '2026-06-30').state, 'appearance');
});

test('official ends persist through campaigns and appearances until a new explicit appointment', () => {
  const brand = example([event('2026-01-01', 'appointment'), event('2026-03-01', 'end'), event('2026-05-01', 'campaign'), event('2026-06-01', 'appearance'), event('2026-09-01', 'appointment', { role: 'New regional ambassador' })]);
  assert.equal(brandSnapshot(brand, '2026-02-28').state, 'recent');
  assert.equal(brandSnapshot(brand, '2026-03-01').state, 'ended');
  assert.equal(brandSnapshot(brand, '2026-08-31').state, 'ended');
  assert.equal(contractEnd(brandSnapshot(brand, '2026-08-31')), '已公告结束，具体日期未列');
  const reopened = brandSnapshot(brand, '2026-09-01');
  assert.equal(reopened.state, 'recent'); assert.equal(reopened.role, 'New regional ambassador'); assert.equal(reopened.end, null);
});

test('future effective dates and retroactive notices respect public knowledge at the selected date', () => {
  const scheduled = example([event('2026-01-01', 'appointment'), event('2026-03-01', 'end', { effectiveOn: '2026-04-01' })]);
  assert.equal(brandSnapshot(scheduled, '2026-03-31').state, 'ending');
  assert.equal(brandSnapshot(scheduled, '2026-04-01').state, 'ended');
  const futureStart = example([event('2026-02-01', 'appointment', { effectiveOn: '2026-03-01' })]);
  assert.equal(brandSnapshot(futureStart, '2026-02-28').state, 'announced');
  assert.equal(brandSnapshot(futureStart, '2026-03-01').state, 'recent');
  const retro = example([event('2026-01-01', 'appointment'), event('2026-03-01', 'end', { effectiveOn: '2026-02-15' })]);
  validateBrands({ ...data, brands: [retro] });
  assert.equal(brandSnapshot(retro, '2026-02-20').state, 'recent');
  assert.equal(brandSnapshot(retro, '2026-03-01').state, 'ended');
});

test('missing evidence, unverifiable ends, invalid chronology and unsafe URLs fail the build', () => {
  for (const mutate of [
    d => { d.brands.push(structuredClone(d.brands[0])); },
    d => { d.brands[0].events[0].date = '2026-02-30'; },
    d => { d.brands[0].events[0].date = '2099-01-01'; },
    d => { d.brands[0].events[0].sources = []; },
    d => { d.brands[0].events[0].sources[0].url = 'javascript:alert(1)'; },
    d => { d.brands[0].events[0].sources[0].url = 'https://user:secret@example.com/'; },
    d => { d.brands[0].events[0].kind = 'inferred-end'; },
    d => { d.brands[0].events[0].kind = 'end'; d.brands[0].events[0].sources[0].kind = 'media'; },
    d => { d.brands[0].events.push(structuredClone(d.brands[0].events[0])); },
    d => { d.brands[0].events[0].effectiveOn = '2026-13-01'; }
  ]) { const value = structuredClone(data); mutate(value); assert.throws(() => validateBrands(value)); }
});

test('static HTML retains every dated source with safe embedded data and no invented current status', () => {
  const html = renderBrands(data, template);
  assert.equal((html.match(/data-brand-id="/g) || []).length, data.brands.length);
  assert.equal((html.match(/class="brand-event" /g) || []).length, data.brands.reduce((sum, brand) => sum + brand.events.length, 0));
  assert.match(html, /不自动显示为“现任”/);
  assert.match(html, /官方发布/); assert.match(html, /媒体报道/);
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
  const injected = structuredClone(data); injected.brands[0].name = '</script><img src=x onerror="alert(1)">';
  const safe = renderBrands(injected, template);
  assert.doesNotMatch(safe, /<img src=x/);
  const raw = safe.match(/<script type="application\/json" id="brands-data">(.*?)<\/script>/s)[1];
  assert.doesNotMatch(raw, /</);
  assert.equal(JSON.parse(raw).brands[0].name, injected.brands[0].name);
  const ended = { ...data, brands: [example([event('2026-01-01', 'appointment'), event('2026-03-01', 'end', { effectiveOn: '2026-04-01' })])] };
  assert.match(renderBrands(ended, template), /data-brand-end>2026-04-01</);
});

test('today rolls over at midnight in Asia/Shanghai regardless of server timezone', () => {
  assert.equal(shanghaiToday(new Date('2026-10-14T15:59:59Z')), '2026-10-14');
  assert.equal(shanghaiToday(new Date('2026-10-14T16:00:00Z')), '2026-10-15');
});
