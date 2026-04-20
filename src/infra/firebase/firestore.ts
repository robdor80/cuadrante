import { getFirestore } from 'firebase/firestore';

import { firebaseApp } from './client';

// Parte 1: solo inicializamos cliente de Firestore.
// El esquema final de colecciones para estados diarios se definirá en su fase.
export const db = firebaseApp ? getFirestore(firebaseApp) : null;
