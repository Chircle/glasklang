// Glasklang · App
import { createStore } from './store.js';
import { initSky, initOrb, initTilt, initDock, layoutBubbles, reveal, popIcon, ripple, reduced } from './motion.js';
import { createMetronome, tempoName, METERS } from './metronome.js';
import { LANGS, t, L, isFallback, setLang, getLang, detectLang, translateDOM, compare, langName, autonym, keyName, fmtNum } from './i18n.js';

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
const CAT_COLORS = ['#9a6bff', '#ef7a6c', '#4f8df0', '#e36fb4', '#f0a04b', '#45c19a', '#7a6cf0', '#3fb6d6', '#d0679a'];
const DIFF_RANK = { beginner: 1, intermediate: 2, advanced: 3 };
const EDIT_LANGS = ['de', 'en', 'fr', 'es', 'it', 'pt', 'nl', 'sv', 'da', 'no', 'pl', 'cs', 'hu', 'el', 'tr', 'ru', 'ja', 'ko', 'zh', 'he', 'ar', 'la'];
const VIEWS = ['katalog', 'technik', 'metronom'];
const METRO_DEFAULT = { bpm: 96, meter: 4, sound: 'glas', volume: 0.7, accent: true };
const mobile = matchMedia('(max-width: 900px)');
const tEnum = (group, id) => t(`enum.${group}.${id}`);

const S = {
  store: null, user: null, role: null,
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
  $('#demo-banner').hidden = !S.store.demo;
  $$('[data-owner-only]').forEach(el => { el.hidden = S.role !== 'owner'; });

  const name = S.user.displayName || S.user.email;
  $('#user-name').textContent = name.split(' ')[0];
  $('#user-mail').textContent = S.user.email;
  const av = $('#user-avatar');
  if (S.user.photoURL) { av.style.backgroundImage = `url("${S.user.photoURL}")`; av.textContent = ''; }
  else av.textContent = name.slice(0, 1).toUpperCase();

  setSync('sync.loading');
  const [songs, cats, comp, u] = await Promise.all([S.store.songs(), S.store.categories(), S.store.compendium(), S.store.loadUserState()]);
  S.songs = songs.map(s => ({ ...s, techniques: s.techniques || [], sections: s.sections || [], versions: s.versions || [] }))
                 .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  S.cats = cats.length ? [...cats].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                       : [...new Set(S.songs.map(s => s.category))].map((id, i) => ({ id, label: id, order: i }));
  S.comp = comp;
  S.u = { ...S.u, favorites: [], completed: [], notes: {}, ...u };
  if (S.u.theme) applyTheme(S.u.theme);
  if (S.u.lang && S.u.lang !== getLang()) await setLang(S.u.lang);
  S.sel = S.sel || (song('wk1') ? 'wk1' : S.songs[0]?.id) || null;
  setSync('sync.ready');

  $('#seed-tile').hidden = !(S.role === 'owner' && !S.store.demo && S.songs.length === 0);
  metroApply({ ...METRO_DEFAULT, ...(S.u.metronome || {}) }, false);
  renderAll();
  route();
  countUp($('#kpi-total'), S.songs.length);
  countUp($('#kpi-cats'), S.cats.length);
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
  $('#f-fav').setAttribute('aria-pressed', String(S.f.fav));
  $$('[data-action="plan"]').forEach(b => b.classList.toggle('is-on', S.f.fav));
  renderCards();
  renderInspector();
}

