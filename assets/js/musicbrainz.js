// Glasklang · Titelsuche über MusicBrainz (offene Musikdatenbank, ohne Schlüssel, CORS erlaubt)
// Regeln von MusicBrainz: höchstens ~1 Anfrage pro Sekunde → nur auf Knopfdruck, mit Abstand.
const API = 'https://musicbrainz.org/ws/2/recording';
let last = 0;

const esc = s => String(s).replace(/(["\\])/g, '\\$1');

/** [{ title, artist, year, album, length }] – doppelte Titel/Interpret-Paare zusammengefasst. */
export async function searchRecordings(q) {
  q = (q || '').trim();
  if (!q) return [];
  const wait = 1100 - (Date.now() - last);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
  // „Titel – Interpret“ bzw. „Titel / Interpret“ gezielt suchen, sonst frei.
  const m = q.split(/\s+[-–—/]\s+/);
  // Zweiter Teil kann Interpret:in oder Musical/Album sein (Cast-Aufnahmen laufen unter den Darsteller:innen).
  const query = m.length === 2 ? `recording:"${esc(m[0])}" AND (artist:"${esc(m[1])}" OR release:"${esc(m[1])}")` : q;
  let res;
  try { res = await fetch(`${API}?${new URLSearchParams({ query, fmt: 'json', limit: '25' })}`, { headers: { Accept: 'application/json' } }); }
  catch { throw new Error('network'); }
  if (res.status === 503 || res.status === 429) throw new Error('busy');
  if (!res.ok) throw new Error('network');
  const data = await res.json();
  const seen = new Map();
  for (const r of data.recordings || []) {
    const artist = (r['artist-credit'] || []).map(a => (a.name || a.artist?.name || '') + (a.joinphrase || '')).join('').trim();
    const title = (r.title || '').trim();
    if (!title) continue;
    const k = `${title.toLowerCase()}|${artist.toLowerCase()}`;
    const year = (r['first-release-date'] || '').slice(0, 4);
    const prev = seen.get(k);
    if (prev) { if (year && (!prev.year || year < prev.year)) prev.year = year; prev.n++; continue; }
    seen.set(k, { title, artist, year, album: r.releases?.[0]?.title || '', length: r.length || null, n: 1, score: r.score || 0 });
  }
  return [...seen.values()].sort((a, b) => b.score - a.score || b.n - a.n).slice(0, 8);
}
