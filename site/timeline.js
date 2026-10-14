(() => {
  'use strict';
  const entries = [...document.querySelectorAll('[data-timeline-entry]')];
  const groups = [...document.querySelectorAll('[data-year-group]')];
  const yearButtons = [...document.querySelectorAll('[data-year]')];
  const typeButtons = [...document.querySelectorAll('[data-type]')];
  const search = document.querySelector('#timeline-search');
  const era = document.querySelector('#timeline-era');
  const order = document.querySelector('#timeline-order');
  const reset = document.querySelector('#timeline-reset');
  const validYears = new Set(yearButtons.map(button => button.dataset.year));
  const validTypes = new Set(typeButtons.map(button => button.dataset.type));
  const validEras = new Set([...era.options].map(option => option.value));
  const normalize = text => text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const searchable = new Map(entries.map(entry => [entry, normalize(entry.dataset.search)]));
  let state = { year: 'all', type: 'all', era: 'all', order: 'newest', q: '' };

  function readURL() {
    const params = new URL(location.href).searchParams;
    state = {
      year: validYears.has(params.get('year')) ? params.get('year') : 'all',
      type: validTypes.has(params.get('type')) ? params.get('type') : 'all',
      era: validEras.has(params.get('era')) ? params.get('era') : 'all',
      order: params.get('order') === 'oldest' ? 'oldest' : 'newest',
      q: (params.get('q') || '').slice(0, 120)
    };
    search.value = state.q;
    era.value = state.era;
    order.value = state.order;
  }
  function render(updateURL = true) {
    const words = normalize(state.q).split(' ').filter(Boolean);
    let count = 0;
    const facetCounts = new Map();
    for (const entry of entries) {
      const matches = (state.type === 'all' || entry.dataset.category === state.type)
        && (state.era === 'all' || entry.dataset.era === state.era)
        && words.every(word => searchable.get(entry).includes(word));
      const year = entry.dataset.date.slice(0, 4);
      if (matches) facetCounts.set(year, (facetCounts.get(year) || 0) + 1);
      entry.hidden = !matches || (state.year !== 'all' && year !== state.year);
      if (!entry.hidden) count++;
    }
    for (const button of yearButtons) {
      const year = button.dataset.year;
      button.setAttribute('aria-pressed', String(state.year === year));
      button.querySelector('small').textContent = year === 'all'
        ? [...facetCounts.values()].reduce((sum, value) => sum + value, 0) : facetCounts.get(year) || 0;
    }
    for (const button of typeButtons) button.setAttribute('aria-pressed', String(state.type === button.dataset.type));
    const direction = state.order === 'oldest' ? 1 : -1;
    for (const group of [...groups].sort((a, b) => direction * a.dataset.yearGroup.localeCompare(b.dataset.yearGroup))) {
      const list = group.querySelector('.archive-year-entries');
      [...list.children].sort((a, b) => direction * a.dataset.date.localeCompare(b.dataset.date) || a.id.localeCompare(b.id)).forEach(entry => list.append(entry));
      group.hidden = ![...list.children].some(entry => !entry.hidden);
      document.querySelector('#timeline-entries').append(group);
    }
    document.querySelector('#timeline-count').textContent = `${count} / ${entries.length} 条记录${state.year !== 'all' ? ` · ${state.year} 年` : ''}`;
    document.querySelector('#timeline-empty').hidden = count > 0;
    reset.hidden = !state.q && state.year === 'all' && state.type === 'all' && state.era === 'all' && state.order === 'newest';
    if (updateURL) {
      const url = new URL(location.href);
      for (const [key, value] of Object.entries(state)) {
        if (!value || value === 'all' || (key === 'order' && value === 'newest')) url.searchParams.delete(key);
        else url.searchParams.set(key, value);
      }
      try { history.replaceState(null, '', url); } catch { /* Filtering still works if browser history is unavailable. */ }
    }
  }
  function clear() {
    state = { year: 'all', type: 'all', era: 'all', order: 'newest', q: '' };
    search.value = ''; era.value = 'all'; order.value = 'newest';
    render(); search.focus({ preventScroll: true });
  }
  yearButtons.forEach(button => button.addEventListener('click', () => {
    state.year = button.dataset.year;
    render();
    const controls = document.querySelector('.archive-controls');
    const headerHeight = document.querySelector('.header').offsetHeight;
    if (controls.getBoundingClientRect().top < headerHeight) {
      window.scrollTo({ top: controls.getBoundingClientRect().top + scrollY - headerHeight - 20, behavior: 'instant' });
    }
  }));
  typeButtons.forEach(button => button.addEventListener('click', () => { state.type = button.dataset.type; render(); }));
  search.addEventListener('input', () => { state.q = search.value; render(); });
  era.addEventListener('change', () => { state.era = era.value; render(); });
  order.addEventListener('change', () => { state.order = order.value; render(); });
  reset.addEventListener('click', clear);
  document.querySelector('[data-reset-timeline]').addEventListener('click', clear);
  window.addEventListener('popstate', () => { readURL(); render(false); });
  readURL(); render(false);
  document.querySelector('.archive-layout').classList.add('archive-enhanced');
  document.querySelectorAll('[data-timeline-controls]').forEach(node => { node.hidden = false; });
})();
