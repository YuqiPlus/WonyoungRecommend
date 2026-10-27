import { normalizeSearch } from './search-model.mjs';
import { validDate } from './brands-model.mjs';

export const albumEras = { izone: 'IZ*ONE', ive: 'IVE' };
export const albumMarkets = { kr: '韩语发行', jp: '日语发行' };
export const albumTypes = { album: '正规专辑', ep: '迷你专辑 / EP', single: '单曲专辑' };
export const albumDefaults = { q: '', era: 'all', market: 'all', type: 'all', year: 'all', order: 'newest' };
const text = value => typeof value === 'string' && value.trim().length > 0;
function https(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid album source URL');
}
function validateTracks(tracks) {
  if (!Array.isArray(tracks) || !tracks.length) throw new Error('Missing album tracks');
  for (const [index, track] of tracks.entries()) {
    if (track.number !== index + 1 || !text(track.title) || !Number.isInteger(track.duration) || track.duration < 1) throw new Error('Invalid track sequence');
    https(track.url);
  }
}
export function validateAlbums(data) {
  if (!validDate(data.updated) || !Array.isArray(data.albums) || !data.albums.length) throw new Error('Invalid album archive');
  const ids = new Set();
  for (const album of data.albums) {
    if (!/^[a-z0-9-]+$/.test(album.id || '') || ids.has(album.id)) throw new Error('Invalid or duplicate album ID');
    ids.add(album.id);
    if (!validDate(album.date) || !validDate(album.digitalDate) || album.date < '2018-01-01' || album.date > data.updated || album.digitalDate > data.updated) throw new Error(`Invalid album date: ${album.id}`);
    if (!Object.hasOwn(albumEras, album.era) || !Object.hasOwn(albumMarkets, album.market) || !Object.hasOwn(albumTypes, album.type)) throw new Error('Invalid album classification');
    for (const key of ['title', 'summary', 'edition', 'note']) if (!text(album[key])) throw new Error(`Missing album ${key}`);
    if (!album.cover || !/^[a-z0-9-]+\.jpg$/.test(album.cover.asset || '') || !text(album.cover.credit)) throw new Error('Invalid album artwork');
    https(album.cover.url);
    validateTracks(album.tracks);
    if (!Array.isArray(album.alternateEditions) || !Array.isArray(album.aliases) || !album.aliases.every(text) || !album.highlights?.length || !album.highlights.every(title => album.tracks.some(track => track.title === title))) throw new Error('Invalid album edition or highlights');
    for (const edition of album.alternateEditions) { if (!text(edition.label)) throw new Error('Missing edition label'); https(edition.url); validateTracks(edition.tracks); }
    for (const key of ['listen', 'sources', 'videos']) {
      if (!Array.isArray(album[key]) || !album[key].length) throw new Error(`Missing album ${key}`);
      for (const link of album[key]) {
        if (!text(link.label || link.title)) throw new Error('Missing link label');
        https(link.url);
        if (key === 'videos' && (!text(link.publisher) || !/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(link.url))) throw new Error('Invalid official video');
      }
    }
  }
  return data;
}
export function albumSearchText(album) {
  return [album.title, album.summary, album.date, albumEras[album.era], albumMarkets[album.market], album.market === 'kr' ? '韩专' : '日专', albumTypes[album.type], ...album.aliases, ...album.tracks.map(track => track.title), ...album.alternateEditions.flatMap(edition => edition.tracks.map(track => track.title))].join(' ');
}
export function filterAlbums(albums, state = {}) {
  const values = { ...albumDefaults, ...state };
  const words = normalizeSearch(values.q.slice(0, 120)).split(' ').filter(Boolean);
  return albums.filter(album => ['era', 'market', 'type'].every(key => values[key] === 'all' || album[key] === values[key])
    && (values.year === 'all' || album.date.startsWith(values.year))
    && words.every(word => normalizeSearch(albumSearchText(album)).includes(word)))
    .sort((a, b) => (values.order === 'oldest' ? 1 : -1) * a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
