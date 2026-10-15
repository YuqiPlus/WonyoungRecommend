import { brandSnapshot, brandStates, brandStateNote, contractEnd, shanghaiToday, validDate } from './brands-model.mjs';

const data = JSON.parse(document.querySelector('#brands-data').textContent);
const grid = document.querySelector('#brands-grid');
const articles = new Map([...grid.querySelectorAll('[data-brand-id]')].map(article => [article.dataset.brandId, article]));
const fields = Object.fromEntries(['asof', 'search', 'category', 'state', 'order'].map(key => [key, document.querySelector(`#brands-${key}`)]));
const defaults = { search: '', category: 'all', state: 'all', order: 'newest' };
const params = new URLSearchParams(location.search);
const pretty = date => date.replaceAll('-', '.');
const normalize = text => text.normalize('NFKC').toLocaleLowerCase().trim();
let followToday = !params.has('asof');
fields.asof.max = shanghaiToday();
fields.asof.value = fields.asof.max;
const selectedDate = params.get('asof');
if (validDate(selectedDate) && selectedDate >= fields.asof.min && selectedDate <= fields.asof.max) fields.asof.value = selectedDate;
else followToday = true;
for (const [key, field] of Object.entries(fields)) {
  if (key === 'asof') continue;
  const value = params.get(key === 'search' ? 'q' : key);
  if (value !== null && (key === 'search' || [...field.options].some(option => option.value === value))) field.value = value.slice(0, 120);
}
function update() {
  const today = shanghaiToday();
  fields.asof.max = today;
  if (followToday) fields.asof.value = today;
  const asOf = fields.asof.value;
  if (!validDate(asOf) || asOf < fields.asof.min || asOf > today) { fields.asof.setCustomValidity('请选择范围内的有效日期'); fields.asof.reportValidity(); return; }
  fields.asof.setCustomValidity('');
  const snapshots = data.brands.map(brand => ({ brand, snapshot: brandSnapshot(brand, asOf, data.freshnessDays) })).filter(item => item.snapshot);
  const words = normalize(fields.search.value).split(/\s+/).filter(Boolean);
  const sorted = snapshots.sort((a, b) => fields.order.value === 'name' ? a.brand.name.localeCompare(b.brand.name, 'zh-CN') : fields.order.value === 'oldest' ? a.snapshot.events[0].date.localeCompare(b.snapshot.events[0].date) : b.snapshot.latest.date.localeCompare(a.snapshot.latest.date));
  for (const article of articles.values()) article.hidden = true;
  let visible = 0;
  for (const { brand, snapshot } of sorted) {
    const article = articles.get(brand.id);
    const search = normalize([brand.name, ...brand.aliases, ...snapshot.events.flatMap(event => [event.title, event.role, event.scope])].join(' '));
    const show = (fields.category.value === 'all' || fields.category.value === brand.category) && (fields.state.value === 'all' || fields.state.value === snapshot.state) && words.every(word => search.includes(word));
    article.hidden = !show;
    if (show) visible++;
    article.querySelector('[data-brand-role]').textContent = snapshot.role;
    article.querySelector('[data-brand-scope]').textContent = snapshot.scope;
    article.querySelector('[data-brand-evidence]').textContent = `${pretty(snapshot.evidence.date)}${snapshot.state === 'appearance' ? ' · 活动报道' : ''}`;
    article.querySelector('[data-brand-end]').textContent = contractEnd(snapshot);
    const badge = article.querySelector('.brand-state'); badge.dataset.state = snapshot.state; badge.textContent = brandStates[snapshot.state];
    article.querySelector('[data-brand-state-note]').textContent = brandStateNote(snapshot);
    article.querySelector('[data-brand-event-count]').textContent = `${snapshot.events.length} 条`;
    for (const event of article.querySelectorAll('[data-event-date]')) event.hidden = event.dataset.eventDate > asOf;
    grid.append(article);
  }
  document.querySelector('#brands-total').textContent = snapshots.length;
  document.querySelector('#brands-recent').textContent = snapshots.filter(item => item.snapshot.state === 'recent').length;
  document.querySelector('#brands-events').textContent = snapshots.reduce((sum, item) => sum + item.snapshot.events.length, 0);
  document.querySelector('#brands-count').textContent = `${visible} 份档案 · 查看日期 ${pretty(asOf)}`;
  document.querySelector('#brands-coverage').textContent = asOf > data.updated ? `资料整理截至 ${pretty(data.updated)}；后续新动态仍待补录，时效提示按查看日期计算。` : '仅展示截至所选日期已公开的已收录资料；身份范围以当时记录为准。';
  document.querySelector('#brands-empty').hidden = visible > 0;
  document.querySelector('#brands-reset').hidden = followToday && Object.keys(defaults).every(key => fields[key].value === defaults[key]);
  const url = new URL(location.href);
  if (followToday) url.searchParams.delete('asof'); else url.searchParams.set('asof', asOf);
  for (const [key, value] of Object.entries(defaults)) { const param = key === 'search' ? 'q' : key; if (fields[key].value === value) url.searchParams.delete(param); else url.searchParams.set(param, fields[key].value); }
  try { history.replaceState(null, '', url); } catch { /* Reading the archive also works from local files. */ }
}
document.querySelector('#brands-controls').hidden = false;
document.querySelector('#brands-controls').addEventListener('submit', event => event.preventDefault());
fields.asof.addEventListener('change', () => { followToday = false; update(); });
for (const key of Object.keys(defaults)) fields[key].addEventListener('input', update);
document.querySelector('#brands-today').addEventListener('click', () => { followToday = true; update(); });
function reset() { followToday = true; for (const [key, value] of Object.entries(defaults)) fields[key].value = value; update(); }
document.querySelector('#brands-reset').addEventListener('click', reset);
document.querySelector('#brands-empty-reset').addEventListener('click', reset);
document.addEventListener('visibilitychange', () => { if (!document.hidden && followToday) update(); });
window.addEventListener('pageshow', () => { if (followToday) update(); });
setInterval(() => { if (!document.hidden && followToday && fields.asof.value !== shanghaiToday()) update(); }, 60000);
update();
