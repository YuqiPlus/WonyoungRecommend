export const searchTypes = { picks: '入坑推荐', timeline: '成长时间线', photocards: '小卡图鉴', brands: '品牌合作' };

export function normalizeSearch(value) {
  return String(value).normalize('NFKC').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/哔哩哔哩|b\s*站|bilibili/g, ' bilibili ').replace(/油管|youtube/g, ' youtube ')
    .replace(/(\d{4})(?=\p{Script=Han})/gu, '$1 ')
    .replace(/[’'＊*]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function prepareSearch(documents) {
  return documents.map(doc => ({
    doc,
    title: normalizeSearch(doc.title),
    subtitle: normalizeSearch(doc.subtitle),
    text: normalizeSearch([doc.title, doc.subtitle, doc.summary, doc.keywords, doc.date, doc.year, searchTypes[doc.type]].join(' '))
  }));
}

export function searchDocuments(prepared, { q = '', type = 'all', year = 'all', sort = 'relevance' } = {}) {
  const query = normalizeSearch(q.slice(0, 120));
  const words = query.split(' ').filter(Boolean);
  const counts = Object.fromEntries(['all', ...Object.keys(searchTypes)].map(key => [key, 0]));
  const matches = [];
  for (const item of prepared) {
    if ((year !== 'all' && String(item.doc.year) !== year) || !words.every(word => item.text.includes(word))) continue;
    counts.all++; counts[item.doc.type]++;
    if (type !== 'all' && item.doc.type !== type) continue;
    const score = !query ? 0 : (item.title === query ? 100 : item.title.includes(query) ? 50 : 0)
      + words.reduce((sum, word) => sum + (item.title.includes(word) ? 10 : item.subtitle.includes(word) ? 5 : 1), 0);
    matches.push({ doc: item.doc, score });
  }
  matches.sort((a, b) => {
    if (sort === 'relevance' && query && a.score !== b.score) return b.score - a.score;
    const order = sort === 'oldest' ? a.doc.date.localeCompare(b.doc.date)
      : sort === 'newest' ? b.doc.date.localeCompare(a.doc.date) : b.doc.updatedAt.localeCompare(a.doc.updatedAt);
    return order || b.doc.date.localeCompare(a.doc.date) || a.doc.id.localeCompare(b.doc.id);
  });
  return { results: matches.map(item => item.doc), counts };
}
