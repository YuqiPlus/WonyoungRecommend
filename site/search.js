import { prepareSearch, searchDocuments, searchTypes } from './search-model.mjs';

const documents = JSON.parse(document.querySelector('#global-search-data').textContent);
const prepared = prepareSearch(documents);
const container = document.querySelector('#global-search-results');
const nodes = new Map([...container.querySelectorAll('[data-result-id]')].map(node => [node.dataset.resultId, node]));
const query = document.querySelector('#global-query');
const year = document.querySelector('#global-year');
const sort = document.querySelector('#global-sort');
const typeButtons = [...document.querySelectorAll('[data-search-type]')];
const more = document.querySelector('#global-search-more');
const reset = document.querySelector('#global-search-reset');
const status = document.querySelector('#global-search-count');
const shown = document.querySelector('#global-search-shown');
let type = 'all', limit = 24, results = [];

function readURL() {
  const params = new URLSearchParams(location.search);
  query.value = (params.get('q') || '').slice(0, 120);
  type = Object.hasOwn(searchTypes, params.get('type')) ? params.get('type') : 'all';
  year.value = [...year.options].some(option => option.value === params.get('year')) ? params.get('year') : 'all';
  sort.value = [...sort.options].some(option => option.value === params.get('sort')) ? params.get('sort') : 'relevance';
}
function renderPage() {
  for (const node of nodes.values()) node.hidden = true;
  for (const doc of results.slice(0, limit)) { const node = nodes.get(doc.id); node.hidden = false; container.append(node); }
  shown.hidden = results.length === 0;
  shown.textContent = `已显示 ${Math.min(limit, results.length)} / ${results.length} 条资料`;
  more.hidden = results.length <= limit;
  status.textContent = query.value.trim() ? `“${query.value.trim()}” · 找到 ${results.length} 条资料` : `${results.length} 条资料${year.value !== 'all' ? ` · ${year.value} 年` : ''}`;
  document.querySelector('#global-search-empty').hidden = results.length > 0;
}
function search(updateURL = true) {
  limit = 24;
  const found = searchDocuments(prepared, { q: query.value, type, year: year.value, sort: sort.value });
  results = found.results;
  for (const button of typeButtons) button.setAttribute('aria-pressed', String(button.dataset.searchType === type));
  for (const facet of document.querySelectorAll('[data-facet]')) facet.textContent = found.counts[facet.dataset.facet];
  reset.hidden = !query.value && type === 'all' && year.value === 'all' && sort.value === 'relevance';
  renderPage();
  if (updateURL) {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries({ q: query.value, type, year: year.value, sort: sort.value })) {
      if (!value || value === 'all' || (key === 'sort' && value === 'relevance')) url.searchParams.delete(key); else url.searchParams.set(key, value);
    }
    try { history.replaceState(null, '', url); } catch { /* Searching also works without browser history access. */ }
  }
}
function clear() {
  query.value = ''; year.value = 'all'; sort.value = 'relevance'; type = 'all'; search(); query.focus({ preventScroll: true });
}
query.addEventListener('input', () => { if (!composing) search(); });
let composing = false;
query.addEventListener('compositionstart', () => { composing = true; });
query.addEventListener('compositionend', () => { composing = false; search(); });
year.addEventListener('change', () => search()); sort.addEventListener('change', () => search());
for (const button of typeButtons) button.addEventListener('click', () => { type = button.dataset.searchType; search(); });
for (const button of document.querySelectorAll('[data-search-example]')) button.addEventListener('click', () => { query.value = button.dataset.searchExample; search(); query.focus({ preventScroll: true }); });
document.querySelector('#global-search-form').addEventListener('submit', event => { event.preventDefault(); search(); });
reset.addEventListener('click', clear); document.querySelector('#global-search-empty-reset').addEventListener('click', clear);
more.addEventListener('click', () => {
  const next = results[limit]; limit += 24; renderPage();
  if (next) nodes.get(next.id).querySelector('h2 a').focus();
});
window.addEventListener('popstate', () => { readURL(); search(false); });
readURL(); search(false);
document.querySelector('#global-search-form').hidden = false;
