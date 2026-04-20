import { FIREBASE_CONFIG } from './config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';

let firebaseApp = null;
let firebaseAuth = null;
let authInitPromise = null;

function hasValidConfig() {
  return Object.values(FIREBASE_CONFIG).every((value) => typeof value === 'string' && value.trim() !== '');
}

export function initFirebase() {
  if (!hasValidConfig()) {
    console.info('Firebase no configurado aun. Se activara en fases posteriores.');
    return null;
  }

  if (!firebaseApp) {
    firebaseApp = initializeApp(FIREBASE_CONFIG);
  }

  return firebaseApp;
}

export function isFirebaseConfigured() {
  return hasValidConfig();
}

export function isAuthReadyForUse() {
  return isFirebaseConfigured();
}

export async function initFirebaseAuth() {
  const app = initFirebase();
  if (!app) {
    return null;
  }

  if (!firebaseAuth) {
    firebaseAuth = getAuth(app);
    authInitPromise = setPersistence(firebaseAuth, browserLocalPersistence);
  }

  if (authInitPromise) {
    await authInitPromise;
  }

  return firebaseAuth;
}

export async function signInWithGoogle() {
  const auth = await initFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase no configurado.');
  }

  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export async function signOutUser() {
  const auth = await initFirebaseAuth();
  if (!auth) {
    return;
  }

  await signOut(auth);
}

export async function observeAuthState(onChange) {
  const auth = await initFirebaseAuth();
  if (!auth) {
    return () => {};
  }

  return onAuthStateChanged(auth, onChange);
}
