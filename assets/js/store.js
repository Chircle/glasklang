// Datenschicht: Firebase (Auth + Firestore) oder Demo (seed.json + localStorage)
// Glasklang ist eine Ein-Personen-App: Lesen und Schreiben darf nur das Besitzer-Konto (siehe firestore.rules).
import { firebaseConfig } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
const emptyState = () => ({ favorites: [], completed: [], notes: {}, theme: null, lang: null, metronome: null });

export function isDemo() {
  return /[?&]demo\b/.test(location.search) || !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('DEIN_');
}

export async function createStore() {
  return isDemo() ? createDemoStore() : createFirebaseStore();
}

/* ------------------------------------------------------------------ Demo */
function createDemoStore() {
  const KEY = 'glasklang-demo-state';
  const SONGS_KEY = 'glasklang-demo-songs';
  const ART_KEY = 'glasklang-demo-artists';
  const user = { uid: 'demo', displayName: 'Demo', email: 'demo@glasklang.local', photoURL: '' };
  let seedCache = null;
  const seed = async () => (seedCache ??= await (await fetch('data/seed.json')).json());
  const readJSON = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) || fallback; } catch { return fallback; } };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { throw new Error('storage-full'); } };

  return {
    demo: true,
    onAuth(cb) { setTimeout(() => cb(user), 0); },
    async signIn() {},
    async signOut() { location.reload(); },
    async access() { return true; },
    async songs() { const p = readJSON(SONGS_KEY, {}); return (await seed()).songs.map(s => ({ ...s, ...(p[s.id] || {}) })); },
    async categories() { return (await seed()).categories || []; },
    async compendium() { return (await seed()).compendium; },
    async updateSong(id, patch) { const p = readJSON(SONGS_KEY, {}); p[id] = { ...(p[id] || {}), ...patch }; writeJSON(SONGS_KEY, p); },
    async artists() { return readJSON(ART_KEY, {}); },
    async setArtistImage(key, image, name) {
      const a = readJSON(ART_KEY, {});
      if (image) a[key] = { image, name }; else delete a[key];
      writeJSON(ART_KEY, a);
    },
    async loadUserState() {
      return readJSON(KEY, null) || { ...emptyState(), favorites: ['af1', 'af2', 'af3', 'wk1', 'ag1'], completed: ['kc1', 'af1'] };
    },
    async saveUserState(s) { writeJSON(KEY, s); },
    async importSeed() { return 0; }
  };
}

/* -------------------------------------------------------------- Firebase */
async function createFirebaseStore() {
  const [{ initializeApp }, authMod, fs] = await Promise.all([
    import(FB + 'firebase-app.js'),
    import(FB + 'firebase-auth.js'),
    import(FB + 'firebase-firestore.js')
  ]);
  const { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } = authMod;
  const { getFirestore, collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } = fs;

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  return {
    demo: false,
    onAuth(cb) { onAuthStateChanged(auth, cb); },
    async signIn() {
      try { await signInWithPopup(auth, provider); }
      catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
          await signInWithRedirect(auth, provider);
        } else throw e;
      }
    },
    async signOut() { await signOut(auth); },

    // Zugang = die Firestore-Regeln lassen dieses Konto lesen. Keine E-Mail-Adresse im ausgelieferten Code.
    async access() {
      try { await getDoc(doc(db, 'meta', 'categories')); return true; } catch { return false; }
    },

    async songs() {
      const snap = await getDocs(collection(db, 'songs'));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    async categories() {
      const snap = await getDoc(doc(db, 'meta', 'categories'));
      return snap.exists() ? (snap.data().items || []) : [];
    },
    async compendium() {
      const snap = await getDoc(doc(db, 'meta', 'compendium'));
      return snap.exists() ? (snap.data().items || []) : [];
    },
    async updateSong(id, patch) { await updateDoc(doc(db, 'songs', id), { ...patch, updatedAt: serverTimestamp() }); },

    async artists() {
      const snap = await getDocs(collection(db, 'artists'));
      return Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
    },
    async setArtistImage(key, image, name) {
      if (image) await setDoc(doc(db, 'artists', key), { image, name, updatedAt: serverTimestamp() });
      else await deleteDoc(doc(db, 'artists', key));
    },

    async loadUserState() {
      const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      return snap.exists() ? { ...emptyState(), ...snap.data() } : emptyState();
    },
    async saveUserState(s) {
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        favorites: s.favorites, completed: s.completed, notes: s.notes, theme: s.theme, lang: s.lang || null, metronome: s.metronome || null,
        updatedAt: serverTimestamp()
      }, { merge: true });
    },

    // Schreibt nur Songs, die es noch nicht gibt – eigene Texte bleiben unangetastet.
    async importSeed() {
      const seed = await (await fetch('data/seed.json')).json();
      const existing = new Set((await getDocs(collection(db, 'songs'))).docs.map(d => d.id));
      const batch = writeBatch(db);
      let n = 0;
      for (const s of seed.songs) {
        if (existing.has(s.id)) continue;
        const { id, ...data } = s;
        batch.set(doc(db, 'songs', id), data);
        n++;
      }
      batch.set(doc(db, 'meta', 'compendium'), { items: seed.compendium }, { merge: true });
      batch.set(doc(db, 'meta', 'categories'), { items: seed.categories || [] }, { merge: true });
      await batch.commit();
      return n;
    }
  };
}