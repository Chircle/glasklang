// Glasklang · App
import { createStore } from './store.js';
import { initSky, initOrb, initTilt, initDock, layoutBubbles, reveal, popIcon, ripple, reduced } from './motion.js';
import { createMetronome, tempoName, METERS } from './metronome.js';
import { LANGS, t, L, isFallback, setLang, getLang, detectLang, translateDOM, compare, langName, autonym, keyName, fmtNum } from './i18n.js';
import { searchLyrics, lrcToPlain, fmtDuration, externalLyricsLinks } from './lyrics.js';
import { openKaraoke, closeKaraoke, bindKaraoke } from './karaoke.js';
import { artistKey, avatarHTML, processImage } from './avatars.js';
import { youtubeEnabled, searchVideos } from './youtube.js';
import { coachSchema, buildPrompt, validatePlan, rulePlan } from './coach.js';
import { searchRecordings } from './musicbrainz.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------------------------------------------------- Konstanten */
const ENUMS = {
  mood: ['powerful', 'emotional', 'playful', 'dramatic', 'gentle'],
  difficulty: ['beginner', 'intermediate', 'advanced'],
  register: ['chest', 'mix', 'head', 'falsetto', 'whistle'],
  techniques: ['belting', 'mix', 'legit', 'twang', 'runs', 'support']
};
const TECH_COLORS = { belting: '#ef7a6c', mix: '#9a6bff', legit: '#6fb6ff', twang: '#f5a65b', runs: '#e36fb4', support: '#45c19a' };
const DIFF_RANK = { beginner: 1, intermediate: 2, advanced: 3 };
const EDIT_LANGS = ['de', 'en', 'fr', 'es', 'it', 'pt', 'nl', 'sv', 'da', 'no', 'pl', 'cs', 'hu', 'el', 'tr', 'ru', 'ja', 'ko', 'zh', 'he', 'ar', 'la'];
const VIEWS = ['katalog', 'technik', 'metronom', 'plan'];
const COACH_DEFAULT = { note: '', source: 'plan', result: null, at: null };
const METRO_DEFAULT = { bpm: 96, meter: 4, sound: 'glas', volume: 0.7, accent: true };
const mobile = matchMedia('(max-width: 900px)');
const coarse = matchMedia('(pointer: coarse)');
const haptic = (ms = 8) => { try { if (coarse.matches) navigator.vibrate?.(ms); } catch { /* egal */ } };
const tEnum = (group, id) => (id ? t(`enum.${group}.${id}`) : '–');
const bpmTxt = s => (s.bpm ? fmtNum(s.bpm) : '–');

const S = {
  store: null, user: null, artists: {},
  songs: [], cats: [], comp: [], compSel: null,
  u: { favorites: [], completed: [], notes: {}, theme: null, lang: null, metronome: null },
  f: { q: '', cat: 'ALL', mood: 'ALL', diff: 'ALL', reg: 'ALL', vlang: 'ALL', sort: 'order', tech: 'ALL', fav: false },
  layout: 'grid', view: 'katalog', sel: null, list: [], verSel: {}, editing: null
};

/* ------------------------------------------------------- Song-Helfer */
const song = id => S.songs.find(s => s.id === id);
const versions = s => (s.versions && s.versions.length ? s.versions : [{ id: 'orig', lang: 'en', title: L(s.title) || s.id, performer: '', lyrics: '', video: '' }]);
const mainTitle = s => versions(s)[0].title;
const altTitles = s => versions(s).slice(1).map(v => v.title).filter(x => x && x !== mainTitle(s));
const catOf = id => S.cats.find(c => c.id === id);
const catLabel = id => L(catOf(id)?.label) || id;
function currentVersion(s) {
  const vs = versions(s);
  return vs.find(v => v.id === S.verSel[s.id]) || vs.find(v => v.lang === getLang()) || vs[0];
}
function sectionLabel(x) {
  if (x.type === 'custom') return L(x.label);
  return t(`section.${x.type}`) + (x.n ? ` ${x.n}` : '');
}
const dash = v => (v ? v : '–');
const fb = v => (isFallback(v) ? ` <span class="fb" title="${esc(t('content.fallback'))}">DE</span>` : '');

/* ------------------------------------------------------------- Theme */
function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name="theme-color"]').content = dark ? '#080b1c' : '#e8eafb';
  $$('[data-theme-switch]').forEach(b => b.setAttribute('aria-checked', String(dark)));
  try { localStorage.setItem('glasklang-theme', dark ? 'dark' : 'light'); } catch { /* egal */ }
}
function toggleTheme() {
  S.u.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(S.u.theme);
  save();
  if (S.view === 'technik') requestAnimationFrame(renderBubbles);
}

/* ------------------------------------------------------------ Sprache */
async function changeLang(l) {
  await setLang(l);
  S.u.lang = l;
  try { localStorage.setItem('glasklang-lang', l); } catch { /* egal */ }
  save();
  renderAll();
}
function renderControls() {
  $$('[data-controls]').forEach(host => {
    $$('[data-lang-code]', host).forEach(el => { el.textContent = getLang().toUpperCase(); });
    const menu = $('[data-lang-menu]', host);
    if (menu) menu.innerHTML = LANGS.map(l =>
      `<li role="option" aria-selected="${l === getLang()}"><button type="button" class="lang-opt ${l === getLang() ? 'is-on' : ''}" data-set-lang="${l}"><b>${l.toUpperCase()}</b>${esc(autonym(l))}</button></li>`).join('');
  });
}
function mountControls() {
  const tpl = $('#tpl-controls');
  $$('[data-controls]').forEach(host => { host.replaceChildren(tpl.content.cloneNode(true)); });
}

/* -------------------------------------------------------- Speichern */
let saveTimer;
function save(delay = 500) {
  if (!S.user) return;
  clearTimeout(saveTimer);
  setSync('sync.saving');
  saveTimer = setTimeout(async () => {
    try { await S.store.saveUserState(S.u); setSync('sync.saved'); }
    catch (e) { console.error(e); setSync('sync.failed'); toast(t('toast.saveFailed')); }
  }, delay);
}
let syncKey = 'sync.ready';
function setSync(k) { syncKey = k; $('#sync-label').textContent = t(k); }

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ------------------------------------------------------------- Gate */
let gateDenied = null;
function showGate(denied = null) {
  gateDenied = denied;
  $('#app').hidden = true;
  $('#gate').hidden = false;
  $('#gate-lead').textContent = denied ? t('gate.denied', { email: denied }) : t('gate.lead');
  $('#btn-signin').hidden = !!denied;
  $('#btn-gate-signout').hidden = !denied;
}

/* ------------------------------------------------------------ Laden */
async function enterApp() {
  $('#gate').hidden = true;
  $('#app').hidden = false;
  let demoHidden = false;
  try { demoHidden = sessionStorage.getItem('glasklang-demo-hidden') === '1'; } catch { /* egal */ }
  $('#demo-banner').hidden = !S.store.demo || demoHidden;

  const name = S.user.displayName || S.user.email;
  $('#user-name').textContent = name.split(' ')[0];
  $('#user-mail').textContent = S.user.email;
  const av = $('#user-avatar');
  if (S.user.photoURL) { av.style.backgroundImage = `url("${S.user.photoURL}")`; av.textContent = ''; }
  else av.textContent = name.slice(0, 1).toUpperCase();

  setSync('sync.loading');
  const [songs, cats, comp, u, artists] = await Promise.all([S.store.songs(), S.store.categories(), S.store.compendium(), S.store.loadUserState(), S.store.artists().catch(() => ({}))]);
  S.artists = artists || {};
  S.songs = songs.map(s => ({ ...s, techniques: s.techniques || [], sections: s.sections || [], versions: s.versions || [] }))
                 .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  S.cats = cats.length ? [...cats].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                       : [...new Set(S.songs.map(s => s.category))].map((id, i) => ({ id, label: id, order: i }));
  S.comp = comp;
  S.u = { ...S.u, favorites: [], completed: [], notes: {}, ...u };
  S.u.coach = { ...COACH_DEFAULT, ...(S.u.coach || {}) };
  if (S.u.theme) applyTheme(S.u.theme);
  if (S.u.lang && S.u.lang !== getLang()) await setLang(S.u.lang);
  S.sel = S.sel || (song('wk1') ? 'wk1' : S.songs[0]?.id) || null;
  setSync('sync.ready');

  $('#seed-tile').hidden = !(!S.store.demo && S.songs.length === 0);
  metroApply({ ...METRO_DEFAULT, ...(S.u.metronome || {}) }, false);
  renderAll();
  route();
  countUp($('#kpi-total'), S.songs.length);
  countUp($('#kpi-cats'), S.cats.length);
}
function refreshCatalogCounts() {
  $('#kpi-total').textContent = fmtNum(S.songs.length);
  $('#kpi-cats').textContent = fmtNum(S.cats.length);
  $('#seed-tile').hidden = !(!S.store.demo && S.songs.length === 0);
}

function renderAll() {
  translateDOM();
  renderControls();
  $('#sync-label').textContent = t(syncKey);
  if (!$('#gate').hidden) showGate(gateDenied);
  if (!S.user) return;
  $('#kpi-total-l').textContent = t('kpi.songs', { count: S.songs.length });
  $('#kpi-cats-l').textContent = t('kpi.categories', { count: S.cats.length });
  fillSelects();
  renderChips();
  renderComp(S.compSel);
  fillMetroSongs();
  metroLabels();
  if (S.view === 'technik') renderBubbles();
  if (S.view === 'plan') renderPlan();
  apply();
}

