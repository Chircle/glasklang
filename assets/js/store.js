// Datenschicht: Firebase (Auth + Firestore) oder Demo (seed.json + localStorage)
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
  const user = { uid: 'demo', displayName: 'Demo', email: 'demo@glasklang.local', photoURL: '' };
  let seedCache = null;
  const seed = async () => (seedCache ??= await (await fetch('data/seed.json')).json());
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
  let members = ['lehrerin@example.com'];
  const SONGS_KEY = 'glasklang-demo-songs';
  const readPatches = () => { try { return JSON.parse(localStorage.getItem(SONGS_KEY)) || {}; } catch { return {}; } };

  return {
    demo: true,
    onAuth(cb) { setTimeout(() => cb(user), 0); },
    async signIn() {},
    async signOut() { location.reload(); },
    async access() { return { ok: true, role: 'owner' }; },
    async songs() { const p = readPatches(); return (await seed()).songs.map(s => ({ ...s, ...(p[s.id] || {}) })); },
    async categories() { return (await seed()).categories || []; },
    async compendium() { return (await seed()).compendium; },
    async updateSong(id, patch) {
      const p = readPatches(); p[id] = { ...(p[id] || {}), ...patch };
      try { localStorage.setItem(SONGS_KEY, JSON.stringify(p)); } catch { /* Speicher nicht verfügbar */ }
    },
    async loadUserState() {
      return read() || { ...emptyState(), favorites: ['af1', 'af2', 'af3', 'wk1', 'ag1'], completed: ['kc1', 'af1'] };
    },
    async saveUserState(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* Speicher nicht verfügbar */ } },
    async listMembers() { return [...members]; },
    async addMember(email) { members = [...new Set([...members, email.toLowerCase()])]; },
    async removeMember(email) { members = members.filter(m => m !== email); },
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

  const mail = () => (auth.currentUser?.email || '').toLowerCase();

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

    async access() {
      // Besitzer:in wird über die Firestore-Regeln erkannt: Nur sie/er darf die ganze Mitgliederliste lesen.
      // So steht keine E-Mail-Adresse im ausgelieferten Code.
      try { await getDocs(collection(db, 'members')); return { ok: true, role: 'owner' }; } catch { /* keine Besitzer:in */ }
      try {
        const snap = await getDoc(doc(db, 'members', mail()));
        return snap.exists() ? { ok: true, role: 'member' } : { ok: false };
      } catch { return { ok: false }; }
    },

    async songs() {
      const snap = await getDocs(collection(db, 'songs'));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    async categories() {
      const snap = await getDoc(doc(db, 'meta', 'categories'));
      return snap.exists() ? (snap.data().items || []) : [];
    },
    async updateSong(id, patch) { await updateDoc(doc(db, 'songs', id), { ...patch, updatedAt: serverTimestamp() }); },
    async compendium() {
      const snap = await getDoc(doc(db, 'meta', 'compendium'));
      return snap.exists() ? (snap.data().items || []) : [];
    },

    async loadUserState() {
      const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      return snap.exists() ? { ...emptyState(), ...snap.data() } : emptyState();
    },
    async saveUserState(s) {
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        favorites: s.favorites, completed: s.completed, notes: s.notes, theme: s.theme, lang: s.lang || null, metronome: s.metronome || null,
        email: mail(), updatedAt: serverTimestamp()
      }, { merge: true });
    },

    async listMembers() {
      const snap = await getDocs(collection(db, 'members'));
      return snap.docs.map(d => d.id).sort();
    },
    async addMember(email) {
      await setDoc(doc(db, 'members', email.trim().toLowerCase()), { addedAt: serverTimestamp(), addedBy: mail() });
    },
    async removeMember(email) { await deleteDoc(doc(db, 'members', email)); },

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
