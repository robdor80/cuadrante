import { FIREBASE_CONFIG } from './config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';

let firebaseApp = null;

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