function countUp(el, to) {
  if (reduced) { el.textContent = fmtNum(to); return; }
  const t0 = performance.now(), dur = 1100;
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = fmtNum(Math.round(to * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* -------------------------------------------------------- Filter-UI */
function fillSelects() {
  const all = `<option value="ALL">${esc(t('filter.all'))}</option>`;
  const count = fn => S.songs.filter(fn).length;
  $('#f-cat').innerHTML = all + S.cats.map(c => `<option value="${esc(c.id)}">${esc(L(c.label))} (${fmtNum(count(s => s.category === c.id))})</option>`).join('');
  [['#f-mood', 'mood'], ['#f-diff', 'difficulty'], ['#f-reg', 'register']].forEach(([sel, g]) => {
    $(sel).innerHTML = all + ENUMS[g].map(id => `<option value="${id}">${esc(tEnum(g, id))}</option>`).join('');
  });
  const langs = [...new Set(S.songs.flatMap(s => versions(s).map(v => v.lang)))]
    .sort((a, b) => compare(langName(a), langName(b)));
  $('#f-lang').innerHTML = all + langs.map(l => `<option value="${l}">${esc(langName(l))} (${fmtNum(count(s => versions(s).some(v => v.lang === l)))})</option>`).join('');
  $('#f-cat').value = S.f.cat; $('#f-mood').value = S.f.mood; $('#f-diff').value = S.f.diff;
  $('#f-reg').value = S.f.reg; $('#f-lang').value = S.f.vlang; $('#f-sort').value = S.f.sort;
}

function renderChips() {
  $('#tech-chips').innerHTML =
    `<button type="button" class="chip ${S.f.tech === 'ALL' ? 'is-on' : ''}" data-tech="ALL">${esc(t('filter.allTechniques'))}</button>` +
    ENUMS.techniques.map(id => `<button type="button" class="chip ${S.f.tech === id ? 'is-on' : ''}" data-tech="${id}"><span class="dot" style="--c:${TECH_COLORS[id]}"></span>${esc(tEnum('techniques', id))}</button>`).join('');
}

function renderBubbles() {
  const items = ENUMS.techniques.map(id => ({ name: id, label: tEnum('techniques', id), color: TECH_COLORS[id], count: S.songs.filter(s => s.techniques.includes(id)).length }));
  layoutBubbles($('#bubbles'), items, { active: S.f.tech, onPick: id => { setTech(id, true); setTimeout(() => go('katalog'), reduced ? 0 : 420); } });
}

function setTech(id, announce = false) {
  S.f.tech = id;
  renderChips();
  $$('.bubble').forEach(b => { const on = b.dataset.name === id; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
  apply();
  if (announce && id !== 'ALL') toast(t('toast.filter', { name: tEnum('techniques', id) }));
}

function renderComp(id) {
  const tabs = $('#comp-tabs');
  if (!S.comp.length) { tabs.innerHTML = ''; $('#comp-body').innerHTML = `<p class="muted">${esc(t('technik.compEmpty'))}</p>`; return; }
  const cur = S.comp.find(c => c.id === id) || S.comp[0];
  S.compSel = cur.id;
  tabs.innerHTML = S.comp.map(c => `<button type="button" role="tab" class="seg ${c.id === cur.id ? 'is-on' : ''}" aria-selected="${c.id === cur.id}" data-comp="${esc(c.id)}">${esc(L(c.title))}</button>`).join('');
  const body = $('#comp-body');
  body.innerHTML = L(cur.html) + (isFallback(cur.html) ? `<p class="fb-note">${esc(t('content.fallback'))}</p>` : ''); // pflegt nur die Besitzerin/der Besitzer
  body.style.animation = 'none'; void body.offsetWidth; body.style.animation = '';
}

/* --------------------------------------------------- Filtern & Liste */
function haystack(s) {
  const flat = v => (v && typeof v === 'object' ? Object.values(v).join(' ') : v ?? '');
  return [
    ...versions(s).flatMap(v => [v.title, v.performer, v.lyrics, langName(v.lang)]),
    flat(s.artist), catLabel(s.category), flat(s.tip),
    ...s.techniques.map(id => tEnum('techniques', id)),
    tEnum('mood', s.mood), tEnum('difficulty', s.difficulty), tEnum('register', s.register), keyName(s.key),
    ...s.sections.flatMap(x => [sectionLabel(x), flat(x.cue)])
  ].join(' ').toLowerCase();
}

function apply() {
  const q = S.f.q.trim().toLowerCase();
  S.list = S.songs.filter(s => {
    if (S.f.cat !== 'ALL' && s.category !== S.f.cat) return false;
    if (S.f.mood !== 'ALL' && s.mood !== S.f.mood) return false;
    if (S.f.diff !== 'ALL' && s.difficulty !== S.f.diff) return false;
    if (S.f.reg !== 'ALL' && s.register !== S.f.reg) return false;
    if (S.f.vlang !== 'ALL' && !versions(s).some(v => v.lang === S.f.vlang)) return false;
    if (S.f.tech !== 'ALL' && !s.techniques.includes(S.f.tech)) return false;
    if (S.f.fav && !S.u.favorites.includes(s.id)) return false;
    if (q && !haystack(s).includes(q)) return false;
    return true;
  });
  if (S.f.sort === 'title') S.list.sort((a, b) => compare(mainTitle(a), mainTitle(b)));
  else if (S.f.sort === 'diff') S.list.sort((a, b) => (DIFF_RANK[a.difficulty] || 9) - (DIFF_RANK[b.difficulty] || 9));
  else if (S.f.sort === 'bpm') S.list.sort((a, b) => a.bpm - b.bpm);

  if (S.list.length && !S.list.some(s => s.id === S.sel) && !mobile.matches) S.sel = S.list[0].id;

  $('#list-count').textContent = fmtNum(S.list.length);
  $('#kpi-favs').textContent = fmtNum(S.u.favorites.length);
  $('#kpi-done').textContent = fmtNum(S.u.completed.length);
  const active = ['cat', 'mood', 'diff', 'reg', 'vlang', 'tech'].filter(k => S.f[k] !== 'ALL').length + (S.f.fav ? 1 : 0) + (q ? 1 : 0);
  $('#filter-note').textContent = active ? t('filter.active', { count: active }) : t('filter.none');
  const sheetActive = active - (q ? 1 : 0);
  $('#filter-count').hidden = !sheetActive;
  $('#filter-count').textContent = sheetActive;
  $('#filter-apply').textContent = t('filter.showResults', { count: S.list.length });
  $('#f-fav').setAttribute('aria-pressed', String(S.f.fav));
  $$('[data-action="plan"]').forEach(b => b.classList.toggle('is-on', S.f.fav));
  renderCards();
  renderInspector();
}

function artistAvatar(s, size, cls = '') {
  const key = artistKey(s.artist);
  return avatarHTML({ name: L(s.artist), key, image: S.artists[key]?.image, size, cls });
}
const diffBadge = d => d === 'beginner' ? 'badge--mint' : d === 'advanced' ? 'badge--coral' : 'badge--accent';

function renderCards() {
  const box = $('#cards');
  box.dataset.layout = S.layout;
  if (!S.list.length) {
    box.innerHTML = `<div class="empty glass"><h3 class="tile-title">${esc(t('empty.title'))}</h3>
      <p class="muted">${esc(t('empty.text'))}</p>
      <button type="button" class="btn btn--primary" data-reset>${esc(t('filter.reset'))}</button></div>`;
    return;
  }
  box.innerHTML = S.list.map(s => {
    const fav = S.u.favorites.includes(s.id), done = S.u.completed.includes(s.id);
    const vs = versions(s), alts = altTitles(s);
    return `<article class="card ${s.id === S.sel ? 'is-selected' : ''}" data-id="${esc(s.id)}" tabindex="0" role="button" aria-pressed="${s.id === S.sel}" aria-label="${esc(t('card.open', { title: mainTitle(s) }))}">
      <div class="card-top">
        ${artistAvatar(s, 42, 'card-av')}
        <div class="card-badges">
          ${vs.length > 1 || vs[0].lang !== 'en' ? `<span class="langs" title="${esc(t('versions.title'))}">${vs.map(v => `<b>${esc(v.lang.toUpperCase())}</b>`).join('')}</span>` : ''}
          <span class="badge ${diffBadge(s.difficulty)}">${esc(tEnum('difficulty', s.difficulty))}</span>
        </div>
      </div>
      <div>
        <h3 class="card-title">${esc(mainTitle(s))}</h3>
        ${alts.length ? `<div class="card-alt">${alts.map(esc).join(' · ')}</div>` : ''}
        <div class="card-artist">${esc(L(s.artist))}</div>
      </div>
      <div class="card-facts">
        <div><div class="fact-l">${esc(t('meta.key'))}</div><div class="fact-v">${esc(dash(keyName(s.key)))}</div></div>
        <div><div class="fact-l">${esc(t('meta.range'))}</div><div class="fact-v">${esc(dash(s.range))}</div></div>
        <div><div class="fact-l">${esc(t('meta.tempo'))}</div><div class="fact-v">${esc(bpmTxt(s))} BPM</div></div>
      </div>
      <div class="card-foot">
        <div class="badges">${s.techniques.slice(0, 3).map(id => `<span class="badge">${esc(tEnum('techniques', id))}</span>`).join('')}${s.techniques.length > 3 ? `<span class="badge">+${s.techniques.length - 3}</span>` : ''}</div>
        <div class="card-actions">
          <button type="button" class="icon-btn ${fav ? 'is-fav' : ''}" data-fav="${esc(s.id)}" aria-pressed="${fav}" aria-label="${esc(t('action.plan'))}" title="${esc(t('action.plan'))}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-star"/></svg></button>
          <button type="button" class="icon-btn ${done ? 'is-done' : ''}" data-done="${esc(s.id)}" aria-pressed="${done}" aria-label="${esc(t('action.done'))}" title="${esc(t('action.done'))}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-check"/></svg></button>
        </div>
      </div>
    </article>`;
  }).join('');
  reveal($$('.card', box));
}

/* ------------------------------------------------------------ Videos */
function youtubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (/(^|\.)youtube(-nocookie)?\.com$/.test(u.hostname)) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(embed|shorts|live|v)\/([\w-]{6,})/);
      return m ? m[2] : null;
    }
  } catch { /* keine URL */ }
  return null;
}
function searchUrl(s, v) {
  const orig = versions(s)[0];
  const parts = [v.title, v.performer || L(s.artist)];
  if (v.lang !== orig.lang) parts.push(autonym(v.lang));
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(parts.filter(Boolean).join(' '));
}
const YT = { tried: new Set(), busy: new Set(), quota: false, open: null };
const ytKey = (s, v) => `${s.id}:${v.id}`;

function videoBlock(s, v) {
  const id = youtubeId(v.video);
  const k = ytKey(s, v);
  if (id) {
    const alts = (v.videoAlts || []).filter(a => a.id !== id);
    const canPick = alts.length || youtubeEnabled();
    const open = YT.open === k;
    return `<div class="video" data-key="${esc(k + ':' + id)}"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&playsinline=1" title="${esc(v.videoTitle || v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
      <div class="video-meta">
        ${v.videoAuto ? `<span class="badge badge--accent">${esc(t('video.auto'))}</span>` : ''}
        <a class="link-ext" href="https://www.youtube.com/watch?v=${encodeURIComponent(id)}" target="_blank" rel="noopener">${esc(t('video.openYoutube'))}<svg class="ico ico--sm" aria-hidden="true"><use href="#i-external"/></svg></a>
        ${canPick ? `<button type="button" class="btn btn--sm btn--ghost" data-video-alts aria-expanded="${open}">${esc(t('video.other'))}<svg class="ico ico--sm chev${open ? ' is-up' : ''}" aria-hidden="true"><use href="#i-chevron"/></svg></button>` : ''}
      </div>
      ${open ? videoAltsList(s, v, alts) : ''}`;
  }
  if (v.video) return `<a class="link-ext" href="${esc(v.video)}" target="_blank" rel="noopener">${esc(t('video.open'))}<svg class="ico ico--sm" aria-hidden="true"><use href="#i-external"/></svg></a>`;
  if (YT.busy.has(k)) return `<div class="video video--pending"><span class="spinner" aria-hidden="true"></span><span>${esc(t('video.searching'))}</span></div>`;
  return `<a class="link-ext" href="${esc(searchUrl(s, v))}" target="_blank" rel="noopener">${esc(t('video.search', { lang: langName(v.lang) }))}<svg class="ico ico--sm" aria-hidden="true"><use href="#i-external"/></svg></a>
    ${youtubeEnabled() && !YT.quota ? `<button type="button" class="btn btn--sm btn--ghost" data-video-find><svg class="ico ico--sm" aria-hidden="true"><use href="#i-search"/></svg>${esc(t('video.find'))}</button>` : ''}`;
}
function videoAltsList(s, v, alts) {
  return `<div class="video-alts">
    ${alts.length ? `<ul>${alts.map(a => `<li><button type="button" class="video-alt" data-video-pick="${esc(a.id)}">
        <img src="https://i.ytimg.com/vi/${encodeURIComponent(a.id)}/mqdefault.jpg" alt="" loading="lazy" width="96" height="54">
        <span><b>${esc(a.title)}</b><small>${esc(a.channel)}</small></span></button></li>`).join('')}</ul>`
      : `<p class="sec-empty">${esc(t('video.noAlts'))}</p>`}
    ${youtubeEnabled() && !YT.quota ? `<button type="button" class="btn btn--sm btn--ghost" data-video-find>${esc(t('video.searchAgain'))}</button>` : ''}
  </div>`;
}

/** Sucht das erste einbettbare Video und speichert es samt Alternativen an der Fassung. */
async function findVideo(s, v, { manual = false } = {}) {
  const k = ytKey(s, v);
  if (!youtubeEnabled() || YT.quota || YT.busy.has(k)) return;
  YT.tried.add(k); YT.busy.add(k);
  if (S.sel === s.id) renderInspector();
  try {
    const orig = versions(s)[0];
    const hits = await searchVideos({
      title: v.title,
      performer: v.performer || L(s.artist),
      lang: v.lang !== orig.lang ? v.lang : null
    });
    YT.busy.delete(k);
    if (!hits.length) { if (manual) toast(t('video.none')); if (S.sel === s.id) renderInspector(); return; }
    const keep = manual && youtubeId(v.video);
    const list = versions(s).map(x => (x.id === v.id
      ? { ...x, ...(keep ? {} : { video: `https://www.youtube.com/watch?v=${hits[0].id}`, videoTitle: hits[0].title, videoAuto: true }), videoAlts: hits }
      : { ...x }));
    await S.store.updateSong(s.id, { versions: list });
    s.versions = list;
    if (keep) YT.open = k;
  } catch (e) {
    YT.busy.delete(k);
    if (e.message === 'quota') { YT.quota = true; toast(t('video.quota')); }
    else if (e.message === 'denied') { YT.quota = true; toast(t('video.denied')); console.warn('YouTube-API: Schlüssel abgelehnt (Einschränkungen prüfen).'); }
    else if (manual) toast(t('video.failed'));
  }
  if (S.sel === s.id) renderInspector();
}
async function pickVideo(id) {
  const s = song(S.sel); if (!s) return;
  const v = currentVersion(s);
  const alt = (v.videoAlts || []).find(a => a.id === id);
  const list = versions(s).map(x => (x.id === v.id ? { ...x, video: `https://www.youtube.com/watch?v=${id}`, videoTitle: alt?.title || '', videoAuto: false } : { ...x }));
  try {
    await S.store.updateSong(s.id, { versions: list });
    s.versions = list; YT.open = null;
    toast(t('video.picked'));
    renderInspector();
  } catch (e) { console.error(e); toast(t('toast.saveFailed')); }
}
/** Nach dem Rendern: fehlt das Video, automatisch das beste Ergebnis holen (einmal pro Fassung). */
function maybeAutoVideo(s, v) {
  if (!s || !v || v.video || !youtubeEnabled() || YT.quota) return;
  if (YT.tried.has(ytKey(s, v))) return;
  setTimeout(() => {
    // nur, wenn der Song wirklich sichtbar ist (Handy: Sheet offen)
    if (S.sel !== s.id || S.view !== 'katalog') return;
    if (mobile.matches && !$('#inspector').classList.contains('is-open')) return;
    if (currentVersion(s).id !== v.id) return;
    findVideo(s, v);
  }, 400);
}
function lyricsBlock(text) {
  const blocks = [];
  let cur = { head: null, lines: [] };
  for (const line of String(text).replace(/\r/g, '').split('\n')) {
    const m = line.trim().match(/^\[(.+)\]$/);
    if (m) { if (cur.head || cur.lines.some(Boolean)) blocks.push(cur); cur = { head: m[1], lines: [] }; }
    else cur.lines.push(line);
  }
  if (cur.head || cur.lines.some(Boolean)) blocks.push(cur);
  return blocks.map(b => `<div class="ly-block">${b.head ? `<div class="ly-head">${esc(b.head)}</div>` : ''}<p class="ly-lines">${esc(b.lines.join('\n').trim())}</p></div>`).join('');
}

/* --------------------------------------------------------- Inspektor */
/**
 * Ersetzt den Inhalt von box durch html, lässt aber ein laufendes Video-iframe
 * (gleiches data-key) im DOM stehen – sonst würde jedes Neuzeichnen das Video neu laden.
 */
function patchKeepVideo(box, html) {
  const oldKeep = box.querySelector('.video[data-key]');
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const newKeep = tpl.content.querySelector('.video[data-key]');
  if (!oldKeep || !newKeep || oldKeep.dataset.key !== newKeep.dataset.key) { box.innerHTML = html; return; }
  const merge = (oldP, newP) => {
    const oldPath = [...oldP.children].find(c => c === oldKeep || c.contains(oldKeep));
    const newPath = [...newP.children].find(c => c === newKeep || c.contains(newKeep));
    if (!oldPath || !newPath || (oldPath !== oldKeep && oldPath.tagName !== newPath.tagName)) return false;
    [...oldP.childNodes].forEach(n => { if (n !== oldPath) n.remove(); });
    const nodes = [...newP.childNodes], idx = nodes.indexOf(newPath);
    oldPath.before(...nodes.slice(0, idx));
    oldPath.after(...nodes.slice(idx + 1));
    if (oldPath === oldKeep) return true;
    [...oldPath.attributes].forEach(at => oldPath.removeAttribute(at.name));
    [...newPath.attributes].forEach(at => oldPath.setAttribute(at.name, at.value));
    return merge(oldPath, newPath);
  };
  if (!merge(box, tpl.content)) box.innerHTML = html;
}

function renderInspector() {
  const box = $('#inspector-inner');
  const s = song(S.sel);
  if (!s) { box.innerHTML = `<p class="muted">${esc(t(S.songs.length ? 'sheet.pick' : 'sheet.noSongs'))}</p>`; return; }
  const fav = S.u.favorites.includes(s.id), done = S.u.completed.includes(s.id);
  const v = currentVersion(s), vs = versions(s);
  const alts = altTitles(s);
  const hasImg = !!S.artists[artistKey(s.artist)]?.image;
  const links = externalLyricsLinks(v.title, v.performer || L(s.artist));
  patchKeepVideo(box, `<div class="insp-anim">
    <div class="insp-head">
      <div class="insp-avatar">
        ${artistAvatar(s, 72, 'av-lg')}
        <button type="button" class="av-edit" data-avatar-pick aria-label="${esc(t(hasImg ? 'avatar.change' : 'avatar.add'))}" title="${esc(t(hasImg ? 'avatar.change' : 'avatar.add'))}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-camera"/></svg></button>
        ${hasImg ? `<button type="button" class="av-remove" data-avatar-remove aria-label="${esc(t('avatar.remove'))}" title="${esc(t('avatar.remove'))}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-x"/></svg></button>` : ''}
      </div>
      <div class="insp-heading">
        <div class="insp-kicker">${esc(catLabel(s.category))} · ${esc(tEnum('mood', s.mood))} · ${esc(tEnum('difficulty', s.difficulty))}</div>
        <h2 class="insp-title">${esc(mainTitle(s))}</h2>
        ${alts.length ? `<div class="card-alt">${alts.map(esc).join(' · ')}</div>` : ''}
        <div class="muted">${esc(L(s.artist))}</div>
      </div>
      <button type="button" class="icon-btn insp-back" data-close aria-label="${esc(t('common.close'))}"><svg class="ico" aria-hidden="true"><use href="#i-x"/></svg></button>
    </div>

    <div class="meta">
      <div><span class="meta-v">${esc(dash(keyName(s.key)))}</span><span class="meta-l">${esc(t('meta.key'))}</span></div>
      <div><span class="meta-v">${esc(dash(s.range))}</span><span class="meta-l">${esc(t('meta.range'))}</span></div>
      <div><span class="meta-v">${esc(bpmTxt(s))}</span><span class="meta-l">BPM</span></div>
      <div><span class="meta-v">${esc(tEnum('register', s.register))}</span><span class="meta-l">${esc(t('meta.register'))}</span></div>
    </div>
    ${s.review ? `<p class="review-note">${esc(t('meta.review'))} <button type="button" class="link-btn" data-song-edit>${esc(t('song.complete'))}</button></p>` : ''}

    <div class="row-actions">
      <button type="button" class="btn btn--sm ${fav ? 'btn--primary' : ''}" data-fav="${esc(s.id)}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-star"/></svg>${esc(t(fav ? 'action.inPlan' : 'action.plan'))}</button>
      <button type="button" class="btn btn--sm ${done ? 'btn--primary' : ''}" data-done="${esc(s.id)}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-check"/></svg>${esc(t(done ? 'action.isDone' : 'action.done'))}</button>
      <button type="button" class="btn btn--sm btn--ghost" data-metro="${esc(s.id)}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-metro"/></svg>${esc(bpmTxt(s))} BPM</button>
      <button type="button" class="btn btn--sm btn--ghost" data-song-edit><svg class="ico ico--sm" aria-hidden="true"><use href="#i-edit"/></svg>${esc(t('song.edit'))}</button>
      <button type="button" class="btn btn--sm btn--ghost" data-print><svg class="ico ico--sm" aria-hidden="true"><use href="#i-printer"/></svg>${esc(t('action.print'))}</button>
      <button type="button" class="btn btn--sm btn--ghost" data-txt><svg class="ico ico--sm" aria-hidden="true"><use href="#i-file"/></svg>TXT</button>
    </div>

    <section class="versions">
      <div class="versions-head">
        <span class="lbl">${esc(t('versions.title'))}</span>
        <div class="segmented" role="tablist">
          ${vs.map(x => `<button type="button" role="tab" class="seg ${x.id === v.id ? 'is-on' : ''}" aria-selected="${x.id === v.id}" data-version="${esc(x.id)}">${esc(langName(x.lang))}</button>`).join('')}
          <button type="button" class="seg seg--add" data-version-add aria-label="${esc(t('versions.add'))}" title="${esc(t('versions.add'))}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-plus"/></svg></button>
        </div>
      </div>
      <div class="version-card" lang="${esc(v.lang)}">
        <div class="version-top">
          <div>
            <div class="version-title">${esc(v.title)}</div>
            <div class="muted version-sub">${esc(v.performer || L(s.artist))} · ${esc(autonym(v.lang))}</div>
          </div>
          <button type="button" class="btn btn--sm btn--ghost" data-version-edit="${esc(v.id)}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-edit"/></svg>${esc(t('versions.edit'))}</button>
        </div>
        ${videoBlock(s, v)}
        <div class="ly-actions">
          ${v.synced ? `<button type="button" class="btn btn--sm btn--primary" data-karaoke><svg class="ico ico--sm" aria-hidden="true"><use href="#i-mic"/></svg>${esc(t('karaoke.open'))}</button>` : ''}
          ${v.lyrics ? `<button type="button" class="btn btn--sm ${v.synced ? 'btn--ghost' : 'btn--primary'}" data-lyrics-view><svg class="ico ico--sm" aria-hidden="true"><use href="#i-text"/></svg>${esc(t('karaoke.openPlain'))}</button>` : ''}
          <button type="button" class="btn btn--sm ${v.lyrics ? 'btn--ghost' : 'btn--primary'}" data-lyrics-load><svg class="ico ico--sm" aria-hidden="true"><use href="#i-download"/></svg>${esc(t(v.lyrics ? 'lyrics.reload' : 'lyrics.load'))}</button>
        </div>
        ${v.synced ? `<span class="badge badge--accent ly-sync-badge">${esc(t('lyrics.synced'))}</span>` : ''}
        ${v.lyrics
          ? `<div class="lyrics-wrap">
              <button type="button" class="icon-btn ly-expand" data-lyrics-view aria-label="${esc(t('lyrics.fullscreen'))}" title="${esc(t('lyrics.fullscreen'))}"><svg class="ico" aria-hidden="true"><use href="#i-expand"/></svg></button>
              <div class="lyrics" data-karaoke-tap>${lyricsBlock(v.lyrics)}</div>
            </div>`
          : `<div class="lyrics"><p class="sec-empty">${esc(t('versions.noLyricsOwner'))}</p></div>`}
        <p class="ly-links"><span>${esc(t('lyrics.elsewhere'))}</span> ${links.map(l => `<a class="link-ext" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}<svg class="ico ico--sm" aria-hidden="true"><use href="#i-external"/></svg></a>`).join(' ')}</p>
      </div>
    </section>

    <div class="coach">
      <span class="lbl">${esc(t('sheet.coaching'))}</span>
      <div class="badges">${s.techniques.map(id => `<span class="badge" style="background:color-mix(in srgb, ${TECH_COLORS[id] || '#9a6bff'} 18%, transparent);border-color:transparent">${esc(tEnum('techniques', id))}</span>`).join('')}</div>
      <p>${esc(L(s.tip))}${fb(s.tip)}</p>
      ${s.coachingQuery ? `<a class="link-ext" href="https://www.youtube.com/results?search_query=${encodeURIComponent(s.coachingQuery)}" target="_blank" rel="noopener">${esc(t('sheet.coachingVideos'))}<svg class="ico ico--sm" aria-hidden="true"><use href="#i-external"/></svg></a>` : ''}
    </div>

    <div>
      <span class="lbl">${esc(t('sheet.sections'))}</span>
      <div class="sec-list">${s.sections.map(x => `
        <div class="sec">
          <div class="sec-head"><span class="sec-part">${esc(sectionLabel(x))}</span></div>
          <p class="sec-cue">${esc(L(x.cue))}${fb(x.cue)}</p>
        </div>`).join('')}
      </div>
    </div>

    <div>
      <label class="lbl" for="note">${esc(t('sheet.notes'))}</label>
      <textarea id="note" class="notes" data-note="${esc(s.id)}" placeholder="${esc(t('sheet.notesHint'))}">${esc(S.u.notes[s.id] || '')}</textarea>
    </div>
  </div>`);
  renderPrint(s);
  maybeAutoVideo(s, v);
}

