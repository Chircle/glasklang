// Glasklang · KI-Coach
// Baut aus Übungsplan, Fortschritt und deiner Notiz eine Anfrage an Gemini (Firebase AI Logic)
// und prüft die Antwort streng gegen den Katalog: Nur echte Song-IDs und bekannte Techniken
// kommen in der Oberfläche an. Ohne KI (Demo-Modus) entsteht ein einfacher Plan nach Regeln.

export const TECHNIQUES = ['belting', 'mix', 'legit', 'twang', 'runs', 'support'];
const DIFF = { beginner: 1, intermediate: 2, advanced: 3 };

/** Antwortschema (Structured Output). Wird mit der Schema-Klasse des Firebase-SDK gebaut. */
export function coachSchema(Schema) {
  return Schema.object({
    properties: {
      summary: Schema.string({ description: '2–3 Sätze: Einschätzung und Schwerpunkt der nächsten Wochen.' }),
      songs: Schema.array({
        description: 'Genau 3 Songs in sinnvoller Übungsreihenfolge.',
        items: Schema.object({
          properties: {
            id: Schema.string({ description: 'Song-ID exakt aus dem Katalog.' }),
            why: Schema.string({ description: '1–2 Sätze, warum dieser Song jetzt passt.' }),
            focus: Schema.array({ items: Schema.enumString({ enum: TECHNIQUES }) }),
            exercise: Schema.string({ description: 'Eine konkrete Übung bzw. Stelle, mit der man anfängt.' })
          }
        })
      }),
      techniques: Schema.array({
        description: '2–3 Techniken, die als Nächstes dran sind.',
        items: Schema.object({
          properties: {
            id: Schema.enumString({ enum: TECHNIQUES }),
            why: Schema.string(),
            howTo: Schema.string({ description: 'Kurze, konkrete Übungsanleitung (5–10 Minuten).' })
          }
        })
      }),
      caution: Schema.string({ description: 'Nur bei Schmerz, Heiserkeit o. Ä.: Hinweis auf Pause bzw. Stimmarzt/Gesangslehrer. Sonst leer.' })
    },
    optionalProperties: ['caution']
  });
}

const title = (s, L) => (s.versions?.[0]?.title) || L(s.title) || s.id;

/** Systemanweisung + Nutzerinhalt für das Modell. */
export function buildPrompt({ songs, favorites, completed, notes, note, source, lang, L, techName }) {
  const byId = new Map(songs.map(s => [s.id, s]));
  const row = s => ({
    id: s.id, title: title(s, L), artist: L(s.artist), difficulty: s.difficulty, register: s.register,
    range: s.range || null, bpm: s.bpm || null, techniques: s.techniques || []
  });
  const plan = favorites.map(id => byId.get(id)).filter(Boolean)
    .map(s => ({ ...row(s), myNote: (notes[s.id] || '').slice(0, 300) || undefined }));
  const done = completed.map(id => byId.get(id)).filter(Boolean).map(s => ({ id: s.id, title: title(s, L), difficulty: s.difficulty, techniques: s.techniques }));
  const pool = (source === 'plan' && plan.length >= 3 ? plan : songs.filter(s => !completed.includes(s.id)).map(row));

  const language = lang === 'de' ? 'Deutsch (du-Form)' : 'English';
  const system = [
    'Du bist ein erfahrener, freundlicher Gesangscoach (Pop, Soul, Musical).',
    'Du erstellst einen kurzen, motivierenden Übungsplan für eine einzelne Person, die singt. Sprich sie direkt an.',
    'Regeln:',
    '- Wähle genau 3 Songs, ausschließlich aus der Liste „candidates“, und übernimm ihre id exakt.',
    '- Bevorzuge Songs, die auf dem aktuellen Stand aufbauen (Übungsplan, gemeisterte Songs) und gezielt das trainieren, was laut Notiz schwerfällt.',
    '- Steigere behutsam: höchstens eine Stufe schwerer als die meisten gemeisterten Songs.',
    '- Ordne die 3 Songs in sinnvoller Reihenfolge (zum Einstieg der zugänglichste).',
    `- Techniken nur aus: ${TECHNIQUES.map(id => `${id} (${techName(id)})`).join(', ')}.`,
    '- Übungen konkret und kurz (Stelle im Song, Vokal, Tempo, Dauer). Keine Songtexte zitieren.',
    '- Bei Schmerzen, Heiserkeit oder Stimmproblemen: im Feld caution zu Pause und ggf. HNO/Phoniatrie raten; keine Diagnosen.',
    `- Antworte auf ${language}.`
  ].join('\n');

  const user = JSON.stringify({
    whatIsHard: (note || '').slice(0, 1500),
    source: source === 'plan' && plan.length >= 3 ? 'nur aus dem Übungsplan' : 'ganzer Katalog (ohne Gemeistertes)',
    practicePlan: plan,
    mastered: done,
    candidates: pool
  });
  return { system, user };
}

