export const APP_NAME = 'Cuadrante';
export const BASE_PATH = '/cuadrante/';

export const ROUTES = Object.freeze({
  HOME: '/',
  LOGIN: '/login',
  CALENDAR: '/calendario',
});

export const SLOT_COUNT = 6;
export const SHIFT_TIMEZONE = 'Europe/Madrid';
export const ANCHOR_DATE = '2026-04-18';

export const SHIFT_PATTERN = Object.freeze([
  'ma\u00f1ana',
  'ma\u00f1ana',
  'tarde',
  'tarde',
  'noche',
  'noche',
  'libre',
  'libre',
  'libre',
  'libre',
  'libre',
  'libre',
]);

export const DailyStatus = Object.freeze({
  VOY: 'VOY',
  NO_VOY: 'NO_VOY',
  VIALIA: 'VIALIA',
});

// Parte 1: marcador visual por dia para NO_VOY y VIALIA.
// Formato previsto:
// 'YYYY-MM-DD': { noVoy: ['#hexColor', ...], vialia: ['#hexColor', ...] }
export const DAILY_STATUS_MARKERS = Object.freeze({});

// Parte 1: solo configuracion base. Se completara en fases posteriores.
export const FIREBASE_CONFIG = Object.freeze({
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
});

// Parte 2: lista blanca temporal local (sin Firestore).
// Sustituye estos placeholders por los correos reales permitidos.
export const ALLOWED_EMAILS = Object.freeze([
  'tu_correo_de_prueba@gmail.com',
  'otro_correo@example.com',
]);

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const ALLOWED_EMAILS_NORMALIZED = new Set(ALLOWED_EMAILS.map((email) => normalizeEmail(email)));

export function isEmailAllowed(email) {
  return ALLOWED_EMAILS_NORMALIZED.has(normalizeEmail(email));
}