/* ------------------------------------------------- Bottom-Sheets (Handy) */
function syncScrim() {
  const any = $('#inspector').classList.contains('is-open') || $('#filterbar').classList.contains('is-open');
  $('#scrim').hidden = !any;
  document.documentElement.classList.toggle('sheet-open', any);
}
function openSheet() { if (!mobile.matches) return; $('#inspector').classList.add('is-open'); syncScrim(); }
function closeSheet() { $('#inspector').classList.remove('is-open'); resetDrag($('#inspector')); syncScrim(); }
function openFilters() {
  if (!mobile.matches) return;
  const fb = $('#filterbar');
  fb.classList.add('is-open'); fb.scrollTop = 0;
  $('#btn-filters').setAttribute('aria-expanded', 'true');
  syncScrim();
}
function closeFilters() {
  const fb = $('#filterbar');
  fb.classList.remove('is-open'); resetDrag(fb);
  $('#btn-filters').setAttribute('aria-expanded', 'false');
  syncScrim();
}
function resetDrag(el) { el.style.transform = ''; el.classList.remove('is-dragging'); }

/* Nach unten wischen schließt ein Sheet – am Griff oder wenn der Inhalt ganz oben steht */
function swipeToClose(sheet, scroller, onClose) {
  let y0 = null, dy = 0, t0 = 0, armed = false;
  sheet.addEventListener('touchstart', e => {
    if (!sheet.classList.contains('is-open') || e.touches.length !== 1) return;
    const onGrip = !!e.target.closest('[data-grip], .fsheet-head');
    armed = onGrip || scroller.scrollTop <= 0;
    y0 = e.touches[0].clientY; dy = 0; t0 = performance.now();
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (y0 == null || !armed) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0) { if (sheet.classList.contains('is-dragging')) resetDrag(sheet); return; }
    if (scroller.scrollTop > 0 && !e.target.closest('[data-grip], .fsheet-head')) return;
    e.preventDefault();
    sheet.classList.add('is-dragging');
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: false });
  sheet.addEventListener('touchend', () => {
    if (y0 == null) return;
    const v = dy / Math.max(1, performance.now() - t0);
    sheet.classList.remove('is-dragging');
    if (armed && (dy > 110 || (dy > 40 && v > .6))) onClose();
    else sheet.style.transform = '';
    y0 = null; dy = 0;
  });
}

