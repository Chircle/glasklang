// Glasklang · Vollbild-Songtext: Karaoke (synchronisiert) oder Großansicht (reiner Text)
// Zeitquelle: eingebettetes YouTube-Video (IFrame-API) oder eine eigene Uhr.
import { parseLRC } from './lyrics.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let ytReady = null;
function loadYT() {
  if (window.YT?.Player) return Promise.resolve();
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytReady = null; reject(new Error('yt')); };
    document.head.appendChild(s);
  });
  return ytReady;
}

const K = { lines: [], idx: -1, offset: 0, playing: false, clock: 0, clockStart: 0, player: null, raf: 0, size: 1, wake: null, t: k => k };

function now() {
  if (K.player?.getCurrentTime) return K.player.getCurrentTime() + K.offset;
  return (K.playing ? K.clock + (performance.now() - K.clockStart) / 1000 : K.clock) + K.offset;
}
function duration() {
  const d = K.player?.getDuration?.();
  return d > 0 ? d : (K.lines.at(-1)?.t || 0) + 6;
}

async function wake(on) {
  try {
    if (on && 'wakeLock' in navigator && !K.wake) K.wake = await navigator.wakeLock.request('screen');
    else if (!on && K.wake) { await K.wake.release(); K.wake = null; }
  } catch { K.wake = null; }
}

function setPlaying(on) {
  if (K.player) { on ? K.player.playVideo() : K.player.pauseVideo(); }
  else if (on && !K.playing) { K.clockStart = performance.now(); }
  else if (!on && K.playing) { K.clock += (performance.now() - K.clockStart) / 1000; }
  K.playing = on;
  renderPlay();
  wake(on);
}
function seek(sec) {
  const target = Math.max(0, sec - K.offset);
  if (K.player?.seekTo) K.player.seekTo(target, true);
  else { K.clock = target; K.clockStart = performance.now(); }
  K.idx = -2;
}
function renderPlay() {
  const b = $('#k-play');
  if (!b) return;
  b.querySelector('use').setAttribute('href', K.playing ? '#i-pause' : '#i-play');
  b.setAttribute('aria-label', K.t(K.playing ? 'karaoke.pause' : 'karaoke.play'));
}

function tick() {
  const box = $('#k-lines');
  if (!box) return;
  const tNow = now();
  let i = -1;
  for (let j = 0; j < K.lines.length; j++) { if (K.lines[j].t <= tNow + 0.05) i = j; else break; }
  if (i !== K.idx) {
    K.idx = i;
    box.querySelectorAll('.k-line').forEach((el, j) => {
      el.classList.toggle('is-now', j === i);
      el.classList.toggle('is-past', j < i);
    });
    const cur = box.children[Math.max(0, i)];
    if (cur) box.scrollTo({ top: cur.offsetTop - box.clientHeight * 0.38, behavior: reduced ? 'auto' : 'smooth' });
  }
  const d = duration();
  $('#k-time').textContent = `${fmt(tNow)} / ${fmt(d)}`;
  const seekEl = $('#k-seek');
  if (seekEl && document.activeElement !== seekEl) { seekEl.max = Math.round(d * 10); seekEl.value = Math.round(Math.max(0, tNow) * 10); }
  if (!K.player && K.playing && tNow > d) setPlaying(false);
  K.raf = requestAnimationFrame(tick);
}

function applySize() { $('#karaoke').style.setProperty('--k-size', K.size); }

