import { DailyStatus, FIREBASE_CONFIG, SLOT_COUNT } from './config.js';
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
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

let firebaseApp = null;
let firebaseAuth = null;
let firestoreDb = null;
let authInitPromise = null;
let slotsInitPromise = null;

const DAILY_STATUS_MONTHS_COLLECTION = 'daily_status_months';
const STATUS_PERSISTED_SET = new Set([DailyStatus.NO_VOY, DailyStatus.VIALIA]);

function hasValidConfig() {
  return Object.values(FIREBASE_CONFIG).every((value) => typeof value === 'string' && value.trim() !== '');
}

function isValidDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidMonthKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
}

function normalizeProfileRecord(raw) {
  if (!raw) {
    return null;
  }

  return {
    uid: String(raw.uid || ''),
    email: String(raw.email || ''),
    name: String(raw.name || ''),
    color: String(raw.color || ''),
    slotId: Number(raw.slotId || 0),
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

function normalizeMonthDays(rawDays) {
  if (!rawDays || typeof rawDays !== 'object') {
    return {};
  }

  const normalized = {};

  for (const [dateKey, dayEntries] of Object.entries(rawDays)) {
    if (!isValidDateKey(dateKey) || !dayEntries || typeof dayEntries !== 'object') {
      continue;
    }

    const normalizedDay = {};

    for (const [uid, status] of Object.entries(dayEntries)) {
      const safeUid = String(uid || '').trim();
      if (!safeUid || !STATUS_PERSISTED_SET.has(status)) {
        continue;
      }
      normalizedDay[safeUid] = status;
    }

    if (Object.keys(normalizedDay).length > 0) {
      normalized[dateKey] = normalizedDay;
    }
  }

  return normalized;
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

export function initFirestore() {
  const app = initFirebase();
  if (!app) {
    return null;
  }

  if (!firestoreDb) {
    firestoreDb = getFirestore(app);
  }

  return firestoreDb;
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

export async function ensureSlotsInitialized() {
  const db = initFirestore();
  if (!db) {
    throw new Error('Firestore no configurado.');
  }

  if (!slotsInitPromise) {
    slotsInitPromise = (async () => {
      const snapshot = await getDocs(collection(db, 'slots'));
      const existingIds = new Set(snapshot.docs.map((slotDoc) => slotDoc.id));
      const writes = [];

      for (let slotId = 1; slotId <= SLOT_COUNT; slotId += 1) {
        const slotDocId = String(slotId);
        if (!existingIds.has(slotDocId)) {
          writes.push(
            setDoc(
              doc(db, 'slots', slotDocId),
              {
                slotId,
                occupiedBy: null,
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            ),
          );
        }
      }

      if (writes.length > 0) {
        await Promise.all(writes);
      }
    })().catch((error) => {
      slotsInitPromise = null;
      throw error;
    });
  }

  await slotsInitPromise;
}

export async function loadUserProfile(uid) {
  const db = initFirestore();
  if (!db) {
    throw new Error('Firestore no configurado.');
  }

  const profileRef = doc(db, 'users', uid);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    return null;
  }

  return normalizeProfileRecord(profileSnap.data());
}

export async function listActiveProfilesBySlot() {
  const db = initFirestore();
  if (!db) {
    throw new Error('Firestore no configurado.');
  }

  const usersSnap = await getDocs(collection(db, 'users'));
  const users = usersSnap.docs
    .map((snap) => normalizeProfileRecord(snap.data()))
    .filter(
      (profile) =>
        profile &&
        profile.uid &&
        Number.isInteger(profile.slotId) &&
        profile.slotId >= 1 &&
        profile.slotId <= SLOT_COUNT,
    )
    .sort((a, b) => a.slotId - b.slotId);

  return users;
}

export async function createUserProfileWithAutoSlot({ uid, email, name, color }) {
  const db = initFirestore();
  if (!db) {
    throw new Error('Firestore no configurado.');
  }

  await ensureSlotsInitialized();

  const userRef = doc(db, 'users', uid);

  const txResult = await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    if (userSnap.exists()) {
      return {
        status: 'existing',
        profile: normalizeProfileRecord(userSnap.data()),
      };
    }

    let freeSlotId = null;
    let freeSlotRef = null;

    for (let slotId = 1; slotId <= SLOT_COUNT; slotId += 1) {
      const slotRef = doc(db, 'slots', String(slotId));
      const slotSnap = await tx.get(slotRef);

      if (!slotSnap.exists()) {
        tx.set(
          slotRef,
          {
            slotId,
            occupiedBy: null,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }

      const occupiedBy = slotSnap.exists() ? slotSnap.data().occupiedBy : null;
      if (freeSlotRef === null && (occupiedBy === null || occupiedBy === undefined || occupiedBy === '')) {
        freeSlotId = slotId;
        freeSlotRef = slotRef;
      }
    }

    if (freeSlotRef === null || freeSlotId === null) {
      const error = new Error('No hay plazas libres.');
      error.code = 'slots/full';
      throw error;
    }

    const now = serverTimestamp();

    tx.set(userRef, {
      uid,
      email,
      name,
      color,
      slotId: freeSlotId,
      createdAt: now,
      updatedAt: now,
    });

    tx.set(
      freeSlotRef,
      {
        slotId: freeSlotId,
        occupiedBy: uid,
        updatedAt: now,
      },
      { merge: true },
    );

    return {
      status: 'created',
      slotId: freeSlotId,
    };
  });

  if (txResult.status === 'existing') {
    return txResult.profile;
  }

  const createdSnap = await getDoc(userRef);
  if (!createdSnap.exists()) {
    throw new Error('No se pudo recuperar el perfil creado.');
  }

  return normalizeProfileRecord(createdSnap.data());
}

export function subscribeMonthDailyStatuses(monthKey, onData, onError) {
  if (!isValidMonthKey(monthKey)) {
    throw new Error('monthKey invalido. Usa YYYY-MM.');
  }

  const db = initFirestore();
  if (!db) {
    throw new Error('Firestore no configurado.');
  }

  const monthRef = doc(db, DAILY_STATUS_MONTHS_COLLECTION, monthKey);
  return onSnapshot(
    monthRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData({
          monthKey,
          days: {},
          updatedAt: null,
        });
        return;
      }

      const raw = snapshot.data() || {};
      onData({
        monthKey: isValidMonthKey(raw.monthKey) ? raw.monthKey : monthKey,
        days: normalizeMonthDays(raw.days),
        updatedAt: raw.updatedAt || null,
      });
    },
    (error) => {
      if (typeof onError === 'function') {
        onError(error);
      }
    },
  );
}

export async function saveUserDailyStatus({ monthKey, dateKey, uid, status }) {
  if (!isValidMonthKey(monthKey)) {
    throw new Error('monthKey invalido. Usa YYYY-MM.');
  }

  if (!isValidDateKey(dateKey)) {
    throw new Error('dateKey invalido. Usa YYYY-MM-DD.');
  }

  if (!dateKey.startsWith(`${monthKey}-`)) {
    throw new Error('dateKey no corresponde al monthKey enviado.');
  }

  const safeUid = String(uid || '').trim();
  if (!safeUid) {
    throw new Error('uid invalido.');
  }

  const statusSet = new Set([DailyStatus.VOY, DailyStatus.NO_VOY, DailyStatus.VIALIA]);
  if (!statusSet.has(status)) {
    throw new Error('Estado diario invalido.');
  }

  const db = initFirestore();
  if (!db) {
    throw new Error('Firestore no configurado.');
  }

  const monthRef = doc(db, DAILY_STATUS_MONTHS_COLLECTION, monthKey);

  await runTransaction(db, async (tx) => {
    const monthSnap = await tx.get(monthRef);
    const currentDays = monthSnap.exists() ? normalizeMonthDays(monthSnap.data()?.days) : {};
    const before = JSON.stringify(currentDays);
    const nextDays = { ...currentDays };
    const nextDayMap = { ...(nextDays[dateKey] || {}) };

    if (status === DailyStatus.VOY) {
      delete nextDayMap[safeUid];
    } else {
      nextDayMap[safeUid] = status;
    }

    if (Object.keys(nextDayMap).length === 0) {
      delete nextDays[dateKey];
    } else {
      nextDays[dateKey] = nextDayMap;
    }

    const after = JSON.stringify(nextDays);
    if (before === after) {
      return;
    }

    tx.set(
      monthRef,
      {
        monthKey,
        days: nextDays,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
}