/* Suchfeld: oben in der Kopfleiste (Desktop) bzw. in der klebenden Leiste über dem Katalog (Handy) */
function placeSearch() {
  const box = $('#search-box');
  const target = mobile.matches ? $('#search-slot-mobile') : $('#search-slot-top');
  if (box.parentElement !== target) target.appendChild(box);
  if (!mobile.matches) { closeFilters(); closeSheet(); }
}

function select(id) {
  S.sel = id;
  $$('.card').forEach(c => { const on = c.dataset.id === id; c.classList.toggle('is-selected', on); c.setAttribute('aria-pressed', String(on)); });
  renderInspector();
  $('#inspector-inner').scrollTop = 0;
  openSheet();
}

function toggleIn(listName, id, btn) {
  const arr = S.u[listName];
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1); else arr.push(id);
  const on = i < 0, attr = listName === 'favorites' ? 'fav' : 'done';
  $$(`[data-${attr}="${CSS.escape(id)}"].icon-btn`).forEach(b => {
    b.classList.toggle(listName === 'favorites' ? 'is-fav' : 'is-done', on);
    b.setAttribute('aria-pressed', String(on));
    popIcon(b);
  });
  if (btn && !btn.classList.contains('icon-btn')) popIcon(btn);
  haptic(on ? 12 : 6);
  $('#kpi-favs').textContent = fmtNum(S.u.favorites.length);
  $('#kpi-done').textContent = fmtNum(S.u.completed.length);
  if (listName === 'favorites') fillMetroSongs();
  if (id === S.sel) renderInspector();
  if (S.f.fav && listName === 'favorites') apply();
  if (S.view === 'plan') renderPlan();
  save(250);
}

/* ---------------------------------------------- Fassungen bearbeiten */
function openVersionEditor(songId, versionId) {
  const s = song(songId);
  if (!s) return;
  const v = versions(s).find(x => x.id === versionId) || null;
  S.editing = { songId, versionId: v?.id || null };
  const used = new Set(versions(s).map(x => x.lang));
  const pref = v?.lang || [getLang(), ...EDIT_LANGS].find(l => !used.has(l)) || 'en';
  $('#v-lang').innerHTML = EDIT_LANGS.map(l => `<option value="${l}">${esc(langName(l))}${autonym(l).toLowerCase() !== langName(l).toLowerCase() ? ' · ' + esc(autonym(l)) : ''}</option>`).join('');
  $('#v-lang').value = pref;
  $('#v-title').value = v?.title || '';
  $('#v-performer').value = v?.performer || '';
  $('#v-video').value = v?.video || '';
  $('#v-lyrics').value = v?.lyrics || '';
  $('#version-title').textContent = v ? t('edit.title') : t('versions.add');
  const del = $('#v-delete');
  del.hidden = !v || versions(s).length < 2;
  del.dataset.armed = ''; del.textContent = t('edit.delete');
  $('#version-dialog').showModal();
}
async function saveVersion(remove = false) {
  const { songId, versionId } = S.editing || {};
  const s = song(songId);
  if (!s) return;
  let list = versions(s).map(x => ({ ...x }));
  if (remove) list = list.filter(x => x.id !== versionId);
  else {
    const lang = $('#v-lang').value;
    const data = { lang, title: $('#v-title').value.trim(), performer: $('#v-performer').value.trim(), video: $('#v-video').value.trim(), lyrics: $('#v-lyrics').value };
    if (!data.lyrics.trim()) data.synced = '';
    if (versionId) list = list.map(x => (x.id === versionId ? { ...x, ...data } : x));
    else {
      let id = lang, n = 2;
      while (list.some(x => x.id === id)) id = `${lang}-${n++}`;
      list.push({ id, ...data });
      S.verSel[s.id] = id;
    }
  }
  try {
    await S.store.updateSong(s.id, { versions: list });
    s.versions = list;
    $('#version-dialog').close();
    toast(t(remove ? 'toast.versionDeleted' : 'toast.versionSaved'));
    fillSelects(); renderCards(); renderInspector();
  } catch (e) { console.error(e); toast(t('toast.saveFailed')); }
}

