# Glasklang

Persönliche Repertoire- und Gesangstechnik-Datenbank im Glas-Design.
Login mit Google, Daten in Firebase Firestore, gehostet auf GitHub Pages. Es gibt keinen Build-Schritt: nur HTML, CSS und JavaScript-Module.

## Funktionen

- Google-Login. Zugriff hast nur du: Die Firestore-Regeln lassen ausschließlich deine Google-Adresse zu.
- Songkatalog mit 200 Songs in 15 Kategorien, mit Suche und Filtern (Kategorie, Stimmung, Niveau, Register, Fassung, Technik).
- **Eine Kachel pro Song, mehrere gesungene Fassungen**, z. B. „Let It Go“ auf Englisch und „Lass jetzt los“ auf Deutsch. Jede Fassung hat eigenen Titel, Interpret:in, Songtext und YouTube-Video. Das Video wird datenschutzfreundlich erst nach einem Klick geladen, über youtube-nocookie. Ohne eingetragenen Link gibt es eine passende YouTube-Suche.
- Fassungen bearbeiten (nur Besitzer:in): „Bearbeiten“ bzw. „+“ im Unterrichtsblatt. Songtexte können Abschnitte wie `[Refrain]` enthalten.
- **Komplett mehrsprachig:** Oberfläche und Inhalte auf Deutsch und Englisch. Ausnahme ist der Markenname. Der Sprachumschalter (🌐) und der Hell/Dunkel-Kippschalter sitzen oben rechts.
- Drei Bereiche über das Dock: **Datenbank** (Startseite nach dem Login), **Technik** (Konstellation & Kompendium) und **Metronom**.
- Technik-Konstellation: Glaskugeln, die du antippst, um den Katalog nach einer Technik zu filtern.
- Glaskugel-Metronom: 30–260 BPM, Tap-Tempo, Taktarten 2/4 bis 12/8, Betonung, Klänge (Glas, Holz, Klick, stumm) und Lautstärke. Das Tempo lässt sich aus jedem Song übernehmen. Das Metronom läuft weiter, wenn du in die Datenbank wechselst. Tastatur: Leertaste startet und stoppt, ↑/↓ ändern das Tempo (mit Shift in 5er-Schritten), T ist Tap.
- Unterrichtsblatt pro Song: Coaching-Fokus, Abschnitte mit Technik-Cues, eigener Songtext, Notizen.
- **Songtext laden** über [LRCLIB](https://lrclib.net) (freie Songtext-Datenbank, oft mit Zeitstempeln). Suchen, Vorschau ansehen, übernehmen. Der Text landet nur in deinem privaten Firestore, nie im Repository.
- **Nur Text:** Songtext bildschirmfüllend zum Mitlesen, mit einstellbarer Schriftgröße (Text antippen oder ⤢).
- **Videos automatisch:** Fehlt einer Fassung das Video, sucht Glasklang über die YouTube Data API das erste einbettbare Ergebnis und bettet es ein. Unter „Anderes Video“ stehen die nächsten Treffer zur Auswahl (optional, siehe Einrichtung 5).
- **Plan & KI-Coach:** Eigene Ansicht „Plan“ mit deinen markierten Songs. Du schreibst hinein, was dir schwerfällt; Gemini (über Firebase AI Logic) schlägt 3 Songs für die nächsten Wochen samt Techniken und konkreten Übungen vor (optional, siehe Einrichtung 6).
- **Karaoke-Ansicht:** Großer Text, bei synchronisierten Texten läuft die aktuelle Zeile mit, wahlweise zum YouTube-Video oder mit eigener Uhr. Zeile antippen springt dorthin; Versatz ±0,5 s und Schriftgröße einstellbar.
- Rückfall-Links zu Genius und Musixmatch, wenn LRCLIB nichts findet (dort lesen, bei Bedarf von Hand abtippen).
- **Profilbilder** für Künstler:innen, Bands und Musicals: automatisch erzeugte Glas-Avatare mit Initialen, optional ein eigenes Bild (wird auf 256 px zugeschnitten, ca. 25 KB, in `artists/{key}` gespeichert).
- Übungsplan (Favoriten), „gemeistert“, Notizen und Design-Wahl. Das wird pro Konto gespeichert und ist auf allen Geräten gleich.
- Export: Drucken oder als TXT.
- Zwei Designs: **Tageslicht** und **Dämmerung**.
- Demo-Modus ohne Firebase. Er startet automatisch, solange `firebase-config.js` nicht ausgefüllt ist, oder mit `?demo` in der URL.

## Auf dem Handy

Die App ist für Handys gebaut und läuft genauso auf Tablet und Desktop.

- **Kopfleiste:** einzeilig. Die Suche und ein **Filter**-Knopf kleben beim Scrollen oben über dem Katalog.
- **Filter:** Sie öffnen als Bottom-Sheet, mit einem Knopf „N Songs anzeigen“.
- **Song-Karten:** kompakt, etwa 8 Songs pro Bildschirm. Ein Tipp öffnet das Unterrichtsblatt als Sheet. Nach unten wischen schließt es.
- **Metronom:** Kugel, Tempo und Start-Knopf passen auf den ersten Bildschirm. Solange es läuft, bleibt der Bildschirm an.
- **Bedienung:** Alle Tippflächen sind mindestens 44 px groß. Eingabefelder haben 16 px Schrift, damit das iPhone beim Antippen nicht ins Bild zoomt. Abstände berücksichtigen Notch und Home-Indikator.
- **Als App installieren:** im Browser-Menü „Zum Home-Bildschirm“ wählen. Glasklang startet dann im Vollbild mit eigenem Icon.

## Projektstruktur

```
index.html
assets/css/glasklang.css     Designsprache & Komponenten
assets/js/app.js             UI-Logik
assets/js/motion.js          Animationen & Interaktion
assets/js/metronome.js       Metronom (Web Audio)
assets/js/store.js           Firebase- bzw. Demo-Datenschicht
assets/js/lyrics.js          LRCLIB-Suche & LRC-Parser
assets/js/karaoke.js         Karaoke-Ansicht
assets/js/avatars.js         Glas-Avatare & Bild-Upload
assets/js/youtube.js         Videosuche (YouTube Data API)
assets/js/coach.js           KI-Coach: Prompt, Antwortschema, Prüfung
assets/manifest.webmanifest  App-Manifest (Home-Bildschirm)
assets/icons/                App-Icons
assets/js/firebase-config.js Platzhalter, wird beim Deploy aus den Secrets erzeugt
tools/write-config.mjs       erzeugt die Konfiguration
.github/workflows/deploy.yml Prüfen + Deploy auf GitHub Pages
data/seed.json               Startdaten (200 Songs, ohne Songtexte)
locales/de.json, en.json     Oberflächentexte
assets/js/i18n.js            Sprachlogik
tools/check-i18n.mjs         Übersetzungs-Prüfung
firestore.rules              Sicherheitsregeln
```

## Einrichtung (ca. 15 Minuten)

### 1. Firebase-Projekt
1. Öffne <https://console.firebase.google.com> und lege ein **neues Projekt** an. Analytics brauchst du nicht.
2. **Build → Authentication → Get started → Sign-in method → Google** aktivieren.
3. **Build → Firestore Database → Datenbank erstellen**. Als Region z. B. `eur3` oder `europe-west3` wählen und im **Produktionsmodus** starten.
4. **Projekteinstellungen → Allgemein → Meine Apps → Web-App (`</>`) hinzufügen**. Den angezeigten `firebaseConfig`-Block kopieren.

### 2. Sicherheitsregeln
- Öffne `firestore.rules` und ersetze `deine.adresse@gmail.com` durch deine Google-Adresse in Kleinbuchstaben. Mach das **nur in der Firebase Console**: Den Inhalt dort unter **Firestore → Regeln** einfügen und **Veröffentlichen**. Im Repository bleibt der Platzhalter stehen.
- Die Regeln sind nicht öffentlich einsehbar. Auch die Seite selbst enthält deine Adresse nicht: Sie prüft beim Login nur, ob Firestore den Lesezugriff erlaubt.
- **Nach jedem Update von `firestore.rules`** (z. B. neue Sammlung `artists`) den Inhalt erneut in der Console einfügen und veröffentlichen. Das Repository allein ändert die aktiven Regeln nicht.

### 3. GitHub: Secrets & Pages
1. Repository anlegen und den Code pushen (siehe unten).
2. Unter **Settings → Secrets and variables → Actions → New repository secret** diese fünf Werte aus deinem `firebaseConfig` anlegen:

   | Secret | Wert aus firebaseConfig |
   |---|---|
   | `FIREBASE_API_KEY` | apiKey |
   | `FIREBASE_AUTH_DOMAIN` | authDomain |
   | `FIREBASE_PROJECT_ID` | projectId |
   | `FIREBASE_MESSAGING_SENDER_ID` | messagingSenderId |
   | `FIREBASE_APP_ID` | appId |
   | `YOUTUBE_API_KEY` | *optional*, siehe Schritt 5 |
   | `RECAPTCHA_SITE_KEY` | *optional*, siehe Schritt 6 |

3. Unter **Settings → Pages → Build and deployment → Source** den Eintrag **GitHub Actions** wählen.
4. Bei jedem Push auf `main` passiert jetzt automatisch Folgendes: Die Übersetzungen werden geprüft, `firebase-config.js` wird aus den Secrets erzeugt, und die Seite wird veröffentlicht. Fehlt ein Secret, bricht der Lauf mit einem klaren Hinweis ab.

```bash
git init
git add .
git commit -m "Glasklang"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/glasklang.git
git push -u origin main
```

Zuletzt in Firebase unter **Authentication → Settings → Autorisierte Domains** die Domain `DEIN-NAME.github.io` hinzufügen. Ohne diesen Eintrag schlägt der Google-Login fehl.

#### Gut zu wissen: Was Secrets leisten und was nicht
Die Secrets halten die Werte aus dem **Repository** heraus. Die ausgelieferte Seite braucht sie aber im Browser, also kann sie jede:r über die Entwicklertools sehen. Das ist bei Firebase so vorgesehen: Die Web-Config ist ein Erkennungsmerkmal, kein Passwort. Geschützt sind deine Daten über drei Ebenen:
- **Firestore-Regeln:** Nur dein Konto kommt an die Daten.
- **Autorisierte Domains:** Der Login funktioniert nur auf deiner Seite.
- **Empfohlen, den API-Schlüssel einschränken:** In der Google Cloud Console unter **APIs & Dienste → Anmeldedaten** den Browser-Schlüssel auswählen und unter **Website-Einschränkungen** eintragen:
  - `https://DEIN-NAME.github.io/*`
  - `https://DEIN-PROJEKT.firebaseapp.com/*`
  - optional `http://localhost:8000/*` zum Testen

  Optional kommt noch **Firebase App Check** mit reCAPTCHA hinzu.

### 4. Erster Login
1. Die Seite öffnen und mit deinem Google-Konto anmelden.
2. Weil der Katalog noch leer ist, erscheint **„Startdaten importieren“**. Ein Klick schreibt die 200 Songs, die Kategorien und das Quellen-Kompendium in Firestore.

### 5. Optional: Videos automatisch finden
1. In der [Google Cloud Console](https://console.cloud.google.com/) dein Firebase-Projekt wählen und unter **APIs & Dienste → Bibliothek** die **YouTube Data API v3** aktivieren.
2. Unter **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → API-Schlüssel** einen neuen Schlüssel anlegen und sofort einschränken:
   - **Website-Einschränkungen:** `https://DEIN-NAME.github.io/*`
   - **API-Einschränkungen:** nur *YouTube Data API v3*
3. Den Schlüssel als Repository-Secret `YOUTUBE_API_KEY` speichern.

Jede Suche kostet Kontingent; standardmäßig reicht es für etwa **100 Suchen pro Tag**. Glasklang sucht pro Fassung nur einmal und speichert Treffer und Alternativen. Ist das Kontingent aufgebraucht, erscheint ein Hinweis, und am nächsten Tag geht es weiter.

### 6. Optional: KI-Coach (Gemini über Firebase AI Logic)
1. Firebase Console → **AI Services → AI Logic → Get started** → Anbieter **Gemini Developer API** wählen (kostenloses Kontingent, keine Abrechnung nötig).
2. **App Check** einrichten, das Firebase für AI Logic inzwischen verlangt:
   - Unter [google.com/recaptcha/admin](https://www.google.com/recaptcha/admin) einen **reCAPTCHA v3**-Schlüssel für die Domain `DEIN-NAME.github.io` anlegen.
   - Firebase Console → **App Check** → deine Web-App → **reCAPTCHA** → den **geheimen Schlüssel** eintragen. Für *Firebase AI Logic* die Erzwingung aktivieren.
   - Den **Websiteschlüssel** (Site Key) als Repository-Secret `RECAPTCHA_SITE_KEY` speichern.
3. Falls du beim Firebase-Browser-Schlüssel API-Einschränkungen gesetzt hast, dort die *Firebase AI Logic API* ergänzen.

Was gesendet wird: deine Songliste (Titel, Interpret:in, Niveau, Register, Umfang, Techniken), Plan, gemeisterte Songs, deine Notizen zu den Plan-Songs und der Text aus „Was fällt dir gerade schwer?“. Keine Songtexte, keine E-Mail-Adresse. Beim kostenlosen Kontingent kann Google Eingaben laut den Gemini-API-Bedingungen zur Verbesserung seiner Dienste verwenden. Schreib dort also nichts, was du nicht teilen möchtest.

Die Antwort wird gegen den Katalog geprüft: Nur echte Songs und die sechs bekannten Techniken erscheinen in der App. Der letzte Plan wird in deinem Konto gespeichert. Ohne Secret (und im Demo-Modus) entsteht der Vorschlag nach einfachen Regeln.

Das verwendete Modell steht oben in `assets/js/store.js` (`AI_MODELS`). Google benennt Modelle regelmäßig um; antwortet eines nicht mehr, wird automatisch das nächste in der Liste probiert.

## Songtexte & Videos ergänzen
Die Startdaten enthalten **keine Songtexte**. So ergänzt du sie:
1. Song öffnen und unter „Gesungene Fassungen“ die Sprache wählen.
2. **Songtext laden** antippen: Titel und Interpret:in sind vorausgefüllt, Treffer antippen, Vorschau prüfen, **Übernehmen**.
3. Alternativ **Bearbeiten** und Text sowie YouTube-Link von Hand einfügen.

Gut zu wissen:
- LRCLIB ist bei englischen Originalen gut bestückt, bei deutschen Musical- und Disney-Fassungen eher dünn. Dann hilft der Genius-/Musixmatch-Link oder Abtippen.
- Die Texte sind urheberrechtlich geschützt. Für den privaten Gebrauch ist das in Ordnung; deshalb bleibt die App auf dein Konto beschränkt und die Texte gehören nicht ins Repository.
- Anfragen an LRCLIB laufen nur auf Knopfdruck, nacheinander und mit Kennung (`Lrclib-Client`).

Die Suche findet danach auch Wörter aus dem Text.

## Ungeprüfte Angaben
Bei 92 Songs fehlen Tonart und Umfang, oder sie sind nur geschätzt. Das gilt auch für das Tempo. Diese Songs tragen `review: true` und zeigen im Unterrichtsblatt den Hinweis „Angaben ungeprüft“. Korrigieren kannst du sie in der Firebase Console unter `songs/{id}`:
- `key`: z. B. `[{"tonic":"Bb","mode":"major"}]`
- `range`: z. B. `"G3–E5"`
- `bpm`

Danach `review` löschen oder auf `false` setzen.

## Mehrsprachigkeit
- **Oberfläche:** `locales/de.json` und `locales/en.json`. Pluralformen stehen als `{ "one": …, "other": … }`.
- **Inhalte:** Felder wie `tip`, `sections[].cue` und das Kompendium sind Objekte der Form `{ "de": "…", "en": "…" }`. Fehlt eine Sprache, wird Deutsch angezeigt, mit dem Hinweis „DE“.
- **Feste IDs statt Wörter:** Niveau, Stimmung, Register, Technik und Kategorie werden als IDs gespeichert (z. B. `beginner`, `belting`). Die Beschriftung kommt aus den Sprachdateien.
- **Tonarten** werden je Sprache benannt: deutsch „B-Dur“, „fis-Moll“, „H-Dur“, englisch „B♭ major“.
- **Neue Sprache hinzufügen:**
  1. `locales/xx.json` anlegen.
  2. `xx` in `LANGS` in `assets/js/i18n.js` eintragen.
  3. Optional die Inhalte um `xx` ergänzen.
- **Prüfen:** `node tools/check-i18n.mjs` meldet fehlende Schlüssel und Übersetzungen. Der Deploy-Workflow führt das bei jedem Push aus.
- **Schreibrichtung:** Das CSS nutzt Angaben, die sich an der Leserichtung orientieren. Sprachen von rechts nach links funktionieren daher über `"_dir": "rtl"` in der jeweiligen Sprachdatei.

## Datenmodell
| Pfad | Inhalt | Lesen | Schreiben |
|---|---|---|---|
| `songs/{id}` | schema, order, category, artist, key[{tonic, mode}], range, bpm, difficulty, register, mood, techniques[], tip{de,en}, coachingQuery, sections[{type, n, label?, cue{de,en}}], versions[{id, lang, title, performer, lyrics, video, videoTitle?, videoAuto?, videoAlts?, synced?, lyricsSource?}], review? | Besitzer:in | Besitzer:in |
| `meta/categories` | items[{id, label, order}] | Besitzer:in | Besitzer:in |
| `meta/compendium` | items[{id, title{de,en}, html{de,en}}] | Besitzer:in | Besitzer:in |
| `artists/{key}` | name, image (Data-URL) | Besitzer:in | Besitzer:in |
| `users/{uid}` | favorites[], completed[], notes{}, theme, lang, metronome{}, coach{note, source, result, at} | nur das eigene Konto | nur das eigene Konto |

## Lokal testen
```bash
python3 -m http.server 8000
# http://localhost:8000/?demo   → Demo-Modus
# Mit Firebase: Werte vorübergehend in assets/js/firebase-config.js eintragen (nicht committen!)
# oder: FIREBASE_API_KEY=… … node tools/write-config.mjs
```
