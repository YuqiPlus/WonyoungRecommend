import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { escapeHTML as esc } from './build-timeline.mjs';

export const groups = { izone: 'IZ*ONE', ive: 'IVE' };
export const markets = { kr: '韩专', jp: '日专' };
export const cardTypes = { album: '专辑卡', special: '特殊卡种', benefit: '店铺 / 活动特典' };
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function https(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid source URL');
}
export function validatePhotocards(data) {
  if (!validDate(data.updated) || !data.boards || !Array.isArray(data.albums) || !data.albums.length) throw new Error('Invalid photocard archive');
  for (const board of Object.values(data.boards)) {
    if (!/^[a-z0-9-]+\.jpg$/.test(board.asset || '') || !board.author?.trim() || !board.note?.trim() || !['personal', 'configuration'].includes(board.kind) || !Number.isInteger(board.width) || board.width < 1 || !Number.isInteger(board.height) || board.height < 1) throw new Error('Invalid board');
    https(board.url); https(board.source);
  }
  const ids = new Set();
  for (const album of data.albums) {
    if (!/^[a-z0-9-]+$/.test(album.id || '') || ids.has(album.id)) throw new Error('Invalid or duplicate album ID');
    ids.add(album.id);
    if (!validDate(album.date) || album.date < '2018-01-01' || !['released', 'announced'].includes(album.status) || (album.status === 'released' && album.date > data.updated) || (album.status === 'announced' && album.date <= data.updated)) throw new Error(`Invalid release date: ${album.id}`);
    if (!Object.hasOwn(groups, album.era) || !Object.hasOwn(markets, album.market) || (album.board !== null && !Object.hasOwn(data.boards, album.board)) || !Number.isFinite(album.focus) || album.focus < 0 || album.focus > 100) throw new Error(`Invalid classification: ${album.id}`);
    for (const field of ['title', 'summary', 'note']) if (typeof album[field] !== 'string' || !album[field].trim()) throw new Error(`Missing ${field}: ${album.id}`);
    if (!album.rows?.length || !album.sources?.length || !Array.isArray(album.tags)) throw new Error(`Missing records: ${album.id}`);
    for (const row of album.rows) {
      if (!row.label?.trim() || !Object.hasOwn(cardTypes, row.category) || (row.count !== null && (!Number.isInteger(row.count) || row.count < 1)) || (album.status === 'announced' && row.count !== null)) throw new Error(`Invalid card count: ${album.id}`);
    }
    for (const source of album.sources) { if (!source.label?.trim()) throw new Error('Missing source label'); https(source.url); }
  }
  return data;
}
export function countCards(rows) {
  return { known: rows.reduce((sum, row) => sum + (row.count ?? 0), 0), pending: rows.filter(row => row.count === null).length };
}
const external = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
function albumCard(album, data) {
  const board = album.board ? data.boards[album.board] : null;
  const kind = board?.kind || 'pending';
  const src = board ? `./assets/photocards/${board.asset}` : '';
  const search = [album.title, album.date, groups[album.era], markets[album.market], ...album.tags, ...album.rows.map(row => row.label)].join(' ');
  const stats = Object.keys(cardTypes).map(type => {
    const rows = album.rows.filter(row => row.category === type);
    const count = countCards(rows);
    return `<div><dt>${cardTypes[type]}</dt><dd>${!rows.length ? '<span>未录入</span>' : count.known ? `${count.known}<small> 款${count.pending ? ' + 待核' : ''}</small>` : '<span>待核</span>'}</dd></div>`;
  }).join('');
  const table = Object.entries(cardTypes).filter(([type]) => album.rows.some(row => row.category === type)).map(([type, label]) => `<tbody><tr class="pc-table-group"><th colspan="2" scope="colgroup">${label}</th></tr>${album.rows.filter(row => row.category === type).map(row => `<tr data-card-row data-category="${type}" data-label="${esc(row.label)}" data-count="${row.count ?? ''}"><th scope="row">${esc(row.label)}${row.note ? `<small>${esc(row.note)}</small>` : ''}</th><td>${row.count === null ? '<span class="pc-pending">待核</span>' : `${row.count} 款`}</td></tr>`).join('')}</tbody>`).join('');
  return `<article class="pc-card" id="${album.id}" data-pc-album data-era="${album.era}" data-market="${album.market}" data-date="${album.date}" data-status="${album.status}" data-board="${kind}" data-title="${esc(album.title)}" data-search="${esc(search)}">
    <div class="pc-card-heading"><span>${groups[album.era]} <i>／</i> ${markets[album.market]}</span><time datetime="${album.date}">${album.date.replaceAll('-', '.')}</time></div>
    ${board ? `<a class="pc-board" href="${src}" target="_blank" rel="noopener" data-open-board data-title="${esc(album.title)}" data-author="${esc(board.author)}" data-source="${esc(board.source)}" data-note="${esc(board.note)}"><img src="${src}" alt="${esc(album.title)} · ${kind === 'personal' ? '张元英小卡图板' : '官方全员特典配置图'}，点击查看完整原图" width="${board.width}" height="${board.height}" loading="lazy" decoding="async" style="object-position:50% ${album.focus}%"><span class="pc-board-badge">${kind === 'personal' ? '元英个人图板' : '全员特典配置'}</span><span class="pc-board-open">查看完整图板 ⤢</span></a>` : `<div class="pc-board pc-board-missing"><span class="pc-board-badge">${album.status === 'announced' ? '预售中 · 数量待核' : '个人图板待补'}</span><span aria-hidden="true">✧</span><strong>${esc(album.title)}</strong><small>${album.status === 'announced' ? '等新的卡面，慢慢揭晓。' : '把空位留给，下一次相遇。'}</small></div>`}
    <div class="pc-card-body"><div class="pc-album-title"><h2>${esc(album.title)}</h2><a href="#${album.id}" aria-label="定位 ${esc(album.title)}">#</a></div><p class="pc-summary">${esc(album.summary)}</p>${album.status === 'announced' ? '<p class="pc-announced">尚未发售 · 日期为预定发售日</p>' : ''}<dl class="pc-card-stats">${stats}</dl><p class="pc-count-label">本页已列数量 · 按卡面款式计</p>
    <details class="pc-details"><summary>版本明细与数量 <span>${album.rows.length} 项</span></summary><table><caption class="sr-only">${esc(album.title)} 张元英个人小卡统计</caption><thead><tr><th scope="col">版本 / 卡种</th><th scope="col">款数</th></tr></thead>${table}</table></details>
    <details class="pc-details pc-evidence"><summary>图板署名与资料来源</summary><p>${esc(album.note)}</p>${board ? `<p>${esc(board.note)}</p><p>图板：${esc(board.author)}<br>${external(board.source, '查看原始发布 / 存档')} · ${external(board.url, '原始图片')}</p>` : ''}<ul>${album.sources.map(source => `<li>${external(source.url, source.label)}</li>`).join('')}</ul></details>${board ? `<p class="pc-credit">${kind === 'configuration' ? '官方配置图' : '图板整理'} · ${external(board.source, board.author)}</p>` : ''}</div>
  </article>`;
}
export function renderPhotocards(data, template) {
  validatePhotocards(data);
  const albums = [...data.albums].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const values = {
    TOTAL: albums.length,
    PERSONAL: albums.filter(album => data.boards[album.board]?.kind === 'personal').length,
    UPDATED: data.updated.replaceAll('-', '.'),
    YEARS: [...new Set(albums.map(album => album.date.slice(0, 4)))].map(year => `<option value="${year}">${year} 年</option>`).join(''),
    ALBUMS: albums.map(album => albumCard(album, data)).join('\n')
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Unknown template variable: ${key}`);
    return values[key];
  });
}
async function main() {
  const data = JSON.parse(await readFile(new URL('../content/photocards.json', import.meta.url), 'utf8'));
  validatePhotocards(data);
  for (const board of Object.values(data.boards)) await access(new URL(`../site/assets/photocards/${board.asset}`, import.meta.url));
  const template = await readFile(new URL('../content/photocards-template.html', import.meta.url), 'utf8');
  await writeFile(new URL('../site/photocards.html', import.meta.url), renderPhotocards(data, template));
  console.log(`Photocards generated: ${data.albums.length} releases, ${Object.keys(data.boards).length} source boards.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
