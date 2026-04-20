import {
  APP_NAME,
  DAILY_STATUS_MARKERS,
  DailyStatus,
  ROUTES,
  SHIFT_PATTERN,
  SHIFT_TIMEZONE,
  SLOT_COUNT,
} from './config.js';
import { initFirebase, isFirebaseConfigured } from './firebase.js';
import { createHashRouter } from './router.js';
import { getMonthAssignments } from './shiftCycle.js';

const appRoot = document.getElementById('app');
const WEEKDAY_LABELS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

function setActiveNav(route) {
  const links = document.querySelectorAll('[data-route-link]');
  links.forEach((link) => {
    const href = link.getAttribute('href') || '';
    const isActive = href === `#${route}`;
    link.classList.toggle('is-active', isActive);
  });
}

function renderHome() {
  appRoot.innerHTML = `
    <section class="panel">
      <h2>Base de ${APP_NAME}</h2>
      <p class="muted">Parte 1 en HTML, CSS y JavaScript vanilla para GitHub Pages (sin build).</p>
      <ul>
        <li>6 slots fijos: ${SLOT_COUNT}</li>
        <li>Ciclo 12 dias: ${SHIFT_PATTERN.join(' -> ')}</li>
        <li>Estados diarios: ${Object.values(DailyStatus).join(' | ')}</li>
      </ul>
      <div class="badge-row">
        <span class="badge manana">ma&ntilde;ana</span>
        <span class="badge tarde">tarde</span>
        <span class="badge noche">noche</span>
        <span class="badge libre">libre</span>
      </div>
      <p class="muted">En calendario movil: solo se muestran marcadores cuando exista una marca.</p>
    </section>
  `;
}

function renderLogin() {
  appRoot.innerHTML = `
    <section class="panel">
      <h2>Login</h2>
      <p class="muted">Placeholder de acceso. Login Google y whitelist se implementaran en fase posterior.</p>
      <p class="muted">Firebase configurado: <strong>${isFirebaseConfigured() ? 'si' : 'no'}</strong></p>
      <button type="button" disabled>Continuar con Google (pendiente)</button>
    </section>
  `;
}

function toShiftToneClass(shiftKind) {
  switch (shiftKind) {
    case 'ma\u00f1ana':
      return 'tone-manana';
    case 'tarde':
      return 'tone-tarde';
    case 'noche':
      return 'tone-noche';
    default:
      return 'tone-libre';
  }
}

function getShiftCode(shiftKind) {
  switch (shiftKind) {
    case 'ma\u00f1ana':
      return 'M';
    case 'tarde':
      return 'T';
    case 'noche':
      return 'N';
    default:
      return 'L';
  }
}

function getDayMarkers(dateKey) {
  const markers = DAILY_STATUS_MARKERS[dateKey];
  if (!markers) {
    return { noVoy: [], vialia: [] };
  }

  return {
    noVoy: Array.isArray(markers.noVoy) ? markers.noVoy : [],
    vialia: Array.isArray(markers.vialia) ? markers.vialia : [],
  };
}

function getWeekdayIndex(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekDay = utcDate.getUTCDay();
  return weekDay === 0 ? 6 : weekDay - 1;
}

function getDayNumber(dateKey) {
  return Number(dateKey.slice(-2));
}

function getTodayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHIFT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function renderCalendar() {
  const { monthLabel, days } = getMonthAssignments(new Date());
  const firstWeekdayIndex = days.length > 0 ? getWeekdayIndex(days[0].dateKey) : 0;
  const leadingEmptyCells = Array.from(
    { length: firstWeekdayIndex },
    () => '<div class="calendar-cell-empty" aria-hidden="true"></div>',
  ).join('');

  const todayKey = getTodayKey();

  const dayCells = days
    .map(({ dateKey, shiftKind, cycleDay }) => {
      const shiftToneClass = toShiftToneClass(shiftKind);
      const shiftCode = getShiftCode(shiftKind);
      const { noVoy, vialia } = getDayMarkers(dateKey);
      const noVoyMarkers = noVoy
        .map((color) => `<span class="marker marker-no-voy" style="--marker-color:${color}">·</span>`)
        .join('');
      const vialiaMarkers = vialia
        .map((color) => `<span class="marker marker-vialia" style="--marker-color:${color}">·V</span>`)
        .join('');
      const markersBlock = noVoyMarkers || vialiaMarkers
        ? `<div class="calendar-markers">${noVoyMarkers}${vialiaMarkers}</div>`
        : '';

      return `
        <article
          class="calendar-day ${shiftToneClass} ${dateKey === todayKey ? 'is-today' : ''}"
          title="Dia ${getDayNumber(dateKey)} | ciclo ${cycleDay}/12"
        >
          <div class="calendar-day-head">
            <p class="calendar-day-number">${getDayNumber(dateKey)}</p>
            <span class="shift-code">${shiftCode}</span>
          </div>
          ${markersBlock}
        </article>
      `;
    })
    .join('');

  const totalCells = firstWeekdayIndex + days.length;
  const trailingCount = (7 - (totalCells % 7)) % 7;
  const trailingEmptyCells = Array.from(
    { length: trailingCount },
    () => '<div class="calendar-cell-empty" aria-hidden="true"></div>',
  ).join('');

  const weekdayHeaders = WEEKDAY_LABELS.map((label) => {
    const shortLabel = label.charAt(0).toUpperCase();
    return `<div class="calendar-weekday" data-short="${shortLabel}">${label}</div>`;
  }).join('');

  appRoot.innerHTML = `
    <section class="panel">
      <h2>Calendario (${monthLabel})</h2>
      <p class="muted">anchorDate=2026-04-18 | timezone=Europe/Madrid | patron 12 dias.</p>
      <div class="calendar-shell">
        <div class="calendar-weekdays">${weekdayHeaders}</div>
        <div class="calendar-month-grid">${leadingEmptyCells}${dayCells}${trailingEmptyCells}</div>
      </div>
      <p class="muted">En movil: numero de dia y marcadores solo cuando haya estados.</p>
    </section>
  `;
}

function bootstrap() {
  initFirebase();

  const router = createHashRouter({
    routeHandlers: {
      [ROUTES.HOME]: renderHome,
      [ROUTES.LOGIN]: renderLogin,
      [ROUTES.CALENDAR]: renderCalendar,
    },
    fallbackRoute: ROUTES.LOGIN,
    onRouteChange: setActiveNav,
  });

  router.start();
}

bootstrap();
