(() => {
  'use strict';
  const endpoint = 'https://api.20040831.xyz/api/messages';
  const section = document.querySelector('#guestbook');
  const form = document.querySelector('#message-form');
  const fields = document.querySelector('#message-fields');
  const nickname = document.querySelector('#message-nickname');
  const body = document.querySelector('#message-body');
  const submit = document.querySelector('#message-submit');
  const feedback = document.querySelector('#message-feedback');
  const list = document.querySelector('#messages-list');
  const status = document.querySelector('#messages-status');
  const refresh = document.querySelector('#messages-refresh');
  let loading = false;
  let connected = false;
  let submitting = false;
  let started = false;

  async function api(options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.method === 'POST' ? 16000 : 12000);
    try {
      const response = await fetch(endpoint, {
        ...options, signal: controller.signal, credentials: 'omit', cache: 'no-store'
      });
      let data;
      try { data = await response.json(); } catch { throw new Error('留言服务暂时不可用，请稍后再试。'); }
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : '留言服务暂时不可用，请稍后再试。');
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function updateCounter() {
    document.querySelector('#message-counter').textContent = `${body.value.length} / 500`;
  }

  function render(messages) {
    list.replaceChildren();
    for (const message of messages) {
      const item = document.createElement('article');
      item.className = 'public-message';
      const header = document.createElement('div');
      const name = document.createElement('h4');
      name.textContent = message.nickname;
      const time = document.createElement('time');
      const date = new Date(message.created_at);
      if (!Number.isNaN(date.getTime())) {
        time.dateTime = date.toISOString();
        time.textContent = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium' }).format(date);
      }
      header.append(name, time);
      const text = document.createElement('p');
      text.textContent = message.body;
      item.append(header, text);
      list.append(item);
    }
  }

  async function loadMessages() {
    if (loading) return;
    loading = true;
    refresh.disabled = true;
    status.textContent = '正在读取大家的留言……';
    try {
      const data = await api();
      if (!Array.isArray(data.messages) || data.messages.length > 20 || data.messages.some(message =>
        !message || typeof message.nickname !== 'string' || typeof message.body !== 'string' || typeof message.created_at !== 'string'
      )) throw new Error('Invalid response');
      render(data.messages);
      status.textContent = data.messages.length ? `这里收到了 ${data.messages.length} 份喜欢。` : '还没有公开留言，欢迎留下第一份喜欢。';
      connected = true;
      if (!submitting) fields.disabled = false;
      if (!submitting && !feedback.dataset.submitted) feedback.textContent = '写好后即可提交，审核通过再公开。';
    } catch {
      status.textContent = connected ? '暂时无法刷新，先看看已加载的留言吧。' : '留言板暂未开放或连接不上，请稍后再试。';
      if (!connected) feedback.textContent = '暂时无法提交，连接恢复后再来试试吧。';
    } finally {
      loading = false;
      refresh.disabled = false;
    }
  }

  body.addEventListener('input', updateCounter);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!connected || submitting || !form.reportValidity()) return;
    const message = { nickname: nickname.value.trim(), body: body.value.trim(), website: form.elements.website.value };
    if (!message.nickname || !message.body) {
      feedback.textContent = '昵称和留言不能只包含空格。';
      return;
    }
    submitting = true;
    fields.disabled = true;
    submit.textContent = '正在寄出……';
    feedback.textContent = '正在提交并审核，请稍候……';
    delete feedback.dataset.submitted;
    try {
      const data = await api({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message) });
      if (!['pending', 'approved', 'rejected'].includes(data.status) || typeof data.id !== 'string') throw new Error('未能确认提交结果，请稍后再试。');
      form.reset();
      updateCounter();
      feedback.textContent = data.status === 'approved'
        ? '留言已通过审核并公开，谢谢你的分享 ♡'
        : typeof data.message === 'string' ? data.message : '留言已收到，审核通过后会公开展示。谢谢你的分享 ♡';
      feedback.dataset.submitted = 'true';
      if (data.status === 'approved') void loadMessages();
    } catch (error) {
      feedback.textContent = error.name === 'AbortError' || error instanceof TypeError
        ? '连接中断，暂时无法确认是否提交成功；内容已保留，请稍后查看或重试。'
        : error.message;
    } finally {
      submitting = false;
      fields.disabled = false;
      submit.textContent = '寄出这份喜欢 ↗';
    }
  });
  refresh.hidden = false;
  refresh.addEventListener('click', () => { started = true; loadMessages(); });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        if (!started) { started = true; loadMessages(); }
      }
    }, { rootMargin: '150px' });
    observer.observe(section);
  } else {
    started = true;
    loadMessages();
  }
})();
