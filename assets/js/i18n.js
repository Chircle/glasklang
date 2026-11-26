// Glasklang · Internationalisierung
// Oberflächentexte: locales/{lang}.json · Inhalte: Felder als { de: "…", en: "…" } oder einfacher String.

export const LANGS = ['de', 'en'];          // neue Sprache: Datei in locales/ anlegen und hier eintragen
export const DEFAULT_LANG = 'de';

let lang = DEFAULT_LANG;
let dict = {};
let base = {};
const cache = {};
const listeners = new Set();

async function load(l) {
  if (!cache[l]) cache[l] = fetch(`locales/${l}.json`).then(r => { if (!r.ok) throw new Error(l); return r.json(); });
  return cache[l];
}

export function getLang() { return lang; }

export function detectLang(saved) {
  const cands = [saved, ...(navigator.languages || [navigator.language])].filter(Boolean);
  for (const c of cands) {
    const short = String(c).toLowerCase().split('-')[0];
    if (LANGS.includes(short)) return short;
  }
  return DEFAULT_LANG;
}

export async function setLang(l) {
  const next = LANGS.includes(l) ? l : DEFAULT_LANG;
  [dict, base] = await Promise.all([load(next), load(DEFAULT_LANG)]);
  lang = next;
  document.documentElement.lang = next;
  document.documentElement.dir = dict._dir || 'ltr';
  translateDOM();
  listeners.forEach(fn => fn(next));
  return next;
}

export function onLangChange(fn) { listeners.add(fn); }

/** t('key', { count: 3, name: 'x' }) – Pluralformen als { one, other, … } */
export function t(key, vars = {}) {
  let s = dict[key] ?? base[key];
  if (s == null) { console.warn('[i18n] fehlt:', key); return key; }
  if (typeof s === 'object') {
    const form = new Intl.PluralRules(lang).select(vars.count ?? 0);
    s = s[form] ?? s.other;
  }
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? (k === 'count' ? fmtNum(vars[k]) : vars[k]) : m));
}

/** Lokalisierter Inhalt: String bleibt String, { de, en } → aktuelle Sprache → Deutsch → erste vorhandene */
export function L(v) {
  if (v == null) return '';
  if (typeof v !== 'object') return String(v);
  return v[lang] ?? v[DEFAULT_LANG] ?? Object.values(v).find(Boolean) ?? '';
}
/** true, wenn ein Inhalt in der aktuellen Sprache fehlt (Rückfall wird angezeigt) */
export function isFallback(v) {
  return v != null && typeof v === 'object' && !v[lang] && Object.values(v).some(Boolean);
}

export const fmtNum = n => new Intl.NumberFormat(lang).format(n);
export const compare = (a, b) => new Intl.Collator(lang, { sensitivity: 'base' }).compare(a, b);
export function langName(code, inLang = lang) {
  try { return new Intl.DisplayNames([inLang], { type: 'language' }).of(code); } catch { return code; }
}
/** Sprachname in der eigenen Sprache, z. B. „Deutsch“, „français“ */
export const autonym = code => langName(code, code);

/** Tonart je Sprache: deutsch „B-Dur“, „fis-Moll“, „H-Dur“ · englisch „B♭ major“ */
export function keyName(k) {
  if (!k) return '';
  const list = Array.isArray(k) ? k : [k];
  return list.map(({ tonic, mode }) => {
    if (lang === 'de') {
      const map = { B: 'H', Bb: 'B', Eb: 'Es', Ab: 'As', Db: 'Des', Gb: 'Ges', Cb: 'Ces', 'F#': 'Fis', 'C#': 'Cis', 'G#': 'Gis', 'D#': 'Dis', 'A#': 'Ais', 'E#': 'Eis' };
      const n = map[tonic] || tonic;
      return mode === 'minor' ? `${n.toLowerCase()}-Moll` : `${n}-Dur`;
    }
    const n = tonic.replace('b', '♭').replace('#', '♯');
    return `${n} ${t(mode === 'minor' ? 'key.minor' : 'key.major')}`;
  }).join(' / ');
}

/** Übersetzt statische Texte: data-i18n="key" (Text) und data-i18n-attr="placeholder:key; aria-label:key" */
export function translateDOM(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    el.dataset.i18nAttr.split(';').forEach(pair => {
      const [attr, key] = pair.split(':').map(s => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
}
