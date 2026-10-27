import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categories, eras, validateArchive, escapeHTML as esc } from './build-timeline.mjs';
import { validatePhotocards, cardTypes } from './build-photocards.mjs';
import { validateBrands, validDate, shanghaiToday, eventKinds } from '../site/brands-model.mjs';
import { searchTypes } from '../site/search-model.mjs';
import { validateAlbums, albumEras, albumMarkets, albumTypes, albumSearchText } from '../site/albums-model.mjs';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const pretty = date => date.replaceAll('-', '.');
const routes = { picks: './#watch', timeline: './timeline.html', albums: './albums.html', photocards: './photocards.html', brands: './brands.html' };
const sourceFiles = {
  picks: ['content/home-template.html', 'site/index.html'],
  timeline: ['content/timeline.json'], albums: ['content/albums.json'], photocards: ['content/photocards.json'], brands: ['content/brands.json']
};
const plain = text => String(text).replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, item => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' })[item]).trim();
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const fingerprint = doc => createHash('sha256').update(JSON.stringify(canonical(doc.record))).digest('hex');

export function documentsFor(type, source) {
  if (type === 'picks') {
    return [...source.matchAll(/<article class="video-card"[^>]*data-id="([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/article>/g)].map(([, id, html]) => {
      const title = plain(html.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] || '');
      const date = html.match(/<time datetime="(\d{4}-\d{2}-\d{2})"/)?.[1];
      const summary = plain(html.match(/<p>([\s\S]*?)<\/p>/)?.[1] || '');
      const subtitle = plain(html.match(/<div class="video-meta"><span>([\s\S]*?)<\/span>/)?.[1] || '');
      const publisher = plain(html.match(/class="video-source"[^>]*>([\s\S]*?)<\/a>/)?.[1] || '');
      const external = html.match(/class="video-cover [^"]*" href="([^"]+)"/)?.[1] || '';
      return { id: `picks:${id}`, type, title, subtitle, summary, date, year: date?.slice(0, 4), dateLabel: '视频 / 作品日期', url: `./#pick-${id}`, keywords: `张元英 Wonyoung 장원영 YouTube 官方 ${publisher}`, record: { title, date, summary, subtitle, publisher, external } };
    });
  }
  const data = typeof source === 'string' ? JSON.parse(source) : source;
  if (type === 'albums') return data.albums.map(album => ({
    id: `albums:${album.id}`, type, title: album.title, subtitle: `${albumEras[album.era]} · ${albumMarkets[album.market]} · ${albumTypes[album.type]}`,
    summary: `${album.summary} 附封面、${album.tracks.length} 首数字版曲目、官方收听与 MV。`,
    date: album.date, year: album.date.slice(0, 4), dateLabel: '专辑发行', url: `./albums.html?year=${album.date.slice(0, 4)}#${album.id}`,
    keywords: albumSearchText(album), record: album
  }));
  if (type === 'timeline') return data.entries.map(entry => ({
    id: `timeline:${entry.id}`, type, title: entry.title, subtitle: entry.episode, summary: entry.summary,
    date: entry.date, year: entry.date.slice(0, 4), dateLabel: entry.dateType === 'broadcast' ? '节目播出' : '视频发布',
    url: `./timeline.html?year=${entry.date.slice(0, 4)}#${entry.id}`,
    keywords: [entry.originalTitle, entry.participation, categories[entry.category], eras[entry.era], ...(entry.tags || []), ...entry.videos.flatMap(video => [video.publisher, video.url.includes('bilibili.com') ? '哔哩哔哩 B站 Bilibili' : 'YouTube', video.subtitles === 'zh' ? '中字 中文字幕' : ''])].join(' '), record: entry
  }));
  if (type === 'photocards') return data.albums.map(album => ({
    id: `photocards:${album.id}`, type, title: album.title, subtitle: `${album.era === 'ive' ? 'IVE' : 'IZ*ONE'} · ${album.market === 'kr' ? '韩专' : '日专'} · 小卡图鉴`,
    summary: `${album.summary} ${album.board ? data.boards[album.board].kind === 'personal' ? '附个人图板。' : '附官方全员特典配置图，个人图板待补。' : '个人图板待补。'}`,
    date: album.date, year: album.date.slice(0, 4), dateLabel: album.status === 'announced' ? '预定发售' : '专辑发行',
    url: `./photocards.html?year=${album.date.slice(0, 4)}#${album.id}`,
    keywords: [...album.tags, album.note, ...album.rows.flatMap(row => [row.label, cardTypes[row.category], row.note || ''])].join(' '), record: { album, board: album.board ? data.boards[album.board] : null }
  }));
  if (type === 'brands') return data.brands.flatMap(brand => brand.events.map(event => ({
    id: `brands:${brand.id}:${event.date}`, type, title: brand.name, subtitle: event.title,
    summary: `${event.summary} 来源身份：${event.role}；范围：${event.scope}。`,
    date: event.date, year: event.date.slice(0, 4), dateLabel: '资料公开 / 报道',
    url: `./brands.html?asof=${event.date}#${brand.id}`,
    keywords: [...brand.aliases, event.role, event.scope, eventKinds[event.kind], '张元英 Wonyoung 장원영'].join(' '),
    record: { name: brand.name, category: brand.category, aliases: brand.aliases, note: brand.note, event }
  })));
  throw new Error(`Unsupported source type: ${type}`);
}

