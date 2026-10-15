export const brandCategories = { fashion: '时装与鞋履', beauty: '美妆与美发', jewelry: '珠宝', lifestyle: '生活与服务' };
export const eventKinds = { appointment: '身份官宣', campaign: '公开合作', appearance: '活动报道', end: '结束公告' };
export const brandStates = { recent: '近180天有合作资料', review: '近况待复核', appearance: '仅活动记录', ended: '官方已公布结束', ending: '已公告将结束', announced: '已官宣 · 尚未生效' };
export const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const shanghaiToday = (now = new Date()) => new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

export function brandSnapshot(brand, asOf, freshnessDays = 180) {
  if (!validDate(asOf)) throw new Error('Invalid snapshot date');
  const events = [...brand.events].filter(event => event.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
  if (!events.length) return null;
  let cooperation = null, ended = null, ending = null, announced = null;
  for (const event of events) {
    if (event.kind === 'appearance') continue;
    if (event.kind === 'end') {
      if ((event.effectiveOn || event.date) > asOf) ending = event;
      else { ended = event; ending = null; }
    } else if (event.kind === 'appointment') {
      if ((event.effectiveOn || event.date) > asOf) announced = event;
      else { cooperation = event; ended = null; ending = null; announced = null; }
    } else if (!ended) cooperation = event;
  }
  const latest = events.at(-1);
  const evidence = cooperation || announced || latest;
  const age = (Date.parse(asOf) - Date.parse(evidence.date)) / 86400000;
  const state = ended ? 'ended' : ending ? 'ending' : !cooperation && announced ? 'announced' : cooperation ? (age <= freshnessDays ? 'recent' : 'review') : 'appearance';
  return { events, latest, evidence, state, end: ended || ending, role: evidence.role, scope: evidence.scope, age };
}

export function validateBrands(data) {
  if (!validDate(data.updated) || data.freshnessDays !== 180 || !Array.isArray(data.brands) || !data.brands.length) throw new Error('Invalid brand archive');
  const ids = new Set();
  for (const brand of data.brands) {
    if (!/^[a-z0-9-]+$/.test(brand.id || '') || ids.has(brand.id)) throw new Error('Invalid or duplicate brand ID');
    ids.add(brand.id);
    if (!brand.name?.trim() || !brand.note?.trim() || !Object.hasOwn(brandCategories, brand.category) || !['sage', 'rose', 'sky', 'sand', 'lavender'].includes(brand.tone) || !Array.isArray(brand.aliases) || !brand.events?.length) throw new Error(`Invalid brand: ${brand.id}`);
    const dates = new Set();
    for (const event of brand.events) {
      if (!validDate(event.date) || event.date > data.updated || dates.has(event.date) || !Object.hasOwn(eventKinds, event.kind) || (event.effectiveOn && !validDate(event.effectiveOn))) throw new Error(`Invalid public event date: ${brand.id}`);
      dates.add(event.date);
      for (const field of ['role', 'scope', 'title', 'summary']) if (!event[field]?.trim()) throw new Error(`Missing event ${field}: ${brand.id}`);
      if (!event.sources?.length) throw new Error(`Missing evidence: ${brand.id}`);
      for (const source of event.sources) {
        const url = new URL(source.url);
        if (url.protocol !== 'https:' || url.username || url.password || !source.label?.trim() || !['official', 'media'].includes(source.kind)) throw new Error(`Invalid source: ${brand.id}`);
      }
      if (event.kind === 'end' && !event.sources.some(source => source.kind === 'official')) throw new Error(`An end requires an explicit official source: ${brand.id}`);
    }
  }
  return data;
}

export function brandStateNote(snapshot) {
  if (snapshot.state === 'appearance') return '本页仅有活动证据，尚未据此确认代言身份。';
  if (snapshot.state === 'ended') return '结束状态来自已收录的官方公告，旧记录继续保留。';
  if (snapshot.state === 'ending') return '已收录未来结束公告，尚未到公告所列日期。';
  if (snapshot.state === 'announced') return '已有公开任命公告，尚未到公告所列生效日期。';
  if (snapshot.state === 'review') return '最近一条合作资料距查看日期超过 180 天，近况需要复核；不据此推断解约。';
  return '近 180 天有已收录的合作资料；这不等于公开了完整合约期限。';
}

export function contractEnd(snapshot) {
  return snapshot.end ? snapshot.end.effectiveOn || '已公告结束，具体日期未列' : '未公开';
}
