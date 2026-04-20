import {
  getAuth,
  type User as FirebaseUser,
} from 'firebase/auth';

import { firebaseApp, isFirebaseConfigured } from './client';

const auth = firebaseApp ? getAuth(firebaseApp) : null;

export async function signInWithGoogle(): Promise<FirebaseUser> {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase no configurado. Revisa variables en .env.local');
  }

  throw new Error('Login Google pendiente de implementacion en una fase posterior.');
}

export async function logOut(): Promise<void> {
  if (!isFirebaseConfigured) {
    return;
  }

  throw new Error('Logout pendiente de implementacion en una fase posterior.');
}

export function getFirebaseAuth() {
  return auth;
}