/* ------------------------------------------- Songtext laden (LRCLIB) */
const LY = { songId: null, versionId: null, results: [], pick: null };
function openLyricsDialog() {
  const s = song(S.sel);
  if (!s) return;
  const v = currentVersion(s);
  Object.assign(LY, { songId: s.id, versionId: v.id, results: [], pick: null });
  $('#ly-for').textContent = t('lyrics.for', { title: v.title, lang: langName(v.lang) });
  $('#ly-title').value = v.title;
  $('#ly-artist').value = v.performer || L(s.artist);
  $('#ly-results').innerHTML = '';
  $('#ly-preview').hidden = true;
  $('#ly-apply').disabled = true;
  $('#ly-status').textContent = '';
  $('#lyrics-dialog').showModal();
  runLyricsSearch();
}
async function runLyricsSearch() {
  const title = $('#ly-title').value.trim(), artist = $('#ly-artist').value.trim();
  if (!title) return;
  $('#ly-status').textContent = t('lyrics.searching');
  $('#ly-results').innerHTML = '';
  $('#ly-preview').hidden = true; $('#ly-apply').disabled = true; LY.pick = null;
  try {
    LY.results = await searchLyrics({ title, artist });
    $('#ly-status').textContent = LY.results.length ? t('lyrics.found', { count: LY.results.length }) : t('lyrics.none');
    $('#ly-results').innerHTML = LY.results.map((r, i) => `
      <li><button type="button" class="ly-hit" data-ly-pick="${i}">
        <span class="ly-hit-main"><b>${esc(r.trackName)}</b><span>${esc(r.artistName)}${r.albumName ? ' · ' + esc(r.albumName) : ''}</span></span>
        <span class="ly-hit-meta">${r.syncedLyrics ? `<span class="badge badge--accent">${esc(t('lyrics.synced'))}</span>` : ''}<span>${esc(fmtDuration(r.duration))}</span></span>
      </button></li>`).join('');
  } catch (e) {
    console.error(e);
    $('#ly-status').textContent = e.message === 'rate-limit' ? t('lyrics.rateLimit', { s: e.retryAfter }) : t('lyrics.error');
  }
}
function pickLyrics(i) {
  const r = LY.results[i];
  if (!r) return;
  LY.pick = r;
  $$('.ly-hit').forEach((b, j) => b.classList.toggle('is-on', j === i));
  $('#ly-p-title').textContent = `${r.trackName} · ${r.artistName}`;
  $('#ly-p-sync').hidden = !r.syncedLyrics;
  $('#ly-p-text').innerHTML = lyricsBlock(r.plainLyrics || lrcToPlain(r.syncedLyrics));
  $('#ly-preview').hidden = false;
  $('#ly-apply').disabled = false;
  $('#ly-preview').scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
}
async function applyLyrics() {
  const s = song(LY.songId), r = LY.pick;
  if (!s || !r) return;
  const list = versions(s).map(x => (x.id === LY.versionId
    ? { ...x, lyrics: r.plainLyrics || lrcToPlain(r.syncedLyrics), synced: r.syncedLyrics || '', lyricsSource: { provider: 'lrclib', id: r.id } }
    : { ...x }));
  try {
    await S.store.updateSong(s.id, { versions: list });
    s.versions = list;
    $('#lyrics-dialog').close();
    toast(t(r.syncedLyrics ? 'toast.lyricsSyncedSaved' : 'toast.lyricsSaved'));
    renderInspector();
  } catch (e) { console.error(e); toast(t(e.message === 'storage-full' ? 'toast.storageFull' : 'toast.saveFailed')); }
}

/* ------------------------------------------------ Vollbild / Karaoke */
/** plain = true → nur Text (ohne Mitlaufen), sonst Karaoke, falls Zeitstempel vorhanden. */
function startKaraoke(plain = false) {
  const s = song(S.sel);
  if (!s) return;
  const v = currentVersion(s);
  if (!v.lyrics && !v.synced) return;
  openKaraoke({
    title: v.title,
    sub: `${v.performer || L(s.artist)} · ${autonym(v.lang)}`,
    lyrics: v.lyrics || lrcToPlain(v.synced || ''), synced: plain ? null : v.synced, videoId: youtubeId(v.video), t
  });
}

/* ---------------------------------------------------- Profilbilder */
let avatarFor = null;
function pickAvatar() {
  const s = song(S.sel);
  if (!s) return;
  avatarFor = s;
  const input = $('#avatar-file');
  input.value = '';
  input.click();
}
async function onAvatarFile(file) {
  const s = avatarFor;
  if (!s || !file) return;
  const key = artistKey(s.artist);
  try {
    const image = await processImage(file);
    await S.store.setArtistImage(key, image, L(s.artist));
    S.artists[key] = { image, name: L(s.artist) };
    toast(t('avatar.saved', { name: L(s.artist) }));
    renderCards(); renderInspector();
  } catch (e) {
    console.error(e);
    toast(t(e.message === 'not-image' ? 'avatar.notImage' : e.message === 'storage-full' ? 'toast.storageFull' : 'toast.saveFailed'));
  }
}
async function removeAvatar() {
  const s = song(S.sel);
  if (!s) return;
  const key = artistKey(s.artist);
  try {
    await S.store.setArtistImage(key, null);
    delete S.artists[key];
    toast(t('avatar.removed'));
    renderCards(); renderInspector();
  } catch (e) { console.error(e); toast(t('toast.saveFailed')); }
}

/* ------------------------------------------------------------ Export */
function renderPrint(s) {
  const v = currentVersion(s), note = S.u.notes[s.id] || '';
  $('#print-sheet').innerHTML = `
    <h1>${esc(v.title)}</h1>
    <div><strong>${esc(v.performer || L(s.artist))}</strong> · ${esc(catLabel(s.category))} · ${esc(autonym(v.lang))}</div>
    <div class="p-meta">${esc(t('meta.key'))}: ${esc(dash(keyName(s.key)))} | ${esc(t('meta.range'))}: ${esc(dash(s.range))} | ${esc(t('meta.tempo'))}: ${esc(bpmTxt(s))} BPM | ${esc(t('filter.difficulty'))}: ${esc(tEnum('difficulty', s.difficulty))} | ${esc(t('meta.register'))}: ${esc(tEnum('register', s.register))} | ${esc(s.techniques.map(id => tEnum('techniques', id)).join(', '))}</div>
    <p><strong>${esc(t('sheet.coaching'))}:</strong> ${esc(L(s.tip))}</p>
    ${s.sections.map(x => `<div class="p-sec"><div class="p-sec-t">${esc(sectionLabel(x))}</div><div class="p-sec-c">${esc(L(x.cue))}</div></div>`).join('')}
    ${v.lyrics ? `<div class="p-lyrics">${lyricsBlock(v.lyrics)}</div>` : ''}
    <div class="p-notes"><strong>${esc(t('sheet.notes'))}:</strong><br>${note ? esc(note) : '<br>_______________________________________________<br><br>_______________________________________________'}</div>`;
}
function exportTxt(s) {
  const v = currentVersion(s);
  const lines = [
    `${v.title} — ${v.performer || L(s.artist)} (${autonym(v.lang)})`,
    `${t('meta.key')}: ${dash(keyName(s.key))} | ${t('meta.range')}: ${dash(s.range)} | ${t('meta.tempo')}: ${bpmTxt(s)} BPM | ${t('filter.difficulty')}: ${tEnum('difficulty', s.difficulty)} | ${t('meta.register')}: ${tEnum('register', s.register)}`,
    `${t('sheet.techniques')}: ${s.techniques.map(id => tEnum('techniques', id)).join(', ')}`,
    `${t('sheet.coaching')}: ${L(s.tip)}`,
    v.video ? `Video: ${v.video}` : '',
    '',
    ...s.sections.map(x => `[${sectionLabel(x)}] ${L(x.cue)}`),
    '',
    v.lyrics || '',
    S.u.notes[s.id] ? `\n${t('sheet.notes')}:\n${S.u.notes[s.id]}` : ''
  ].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines], { type: 'text/plain;charset=utf-8' }));
  a.download = `${s.id}-${v.lang}-glasklang.txt`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------------------------------------------------------- Ansichten */
