import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { escapeHTML as esc } from './build-timeline.mjs';
import { validateAlbums, albumEras, albumTypes, filterAlbums } from '../site/albums-model.mjs';

const external = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span></a>`;
const pretty = date => date.replaceAll('-', '.');
const duration = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
function tracklist(album, tracks = album.tracks) {
  return `<ol class="album-tracks">${tracks.map(track => `<li${track.title === '8 (JANGWONYOUNG Solo)' ? ' class="album-solo"' : ''}><span class="track-number" aria-hidden="true">${String(track.number).padStart(2, '0')}</span><div>${external(track.url, track.title)}${album.highlights.includes(track.title) ? '<small>主打</small>' : track.title === '8 (JANGWONYOUNG Solo)' ? '<small>元英 SOLO</small>' : ''}</div><span class="track-duration" aria-label="时长 ${Math.floor(track.duration / 60)} 分 ${track.duration % 60} 秒">${duration(track.duration)}</span></li>`).join('')}</ol>`;
}
function albumCard(album, photocards) {
  return `<article class="album-card" id="${album.id}" data-album-id="${album.id}">
    <div class="album-cover"><img src="./assets/albums/${album.cover.asset}" width="600" height="600" loading="lazy" decoding="async" alt="${esc(album.title)} · 数字版专辑封面"><span>${albumEras[album.era]} <i>／</i> ${album.market === 'kr' ? 'KR' : 'JP'}</span></div>
    <div class="album-body"><div class="album-meta"><time datetime="${album.date}">${pretty(album.date)}</time><span>${albumTypes[album.type]}</span></div><div class="album-title"><h2>${esc(album.title)}</h2><a href="#${album.id}" aria-label="定位 ${esc(album.title)}">#</a></div><p class="album-summary">${esc(album.summary)}</p><p class="album-highlights">从这里听起 <span>${album.highlights.map(esc).join(' · ')}</span></p>
    <div class="album-listen">${album.listen.map(link => external(link.url, link.label)).join('')}${photocards.has(album.id) ? `<a href="./photocards.html#${album.id}">元英小卡 <span aria-hidden="true">↗</span></a>` : ''}</div>
    <details class="album-details album-songbook"><summary>展开曲目 <span>${album.tracks.length} 首 · 数字版</span></summary><p class="album-edition">${esc(album.edition)}</p>${tracklist(album)}${album.alternateEditions.map(edition => `<details class="album-alternate"><summary>${esc(edition.label)} <span>${edition.tracks.length} 首</span></summary>${tracklist(album, edition.tracks)}${external(edition.url, '收听此版本')}</details>`).join('')}<p class="album-version-note">${esc(album.note)}</p></details>
    <details class="album-details album-videos"><summary>官方 MV <span>${album.videos.length} 支</span></summary><ul>${album.videos.map(video => `<li>${external(video.url, video.title)}<small>${esc(video.publisher)} · YouTube</small></li>`).join('')}</ul></details>
    <details class="album-details album-sources"><summary>发行资料与封面出处</summary><p>${esc(album.note)}</p>${album.digitalDate !== album.date ? `<p>所链接数字版的平台标注日期：<time datetime="${album.digitalDate}">${pretty(album.digitalDate)}</time>；页面排序采用正式发行日 ${pretty(album.date)}。</p>` : ''}<ul>${album.sources.map(link => `<li>${external(link.url, link.label)}</li>`).join('')}</ul><p>${esc(album.cover.credit)} · ${external(album.cover.url, '原始封面')}</p></details></div>
  </article>`;
}
export function renderAlbums(data, template, cards) {
  validateAlbums(data);
  const albums = filterAlbums(data.albums);
  const photocards = new Set(cards.albums.map(album => album.id));
  const values = {
    TOTAL: albums.length, IZONE: albums.filter(album => album.era === 'izone').length, IVE: albums.filter(album => album.era === 'ive').length,
    UPDATED: pretty(data.updated),
    YEARS: [...new Set(albums.map(album => album.date.slice(0, 4)))].map(year => `<option value="${year}">${year} 年</option>`).join(''),
    ART: albums.slice(0, 4).map(album => `<img src="./assets/albums/${album.cover.asset}" alt="" width="600" height="600" decoding="async">`).join(''),
    ALBUMS: albums.map(album => albumCard(album, photocards)).join('\n'),
    DATA: JSON.stringify(albums).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Unknown template variable: ${key}`);
    return values[key];
  });
}
async function main() {
  const [raw, template, cards] = await Promise.all([
    readFile(new URL('../content/albums.json', import.meta.url), 'utf8'), readFile(new URL('../content/albums-template.html', import.meta.url), 'utf8'), readFile(new URL('../content/photocards.json', import.meta.url), 'utf8')
  ]);
  const data = validateAlbums(JSON.parse(raw));
  for (const album of data.albums) await access(new URL(`../site/assets/albums/${album.cover.asset}`, import.meta.url));
  await writeFile(new URL('../site/albums.html', import.meta.url), renderAlbums(data, template, JSON.parse(cards)));
  console.log(`Albums generated: ${data.albums.length} formal Korean/Japanese releases with artwork, tracks and official videos.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