const catColor = id => CAT_COLORS[Math.max(0, S.cats.findIndex(c => c.id === id)) % CAT_COLORS.length];
const initials = label => label.replace(/[^\p{L}&\s-]/gu, '').split(/[\s-]+/).filter(w => w && w !== '&').slice(0, 2).map(w => w[0]).join('').toUpperCase();
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
        <span class="mono" style="--c:${catColor(s.category)}" aria-hidden="true">${esc(initials(catLabel(s.category)))}</span>
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
        <div><div class="fact-l">${esc(t('meta.tempo'))}</div><div class="fact-v">${esc(fmtNum(s.bpm))} BPM</div></div>
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
function videoBlock(s, v) {
  const id = youtubeId(v.video);
  if (id) {
    return `<div class="video" data-yt="${esc(id)}">
      <button type="button" class="video-load" data-load-video>
        <span class="video-play"><svg class="ico" aria-hidden="true"><use href="#i-play"/></svg></span>
        <span><b>${esc(t('video.load'))}</b><small>${esc(t('video.privacy'))}</small></span>
      </button></div>
      <a class="link-ext" href="${esc(v.video)}" target="_blank" rel="noopener">${esc(t('video.openYoutube'))}<svg class="ico ico--sm" aria-hidden="true"><use href="#i-external"/></svg></a>`;
  }
  if (v.video) return `<a class="link-ext" href="${esc(v.video)}" target="_blank" rel="noopener">${esc(t('video.open'))}<svg class="ico ico--sm" aria-hidden="true"><use href="#i-external"/></svg></a>`;
  return `<a class="link-ext" href="${esc(searchUrl(s, v))}" target="_blank" rel="noopener">${esc(t('video.search', { lang: langName(v.lang) }))}<svg class="ico ico--sm" aria-hidden="true"><use href="#i-external"/></svg></a>`;
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
function renderInspector() {
  const box = $('#inspector-inner');
  const s = song(S.sel);
  if (!s) { box.innerHTML = `<p class="muted">${esc(t(S.songs.length ? 'sheet.pick' : 'sheet.noSongs'))}</p>`; return; }
  const fav = S.u.favorites.includes(s.id), done = S.u.completed.includes(s.id);
  const v = currentVersion(s), vs = versions(s), owner = S.role === 'owner';
  const alts = altTitles(s);
  box.innerHTML = `<div class="insp-anim">
    <div class="insp-head">
      <div>
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
      <div><span class="meta-v">${esc(fmtNum(s.bpm))}</span><span class="meta-l">BPM</span></div>
      <div><span class="meta-v">${esc(tEnum('register', s.register))}</span><span class="meta-l">${esc(t('meta.register'))}</span></div>
    </div>
    ${s.review ? `<p class="review-note">${esc(t('meta.review'))}</p>` : ''}

    <div class="row-actions">
      <button type="button" class="btn btn--sm ${fav ? 'btn--primary' : ''}" data-fav="${esc(s.id)}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-star"/></svg>${esc(t(fav ? 'action.inPlan' : 'action.plan'))}</button>
      <button type="button" class="btn btn--sm ${done ? 'btn--primary' : ''}" data-done="${esc(s.id)}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-check"/></svg>${esc(t(done ? 'action.isDone' : 'action.done'))}</button>
      <button type="button" class="btn btn--sm btn--ghost" data-metro="${esc(s.id)}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-metro"/></svg>${esc(fmtNum(s.bpm))} BPM</button>
      <button type="button" class="btn btn--sm btn--ghost" data-print><svg class="ico ico--sm" aria-hidden="true"><use href="#i-printer"/></svg>${esc(t('action.print'))}</button>
      <button type="button" class="btn btn--sm btn--ghost" data-txt><svg class="ico ico--sm" aria-hidden="true"><use href="#i-file"/></svg>TXT</button>
    </div>

    <section class="versions">
      <div class="versions-head">
        <span class="lbl">${esc(t('versions.title'))}</span>
        <div class="segmented" role="tablist">
          ${vs.map(x => `<button type="button" role="tab" class="seg ${x.id === v.id ? 'is-on' : ''}" aria-selected="${x.id === v.id}" data-version="${esc(x.id)}">${esc(langName(x.lang))}</button>`).join('')}
          ${owner ? `<button type="button" class="seg seg--add" data-version-add aria-label="${esc(t('versions.add'))}" title="${esc(t('versions.add'))}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-plus"/></svg></button>` : ''}
        </div>
      </div>
      <div class="version-card" lang="${esc(v.lang)}">
        <div class="version-top">
          <div>
            <div class="version-title">${esc(v.title)}</div>
            <div class="muted version-sub">${esc(v.performer || L(s.artist))} · ${esc(autonym(v.lang))}</div>
          </div>
          ${owner ? `<button type="button" class="btn btn--sm btn--ghost" data-version-edit="${esc(v.id)}"><svg class="ico ico--sm" aria-hidden="true"><use href="#i-edit"/></svg>${esc(t('versions.edit'))}</button>` : ''}
        </div>
        ${videoBlock(s, v)}
        <div class="lyrics">${v.lyrics ? lyricsBlock(v.lyrics)
          : `<p class="sec-empty">${esc(t(owner ? 'versions.noLyricsOwner' : 'versions.noLyrics'))}</p>`}</div>
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
  </div>`;
  renderPrint(s);
}

function openSheet() { if (mobile.matches) $('#inspector').classList.add('is-open'); }
function closeSheet() { $('#inspector').classList.remove('is-open'); }

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
  $('#kpi-favs').textContent = fmtNum(S.u.favorites.length);
  $('#kpi-done').textContent = fmtNum(S.u.completed.length);
  if (listName === 'favorites') fillMetroSongs();
  if (id === S.sel) renderInspector();
  if (S.f.fav && listName === 'favorites') apply();
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

/* ------------------------------------------------------------ Export */
function renderPrint(s) {
  const v = currentVersion(s), note = S.u.notes[s.id] || '';
  $('#print-sheet').innerHTML = `
    <h1>${esc(v.title)}</h1>
    <div><strong>${esc(v.performer || L(s.artist))}</strong> · ${esc(catLabel(s.category))} · ${esc(autonym(v.lang))}</div>
    <div class="p-meta">${esc(t('meta.key'))}: ${esc(dash(keyName(s.key)))} | ${esc(t('meta.range'))}: ${esc(dash(s.range))} | ${esc(t('meta.tempo'))}: ${esc(s.bpm)} BPM | ${esc(t('filter.difficulty'))}: ${esc(tEnum('difficulty', s.difficulty))} | ${esc(t('meta.register'))}: ${esc(tEnum('register', s.register))} | ${esc(s.techniques.map(id => tEnum('techniques', id)).join(', '))}</div>
    <p><strong>${esc(t('sheet.coaching'))}:</strong> ${esc(L(s.tip))}</p>
    ${s.sections.map(x => `<div class="p-sec"><div class="p-sec-t">${esc(sectionLabel(x))}</div><div class="p-sec-c">${esc(L(x.cue))}</div></div>`).join('')}
    ${v.lyrics ? `<div class="p-lyrics">${lyricsBlock(v.lyrics)}</div>` : ''}
    <div class="p-notes"><strong>${esc(t('sheet.notes'))}:</strong><br>${note ? esc(note) : '<br>_______________________________________________<br><br>_______________________________________________'}</div>`;
}
function exportTxt(s) {
  const v = currentVersion(s);
  const lines = [
    `${v.title} — ${v.performer || L(s.artist)} (${autonym(v.lang)})`,
    `${t('meta.key')}: ${dash(keyName(s.key))} | ${t('meta.range')}: ${dash(s.range)} | ${t('meta.tempo')}: ${s.bpm} BPM | ${t('filter.difficulty')}: ${tEnum('difficulty', s.difficulty)} | ${t('meta.register')}: ${tEnum('register', s.register)}`,
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

/* --------------------------------------------------------- Mitglieder */
async function openMembers() {
  $('#user-menu').hidden = true;
  $('#members-dialog').showModal();
  await renderMembers();
}
async function renderMembers() {
  const ul = $('#member-list');
  ul.innerHTML = `<li>${esc(t('sync.loading'))}</li>`;
  try {
    const list = await S.store.listMembers();
    ul.innerHTML = `<li class="owner"><span>${esc(S.user.email)}</span><span class="badge badge--accent">${esc(t('members.owner'))}</span></li>` +
      (list.length ? list.map(m => `<li><span>${esc(m)}</span><button type="button" class="btn btn--sm btn--ghost" data-remove="${esc(m)}">${esc(t('members.remove'))}</button></li>`).join('')
                   : `<li class="muted">${esc(t('members.none'))}</li>`);
  } catch (e) { console.error(e); ul.innerHTML = `<li>${esc(t('members.loadFailed'))}</li>`; }
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
  if (view !== 'katalog') closeSheet();
  if (view === 'technik') requestAnimationFrame(renderBubbles);
  if (changed) window.scrollTo({ top: 0 });
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
  $('#m-hint').textContent = t(on ? 'metro.hintStop' : 'metro.hintStart');
  $('#m-name').textContent = tempoName(c.bpm) + (c.meter >= 6 ? ' · ' + t('metro.eighths') : '');
}
function metroState(on) {
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
  const opt = s => `<option value="${esc(s.id)}">${esc(mainTitle(s))} · ${esc(s.bpm)} BPM</option>`;
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

    const sheet = $('#inspector');
    if (sheet.classList.contains('is-open') && !sheet.contains(e.target) && !e.target.closest('dialog')) { closeSheet(); return; }

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
    const vt = e.target.closest('[data-version]');
    if (vt) { S.verSel[S.sel] = vt.dataset.version; return renderInspector(); }
    if (e.target.closest('[data-version-add]')) return openVersionEditor(S.sel, null);
    const ve = e.target.closest('[data-version-edit]');
    if (ve) return openVersionEditor(S.sel, ve.dataset.versionEdit);
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
      if (a === 'members') return openMembers();
      if (a === 'plan') { S.f.fav = !S.f.fav; apply(); return go('katalog'); }
    }
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      return S.store.removeMember(rm.dataset.remove).then(renderMembers).then(() => toast(t('toast.memberRemoved')))
        .catch(err => { console.error(err); toast(t('toast.removeFailed')); });
    }
    if (!e.target.closest('#user-chip, #user-menu')) { $('#user-menu').hidden = true; $('#user-chip').setAttribute('aria-expanded', 'false'); }
  });
  $('#cards').addEventListener('keydown', e => {
    const card = e.target.closest('.card');
    if (card && (e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); select(card.dataset.id); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSheet(); $('#user-menu').hidden = true; $$('[data-lang-menu]').forEach(m => { m.hidden = true; }); }
  });
  document.addEventListener('input', e => {
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

  $('#member-form').addEventListener('submit', async e => {
    e.preventDefault();
    const input = $('#member-email');
    const email = input.value.trim().toLowerCase();
    if (!email) return;
    try { await S.store.addMember(email); input.value = ''; toast(t('toast.memberAdded', { email })); await renderMembers(); }
    catch (err) { console.error(err); toast(t('toast.addFailed')); }
  });

  $('#version-form').addEventListener('submit', e => { e.preventDefault(); saveVersion(false); });
  $('#v-cancel').addEventListener('click', () => $('#version-dialog').close());
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
  mobile.addEventListener('change', () => { if (!mobile.matches) closeSheet(); });
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
  bind();
  metroLabels();

  try { S.store = await createStore(); }
  catch (e) { console.error(e); showGate(); $('#gate-lead').textContent = t('gate.firebaseError'); return; }

  S.store.onAuth(async user => {
    S.user = user;
    if (!user) return showGate();
    const acc = await S.store.access();
    if (!acc.ok) return showGate(user.email);
    S.role = acc.role;
    try { await enterApp(); }
    catch (e) { console.error(e); toast(t('toast.loadFailed')); }
  });
}

boot();