export function trackRevisions(revisions) {
  let previous = new Map();
  const metadata = new Map();
  const changes = [];
  for (const revision of revisions) {
    if (!validDate(revision.date)) throw new Error('Invalid revision date');
    const current = new Map(revision.documents.map(doc => [doc.id, fingerprint(doc)]));
    const added = [], modified = [], removed = [];
    for (const [id, hash] of current) {
      const old = metadata.get(id);
      if (!previous.has(id)) added.push(id);
      else if (previous.get(id) !== hash) modified.push(id);
      else continue;
      metadata.set(id, { addedAt: old?.addedAt || revision.date, updatedAt: revision.date, revisionDates: [...new Set([...(old?.revisionDates || []), revision.date])] });
    }
    for (const id of previous.keys()) if (!current.has(id)) removed.push(id);
    if (added.length || modified.length || removed.length) changes.push({ date: revision.date, timestamp: revision.timestamp || revision.date, type: revision.type, added, modified, removed });
    previous = current;
  }
  return { metadata, changes };
}

async function git(args) { return (await run('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 })).stdout; }
async function historicSource(commit, paths) {
  for (const path of paths) {
    try { return await git(['show', `${commit}:${path}`]); } catch (error) { if (error.code !== 128) throw error; }
  }
  throw new Error('Missing content at a source revision');
}
export async function buildCatalog(currentSources, siteUpdates, today = shanghaiToday()) {
  if ((await git(['rev-parse', '--is-shallow-repository'])).trim() === 'true') throw new Error('Discovery needs full content history: use fetch-depth: 0 at checkout.');
  const documents = [], activities = [];
  for (const [type, paths] of Object.entries(sourceFiles)) {
    const log = (await git(['log', '--reverse', '--format=%H%x09%cI', '--', ...paths])).trim();
    const revisions = [];
    for (const line of log ? log.split('\n') : []) {
      const [commit, timestamp] = line.split('\t');
      const source = await historicSource(commit, paths);
      revisions.push({ type, timestamp, date: shanghaiToday(new Date(timestamp)), documents: documentsFor(type, source) });
    }
    const current = documentsFor(type, currentSources[type]);
    // Local previews can include uncommitted edits; an unchanged build adds no revision.
    revisions.push({ type, date: today, timestamp: `${today}T23:59:59+08:00`, documents: current });
    const tracked = trackRevisions(revisions);
    for (const doc of current) {
      const { record, ...publicDoc } = doc;
      documents.push({ ...publicDoc, ...tracked.metadata.get(doc.id) });
    }
    const currentIds = new Set(current.map(doc => doc.id));
    activities.push(...tracked.changes.map(change => ({ ...change, added: change.added.filter(id => currentIds.has(id)), modified: change.modified.filter(id => currentIds.has(id)) })).filter(change => change.added.length || change.modified.length || change.removed.length));
  }
  validateCatalog(documents);
  const updates = activities.map((change, index) => {
    const added = change.added.length, modified = change.modified.length, removed = change.removed.length;
    const title = [added ? `新增 ${added} 条` : '', modified ? `补充 ${modified} 条` : '', removed ? `整理移除 ${removed} 条` : ''].filter(Boolean).join('，');
    const ids = [...change.added, ...change.modified];
    const examples = ids.map(id => documents.find(doc => doc.id === id)).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).slice(0, 2)
      .map(doc => doc.type === 'brands' ? `${doc.title} · ${doc.subtitle}` : `${doc.title}${doc.type === 'timeline' ? ` · ${doc.subtitle}` : doc.dateLabel === '预定发售' ? '（预定发售）' : ''}`).join('；');
    return { id: `archive-${index}`, date: change.date, timestamp: change.timestamp, type: change.type, title: `${searchTypes[change.type]}：${title}`, summary: examples || '核对与整理已有资料，保留可访问的来源入口。', url: ids.length === 1 ? documents.find(doc => doc.id === ids[0]).url : routes[change.type] };
  });
  for (const entry of siteUpdates.entries) {
    if (!/^[a-z0-9-]+$/.test(entry.id || '') || !validDate(entry.date) || entry.date > today || !entry.title?.trim() || !entry.summary?.trim()) throw new Error('Invalid site update');
    validateLocalURL(entry.url);
    updates.push({ ...entry, type: 'site', timestamp: `${entry.date}T23:59:59+08:00` });
  }
  updates.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id));
  return { documents, updates };
}

