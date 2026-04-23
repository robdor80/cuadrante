export const APP_NAME = 'Cuadrante';
export const BASE_PATH = '/cuadrante/';

export const ROUTES = Object.freeze({
  HOME: '/',
  LOGIN: '/login',
  CALENDAR: '/calendario',
  HISTORY: '/historial',
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

// ===============================
// FIREBASE CONFIG (REAL)
// ===============================
export const FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyD4BGJvsVYYo6imLHqNgAMX5y6vnZ7mqt0',
  authDomain: 'cuadrante-99569.firebaseapp.com',
  projectId: 'cuadrante-99569',
  storageBucket: 'cuadrante-99569.firebasestorage.app',
  messagingSenderId: '970203186839',
  appId: '1:970203186839:web:7c743dc31aa28aac97cbd2',
});

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// Parte 3: paleta cerrada de colores para el perfil.
// En esta fase se permiten colores repetidos entre usuarios.
export const PROFILE_COLOR_OPTIONS = Object.freeze([
  { value: '#1d4ed8', label: 'Azul' },
  { value: '#b91c1c', label: 'Rojo' },
  { value: '#c2410c', label: 'Naranja' },
  { value: '#15803d', label: 'Verde' },
  { value: '#7e22ce', label: 'Morado' },
  { value: '#0f766e', label: 'Turquesa' },
]);
