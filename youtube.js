// Glasklang · YouTube-Suche (YouTube Data API v3, search.list)
// Der Schlüssel kommt aus dem Secret YOUTUBE_API_KEY (→ firebase-config.js, extras).
// Jede Suche kostet Kontingent (Standard: 100 Suchen pro Tag). Deshalb wird pro
// Fassung nur einmal gesucht und das Ergebnis samt Alternativen gespeichert.
import * as cfg from './firebase-config.js';

const API = 'https://www.googleapis.com/youtube/v3/search';

function key() {
  const k = cfg.extras?.youtubeApiKey || '';
  if (k) return k;
  // Nur für lokale Tests im Demo-Modus: Schlüssel im Browser hinterlegen.
  try { if (/[?&]demo\b/.test(location.search)) return localStorage.getItem('glasklang-yt-key') || ''; } catch { /* egal */ }
  return '';
}
export const youtubeEnabled = () => !!key();

const decode = s => { const d = document.createElement('textarea'); d.innerHTML = s || ''; return d.value; };

/** Liefert bis zu 6 einbettbare Videos: [{ id, title, channel }]. Fehler: 'quota' | 'denied' | 'network'. */
export async function searchVideos({ title, performer, lang }) {
  const q = [title, performer].filter(Boolean).join(' ');
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '6', q, key: key()
  });
  if (lang) params.set('relevanceLanguage', lang);
  let res;
  try { res = await fetch(`${API}?${params}`); }
  catch { throw new Error('network'); }
  if (!res.ok) {
    let reason = '';
    try { reason = (await res.json())?.error?.errors?.[0]?.reason || ''; } catch { /* egal */ }
    throw new Error(/quota|rateLimit/i.test(reason) ? 'quota' : res.status === 400 || res.status === 403 ? 'denied' : 'network');
  }
  const data = await res.json();
  return (data.items || [])
    .filter(it => it?.id?.videoId)
    .map(it => ({ id: it.id.videoId, title: decode(it.snippet?.title), channel: decode(it.snippet?.channelTitle) }));
}
