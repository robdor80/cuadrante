import {
  APP_NAME,
  DAILY_STATUS_MARKERS,
  DailyStatus,
  ROUTES,
  SHIFT_PATTERN,
  SHIFT_TIMEZONE,
  SLOT_COUNT,
  isEmailAllowed,
  normalizeEmail,
} from './config.js';
import {
  initFirebase,
  isAuthReadyForUse,
  isFirebaseConfigured,
  observeAuthState,
  signInWithGoogle,
  signOutUser,
} from './firebase.js';
import { createHashRouter } from './router.js';
import { getMonthAssignments } from './shiftCycle.js';

const appRoot = document.getElementById('app');
const WEEKDAY_LABELS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const ROUTE_SET = new Set([ROUTES.HOME, ROUTES.LOGIN, ROUTES.CALENDAR]);

const state = {
  authStatus: 'loading',
  authUser: null,
  authError: '',
  deniedEmail: '',
  keepDeniedNotice: false,
  isSigningIn: false,
  isSigningOut: false,
};

function normalizeRouteFromHash(hashValue) {
  const raw = (hashValue || '').replace(/^#/, '').trim();
  if (!raw) {
    return ROUTES.LOGIN;
  }

  return raw.startsWith('/') ? raw : `/${raw}`;
}

function getCurrentRoute() {
  const route = normalizeRouteFromHash(window.location.hash);
  return ROUTE_SET.has(route) ? route : ROUTES.LOGIN;
}

function goTo(route) {
  window.location.hash = `#${route}`;
}

function setActiveNav(route) {
  const links = document.querySelectorAll('[data-route-link]');
  links.forEach((link) => {
    const href = link.getAttribute('href') || '';
    const isActive = href === `#${route}`;
    link.classList.toggle('is-active', isActive);
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mapAuthErrorMessage(error) {
  if (!error || typeof error !== 'object') {
    return 'No se pudo iniciar sesion con Google.';
  }

  switch (error.code) {
    case 'auth/popup-closed-by-user':
      return 'Se cerro la ventana de Google antes de completar el acceso.';
    case 'auth/popup-blocked':
      return 'El navegador bloqueo el popup. Permite popups para continuar.';
    case 'auth/cancelled-popup-request':
      return 'Ya habia un intento de login en curso.';
    default:
      return 'Error de autenticacion con Google. Intentalo de nuevo.';
  }
}

function renderLoadingPanel(message) {
  appRoot.innerHTML = `
    <section class="panel auth-panel">
      <h2>Cargando</h2>
      <p class="muted">${message}</p>
    </section>
  `;
}

function renderHomeInfo() {
  appRoot.innerHTML = `
    <section class="panel">
      <h2>Base de ${APP_NAME}</h2>
      <p class="muted">Parte 2: login Google + whitelist + sesion persistente.</p>
      <ul>
        <li>6 slots fijos: ${SLOT_COUNT}</li>
        <li>Ciclo 12 dias: ${SHIFT_PATTERN.join(' -> ')}</li>
        <li>Estados diarios: ${Object.values(DailyStatus).join(' | ')}</li>
      </ul>
      <p class="muted">Para acceder al calendario necesitas un email autorizado.</p>
    </section>
  `;
}

function renderLogin() {
  if (state.authStatus === 'authenticated') {
    goTo(ROUTES.CALENDAR);
    return;
  }

  const isFirebaseReady = isAuthReadyForUse();
  const buttonDisabled = !isFirebaseReady || state.isSigningIn || state.isSigningOut;

  let statusBlock = '';
  if (state.deniedEmail) {
    statusBlock = `
      <p class="auth-message auth-message--denied">
        Acceso denegado: el email <strong>${escapeHtml(state.deniedEmail)}</strong> no esta autorizado.
      </p>
    `;
  } else if (state.authError) {
    statusBlock = `<p class="auth-message auth-message--error">${escapeHtml(state.authError)}</p>`;
  } else if (!isFirebaseReady) {
    statusBlock =
      '<p class="auth-message auth-message--warn">Firebase no esta configurado todavia. Revisa js/config.js.</p>';
  }

  appRoot.innerHTML = `
    <section class="panel auth-panel">
      <h2>Login</h2>
      <p class="muted">Accede con Google para entrar al calendario del turno.</p>
      ${statusBlock}
      <button id="google-login-btn" class="btn btn-primary" type="button" ${buttonDisabled ? 'disabled' : ''}>
        ${state.isSigningIn ? 'Abriendo Google...' : 'Continuar con Google'}
      </button>
      <p class="muted auth-help">Firebase configurado: <strong>${isFirebaseConfigured() ? 'si' : 'no'}</strong></p>
    </section>
  `;

  const loginButton = document.getElementById('google-login-btn');
  if (loginButton) {
    loginButton.addEventListener('click', handleGoogleLogin);
  }
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
  if (state.authStatus === 'loading') {
    renderLoadingPanel('Verificando sesion...');
    return;
  }

  if (state.authStatus !== 'authenticated') {
    goTo(ROUTES.LOGIN);
    return;
  }

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
      const markersBlock =
        noVoyMarkers || vialiaMarkers
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
      <div class="calendar-header-row">
        <div>
          <h2>Calendario (${monthLabel})</h2>
          <p class="muted">anchorDate=2026-04-18 | timezone=Europe/Madrid | patron 12 dias.</p>
          <p class="muted">Sesion: <strong>${escapeHtml(state.authUser?.email || 'sin email')}</strong></p>
        </div>
        <button id="logout-btn" class="btn btn-secondary" type="button" ${state.isSigningOut ? 'disabled' : ''}>
          ${state.isSigningOut ? 'Cerrando...' : 'Cerrar sesion'}
        </button>
      </div>
      <div class="calendar-shell">
        <div class="calendar-weekdays">${weekdayHeaders}</div>
        <div class="calendar-month-grid">${leadingEmptyCells}${dayCells}${trailingEmptyCells}</div>
      </div>
      <p class="muted">En movil: numero de dia y marcadores solo cuando haya estados.</p>
    </section>
  `;

  const logoutButton = document.getElementById('logout-btn');
  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
  }
}

function renderRoute(route) {
  setActiveNav(route);

  switch (route) {
    case ROUTES.HOME:
      if (state.authStatus === 'loading') {
        renderLoadingPanel('Verificando sesion...');
      } else if (state.authStatus === 'authenticated') {
        goTo(ROUTES.CALENDAR);
      } else {
        goTo(ROUTES.LOGIN);
      }
      break;
    case ROUTES.LOGIN:
      renderLogin();
      break;
    case ROUTES.CALENDAR:
      renderCalendar();
      break;
    default:
      renderHomeInfo();
      break;
  }
}

function refreshCurrentRoute() {
  renderRoute(getCurrentRoute());
}

async function handleGoogleLogin() {
  if (state.isSigningIn) {
    return;
  }

  if (!isAuthReadyForUse()) {
    state.authError = 'Firebase no esta configurado. Completa js/config.js antes de iniciar sesion.';
    refreshCurrentRoute();
    return;
  }

  state.authError = '';
  state.deniedEmail = '';
  state.keepDeniedNotice = false;
  state.isSigningIn = true;
  refreshCurrentRoute();

  try {
    await signInWithGoogle();
  } catch (error) {
    state.authError = mapAuthErrorMessage(error);
  } finally {
    state.isSigningIn = false;
    refreshCurrentRoute();
  }
}

async function handleLogout() {
  if (state.isSigningOut) {
    return;
  }

  state.isSigningOut = true;
  state.authError = '';
  state.deniedEmail = '';
  state.keepDeniedNotice = false;
  refreshCurrentRoute();

  try {
    await signOutUser();
  } catch (_error) {
    state.authError = 'No se pudo cerrar sesion. Intentalo de nuevo.';
  } finally {
    state.isSigningOut = false;
    refreshCurrentRoute();
  }
}

async function bootstrap() {
  initFirebase();

  const router = createHashRouter({
    routeHandlers: {
      [ROUTES.HOME]: () => renderRoute(ROUTES.HOME),
      [ROUTES.LOGIN]: () => renderRoute(ROUTES.LOGIN),
      [ROUTES.CALENDAR]: () => renderRoute(ROUTES.CALENDAR),
    },
    fallbackRoute: ROUTES.LOGIN,
  });

  await observeAuthState(async (firebaseUser) => {
    if (!firebaseUser) {
      state.authStatus = 'unauthenticated';
      state.authUser = null;

      if (state.keepDeniedNotice) {
        state.keepDeniedNotice = false;
      } else {
        state.deniedEmail = '';
      }

      if (getCurrentRoute() === ROUTES.CALENDAR) {
        goTo(ROUTES.LOGIN);
      } else {
        refreshCurrentRoute();
      }
      return;
    }

    const email = normalizeEmail(firebaseUser.email);

    if (!isEmailAllowed(email)) {
      state.authStatus = 'unauthenticated';
      state.authUser = null;
      state.authError = '';
      state.deniedEmail = email || '(sin email)';
      state.keepDeniedNotice = true;

      if (getCurrentRoute() !== ROUTES.LOGIN) {
        goTo(ROUTES.LOGIN);
      }

      refreshCurrentRoute();
      await signOutUser();
      return;
    }

    state.authStatus = 'authenticated';
    state.authUser = {
      uid: firebaseUser.uid,
      email,
      displayName: firebaseUser.displayName || '',
    };
    state.authError = '';
    state.deniedEmail = '';
    state.keepDeniedNotice = false;

    const currentRoute = getCurrentRoute();
    if (currentRoute === ROUTES.LOGIN || currentRoute === ROUTES.HOME) {
      goTo(ROUTES.CALENDAR);
    } else {
      refreshCurrentRoute();
    }
  });

  if (!isAuthReadyForUse()) {
    state.authStatus = 'unauthenticated';
  }

  router.start();
}

bootstrap();
