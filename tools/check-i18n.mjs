// Prüft, ob alle Sprachdateien dieselben Schlüssel haben und ob Inhalte in seed.json übersetzt sind.
// Aufruf: node tools/check-i18n.mjs
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../locales/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.json'));
const data = Object.fromEntries(files.map(f => [f.replace('.json', ''), JSON.parse(readFileSync(new URL(f, dir), 'utf8'))]));
const langs = Object.keys(data);
const all = new Set(langs.flatMap(l => Object.keys(data[l])));
let problems = 0;
for (const l of langs) {
  const missing = [...all].filter(k => !(k in data[l]));
  if (missing.length) { problems += missing.length; console.error(`✗ ${l}.json fehlt: ${missing.join(', ')}`); }
  else console.log(`✓ ${l}.json vollständig (${Object.keys(data[l]).length} Schlüssel)`);
}

const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8'));
const loc = (v, where) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const l of langs) if (!v[l]) { problems++; console.error(`✗ seed: ${where} ohne „${l}“`); }
};
for (const s of seed.songs) {
  loc(s.tip, `${s.id}.tip`);
  s.sections.forEach((x, i) => { loc(x.cue, `${s.id}.sections[${i}].cue`); if (x.label) loc(x.label, `${s.id}.sections[${i}].label`); });
}
for (const c of seed.compendium) { loc(c.title, `compendium.${c.id}.title`); loc(c.html, `compendium.${c.id}.html`); }
for (const c of seed.categories) loc(c.label, `category.${c.id}`);
if (problems) { console.error(`\n${problems} Problem(e)`); process.exit(1); }
console.log('✓ Startdaten vollständig übersetzt');