function validateLocalURL(value) {
  const url = new URL(value, 'https://20040831.xyz/');
  if (!value.startsWith('./') || url.origin !== 'https://20040831.xyz' || !['/', '/timeline.html', '/albums.html', '/photocards.html', '/brands.html', '/search.html'].includes(url.pathname) || !/^#[a-z0-9-]*$|^$/.test(url.hash)) throw new Error('Invalid internal destination');
}
export function validateCatalog(documents) {
  const ids = new Set();
  for (const doc of documents) {
    if (!doc.id || ids.has(doc.id) || !Object.hasOwn(searchTypes, doc.type) || !doc.title?.trim() || !doc.summary?.trim() || !validDate(doc.date) || doc.year !== doc.date.slice(0, 4) || !validDate(doc.addedAt) || !validDate(doc.updatedAt) || !doc.revisionDates?.length || !doc.revisionDates.every(validDate)) throw new Error('Invalid catalog record');
    ids.add(doc.id); validateLocalURL(doc.url);
  }
  return documents;
}
export function renderResult(doc) {
  return `<article class="search-result" data-result-id="${esc(doc.id)}"><div class="search-result-meta"><span data-type="${doc.type}">${searchTypes[doc.type]}</span><span>${esc(doc.dateLabel)} <time datetime="${doc.date}">${pretty(doc.date)}</time></span></div><h2><a href="${esc(doc.url)}">${esc(doc.title)} <span aria-hidden="true">↗</span></a></h2><p class="search-result-subtitle">${esc(doc.subtitle)}</p><p class="search-result-summary">${esc(doc.summary)}</p><p class="search-result-updated">${doc.addedAt === doc.updatedAt ? '站内收录' : '站内更新'} <time datetime="${doc.updatedAt}">${pretty(doc.updatedAt)}</time></p></article>`;
}
export function renderDiscovery(catalog, homeTemplate, searchTemplate) {
  validateCatalog(catalog.documents);
  const sorted = [...catalog.documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const updateCard = update => `<article class="update-card"><div><span>${update.type === 'site' ? '站点新功能' : searchTypes[update.type]}</span><time datetime="${update.date}">${pretty(update.date)}</time></div><h3><a href="${esc(update.url)}">${esc(update.title)} <span aria-hidden="true">↗</span></a></h3><p>${esc(update.summary)}</p></article>`;
  const recent = catalog.updates.slice(0, 6);
  const values = {
    TOTAL: sorted.length,
    YEARS: [...new Set(sorted.map(doc => doc.year))].sort().reverse().map(year => `<option value="${year}">${year} 年</option>`).join(''),
    TYPES: Object.entries(searchTypes).map(([type, title]) => `<button type="button" data-search-type="${type}" aria-pressed="false">${title} <span data-facet="${type}">${sorted.filter(doc => doc.type === type).length}</span></button>`).join(''),
    RESULTS: sorted.map(renderResult).join('\n'),
    DATA: JSON.stringify(sorted).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'),
    UPDATES: recent.slice(0, 3).map(updateCard).join('\n'),
    OLDER_UPDATES: recent.length > 3 ? `<details class="updates-earlier"><summary>再看看更早的整理 <span>${recent.length - 3} 次更新</span></summary><div class="updates-grid">${recent.slice(3).map(updateCard).join('\n')}</div></details>` : ''
  };
  const render = template => template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key) => { if (!Object.hasOwn(values, key)) throw new Error(`Unknown template variable: ${key}`); return values[key]; });
  return { home: render(homeTemplate), search: render(searchTemplate) };
}
async function main() {
  const [home, timelineRaw, cardsRaw, brandsRaw, updatesRaw, search, albumsRaw] = await Promise.all([
    readFile(new URL('../content/home-template.html', import.meta.url), 'utf8'), readFile(new URL('../content/timeline.json', import.meta.url), 'utf8'),
    readFile(new URL('../content/photocards.json', import.meta.url), 'utf8'), readFile(new URL('../content/brands.json', import.meta.url), 'utf8'),
    readFile(new URL('../content/site-updates.json', import.meta.url), 'utf8'), readFile(new URL('../content/search-template.html', import.meta.url), 'utf8'),
    readFile(new URL('../content/albums.json', import.meta.url), 'utf8')
  ]);
  validateArchive(JSON.parse(timelineRaw)); validatePhotocards(JSON.parse(cardsRaw)); validateBrands(JSON.parse(brandsRaw)); validateAlbums(JSON.parse(albumsRaw));
  const catalog = await buildCatalog({ picks: home, timeline: timelineRaw, albums: albumsRaw, photocards: cardsRaw, brands: brandsRaw }, JSON.parse(updatesRaw));
  const rendered = renderDiscovery(catalog, home, search);
  await Promise.all([writeFile(new URL('../site/index.html', import.meta.url), rendered.home), writeFile(new URL('../site/search.html', import.meta.url), rendered.search)]);
  console.log(`Discovery generated: ${catalog.documents.length} searchable records, ${catalog.updates.length} dated site updates.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
