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
  'MORNING',
  'MORNING',
  'AFTERNOON',
  'AFTERNOON',
  'NIGHT',
  'NIGHT',
  'OFF',
  'OFF',
  'OFF',
  'OFF',
  'OFF',
  'OFF',
]);

export const DailyStatus = Object.freeze({
  VOY: 'VOY',
  NO_VOY: 'NO_VOY',
  VIALIA: 'VIALIA',
});

// Parte 1: solo configuracion base. Se completara en fases posteriores.
export const FIREBASE_CONFIG = Object.freeze({
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
});
