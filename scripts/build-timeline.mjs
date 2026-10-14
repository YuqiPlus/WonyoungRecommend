import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const categories = { tv: '电视综艺', web: '网络节目', reality: '团综日常', milestone: '重要时刻' };
export const eras = { beginning: '初次亮相', izone: 'IZ*ONE', solo: '个人活动', ive: 'IVE' };
const kinds = { full: '整期', clip: '片段', playlist: '播放列表', trailer: '预告', mv: 'MV', stage: '舞台', part: '分段正片' };
const platforms = { youtube: 'YouTube', bilibili: '哔哩哔哩' };
export function videoPlatform(video) {
  return new URL(video.url).hostname === 'www.youtube.com' ? 'youtube' : 'bilibili';
}
export function videoCover(video) {
  if (videoPlatform(video) === 'youtube') return `https://i.ytimg.com/vi/${new URL(video.url).searchParams.get('v')}/hqdefault.jpg`;
  return video.thumbnail;
}
export const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function checkLink(link) {
  const url = new URL(link.url);
  if (url.protocol !== 'https:' || url.username || url.password || !link.label?.trim()) throw new Error('Invalid source link');
}
export function validateArchive(data) {
  if (!validDate(data.updated) || !Array.isArray(data.entries) || !data.entries.length) throw new Error('Invalid archive');
  const ids = new Set();
  for (const entry of data.entries) {
    if (!/^[a-z0-9-]+$/.test(entry.id || '') || ids.has(entry.id)) throw new Error('Invalid or duplicate entry ID');
    ids.add(entry.id);
    if (!validDate(entry.date) || entry.date > data.updated || entry.date < '2018-01-01') throw new Error(`Invalid date: ${entry.id}`);
    if (!['broadcast', 'published'].includes(entry.dateType) || !Object.hasOwn(categories, entry.category) || !Object.hasOwn(eras, entry.era)) throw new Error(`Invalid classification: ${entry.id}`);
    for (const field of ['title', 'episode', 'summary']) if (typeof entry[field] !== 'string' || !entry[field].trim()) throw new Error(`Missing ${field}: ${entry.id}`);
    if (!entry.videos?.length || !entry.sources?.length) throw new Error(`Missing video or evidence: ${entry.id}`);
    for (const video of entry.videos) {
      checkLink(video);
      if (!Object.hasOwn(kinds, video.kind) || !video.publisher?.trim()) throw new Error(`Invalid video: ${entry.id}`);
      const url = new URL(video.url);
      if (url.hostname === 'www.youtube.com') {
        if (url.pathname !== '/watch' || !/^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get('v') || '') || !/^UC[A-Za-z0-9_-]{22}$/.test(video.channelId || '')) throw new Error(`Invalid YouTube metadata: ${entry.id}`);
      } else if (url.hostname === 'www.bilibili.com') {
        if (!/^\/video\/BV[A-Za-z0-9]{10}\/$/.test(url.pathname) || !/^[1-9]\d*$/.test(String(video.uploaderId || '')) || video.sourceRole !== 'fan') throw new Error(`Invalid Bilibili metadata: ${entry.id}`);
        if (url.searchParams.has('p') && !/^[1-9]\d*$/.test(url.searchParams.get('p'))) throw new Error(`Invalid episode page: ${entry.id}`);
        const cover = new URL(video.thumbnail);
        if (cover.protocol !== 'https:' || !/^i[0-2]\.hdslb\.com$/.test(cover.hostname) || cover.username || cover.password || !cover.pathname.startsWith('/bfs/archive/')) throw new Error(`Invalid thumbnail: ${entry.id}`);
      } else throw new Error(`Unsupported video platform: ${entry.id}`);
      if (video.subtitles && !['zh', 'unconfirmed'].includes(video.subtitles)) throw new Error(`Invalid subtitles: ${entry.id}`);
      if (video.dateBasis && video.dateBasis !== 'page') throw new Error(`Invalid date basis: ${entry.id}`);
      if (!validDate(video.published) || video.published > data.updated) throw new Error(`Missing verified video metadata: ${entry.id}`);
    }
    entry.sources.forEach(checkLink);
  }
  return data;
}
function link(item, css = '') {
  return `<a${css ? ` class="${css}"` : ''} href="${escapeHTML(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(item.label)} <span aria-hidden="true">↗</span></a>`;
}
function card(entry) {
  const search = [entry.title, entry.episode, entry.date, entry.summary, entry.originalTitle || '', ...(entry.tags || []), eras[entry.era], categories[entry.category]].join(' ');
  const videos = entry.videos.map(video => {
    const platform = videoPlatform(video);
    return `<div class="archive-video"><a class="archive-watch" href="${escapeHTML(video.url)}" target="_blank" rel="noopener noreferrer"><span class="archive-thumbnail"><span class="archive-cover-fallback" aria-hidden="true">✧<small>前往${platforms[platform]}观看</small></span><img src="${escapeHTML(videoCover(video))}" alt="" width="480" height="270" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="archive-platform" data-platform="${platform}">${platforms[platform]}</span><span class="archive-play" aria-hidden="true">▶</span></span><span class="archive-watch-label">${escapeHTML(video.label)} <span aria-hidden="true">↗</span></span></a><span>${escapeHTML(video.publisher)} · ${video.sourceRole === 'fan' ? '粉丝分享' : '官方频道'} · ${kinds[video.kind]}${video.subtitles === 'zh' ? ' · 中字' : ''}</span>${video.note ? `<span>${escapeHTML(video.note)}</span>` : ''}</div>`;
  }).join('');
  const entryPlatforms = [...new Set(entry.videos.map(videoPlatform))].join(' ');
  return `<article class="archive-entry" id="${entry.id}" data-timeline-entry data-date="${entry.date}" data-category="${entry.category}" data-era="${entry.era}" data-platforms="${entryPlatforms}" data-search="${escapeHTML(search)}">
  <div class="archive-date"><time datetime="${entry.date}">${entry.date.slice(5).replace('-', '.')}</time><span>${entry.dateType === 'broadcast' ? '节目播出' : '视频发布'}</span></div>
  <div class="archive-card"><div class="archive-card-meta"><span class="archive-category">${categories[entry.category]}</span><span>${eras[entry.era]}${entry.participation ? ` · ${escapeHTML(entry.participation)}` : ''}</span><a class="archive-permalink" href="#${entry.id}" aria-label="定位${escapeHTML(entry.title)}这条记录">#</a></div>
  <h3>${escapeHTML(entry.title)}</h3><p class="archive-episode">${escapeHTML(entry.episode)}</p><p class="archive-summary">${escapeHTML(entry.summary)}</p>
  <div class="archive-videos">${videos}</div>
  <details class="archive-evidence"><summary>来源与日期说明</summary><p>${entry.dateType === 'broadcast' ? '日期为节目播出日；片段可能在之后上传。' : '日期为所列原始视频的发布日，不代表录制或电视首播日期。'}${entry.dateNote ? ` ${escapeHTML(entry.dateNote)}` : ''}</p><ul>${entry.videos.map(video => `<li>${platforms[videoPlatform(video)]} · ${escapeHTML(video.publisher)} · 上传于 ${video.published}${videoPlatform(video) === 'bilibili' ? '（中国时间）' : video.dateBasis === 'page' ? '（视频页面日期）' : '（韩国时间）'}</li>`).join('')}</ul>${entry.originalTitle ? `<p>原题：${escapeHTML(entry.originalTitle)}</p>` : ''}<ul>${entry.sources.map(source => `<li>${link(source)}</li>`).join('')}</ul></details></div></article>`;
}
export function renderArchive(data, template) {
  validateArchive(data);
  const entries = [...data.entries].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const years = [...new Set(entries.map(entry => entry.date.slice(0, 4)))].sort().reverse();
  const values = {
    TOTAL: entries.length,
    FIRST_YEAR: years.at(-1), LAST_YEAR: years[0], UPDATED: data.updated.replaceAll('-', '.'),
    YEARS: years.map(year => `<button type="button" data-year="${year}" aria-pressed="false"><span>${year}</span><small>${entries.filter(entry => entry.date.startsWith(year)).length}</small></button>`).join(''),
    ENTRIES: years.map(year => `<section class="archive-year" data-year-group="${year}" aria-labelledby="year-${year}"><h2 id="year-${year}">${year}<span>留下来的心动瞬间</span></h2><div class="archive-year-entries">${entries.filter(entry => entry.date.startsWith(year)).map(card).join('\n')}</div></section>`).join('\n')
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Unknown template variable ${key}`);
    return values[key];
  });
}
async function main() {
  const data = JSON.parse(await readFile(new URL('../content/timeline.json', import.meta.url), 'utf8'));
  const template = await readFile(new URL('../content/timeline-template.html', import.meta.url), 'utf8');
  await writeFile(new URL('../site/timeline.html', import.meta.url), renderArchive(data, template));
  console.log(`Timeline generated: ${data.entries.length} sourced records.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
