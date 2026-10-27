import { albumDefaults, filterAlbums } from './albums-model.mjs';

const albums = JSON.parse(document.querySelector('#albums-data').textContent);
const fields = Object.fromEntries(Object.keys(albumDefaults).map(key => [key, document.querySelector(`#albums-${key}`)]));
const grid = document.querySelector('#albums-grid');
const cards = new Map([...grid.querySelectorAll('[data-album-id]')].map(card => [card.dataset.albumId, card]));
const reset = document.querySelector('#albums-reset');
function readLocation() {
  const params = new URLSearchParams(location.search);
  for (const [key, field] of Object.entries(fields)) {
    const value = params.get(key) || albumDefaults[key];
    field.value = key === 'q' ? value.slice(0, 120) : [...field.options].some(option => option.value === value) ? value : albumDefaults[key];
  }
}
function update(writeURL = true) {
  const state = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
  const results = filterAlbums(albums, state);
  const visible = new Set(results.map(album => album.id));
  for (const [id, card] of cards) card.hidden = !visible.has(id);
  for (const album of results) grid.append(cards.get(album.id));
  document.querySelector('#albums-count').textContent = `${results.length} 张专辑 · IZ*ONE ${results.filter(album => album.era === 'izone').length} 张 · IVE ${results.filter(album => album.era === 'ive').length} 张`;
  document.querySelector('#albums-empty').hidden = results.length > 0;
  reset.hidden = Object.keys(albumDefaults).every(key => state[key] === albumDefaults[key]);
  if (writeURL) {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(state)) {
      if (value === albumDefaults[key]) url.searchParams.delete(key); else url.searchParams.set(key, value);
    }
    if (url.hash && !visible.has(url.hash.slice(1))) url.hash = '';
    try { history.replaceState(null, '', url); } catch { /* Filters still work in a local preview. */ }
  }
  return results;
}
function focusHash() {
  const card = cards.get(location.hash.slice(1));
  if (card && !card.hidden) requestAnimationFrame(() => card.scrollIntoView({ block: 'start' }));
}
readLocation(); update(false);
document.querySelector('#albums-controls').hidden = false;
document.querySelector('#albums-controls').addEventListener('submit', event => event.preventDefault());
let composing = false;
fields.q.addEventListener('compositionstart', () => { composing = true; });
fields.q.addEventListener('compositionend', () => { composing = false; update(); });
for (const field of Object.values(fields)) field.addEventListener('input', () => { if (!composing) update(); });
function clear() { for (const [key, field] of Object.entries(fields)) field.value = albumDefaults[key]; update(); }
reset.addEventListener('click', clear);
document.querySelector('#albums-empty-reset').addEventListener('click', clear);
window.addEventListener('popstate', () => { readLocation(); update(false); focusHash(); });
focusHash();
