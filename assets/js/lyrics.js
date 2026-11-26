// Glasklang · Songtexte: Suche über LRCLIB (https://lrclib.net) + LRC-Werkzeuge
// LRCLIB ist CORS-fähig und verlangt, dass sich der Client ausweist.
// Abfragen nur auf Knopfdruck, nacheinander – keine Massenabfragen.

const API = 'https://lrclib.net/api';
const CLIENT = 'Glasklang/1.0 (private Gesangs-App; https://github.com)';
let last = 0;

async function call(path, params) {
  const wait = 300 - (Date.now() - last);           // höflicher Abstand zwischen Anfragen
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  let res;
  try { res = await fetch(url, { headers: { 'Lrclib-Client': CLIENT } }); }
  catch { res = await fetch(url); }                // falls ein Browser den Zusatz-Header blockiert
  if (res.status === 429) {
    const s = Number(res.headers.get('Retry-After')) || 5;
    const e = new Error('rate-limit'); e.retryAfter = s; throw e;
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('http-' + res.status);
  return res.json();
}

/** Sucht Songtexte. Gibt bis zu 20 Treffer zurück, Treffer mit Text zuerst, synchronisierte bevorzugt. */
export async function searchLyrics({ title, artist }) {
  const tries = [
    { track_name: title, artist_name: artist },
    { q: `${title} ${artist}`.trim() },
    { track_name: title }
  ];
  const seen = new Map();
  for (const p of tries) {
    if (!Object.values(p).every(Boolean)) continue;
    const list = (await call('/search', p)) || [];
    for (const r of list) if (!seen.has(r.id)) seen.set(r.id, r);
    if (seen.size) break;               // erster Treffer reicht – LRCLIB nicht unnötig belasten
  }
  return [...seen.values()]
    .filter(r => !r.instrumental && (r.plainLyrics || r.syncedLyrics))
    .sort((a, b) => score(b, title, artist) - score(a, title, artist))
    .slice(0, 20);
}

function norm(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function score(r, title, artist) {
  let s = 0;
  if (norm(r.trackName) === norm(title)) s += 4; else if (norm(r.trackName).includes(norm(title))) s += 2;
  const a = norm(artist).split(' ')[0];
  if (a && norm(r.artistName).includes(a)) s += 3;
  if (r.syncedLyrics) s += 1;
  return s;
}

/** LRC → [{ t: Sekunden, text }] – unterstützt mehrere Zeitstempel pro Zeile, ignoriert Metadaten. */
export function parseLRC(lrc) {
  const out = [];
  let offset = 0;
  for (const raw of String(lrc || '').replace(/\r/g, '').split('\n')) {
    const off = raw.match(/^\[offset:\s*([+-]?\d+)\]/i);
    if (off) { offset = Number(off[1]) / 1000; continue; }
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').replace(/<\d{1,2}:\d{2}(?:\.\d{1,3})?>/g, '').trim();
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3]) / Math.pow(10, m[3].length) : 0;
      out.push({ t: Number(m[1]) * 60 + Number(m[2]) + frac - offset, text });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Synchronisierten Text in reinen Text umwandeln (falls nur LRC vorhanden ist). */
export const lrcToPlain = lrc => parseLRC(lrc).map(l => l.text).join('\n').replace(/\n{3,}/g, '\n\n').trim();

export const fmtDuration = s => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');

/** Externe Suchlinks als Rückfall */
export function externalLyricsLinks(title, artist) {
  const q = encodeURIComponent(`${title} ${artist}`.trim());
  return [
    { name: 'Genius', url: `https://genius.com/search?q=${q}` },
    { name: 'Musixmatch', url: `https://www.musixmatch.com/search/${q}` }
  ];
}
