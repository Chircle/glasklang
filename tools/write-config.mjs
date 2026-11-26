// Erzeugt assets/js/firebase-config.js aus Umgebungsvariablen (GitHub-Secrets).
import { writeFileSync } from 'node:fs';
const map = {
  apiKey: 'FIREBASE_API_KEY',
  authDomain: 'FIREBASE_AUTH_DOMAIN',
  projectId: 'FIREBASE_PROJECT_ID',
  messagingSenderId: 'FIREBASE_MESSAGING_SENDER_ID',
  appId: 'FIREBASE_APP_ID'
};
const cfg = {}, missing = [];
for (const [k, env] of Object.entries(map)) {
  const v = (process.env[env] || '').trim();
  if (!v) missing.push(env); else cfg[k] = v;
}
if (missing.length) {
  console.error(`✗ Fehlende Repository-Secrets: ${missing.join(', ')}\n  → GitHub: Settings → Secrets and variables → Actions → New repository secret`);
  process.exit(1);
}
writeFileSync(new URL('../assets/js/firebase-config.js', import.meta.url),
  `// automatisch erzeugt beim Deploy – nicht bearbeiten\nexport const firebaseConfig = ${JSON.stringify(cfg, null, 2)};\n`);
console.log('✓ firebase-config.js aus Secrets erzeugt');
