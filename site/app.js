(() => {
  'use strict';
  const storageKey = 'dear-wonyoung:favorites:v1';
  const cards = [...document.querySelectorAll('.video-card')];
  const validIds = new Set(cards.map(card => card.dataset.id));
  const filters = [...document.querySelectorAll('[data-filter]')];
  const emptyState = document.querySelector('#empty-state');
  const randomButton = document.querySelector('#random-pick');
  const toast = document.querySelector('#toast');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let activeFilter = 'all';
  let favorites = new Set();
  let persistentStorage = true;
  let toastTimer;
  let highlightTimer;

  function parseFavorites(value) {
    try {
      const parsed = JSON.parse(value);
      return new Set(Array.isArray(parsed) ? parsed.filter(id => validIds.has(id)) : []);
    } catch {
      return new Set();
    }
  }

  try {
    favorites = parseFavorites(localStorage.getItem(storageKey));
    const probeKey = `${storageKey}:probe`;
    localStorage.setItem(probeKey, '1');
    localStorage.removeItem(probeKey);
  } catch {
    persistentStorage = false;
  }

  function updateStorageNote() {
    document.querySelector('#storage-note').textContent = persistentStorage
      ? '收藏只保存在当前浏览器。'
      : '当前浏览器无法保存收藏，关闭页面后会丢失。';
  }

  function announce(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('visible');
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
  }

  function render() {
    let visibleCount = 0;
    for (const card of cards) {
      const saved = favorites.has(card.dataset.id);
      const visible = activeFilter === 'all'
        || (activeFilter === 'saved' ? saved : activeFilter === card.dataset.category);
      card.hidden = !visible;
      if (visible) visibleCount++;
      const button = card.querySelector('[data-save]');
      const title = card.querySelector('h3').textContent;
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', `${saved ? '取消收藏' : '收藏'} ${title}`);
      button.textContent = saved ? '♥' : '♡';
    }
    for (const filter of filters) {
      filter.setAttribute('aria-pressed', String(filter.dataset.filter === activeFilter));
    }
    document.querySelectorAll('[data-saved-count]').forEach(node => {
      node.textContent = String(favorites.size);
    });
    document.querySelector('#result-count').textContent = `${visibleCount} 个心动瞬间`;
    emptyState.hidden = visibleCount > 0;
    randomButton.disabled = visibleCount === 0;
    updateStorageNote();
  }

  function setFilter(value) {
    activeFilter = value;
    clearTimeout(highlightTimer);
    cards.forEach(card => card.classList.remove('picked'));
    render();
  }

  for (const filter of filters) {
    filter.addEventListener('click', () => setFilter(filter.dataset.filter));
  }
  document.querySelector('[data-reset-filter]').addEventListener('click', () => {
    setFilter('all');
    filters[0].focus({ preventScroll: true });
  });
  document.querySelector('[data-show-saved]').addEventListener('click', () => {
    setFilter('saved');
  });

  for (const button of document.querySelectorAll('[data-save]')) {
    button.addEventListener('click', () => {
      const id = button.dataset.save;
      const removed = favorites.has(id);
      if (removed) favorites.delete(id);
      else favorites.add(id);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...favorites]));
      } catch {
        persistentStorage = false;
      }
      render();
      announce(removed ? '已取消收藏' : persistentStorage ? '已收藏这个心动瞬间 ♡' : '已收藏；当前浏览器无法持久保存');
      if (activeFilter === 'saved' && removed) {
        const nextButton = cards.find(card => !card.hidden)?.querySelector('[data-save]');
        (nextButton || document.querySelector('[data-reset-filter]')).focus({ preventScroll: true });
      }
    });
    button.hidden = false;
  }

  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) {
      favorites = parseFavorites(event.key === null ? null : event.newValue);
      render();
    }
  });

  randomButton.addEventListener('click', () => {
    const visibleCards = cards.filter(card => !card.hidden);
    if (!visibleCards.length) return;
    const selected = visibleCards[Math.floor(Math.random() * visibleCards.length)];
    clearTimeout(highlightTimer);
    cards.forEach(card => card.classList.remove('picked'));
    selected.classList.add('picked');
    selected.scrollIntoView({ behavior: reduceMotion.matches ? 'instant' : 'smooth', block: 'center' });
    selected.querySelector('.video-cover').focus({ preventScroll: true });
    announce(`这次推荐：${selected.querySelector('h3').textContent}`);
    highlightTimer = setTimeout(() => selected.classList.remove('picked'), 5000);
  });

  // Use calendar dates in China so the birthday does not shift across time zones.
  function updateBirthday() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric'
    }).formatToParts(new Date());
    const date = Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
    const currentDay = Date.UTC(date.year, date.month - 1, date.day);
    let nextBirthday = Date.UTC(date.year, 7, 31);
    if (currentDay > nextBirthday) nextBirthday = Date.UTC(date.year + 1, 7, 31);
    const days = Math.round((nextBirthday - currentDay) / 86400000);
    document.querySelector('#birthday-countdown').textContent = days === 0
      ? '今天是元英的生日，生日快乐 ♡'
      : `距离下一次生日，还有 ${days} 天`;
  }

  document.querySelector('a[href="#credits"]').addEventListener('click', () => {
    document.querySelector('#credits').open = true;
  });
  document.querySelector('#watch-toolbar').hidden = false;
  document.querySelector('[data-show-saved]').hidden = false;
  document.querySelector('#storage-note').hidden = false;
  randomButton.hidden = false;
  render();
  updateBirthday();
  setInterval(updateBirthday, 60000);
})();
