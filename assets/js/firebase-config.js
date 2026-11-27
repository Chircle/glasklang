// ---------------------------------------------------------------------------
// Glasklang · Firebase-Konfiguration
// Diese Datei bleibt im Repository ein Platzhalter (→ Demo-Modus).
// Beim Deploy über GitHub Actions wird sie aus den Repository-Secrets erzeugt
// (siehe .github/workflows/deploy.yml und README).
// Für lokale Tests kannst du die Werte hier eintragen – aber nicht committen.
// ---------------------------------------------------------------------------
export const firebaseConfig = {
  apiKey: "DEIN_API_KEY",
  authDomain: "DEIN-PROJEKT.firebaseapp.com",
  projectId: "DEIN-PROJEKT",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000"
};

// Optionale Zusatzdienste (leer = ausgeschaltet).
export const extras = {
  youtubeApiKey: "",     // YouTube Data API v3 → Videos automatisch finden
  recaptchaSiteKey: ""   // reCAPTCHA v3 (App Check) → KI-Coach über Firebase AI Logic
};