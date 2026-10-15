import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { escapeHTML as esc } from './build-timeline.mjs';
import { brandSnapshot, brandCategories, brandStates, eventKinds, validateBrands, brandStateNote as stateNote, contractEnd } from '../site/brands-model.mjs';
export { validateBrands, brandStateNote as stateNote } from '../site/brands-model.mjs';
const pretty = date => date.replaceAll('-', '.');
function card(brand, data) {
  const snapshot = brandSnapshot(brand, data.updated, data.freshnessDays);
  const events = [...brand.events].sort((a, b) => b.date.localeCompare(a.date)).map(event => `<li class="brand-event" data-event-date="${event.date}"><div class="brand-event-meta"><time datetime="${event.date}">${pretty(event.date)}</time><span>${eventKinds[event.kind]}</span></div><h4>${esc(event.title)}</h4><p>${esc(event.summary)}</p><p class="brand-event-role">来源身份：${esc(event.role)}<br>范围：${esc(event.scope)}${event.effectiveNote ? `<br>${esc(event.effectiveNote)}` : ''}${event.effectiveOn ? `<br>公告所列生效日期：${pretty(event.effectiveOn)}` : ''}</p><ul class="brand-event-sources">${event.sources.map(source => `<li><span>${source.kind === 'official' ? '官方发布' : '媒体报道'}</span><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)} ↗</a></li>`).join('')}</ul></li>`).join('');
  return `<article class="brand-card" id="${brand.id}" data-brand-id="${brand.id}" data-category="${brand.category}"><div class="brand-wordmark" data-tone="${brand.tone}"><span>${brandCategories[brand.category]}</span><h2>${esc(brand.name)}</h2><small>WONYOUNG / THE BRAND ARCHIVE</small><i aria-hidden="true">✧</i></div><div class="brand-card-body"><div class="brand-status-row"><span class="brand-state" data-state="${snapshot.state}">${brandStates[snapshot.state]}</span><a href="#${brand.id}" aria-label="定位 ${esc(brand.name)}">#</a></div><dl class="brand-facts"><div><dt>来源中的身份</dt><dd data-brand-role>${esc(snapshot.role)}</dd></div><div><dt>公开范围</dt><dd data-brand-scope>${esc(snapshot.scope)}</dd></div><div><dt>最近合作资料</dt><dd data-brand-evidence>${pretty(snapshot.evidence.date)}${snapshot.state === 'appearance' ? ' · 活动报道' : ''}</dd></div><div><dt>合约结束</dt><dd data-brand-end>${esc(contractEnd(snapshot))}</dd></div></dl><p class="brand-contract-note" data-brand-state-note>${stateNote(snapshot)}</p><details class="brand-history"><summary>沿着日期看来源 <span data-brand-event-count>${snapshot.events.length} 条</span></summary><p class="brand-history-note">日期为资料公开 / 报道日期，另有生效说明时单独标注。最早收录日期不等于最初签约日。</p><ol>${events}</ol><p class="brand-scope-note">${esc(brand.note)}</p></details></div></article>`;
}
export function renderBrands(data, template) {
  validateBrands(data);
  const sorted = [...data.brands].sort((a, b) => brandSnapshot(b, data.updated).latest.date.localeCompare(brandSnapshot(a, data.updated).latest.date) || a.id.localeCompare(b.id));
  const snapshots = sorted.map(brand => brandSnapshot(brand, data.updated, data.freshnessDays));
  const values = {
    TOTAL: sorted.length, RECENT: snapshots.filter(item => item.state === 'recent').length,
    EVENTS: sorted.reduce((sum, brand) => sum + brand.events.length, 0),
    UPDATED: pretty(data.updated), UPDATED_ISO: data.updated,
    CATEGORIES: Object.entries(brandCategories).map(([key, label]) => `<option value="${key}">${label}</option>`).join(''),
    CARDS: sorted.map(brand => card(brand, data)).join('\n'),
    DATA: JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Unknown template variable: ${key}`);
    return values[key];
  });
}
async function main() {
  const data = JSON.parse(await readFile(new URL('../content/brands.json', import.meta.url), 'utf8'));
  const template = await readFile(new URL('../content/brands-template.html', import.meta.url), 'utf8');
  await writeFile(new URL('../site/brands.html', import.meta.url), renderBrands(data, template));
  console.log(`Brands generated: ${data.brands.length} profiles, ${data.brands.reduce((sum, brand) => sum + brand.events.length, 0)} dated source records.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