/** Öffnet die Vollbild-Ansicht. synced (LRC) → Karaoke, sonst Großansicht des reinen Texts. */
export async function openKaraoke({ title, sub, lyrics, synced, videoId, t }) {
  const el = $('#karaoke');
  K.t = t; K.lines = synced ? parseLRC(synced) : []; K.idx = -1; K.offset = 0; K.clock = 0; K.playing = false; K.player = null;
  try { K.size = Number(localStorage.getItem('glasklang-k-size')) || 1; } catch { K.size = 1; }
  const isSync = K.lines.length > 0;
  el.classList.toggle('is-sync', isSync);
  $('#k-title').textContent = title;
  $('#k-sub').textContent = sub;
  $('#k-mode').textContent = t(isSync ? 'karaoke.modeSync' : 'karaoke.modePlain');

  const box = $('#k-lines');
  if (isSync) {
    box.innerHTML = K.lines.map((l, i) => `<button type="button" class="k-line${l.text ? '' : ' k-gap'}" data-k-seek="${l.t}" data-i="${i}">${l.text ? esc(l.text) : '♪'}</button>`).join('')
      + '<div class="k-tail" aria-hidden="true"></div>';
  } else {
    box.innerHTML = `<div class="k-plain">${String(lyrics || '').replace(/\r/g, '').split('\n').map(line => {
      const m = line.trim().match(/^\[(.+)\]$/);
      return m ? `<div class="k-head-line">${esc(m[1])}</div>` : `<div class="k-plain-line">${esc(line) || '&nbsp;'}</div>`;
    }).join('')}</div>`;
  }
  box.scrollTop = 0;

  const vid = $('#k-video');
  vid.innerHTML = '';
  vid.hidden = !(isSync && videoId);
  $('#k-source').textContent = isSync ? t(videoId ? 'karaoke.sourceVideo' : 'karaoke.sourceClock') : '';
  applySize();
  el.hidden = false;
  document.documentElement.classList.add('k-open');
  renderPlay();
  $('#k-close').focus();

  if (isSync && videoId) {
    try {
      await loadYT();
      const holder = document.createElement('div');
      vid.appendChild(holder);
      await new Promise(resolve => {
        K.player = new window.YT.Player(holder, {
          videoId, host: 'https://www.youtube-nocookie.com',
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: resolve,
            onStateChange: e => { K.playing = e.data === 1; renderPlay(); wake(K.playing); }
          }
        });
      });
    } catch {
      K.player = null; vid.hidden = true;
      $('#k-source').textContent = t('karaoke.sourceClock');
    }
  }
  cancelAnimationFrame(K.raf);
  if (isSync) K.raf = requestAnimationFrame(tick);
}

export function closeKaraoke() {
  const el = $('#karaoke');
  if (el.hidden) return;
  cancelAnimationFrame(K.raf);
  try { K.player?.destroy?.(); } catch { /* egal */ }
  K.player = null; K.playing = false;
  wake(false);
  el.hidden = true;
  document.documentElement.classList.remove('k-open');
}

export function bindKaraoke() {
  const el = $('#karaoke');
  el.addEventListener('click', e => {
    if (e.target.closest('#k-close')) return closeKaraoke();
    if (e.target.closest('#k-play')) return setPlaying(!K.playing);
    if (e.target.closest('[data-k-shift]')) {
      K.offset += Number(e.target.closest('[data-k-shift]').dataset.kShift);
      K.idx = -2;
      $('#k-offset').textContent = (K.offset > 0 ? '+' : '') + K.offset.toFixed(1) + ' s';
      return;
    }
    if (e.target.closest('[data-k-size]')) {
      K.size = Math.min(1.8, Math.max(0.7, K.size + Number(e.target.closest('[data-k-size]').dataset.kSize)));
      try { localStorage.setItem('glasklang-k-size', K.size); } catch { /* egal */ }
      return applySize();
    }
    const line = e.target.closest('[data-k-seek]');
    if (line) { seek(Number(line.dataset.kSeek)); if (!K.playing) setPlaying(true); }
  });
  $('#k-seek').addEventListener('input', e => seek(Number(e.target.value) / 10));
  document.addEventListener('keydown', e => {
    if (el.hidden) return;
    if (e.key === 'Escape') closeKaraoke();
    else if (e.code === 'Space' && el.classList.contains('is-sync') && !e.target.closest('input, button')) { e.preventDefault(); setPlaying(!K.playing); }
  });
}