/** Prüft die Modellantwort gegen den Katalog. Wirft 'empty', wenn nichts Brauchbares übrig bleibt. */
export function validatePlan(raw, songs) {
  let data = raw;
  if (typeof raw === 'string') {
    const m = raw.match(/\{[\s\S]*\}/);
    data = JSON.parse(m ? m[0] : raw);
  }
  const ids = new Set(songs.map(s => s.id));
  const clean = v => String(v || '').trim().slice(0, 600);
  const tech = arr => [...new Set((arr || []).filter(x => TECHNIQUES.includes(x)))];
  const seen = new Set();
  const out = {
    summary: clean(data?.summary),
    songs: (data?.songs || []).filter(x => ids.has(x?.id) && !seen.has(x.id) && seen.add(x.id))
      .slice(0, 3).map(x => ({ id: x.id, why: clean(x.why), focus: tech(x.focus), exercise: clean(x.exercise) })),
    techniques: (data?.techniques || []).filter(x => TECHNIQUES.includes(x?.id)).slice(0, 3)
      .map(x => ({ id: x.id, why: clean(x.why), howTo: clean(x.howTo) })),
    caution: clean(data?.caution)
  };
  if (!out.songs.length) throw new Error('empty');
  return out;
}

/** Plan ohne KI (Demo): einfache Regeln statt Sprachmodell. */
export function rulePlan({ songs, favorites, completed, source, t }) {
  const done = songs.filter(s => completed.includes(s.id));
  const level = done.length ? Math.round(done.reduce((a, s) => a + (DIFF[s.difficulty] || 2), 0) / done.length) : 1;
  const planSongs = songs.filter(s => favorites.includes(s.id) && !completed.includes(s.id));
  const pool = source === 'plan' && planSongs.length >= 3 ? planSongs : songs.filter(s => !completed.includes(s.id));
  const count = {};
  [...planSongs, ...done].forEach(s => (s.techniques || []).forEach(x => { count[x] = (count[x] || 0) + 1; }));
  const weak = TECHNIQUES.slice().sort((a, b) => (count[a] || 0) - (count[b] || 0)).slice(0, 2);
  const score = s => -Math.abs((DIFF[s.difficulty] || 2) - (level + 0.5)) * 2
    + (s.techniques || []).filter(x => weak.includes(x)).length + (favorites.includes(s.id) ? 1.5 : 0);
  const pick = pool.slice().sort((a, b) => score(b) - score(a)).slice(0, 3)
    .sort((a, b) => (DIFF[a.difficulty] || 2) - (DIFF[b.difficulty] || 2));
  return {
    summary: t('coach.demoSummary'),
    songs: pick.map(s => ({ id: s.id, why: '', focus: (s.techniques || []).filter(x => weak.includes(x)).slice(0, 2), exercise: '' })),
    techniques: weak.map(id => ({ id, why: '', howTo: '' })),
    caution: '',
    demo: true
  };
}