function go(view) { if (location.hash !== '#/' + view) location.hash = '#/' + view; else route(); }
function route() {
  const v = (location.hash.match(/^#\/(\w+)/) || [])[1];
  const view = VIEWS.includes(v) ? v : 'katalog';
  const changed = view !== S.view;
  S.view = view;
  $$('.view').forEach(el => {
    const on = el.dataset.view === view;
    el.hidden = !on;
    if (on && changed && !reduced) { el.classList.remove('view-in'); void el.offsetWidth; el.classList.add('view-in'); }
  });
  $$('.dock-item[data-go]').forEach(a => a.classList.toggle('is-on', a.dataset.go === view));
  if (view !== 'katalog') { closeSheet(); closeFilters(); }
  closeKaraoke();
  if (view === 'technik') requestAnimationFrame(renderBubbles);
  if (view === 'plan') renderPlan();
  if (changed) window.scrollTo({ top: 0 });
}

/* ------------------------------------------- Song hinzufügen/bearbeiten */
const KEYS = [...['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].map(tonic => ({ tonic, mode: 'major' })),
  ...['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'].map(tonic => ({ tonic, mode: 'minor' }))];
const SD = { id: null, techs: new Set(), armed: false, performer: '', q2: '' };
const slug = x => String(x || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function openSongEditor(id = null) {
  const s = id ? song(id) : null;
  SD.id = s?.id || null; SD.armed = false; SD.performer = ''; SD.q2 = '';
  SD.techs = new Set(s?.techniques || []);
  const isNew = !s;
  $('#song-title').textContent = t(isNew ? 'song.addTitle' : 'song.editTitle');
  $('#sd-sub').textContent = isNew ? t('song.addLead') : `${mainTitle(s)} · ${L(s.artist)}`;
  $('#sd-find').hidden = !isNew;
  $('#sd-new-fields').hidden = !isNew;
  $('#sd-video-wrap').hidden = !isNew;
  $('#sd-delete').hidden = isNew;
  $('#sd-delete').textContent = t('song.delete');
  $('#sd-error').textContent = '';
  $('#sd-status').textContent = ''; $('#sd-results').innerHTML = '';
  $('#sd-q').value = '';
  $('#sd-lang').innerHTML = EDIT_LANGS.map(l => `<option value="${l}">${esc(langName(l))}</option>`).join('');
  $('#sd-lang').value = getLang();
  $('#sd-cat').innerHTML = S.cats.map(c => `<option value="${esc(c.id)}">${esc(L(c.label))}</option>`).join('') + `<option value="__new">${esc(t('song.newCategoryOption'))}</option>`;
  const sel = (q, g, v) => { $(q).innerHTML = ENUMS[g].map(x => `<option value="${x}">${esc(tEnum(g, x))}</option>`).join(''); $(q).value = v; };
  sel('#sd-diff', 'difficulty', s?.difficulty || 'intermediate');
  sel('#sd-reg', 'register', s?.register || 'mix');
  sel('#sd-mood', 'mood', s?.mood || 'emotional');
  $('#sd-key').innerHTML = `<option value="">${esc(t('song.keyUnknown'))}</option>` + KEYS.map(k => `<option value="${k.tonic}:${k.mode}">${esc(keyName(k))}</option>`).join('');
  const k0 = Array.isArray(s?.key) ? s.key[0] : s?.key;
  $('#sd-key').value = k0 ? `${k0.tonic}:${k0.mode}` : '';
  $('#sd-title').value = '';
  $('#sd-artist').value = s ? L(s.artist) : '';
  $('#sd-cat').value = s?.category || (S.f.cat !== 'ALL' ? S.f.cat : S.cats[0]?.id || '__new');
  $('#sd-newcat').value = '';
  $('#sd-newcat-wrap').hidden = $('#sd-cat').value !== '__new';
  $('#sd-video').value = '';
  $('#sd-range').value = s?.range || '';
  $('#sd-bpm').value = s?.bpm || '';
  $('#sd-tip').value = s ? L(s.tip) : '';
  $('#sd-artists').innerHTML = [...new Set(S.songs.map(x => L(x.artist)))].sort(compare).map(a => `<option value="${esc(a)}">`).join('');
  renderSdTechs();
  $('#song-dialog').showModal();
  if (isNew && !coarse.matches) $('#sd-q').focus();
}
function renderSdTechs() {
  $('#sd-techs').innerHTML = ENUMS.techniques.map(id => `<button type="button" class="chip ${SD.techs.has(id) ? 'is-on' : ''}" data-sd-tech="${id}" aria-pressed="${SD.techs.has(id)}"><span class="dot" style="--c:${TECH_COLORS[id]}"></span>${esc(tEnum('techniques', id))}</button>`).join('');
}
let sdHits = [];
async function runSongSearch() {
  const q = $('#sd-q').value.trim();
  if (!q) return;
  $('#sd-status').textContent = t('song.searching'); $('#sd-results').innerHTML = '';
  const parts = q.split(/\s+[-–—/]\s+/);
  SD.q2 = parts.length === 2 ? parts[1].trim() : '';
  try {
    sdHits = await searchRecordings(q);
    $('#sd-status').textContent = sdHits.length ? t('song.pickHit') : t('song.noHits');
    $('#sd-results').innerHTML = sdHits.map((h, i) => {
      const dup = S.songs.find(x => slug(mainTitle(x)) === slug(h.title) && slug(L(x.artist)) === slug(h.artist));
      return `<li><button type="button" class="ly-hit" data-sd-hit="${i}">
        <span class="ly-hit-main"><b>${esc(h.title)}</b><span>${esc(h.artist)}${h.album ? ` · ${esc(h.album)}` : ''}</span></span>
        <span class="sd-hit-meta">${esc([h.year, h.length ? fmtDuration(h.length / 1000) : ''].filter(Boolean).join(' · '))}${dup ? ` · <span class="badge badge--coral">${esc(t('song.exists'))}</span>` : ''}</span>
      </button></li>`;
    }).join('');
  } catch (e) {
    $('#sd-status').textContent = t(e.message === 'busy' ? 'song.busy' : 'song.searchFailed');
  }
}
function pickSongHit(i) {
  const h = sdHits[i]; if (!h) return;
  $('#sd-title').value = h.title;
  // Musical-Aufnahme? („Burn – Hamilton“ → Treffer von Phillipa Soo auf dem Hamilton-Album)
  const q2 = SD.q2.toLowerCase();
  const isCast = q2 && !h.artist.toLowerCase().includes(q2) && (h.album || '').toLowerCase().includes(q2);
  const artist = isCast ? SD.q2 : h.artist;
  SD.performer = isCast ? h.artist : '';
  $('#sd-artist').value = artist;
  // Kategorie raten: gleicher Interpret im Katalog oder gleichnamige Kategorie
  const same = S.songs.find(x => slug(L(x.artist)) === slug(artist));
  const cat = same ? same.category : S.cats.find(c => slug(L(c.label)) === slug(artist))?.id;
  if (cat) { $('#sd-cat').value = cat; $('#sd-newcat-wrap').hidden = true; }
  else { $('#sd-cat').value = '__new'; $('#sd-newcat').value = artist; $('#sd-newcat-wrap').hidden = false; }
  $$('#sd-results .ly-hit').forEach((b, j) => b.classList.toggle('is-on', j === i));
  $('#sd-title').scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
}
async function saveSong() {
  const err = (m, field) => { $('#sd-error').textContent = t(m); if (field) { const f = $(field); f.focus({ preventScroll: true }); f.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); } };
  const isNew = !SD.id;
  const title = $('#sd-title').value.trim();
  const artist = $('#sd-artist').value.trim();
  if (isNew && !title) return err('song.needTitle', '#sd-title');
  if (!artist) return err('song.needArtist', '#sd-artist');
  let category = $('#sd-cat').value;
  let cats = S.cats;
  if (category === '__new') {
    const label = $('#sd-newcat').value.trim();
    if (!label) return err('song.needCategory', '#sd-newcat');
    const existing = S.cats.find(c => slug(L(c.label)) === slug(label));
    if (existing) category = existing.id;
    else {
      let cid = slug(label) || 'kategorie'; let n = 2;
      while (S.cats.some(c => c.id === cid)) cid = `${slug(label)}-${n++}`;
      cats = [...S.cats, { id: cid, label, order: Math.max(-1, ...S.cats.map(c => c.order ?? 0)) + 1 }];
      category = cid;
    }
  }
  const kv = $('#sd-key').value;
  const bpm = parseInt($('#sd-bpm').value, 10);
  const tipTxt = $('#sd-tip').value.trim();
  const prev = isNew ? null : song(SD.id);
  const base = {
    category,
    artist: prev && typeof prev.artist === 'object' && L(prev.artist) === artist ? prev.artist : artist,
    key: kv ? [{ tonic: kv.split(':')[0], mode: kv.split(':')[1] }] : null,
    range: $('#sd-range').value.trim() || null,
    bpm: Number.isFinite(bpm) && bpm >= 30 && bpm <= 260 ? bpm : null,
    difficulty: $('#sd-diff').value, register: $('#sd-reg').value, mood: $('#sd-mood').value,
    techniques: ENUMS.techniques.filter(x => SD.techs.has(x)),
    tip: tipTxt ? (prev?.tip && typeof prev.tip === 'object' && L(prev.tip) === tipTxt ? prev.tip : { [getLang()]: tipTxt }) : null
  };
  base.review = !(base.key && base.range && base.bpm);
  const btn = $('#sd-save'); btn.disabled = true;
  try {
    if (cats !== S.cats) { await S.store.saveCategories(cats); S.cats = cats; }
    let id = SD.id;
    if (isNew) {
      id = `u-${slug(title).slice(0, 24) || 'song'}-${Date.now().toString(36).slice(-4)}`;
      const lang = $('#sd-lang').value;
      const data = {
        schema: 2, id, order: Math.max(0, ...S.songs.map(x => x.order || 0)) + 1, ...base,
        coachingQuery: `${artist} ${title} vocal`, sections: [],
        versions: [{ id: lang, lang, title, performer: SD.performer || artist, lyrics: '', video: $('#sd-video').value.trim() }]
      };
      await S.store.addSong(data);
      S.songs.push({ ...data, techniques: data.techniques, sections: [], versions: data.versions });
    } else {
      await S.store.updateSong(id, base);
      Object.assign(song(id), base);
    }
    $('#song-dialog').close();
    toast(t(isNew ? 'song.added' : 'toast.saved'));
    fillSelects(); renderChips(); refreshCatalogCounts();
    if (isNew) {
      S.f.q = ''; $('#search-input').value = '';
      if (S.f.cat !== 'ALL' && S.f.cat !== category) S.f.cat = 'ALL';
      if (S.f.fav) S.f.fav = false;
    }
    apply();
    select(id);
    if (S.view === 'plan') renderPlan();
  } catch (e) {
    console.error(e);
    err(e.message === 'storage-full' ? 'toast.storageFull' : 'toast.saveFailed');
  } finally { btn.disabled = false; }
}
async function deleteSong() {
  const b = $('#sd-delete');
  if (!SD.armed) { SD.armed = true; b.textContent = t('edit.confirmDelete'); return; }
  const id = SD.id;
  try {
    await S.store.deleteSong(id);
    S.songs = S.songs.filter(x => x.id !== id);
    ['favorites', 'completed'].forEach(k => { S.u[k] = S.u[k].filter(x => x !== id); });
    delete S.u.notes[id];
    save(100);
    $('#song-dialog').close();
    closeSheet();
    S.sel = null;
    toast(t('song.deleted'));
    fillSelects(); refreshCatalogCounts(); apply();
  } catch (e) { console.error(e); toast(t('toast.saveFailed')); }
}

/* ------------------------------------------------- Plan & KI-Coach */
function openSong(id) {
  if (!song(id)) return;
  go('katalog');
  requestAnimationFrame(() => {
    if (S.f.fav && !S.u.favorites.includes(id)) { S.f.fav = false; apply(); }
    select(id);
    document.querySelector(`.card[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  });
}
function songRow(s, extra = '') {
  const done = S.u.completed.includes(s.id);
  return `<div class="plan-row">
    ${artistAvatar(s, 40, 'card-av')}
    <button type="button" class="plan-main" data-open-song="${esc(s.id)}">
      <b>${esc(mainTitle(s))}</b>
      <small>${esc(L(s.artist))} · <span class="badge ${diffBadge(s.difficulty)}">${esc(tEnum('difficulty', s.difficulty))}</span>${done ? ` · <span class="badge badge--mint">${esc(t('action.isDone'))}</span>` : ''}</small>
    </button>${extra}</div>`;
}
function renderPlan() {
  const plan = S.u.favorites.map(song).filter(Boolean);
  $('#plan-count').textContent = fmtNum(plan.length);
  $('#plan-list').innerHTML = plan.length
    ? plan.map(s => `<li>${songRow(s, `<button type="button" class="icon-btn icon-btn--sm is-fav" data-fav="${esc(s.id)}" aria-pressed="true" aria-label="${esc(t('plan.remove'))}" title="${esc(t('plan.remove'))}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-star"/></svg></button>`)}</li>`).join('')
    : `<li class="plan-empty"><p>${esc(t('plan.empty'))}</p><a class="btn btn--sm" href="#/katalog">${esc(t('plan.toCatalog'))}</a></li>`;

  const c = S.u.coach;
  const note = $('#coach-note');
  if (document.activeElement !== note) note.value = c.note || '';
  $$('[data-coach-source]').forEach(b => { const on = b.dataset.coachSource === c.source; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); b.setAttribute('role', 'radio'); });
  const ai = S.store.aiAvailable;
  $('#coach-engine').textContent = ai ? 'Gemini · Firebase AI Logic' : S.store.demo ? t('coach.engineRules') : t('coach.engineOff');
  $('#coach-privacy').textContent = ai ? t('coach.privacy') : S.store.demo ? t('coach.demoHint') : t('coach.offHint');
  $('#coach-go').disabled = !(ai || S.store.demo) || COACH.busy;
  renderCoachResult();
}
const COACH = { busy: false };
function renderCoachResult() {
  const box = $('#coach-result');
  const c = S.u.coach;
  if (COACH.busy) { box.innerHTML = `<div class="coach-busy"><span class="spinner" aria-hidden="true"></span>${esc(t('coach.thinking'))}</div>`; return; }
  const r = c.result;
  if (!r) { box.innerHTML = ''; return; }
  const when = c.at ? new Intl.DateTimeFormat(getLang(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(c.at)) : '';
  const techBadge = id => `<button type="button" class="badge tech-badge" data-coach-tech="${esc(id)}" style="background:color-mix(in srgb, ${TECH_COLORS[id] || '#9a6bff'} 20%, transparent)">${esc(tEnum('techniques', id))}</button>`;
  box.innerHTML = `
    ${r.caution ? `<p class="coach-caution">${esc(r.caution)}</p>` : ''}
    ${r.summary ? `<p class="coach-summary">${esc(r.summary)}</p>` : ''}
    <span class="lbl">${esc(t('coach.nextSongs'))}</span>
    <ol class="coach-songs">${r.songs.map((x, i) => {
      const s = song(x.id); if (!s) return '';
      const inPlan = S.u.favorites.includes(s.id);
      return `<li class="coach-song">
        <span class="coach-num" aria-hidden="true">${i + 1}</span>
        <div class="coach-song-body">
          ${songRow(s, inPlan ? '' : `<button type="button" class="btn btn--sm btn--ghost" data-fav="${esc(s.id)}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-plus"/></svg>${esc(t('coach.addToPlan'))}</button>`)}
          ${x.why ? `<p>${esc(x.why)}</p>` : ''}
          ${x.focus.length ? `<div class="badges">${x.focus.map(techBadge).join('')}</div>` : ''}
          ${x.exercise ? `<p class="coach-ex"><b>${esc(t('coach.exercise'))}</b> ${esc(x.exercise)}</p>` : ''}
        </div></li>`;
    }).join('')}</ol>
    ${r.techniques.length ? `<span class="lbl">${esc(t('coach.techniques'))}</span>
    <ul class="coach-techs">${r.techniques.map(x => `<li>
      <div class="coach-tech-head">${techBadge(x.id)}</div>
      ${x.why ? `<p>${esc(x.why)}</p>` : ''}
      ${x.howTo ? `<p class="coach-ex"><b>${esc(t('coach.howTo'))}</b> ${esc(x.howTo)}</p>` : ''}
    </li>`).join('')}</ul>` : ''}
    <p class="coach-foot">${esc(r.demo ? t('coach.madeRules') : t('coach.madeAI'))}${when ? ` · ${esc(when)}` : ''}</p>`;
}
async function runCoach() {
  if (COACH.busy) return;
  const c = S.u.coach;
  c.note = $('#coach-note').value;
  COACH.busy = true; $('#coach-go').disabled = true; renderCoachResult();
  try {
    let result;
    if (S.store.aiAvailable) {
      const { system, user } = buildPrompt({
        songs: S.songs, favorites: S.u.favorites, completed: S.u.completed, notes: S.u.notes,
        note: c.note, source: c.source, lang: getLang(), L, techName: id => tEnum('techniques', id)
      });
      const text = await S.store.generateJSON({ system, user, schemaFn: coachSchema });
      result = validatePlan(text, S.songs);
    } else if (S.store.demo) {
      await new Promise(r => setTimeout(r, 500));
      result = rulePlan({ songs: S.songs, favorites: S.u.favorites, completed: S.u.completed, source: c.source, t });
    } else return;
    c.result = result; c.at = Date.now();
    save(200);
    haptic(14);
  } catch (e) {
    console.error(e);
    const m = String(e?.message || e);
    toast(t(m === 'empty' ? 'coach.empty' : /app.?check|recaptcha/i.test(m) ? 'coach.appCheck' : /quota|429|resource.?exhausted/i.test(m) ? 'coach.quota' : 'coach.failed'));
  } finally {
    COACH.busy = false;
    if (S.view === 'plan') renderPlan();
  }
}

/* ------------------------------------------------------------ Metronom */
let metro, lastHue = 0;
function metroBeat(idx, level, count) {
  const orb = $('#m-orb');
  $$('.beat-dot').forEach((d, i) => d.classList.toggle('is-on', i === idx));
  const dock = $('.dock-metro');
  dock.classList.remove('tick'); void dock.offsetWidth; dock.classList.add('tick');
  if (reduced) return;
  const amp = level === 2 ? .12 : level === 1 ? .08 : .05;
  orb.animate([{ scale: 1 + amp }, { scale: 1 - amp * .25, offset: .45 }, { scale: 1 }],
    { duration: Math.min(420, 60000 / metro.config.bpm * .9), easing: 'cubic-bezier(.2,.8,.3,1)' });
  if (level === 2) { lastHue = (lastHue + 24) % 360; orb.style.setProperty('--hue', lastHue + 'deg'); }
  if (level > 0 || count <= 4) ripple(orb, { strong: level === 2 });
}
function metroLabels() {
  const on = metro.running, c = metro.config;
  $('#m-go').textContent = t(on ? 'metro.stop' : 'metro.start');
  $('#m-hint').textContent = t(on ? 'metro.hintStop' : (coarse.matches ? 'metro.hintStartTouch' : 'metro.hintStart'));
  $('#m-name').textContent = tempoName(c.bpm) + (c.meter >= 6 ? ' · ' + t('metro.eighths') : '');
}
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && metro?.running) keepAwake(true); });
function metroState(on) {
  keepAwake(on); // Bildschirm bleibt an, solange das Metronom läuft
  haptic(on ? 15 : 8);
  $('.metro').classList.toggle('is-running', on);
  $('.dock-metro').classList.toggle('is-running', on);
  metroLabels();
  if (!on) $$('.beat-dot').forEach(d => d.classList.remove('is-on'));
}
function renderDots() {
  const lv = (METERS[metro.config.meter] || METERS[4]).accents, acc = metro.config.accent;
  $('#m-dots').innerHTML = lv.map(l => `<span class="beat-dot ${acc && l === 2 ? 'is-strong' : acc && l === 1 ? 'is-mid' : ''}"></span>`).join('');
}
function metroApply(patch, persist = true) {
  const c = metro.set(patch);
  $('#m-bpm').textContent = c.bpm;
  $('#m-word').textContent = c.bpm;
  $('#m-range').value = c.bpm;
  $('#m-vol').value = Math.round(c.volume * 100);
  $$('#m-meter [data-meter]').forEach(b => { const on = +b.dataset.meter === c.meter; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); });
  $$('#m-sound [data-sound]').forEach(b => { const on = b.dataset.sound === c.sound; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); });
  $('#m-accent').setAttribute('aria-pressed', String(c.accent));
  if ('meter' in patch || 'accent' in patch) renderDots();
  if ('bpm' in patch && !patch.fromSong) $('#m-song').value = '';
  metroLabels();
  if (persist) { S.u.metronome = c; save(800); }
}
function fillMetroSongs() {
  const cur = $('#m-song').value;
  const fav = S.songs.filter(s => S.u.favorites.includes(s.id));
  const opt = s => `<option value="${esc(s.id)}">${esc(mainTitle(s))} · ${esc(bpmTxt(s))} BPM</option>`;
  $('#m-song').innerHTML = `<option value="">${esc(t('metro.ownTempo'))}</option>` +
    (fav.length ? `<optgroup label="${esc(t('filter.plan'))}">${fav.map(opt).join('')}</optgroup>` : '') +
    `<optgroup label="${esc(t('metro.allSongs'))}">${[...S.songs].sort((a, b) => compare(mainTitle(a), mainTitle(b))).map(opt).join('')}</optgroup>`;
  $('#m-song').value = cur;
}
function metroFromSong(id) {
  const s = song(id);
  if (!s) return;
  const tip = typeof s.tip === 'object' ? Object.values(s.tip).join(' ') : String(s.tip || '');
  const meter = /12\/8/.test(tip) ? 12 : /6\/8/.test(tip) ? 6 : null;
  metroApply({ bpm: s.bpm, fromSong: true, ...(meter ? { meter } : {}) });
  $('#m-song').value = id;
  toast(t('toast.metroSong', { title: mainTitle(s), bpm: s.bpm }));
}
function bindMetro() {
  metro = createMetronome({ onBeat: metroBeat, onState: metroState });
  renderDots();
  $('#m-go').addEventListener('click', () => metro.toggle());
  $('#m-range').addEventListener('input', e => metroApply({ bpm: e.target.value }));
  $$('[data-bpm-step]').forEach(b => b.addEventListener('click', () => metroApply({ bpm: metro.config.bpm + +b.dataset.bpmStep })));
  $('#m-vol').addEventListener('input', e => metroApply({ volume: e.target.value / 100 }));
  $('#m-meter').addEventListener('click', e => { const b = e.target.closest('[data-meter]'); if (b) metroApply({ meter: +b.dataset.meter }); });
  $('#m-sound').addEventListener('click', e => { const b = e.target.closest('[data-sound]'); if (b) metroApply({ sound: b.dataset.sound }); });
  $('#m-accent').addEventListener('click', () => metroApply({ accent: !metro.config.accent }));
  $('#m-song').addEventListener('change', e => { if (e.target.value) metroFromSong(e.target.value); });
  let taps = [];
  $('#m-tap').addEventListener('click', e => {
    const now = performance.now();
    taps = taps.filter(x => now - x < 2500); taps.push(now);
    const b = e.currentTarget; b.classList.remove('tapped'); void b.offsetWidth; b.classList.add('tapped');
    if (taps.length >= 2) {
      const iv = taps.slice(-5).map((x, i, a) => (i ? x - a[i - 1] : 0)).slice(1);
      metroApply({ bpm: 60000 / (iv.reduce((x, y) => x + y, 0) / iv.length) });
    }
  });
  document.addEventListener('keydown', e => {
    if (S.view !== 'metronom' || e.target.closest('input, textarea, select, button, dialog, [contenteditable]')) return;
    if (e.code === 'Space') { e.preventDefault(); metro.toggle(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); metroApply({ bpm: metro.config.bpm + (e.shiftKey ? 5 : 1) }); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); metroApply({ bpm: metro.config.bpm - (e.shiftKey ? 5 : 1) }); }
    else if (e.key.toLowerCase() === 't') $('#m-tap').click();
  });
}

/* ------------------------------------------------------------ Events */
function resetFilters() {
  Object.assign(S.f, { q: '', cat: 'ALL', mood: 'ALL', diff: 'ALL', reg: 'ALL', vlang: 'ALL', tech: 'ALL', fav: false });
  $('#search-input').value = '';
  fillSelects();
  renderChips();
  $$('.bubble').forEach(b => { b.classList.remove('is-on'); b.setAttribute('aria-pressed', 'false'); });
  apply();
}

function bind() {
  $('#btn-signin').addEventListener('click', async () => {
    try { await S.store.signIn(); } catch (e) { console.error(e); toast(t('toast.signinCancelled')); }
  });
  $('#btn-gate-signout').addEventListener('click', () => S.store.signOut());

  let qTimer;
  $('#search-input').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { S.f.q = e.target.value; apply(); }, 140); });
  [['#f-cat', 'cat'], ['#f-mood', 'mood'], ['#f-diff', 'diff'], ['#f-reg', 'reg'], ['#f-lang', 'vlang'], ['#f-sort', 'sort']]
    .forEach(([sel, key]) => $(sel).addEventListener('change', e => { S.f[key] = e.target.value; apply(); }));
  $('#f-fav').addEventListener('click', () => { S.f.fav = !S.f.fav; apply(); });
  $('#tech-chips').addEventListener('click', e => { const c = e.target.closest('[data-tech]'); if (c) setTech(c.dataset.tech); });
  $('#f-reset').addEventListener('click', resetFilters);
  $('#btn-filters').addEventListener('click', openFilters);
  $$('[data-close-filters]').forEach(b => b.addEventListener('click', closeFilters));
  $('#scrim').addEventListener('click', () => { closeSheet(); closeFilters(); });
  swipeToClose($('#inspector'), $('#inspector-inner'), closeSheet);
  swipeToClose($('#filterbar'), $('#filterbar'), closeFilters);
  $('#demo-close').addEventListener('click', () => { $('#demo-banner').hidden = true; try { sessionStorage.setItem('glasklang-demo-hidden', '1'); } catch { /* egal */ } });
  $$('.seg-btn').forEach(b => b.addEventListener('click', () => {
    S.layout = b.dataset.layout;
    $$('.seg-btn').forEach(x => x.classList.toggle('is-on', x === b));
    renderCards();
  }));
  $('#comp-tabs').addEventListener('click', e => { const tb = e.target.closest('[data-comp]'); if (tb) renderComp(tb.dataset.comp); });

  document.addEventListener('click', e => {
    // Sprache & Theme (Gate + Topbar)
    const lt = e.target.closest('[data-lang-toggle]');
    if (lt) {
      const menu = lt.parentElement.querySelector('[data-lang-menu]');
      menu.hidden = !menu.hidden; lt.setAttribute('aria-expanded', String(!menu.hidden));
      return;
    }
    const sl = e.target.closest('[data-set-lang]');
    if (sl) { $$('[data-lang-menu]').forEach(m => { m.hidden = true; }); return changeLang(sl.dataset.setLang); }
    if (!e.target.closest('.lang-pick')) $$('[data-lang-menu]').forEach(m => { m.hidden = true; });
    if (e.target.closest('[data-theme-switch]')) return toggleTheme();


    const fav = e.target.closest('[data-fav]');
    if (fav) { e.stopPropagation(); return toggleIn('favorites', fav.dataset.fav, fav); }
    const done = e.target.closest('[data-done]');
    if (done) { e.stopPropagation(); return toggleIn('completed', done.dataset.done, done); }
    if (e.target.closest('[data-reset]')) return resetFilters();
    if (e.target.closest('[data-close]')) return closeSheet();
    if (e.target.closest('[data-print]')) return window.print();
    if (e.target.closest('[data-txt]')) { const s = song(S.sel); return s && exportTxt(s); }
    const mb = e.target.closest('[data-metro]');
    if (mb) { metroFromSong(mb.dataset.metro); closeSheet(); return go('metronom'); }
    if (e.target.closest('[data-lyrics-load]')) return openLyricsDialog();
    if (e.target.closest('[data-karaoke]')) return startKaraoke();
    if (e.target.closest('[data-lyrics-view]')) return startKaraoke(true);
    if (e.target.closest('[data-karaoke-tap]') && !String(getSelection?.() || '')) return startKaraoke(true);
    if (e.target.closest('[data-avatar-pick]')) return pickAvatar();
    if (e.target.closest('[data-avatar-remove]')) return removeAvatar();
    const lp = e.target.closest('[data-ly-pick]');
    if (lp) return pickLyrics(Number(lp.dataset.lyPick));
    const vt = e.target.closest('[data-version]');
    if (vt) { S.verSel[S.sel] = vt.dataset.version; return renderInspector(); }
    if (e.target.closest('[data-version-add]')) return openVersionEditor(S.sel, null);
    const ve = e.target.closest('[data-version-edit]');
    if (ve) return openVersionEditor(S.sel, ve.dataset.versionEdit);
    if (e.target.closest('[data-song-add]')) return openSongEditor();
    if (e.target.closest('[data-song-edit]')) return openSongEditor(S.sel);
    const sdt = e.target.closest('[data-sd-tech]');
    if (sdt) { const x = sdt.dataset.sdTech; SD.techs.has(x) ? SD.techs.delete(x) : SD.techs.add(x); return renderSdTechs(); }
    const sdh = e.target.closest('[data-sd-hit]');
    if (sdh) return pickSongHit(+sdh.dataset.sdHit);
    const os = e.target.closest('[data-open-song]');
    if (os) return openSong(os.dataset.openSong);
    const ct = e.target.closest('[data-coach-tech]');
    if (ct) { setTech(ct.dataset.coachTech, true); return go('katalog'); }
    const cs = e.target.closest('[data-coach-source]');
    if (cs) { S.u.coach.source = cs.dataset.coachSource; save(400); return renderPlan(); }
    if (e.target.closest('#coach-go')) return runCoach();
    if (e.target.closest('[data-video-find]')) { const s = song(S.sel); if (s) findVideo(s, currentVersion(s), { manual: true }); return; }
    if (e.target.closest('[data-video-alts]')) { const s = song(S.sel); const k = s && ytKey(s, currentVersion(s)); YT.open = YT.open === k ? null : k; return renderInspector(); }
    const vp = e.target.closest('[data-video-pick]');
    if (vp) return pickVideo(vp.dataset.videoPick);
    const lv = e.target.closest('[data-load-video]');
    if (lv) {
      const box = lv.closest('[data-yt]');
      box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(box.dataset.yt)}?autoplay=1&rel=0" title="YouTube" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`;
      return;
    }
    const card = e.target.closest('.card');
    if (card) return select(card.dataset.id);
    const act = e.target.closest('[data-action]');
    if (act) {
      const a = act.dataset.action;
      if (a === 'signout') return S.store.signOut();
      if (a === 'plan') { S.f.fav = !S.f.fav; apply(); return go('katalog'); }
    }
    if (!e.target.closest('#user-chip, #user-menu')) { $('#user-menu').hidden = true; $('#user-chip').setAttribute('aria-expanded', 'false'); }
  });
  $('#cards').addEventListener('keydown', e => {
    const card = e.target.closest('.card');
    if (card && (e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); select(card.dataset.id); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSheet(); closeFilters(); $('#user-menu').hidden = true; $$('[data-lang-menu]').forEach(m => { m.hidden = true; }); }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'coach-note') { S.u.coach.note = e.target.value; save(1200); return; }
    if (e.target.matches('[data-note]')) {
      S.u.notes[e.target.dataset.note] = e.target.value;
      const s = song(e.target.dataset.note);
      if (s) renderPrint(s);
      save(900);
    }
  });
  $('#user-chip').addEventListener('click', () => {
    const m = $('#user-menu');
    m.hidden = !m.hidden;
    $('#user-chip').setAttribute('aria-expanded', String(!m.hidden));
  });

  $('#ly-form').addEventListener('submit', e => { e.preventDefault(); runLyricsSearch(); });
  $('#ly-cancel').addEventListener('click', () => $('#lyrics-dialog').close());
  $('#ly-apply').addEventListener('click', applyLyrics);
  $('#avatar-file').addEventListener('change', e => onAvatarFile(e.target.files?.[0]));
  $('#version-form').addEventListener('submit', e => { e.preventDefault(); saveVersion(false); });
  $('#v-cancel').addEventListener('click', () => $('#version-dialog').close());
  $('#song-form').addEventListener('submit', e => { e.preventDefault(); saveSong(); });
  $('#sd-search').addEventListener('submit', e => { e.preventDefault(); runSongSearch(); });
  $('#sd-cancel').addEventListener('click', () => $('#song-dialog').close());
  $('#sd-delete').addEventListener('click', deleteSong);
  $('#sd-cat').addEventListener('change', e => { $('#sd-newcat-wrap').hidden = e.target.value !== '__new'; if (e.target.value === '__new') $('#sd-newcat').focus(); });
  $('#v-delete').addEventListener('click', e => {
    const b = e.currentTarget;
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = t('edit.confirmDelete'); return; }
    saveVersion(true);
  });

  $('#btn-seed').addEventListener('click', async e => {
    const b = e.currentTarget;
    b.disabled = true; b.textContent = t('seed.importing');
    try { const n = await S.store.importSeed(); toast(t('toast.imported', { count: n })); await enterApp(); }
    catch (err) { console.error(err); toast(t('toast.importFailed')); b.disabled = false; b.textContent = t('seed.button'); }
  });

  addEventListener('hashchange', route);
  let rT;
  addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { if (S.view === 'technik') renderBubbles(); }, 200); });
  mobile.addEventListener('change', placeSearch);
  placeSearch();
}

/* ------------------------------------------------------------- Start */
async function boot() {
  let savedTheme = null, savedLang = null;
  try { savedTheme = localStorage.getItem('glasklang-theme'); savedLang = localStorage.getItem('glasklang-lang'); } catch { /* egal */ }
  applyTheme(savedTheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  mountControls();
  await setLang(detectLang(savedLang));
  applyTheme(document.documentElement.dataset.theme);
  renderControls();

  initSky();
  $$('[data-orb]').forEach(o => initOrb(o));
  initOrb($('#m-orb'), { onTap: () => metro.toggle(), pull: .012, spinSpeed: .12 });
  initTilt($('#cards'));
  initDock($('#dock'));
  bindMetro();
  bindKaraoke();
  bind();
  metroLabels();

  try { S.store = await createStore(); }
  catch (e) { console.error(e); showGate(); $('#gate-lead').textContent = t('gate.firebaseError'); return; }

  S.store.onAuth(async user => {
    S.user = user;
    if (!user) return showGate();
    if (!(await S.store.access())) return showGate(user.email);
    try { await enterApp(); }
    catch (e) { console.error(e); toast(t('toast.loadFailed')); }
  });
}

boot();
