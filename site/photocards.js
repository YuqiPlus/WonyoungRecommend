(() => {
  'use strict';
  const container = document.querySelector('#pc-albums');
  const albums = [...container.querySelectorAll('[data-pc-album]')];
  const fields = Object.fromEntries(['search', 'era', 'market', 'year', 'board', 'order'].map(key => [key, document.querySelector(`#pc-${key}`)]));
  const defaults = { search: '', era: 'all', market: 'all', year: 'all', board: 'all', order: 'newest' };
  const count = document.querySelector('#pc-count');
  const reset = document.querySelector('#pc-reset');
  const exportButton = document.querySelector('#pc-export');
  const params = new URLSearchParams(location.search);
  for (const [key, field] of Object.entries(fields)) {
    const value = params.get(key === 'search' ? 'q' : key);
    if (value !== null && (key === 'search' || [...field.options].some(option => option.value === value))) field.value = value.slice(0, 120);
  }
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase().replace(/[’'＊*]/g, '').replace(/\s+/g, ' ').trim();
  let visible = albums;
  function update() {
    const state = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
    const words = normalize(state.search).split(' ').filter(Boolean);
    const sorted = [...albums].sort((a, b) => (state.order === 'oldest' ? 1 : -1) * a.dataset.date.localeCompare(b.dataset.date));
    visible = [];
    for (const album of sorted) {
      const show = ['era', 'market', 'board'].every(key => state[key] === 'all' || state[key] === album.dataset[key]) && (state.year === 'all' || album.dataset.date.startsWith(state.year)) && words.every(word => normalize(album.dataset.search).includes(word));
      album.hidden = !show;
      if (show) visible.push(album);
      container.append(album);
    }
    const types = visible.flatMap(album => [...album.querySelectorAll('[data-card-row]')]);
    const known = types.reduce((sum, row) => sum + Number(row.dataset.count), 0);
    const pending = types.filter(row => row.dataset.count === '').length;
    count.textContent = `${visible.length} 次发行 · 已列 ${known} 款${pending ? ` · ${pending} 项数量待核` : ''}（非全卡总数）`;
    document.querySelector('#pc-empty').hidden = visible.length > 0;
    reset.hidden = !Object.keys(defaults).some(key => state[key] !== defaults[key]);
    exportButton.disabled = visible.length === 0;
    const url = new URL(location.href);
    for (const key of Object.keys(defaults)) {
      const param = key === 'search' ? 'q' : key;
      if (state[key] === defaults[key]) url.searchParams.delete(param); else url.searchParams.set(param, state[key]);
    }
    try { history.replaceState(null, '', url); } catch { /* Filtering also works when opened as a local file. */ }
  }
  document.querySelector('#pc-controls').hidden = false;
  document.querySelector('[data-pc-actions]').hidden = false;
  document.querySelector('#pc-controls').addEventListener('submit', event => event.preventDefault());
  for (const field of Object.values(fields)) field.addEventListener('input', update);
  function clearFilters() { for (const [key, field] of Object.entries(fields)) field.value = defaults[key]; update(); }
  reset.addEventListener('click', clearFilters);
  document.querySelector('#pc-empty-reset').addEventListener('click', clearFilters);
  update();

  exportButton.addEventListener('click', () => {
    const types = { album: '专辑卡', special: '特殊卡种', benefit: '店铺 / 活动特典' };
    const csvCell = value => `"${String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const rows = [['专辑', '发行日 / 预定日', '发行状态', '阶段', '地区', '卡种', '版本 / 项目', '已列款数（非全卡总数）', '图板情况', '公开来源']];
    for (const album of visible) {
      const source = album.querySelector('.pc-evidence a')?.href || '';
      for (const row of album.querySelectorAll('[data-card-row]')) rows.push([album.dataset.title, album.dataset.date, album.dataset.status === 'announced' ? '预定发售' : '已发行', album.dataset.era === 'ive' ? 'IVE' : 'IZ*ONE', album.dataset.market === 'kr' ? '韩专' : '日专', types[row.dataset.category], row.dataset.label, row.dataset.count || '待核', { personal: '个人图板', configuration: '官方全员配置图', pending: '个人图板待补' }[album.dataset.board], source]);
    }
    const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'Wonyoung-小卡统计.csv'; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const viewer = document.querySelector('#pc-viewer');
  if (typeof viewer.showModal !== 'function') return;
  const image = document.querySelector('#pc-viewer-image');
  const scroll = document.querySelector('#pc-viewer-scroll');
  const zoomIn = document.querySelector('#pc-zoom-in');
  const zoomOut = document.querySelector('#pc-zoom-out');
  let zoom = 1;
  let previousOverflow = '';
  function applyZoom(value) {
    zoom = Math.max(1, Math.min(3, value));
    const padding = parseFloat(getComputedStyle(scroll).paddingLeft) * 2;
    image.style.width = `${Math.max(1, scroll.clientWidth - padding) * zoom}px`;
    document.querySelector('#pc-zoom-value').textContent = `${Math.round(zoom * 100)}%`;
    zoomOut.disabled = zoom <= 1; zoomIn.disabled = zoom >= 3;
  }
  document.querySelectorAll('[data-open-board]').forEach(anchor => anchor.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    image.src = anchor.href; image.alt = `${anchor.dataset.title} · 完整小卡图板`;
    document.querySelector('#pc-viewer-title').textContent = `${anchor.dataset.title} · 完整图板`;
    document.querySelector('#pc-viewer-author').textContent = `图板整理 / 发布：${anchor.dataset.author}`;
    document.querySelector('#pc-viewer-note').textContent = anchor.dataset.note;
    document.querySelector('#pc-viewer-source').href = anchor.dataset.source;
    document.querySelector('#pc-viewer-original').href = anchor.href;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    viewer.showModal(); applyZoom(1); scroll.scrollTo(0, 0);
    document.querySelector('#pc-viewer-close').focus();
  }));
  document.querySelector('#pc-viewer-close').addEventListener('click', () => viewer.close());
  viewer.addEventListener('close', () => { document.body.style.overflow = previousOverflow; });
  viewer.addEventListener('click', event => {
    if (event.target !== viewer) return;
    const rect = viewer.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) viewer.close();
  });
  zoomIn.addEventListener('click', () => applyZoom(zoom + .5));
  zoomOut.addEventListener('click', () => applyZoom(zoom - .5));
  document.querySelector('#pc-zoom-reset').addEventListener('click', () => { applyZoom(1); scroll.scrollTo(0, 0); });
  window.addEventListener('resize', () => { if (viewer.open) applyZoom(zoom); });
})();
