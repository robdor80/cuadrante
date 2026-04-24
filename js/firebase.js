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
const STATUS_PERSISTED_SET = new Set([DailyStatus.NO_VOY, DailyStatus.VIALIA, DailyStatus.CAMBIO]);

function hasValidConfig() {
  return Object.values(FIREBASE_CONFIG).every((value) => typeof value === 'string' && value.trim() !== '');
}

function isValidDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidMonthKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
}

function normalizeHexColor(value) {
  let raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (raw.startsWith('#')) {
    raw = raw.slice(1);
  }

  raw = raw.replace(/[^0-9a-fA-F]/g, '');
  if (raw.length === 3) {
    raw = raw
      .split('')
      .map((char) => `${char}${char}`)
      .join('');
  }

  if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
    return '';
  }

  return `#${raw.toUpperCase()}`;
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
    isActive: raw.isActive !== false,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

function normalizeCompanionName(value) {
  const safe = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (safe.length < 2 || safe.length > 40) {
    return '';
  }

  return safe;
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

function normalizeMonthChanges(rawChanges) {
  if (!rawChanges || typeof rawChanges !== 'object') {
    return {};
  }

  const normalized = {};

  for (const [dateKey, dayEntries] of Object.entries(rawChanges)) {
    if (!isValidDateKey(dateKey) || !dayEntries || typeof dayEntries !== 'object') {
      continue;
    }

    const normalizedDay = {};

    for (const [uid, companionName] of Object.entries(dayEntries)) {
      const safeUid = String(uid || '').trim();
      const safeCompanionName = normalizeCompanionName(companionName);
      if (!safeUid || !safeCompanionName) {
        continue;
      }
      normalizedDay[safeUid] = safeCompanionName;
    }

    if (Object.keys(normalizedDay).length > 0) {
      normalized[dateKey] = normalizedDay;
    }
  }

  return normalized;
}

export function initFirebase() {
  if (!hasValidConfig()) {
    console.info('Firebase no configurado aún. Se activará en fases posteriores.');
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
        profile.slotId <= SLOT_COUNT &&
        profile.isActive !== false,
    )
    .sort((a, b) => a.slotId - b.slotId);

  return users;
}

export async function listProfilesBySlot() {
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
      isActive: true,
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
    throw new Error('monthKey inválido. Usa YYYY-MM.');
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
          changes: {},
          updatedAt: null,
        });
        return;
      }

      const raw = snapshot.data() || {};
      onData({
        monthKey: isValidMonthKey(raw.monthKey) ? raw.monthKey : monthKey,
        days: normalizeMonthDays(raw.days),
        changes: normalizeMonthChanges(raw.changes),
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

export async function loadMonthDailyStatuses(monthKey) {
  if (!isValidMonthKey(monthKey)) {
    throw new Error('monthKey inválido. Usa YYYY-MM.');
  }

  const db = initFirestore();
  if (!db) {
    throw new Error('Firestore no configurado.');
  }

  const monthRef = doc(db, DAILY_STATUS_MONTHS_COLLECTION, monthKey);
  const snapshot = await getDoc(monthRef);

  if (!snapshot.exists()) {
    return {
      monthKey,
      days: {},
      changes: {},
      updatedAt: null,
    };
  }

  const raw = snapshot.data() || {};
  return {
    monthKey: isValidMonthKey(raw.monthKey) ? raw.monthKey : monthKey,
    days: normalizeMonthDays(raw.days),
    changes: normalizeMonthChanges(raw.changes),
    updatedAt: raw.updatedAt || null,
  };
}

export async function saveUserDailyStatus({ monthKey, dateKey, uid, status, companionName = '' }) {
  if (!isValidMonthKey(monthKey)) {
    throw new Error('monthKey inválido. Usa YYYY-MM.');
  }

  if (!isValidDateKey(dateKey)) {
    throw new Error('dateKey inválido. Usa YYYY-MM-DD.');
  }

  if (!dateKey.startsWith(`${monthKey}-`)) {
    throw new Error('dateKey no corresponde al monthKey enviado.');
  }

  const safeUid = String(uid || '').trim();
  if (!safeUid) {
    throw new Error('uid inválido.');
  }

  const statusSet = new Set([DailyStatus.VOY, DailyStatus.NO_VOY, DailyStatus.VIALIA, DailyStatus.CAMBIO]);
  if (!statusSet.has(status)) {
    throw new Error('Estado diario inválido.');
  }

  const safeCompanionName = status === DailyStatus.CAMBIO ? normalizeCompanionName(companionName) : '';
  if (status === DailyStatus.CAMBIO && !safeCompanionName) {
    throw new Error('Nombre de compañero inválido.');
  }

  const db = initFirestore();
  if (!db) {
    throw new Error('Firestore no configurado.');
  }

  const monthRef = doc(db, DAILY_STATUS_MONTHS_COLLECTION, monthKey);

  await runTransaction(db, async (tx) => {
    const monthSnap = await tx.get(monthRef);
    const currentDays = monthSnap.exists() ? normalizeMonthDays(monthSnap.data()?.days) : {};
    const currentChanges = monthSnap.exists() ? normalizeMonthChanges(monthSnap.data()?.changes) : {};
    const before = JSON.stringify({
      days: currentDays,
      changes: currentChanges,
    });
    const nextDays = { ...currentDays };
    const nextChanges = { ...currentChanges };
    const nextDayMap = { ...(nextDays[dateKey] || {}) };
    const nextChangeDayMap = { ...(nextChanges[dateKey] || {}) };

    if (status === DailyStatus.VOY) {
      delete nextDayMap[safeUid];
      delete nextChangeDayMap[safeUid];
    } else if (status === DailyStatus.CAMBIO) {
      nextDayMap[safeUid] = status;
      nextChangeDayMap[safeUid] = safeCompanionName;
    } else {
      nextDayMap[safeUid] = status;
      delete nextChangeDayMap[safeUid];
    }

    if (Object.keys(nextDayMap).length === 0) {
      delete nextDays[dateKey];
    } else {
      nextDays[dateKey] = nextDayMap;
    }

    if (Object.keys(nextChangeDayMap).length === 0) {
      delete nextChanges[dateKey];
    } else {
      nextChanges[dateKey] = nextChangeDayMap;
    }

    const after = JSON.stringify({
      days: nextDays,
      changes: nextChanges,
    });
    if (before === after) {
      return;
    }

    tx.set(monthRef, {
      monthKey,
      days: nextDays,
      changes: nextChanges,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function applyBulkUserDailyStatus({ monthKey, dateKeys, uid, status }) {
  if (!isValidMonthKey(monthKey)) {
    throw new Error('monthKey inválido. Usa YYYY-MM.');
  }

  const safeUid = String(uid || '').trim();
  if (!safeUid) {
    throw new Error('uid inválido.');
  }

  const allowedStatuses = new Set([DailyStatus.VOY, DailyStatus.NO_VOY]);
  if (!allowedStatuses.has(status)) {
    throw new Error('Estado masivo inválido. Solo VOY o NO_VOY.');
  }

  const uniqueDateKeys = Array.from(
    new Set(
      (Array.isArray(dateKeys) ? dateKeys : [])
        .map((value) => String(value || '').trim())
        .filter((value) => isValidDateKey(value) && value.startsWith(`${monthKey}-`)),
    ),
  );

  if (uniqueDateKeys.length === 0) {
    return { changed: false };
  }

  const db = initFirestore();
  if (!db) {
    throw new Error('Firestore no configurado.');
  }

  const monthRef = doc(db, DAILY_STATUS_MONTHS_COLLECTION, monthKey);
  let hasChanges = false;

  await runTransaction(db, async (tx) => {
    let localChanges = false;
    const monthSnap = await tx.get(monthRef);
    const currentDays = monthSnap.exists() ? normalizeMonthDays(monthSnap.data()?.days) : {};
    const currentChanges = monthSnap.exists() ? normalizeMonthChanges(monthSnap.data()?.changes) : {};
    const nextDays = { ...currentDays };
    const nextChanges = { ...currentChanges };

    for (const dateKey of uniqueDateKeys) {
      const currentDayMap = { ...(nextDays[dateKey] || {}) };
      const currentChangeDayMap = { ...(nextChanges[dateKey] || {}) };

      if (status === DailyStatus.VOY) {
        const hadStatus = Object.prototype.hasOwnProperty.call(currentDayMap, safeUid);
        const hadChange = Object.prototype.hasOwnProperty.call(currentChangeDayMap, safeUid);
        if (!hadStatus && !hadChange) {
          continue;
        }

        delete currentDayMap[safeUid];
        delete currentChangeDayMap[safeUid];
        localChanges = true;
      } else {
        if (currentDayMap[safeUid] === DailyStatus.NO_VOY && !Object.prototype.hasOwnProperty.call(currentChangeDayMap, safeUid)) {
          continue;
        }

        currentDayMap[safeUid] = DailyStatus.NO_VOY;
        delete currentChangeDayMap[safeUid];
        localChanges = true;
      }

      if (Object.keys(currentDayMap).length === 0) {
        delete nextDays[dateKey];
      } else {
        nextDays[dateKey] = currentDayMap;
      }

      if (Object.keys(currentChangeDayMap).length === 0) {
        delete nextChanges[dateKey];
      } else {
        nextChanges[dateKey] = currentChangeDayMap;
      }
    }

    if (!localChanges) {
      return;
    }

    hasChanges = true;

    if (monthSnap.exists()) {
      tx.update(monthRef, {
        days: nextDays,
        changes: nextChanges,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    tx.set(monthRef, {
      monthKey,
      days: nextDays,
      changes: nextChanges,
      updatedAt: serverTimestamp(),
    });
  });

  return { changed: hasChanges };
}

export async function updateUserProfileSettings({ uid, name, color, isActive }) {
  const safeUid = String(uid || '').trim();
  if (!safeUid) {
    throw new Error('uid inválido.');
  }

  const safeName = String(name || '').trim();
  if (safeName.length < 2 || safeName.length > 24) {
    throw new Error('Nombre inválido.');
  }

  const safeColor = normalizeHexColor(color);
  if (!safeColor) {
    throw new Error('Color inválido.');
  }

  const db = initFirestore();
  if (!db) {
    throw new Error('Firestore no configurado.');
  }

  const userRef = doc(db, 'users', safeUid);

  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) {
      const error = new Error('Usuario no encontrado.');
      error.code = 'user/not-found';
      throw error;
    }

    tx.set(
      userRef,
      {
        name: safeName,
        color: safeColor,
        isActive: isActive !== false,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  const updatedSnap = await getDoc(userRef);
  if (!updatedSnap.exists()) {
    throw new Error('No se pudo recuperar el usuario actualizado.');
  }

  return normalizeProfileRecord(updatedSnap.data());
}
