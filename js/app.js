import {
  APP_NAME,
  DAILY_STATUS_MARKERS,
  DailyStatus,
  PROFILE_COLOR_OPTIONS,
  ROUTES,
  SHIFT_PATTERN,
  SHIFT_TIMEZONE,
  SLOT_COUNT,
  isEmailAllowed,
  normalizeEmail,
} from './config.js';
import {
  createUserProfileWithAutoSlot,
  ensureSlotsInitialized,
  initFirebase,
  isAuthReadyForUse,
  isFirebaseConfigured,
  loadUserProfile,
  observeAuthState,
  signInWithGoogle,
  signOutUser,
} from './firebase.js';
import { createHashRouter } from './router.js';
import { getMonthAssignments } from './shiftCycle.js';

const appRoot = document.getElementById('app');
const WEEKDAY_LABELS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const ROUTE_SET = new Set([ROUTES.HOME, ROUTES.LOGIN, ROUTES.CALENDAR]);
const DEFAULT_PROFILE_COLOR = PROFILE_COLOR_OPTIONS[0]?.value || '#1d4ed8';

const state = {
  authStatus: 'loading',
  authUser: null,
  authError: '',
  deniedEmail: '',
  keepDeniedNotice: false,
  isSigningIn: false,
  isSigningOut: false,
  authFlowToken: 0,

  profileStatus: 'idle',
  profileData: null,
  profileError: '',
  isProfileSaving: false,
  profileDraft: {
    name: '',
    color: DEFAULT_PROFILE_COLOR,
  },
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

function resetProfileState() {
  state.profileStatus = 'idle';
  state.profileData = null;
  state.profileError = '';
  state.isProfileSaving = false;
  state.profileDraft = {
    name: '',
    color: DEFAULT_PROFILE_COLOR,
  };
}

function setProfileDraftFromAuthUser(firebaseUser) {
  const displayName = String(firebaseUser?.displayName || '').trim().slice(0, 24);
  if (displayName && !state.profileDraft.name) {
    state.profileDraft.name = displayName;
  }
}

function validateProfileInput(name, color) {
  const safeName = String(name || '').trim();
  const allowedColors = new Set(PROFILE_COLOR_OPTIONS.map((option) => option.value));

  if (safeName.length < 2) {
    return { ok: false, message: 'El nombre visible debe tener al menos 2 caracteres.' };
  }

  if (safeName.length > 24) {
    return { ok: false, message: 'El nombre visible no puede superar 24 caracteres.' };
  }

  if (!allowedColors.has(color)) {
    return { ok: false, message: 'Selecciona un color valido de la paleta.' };
  }

  return {
    ok: true,
    value: {
      name: safeName,
      color,
    },
  };
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
      <p class="muted">Parte 3: perfil inicial + color + slot fijo (1..6).</p>
      <ul>
        <li>6 slots fijos: ${SLOT_COUNT}</li>
        <li>Ciclo 12 dias: ${SHIFT_PATTERN.join(' -> ')}</li>
        <li>Estados diarios: ${Object.values(DailyStatus).join(' | ')}</li>
      </ul>
      <p class="muted">Para usar calendario necesitas login autorizado y perfil inicial.</p>
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

function renderCalendarGrid() {
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

  const profile = state.profileData || {};

  appRoot.innerHTML = `
    <section class="panel">
      <div class="calendar-header-row">
        <div>
          <h2>Calendario (${monthLabel})</h2>
          <p class="muted">anchorDate=2026-04-18 | timezone=Europe/Madrid | patron 12 dias.</p>
          <p class="muted">
            Perfil:
            <span class="profile-chip" style="--profile-color:${escapeHtml(profile.color || DEFAULT_PROFILE_COLOR)}"></span>
            <strong>${escapeHtml(profile.name || 'sin nombre')}</strong>
            | slot #${escapeHtml(profile.slotId || '?')}
          </p>
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

function renderProfileSetup() {
  const colorOptions = PROFILE_COLOR_OPTIONS.map((option) => {
    const checked = option.value === state.profileDraft.color ? 'checked' : '';
    return `
      <label class="color-option">
        <input type="radio" name="profileColor" value="${escapeHtml(option.value)}" ${checked} />
        <span class="color-swatch" style="--swatch:${escapeHtml(option.value)}"></span>
        <span class="color-option-label">${escapeHtml(option.label)}</span>
      </label>
    `;
  }).join('');

  const errorBlock = state.profileError
    ? `<p class="auth-message auth-message--error">${escapeHtml(state.profileError)}</p>`
    : '';

  appRoot.innerHTML = `
    <section class="panel auth-panel">
      <h2>Completar alta</h2>
      <p class="muted">Es tu primer acceso. Completa nombre visible y color para ocupar una plaza del turno.</p>
      ${errorBlock}
      <form id="profile-form" class="profile-form">
        <label class="form-label" for="profile-name">Nombre visible</label>
        <input
          id="profile-name"
          name="profileName"
          type="text"
          maxlength="24"
          required
          value="${escapeHtml(state.profileDraft.name)}"
          placeholder="Ejemplo: Rob"
        />

        <p class="form-label">Color</p>
        <div class="color-options">${colorOptions}</div>

        <button id="profile-submit-btn" class="btn btn-primary" type="submit" ${state.isProfileSaving ? 'disabled' : ''}>
          ${state.isProfileSaving ? 'Guardando...' : 'Completar alta'}
        </button>
      </form>

      <button id="logout-btn" class="btn btn-secondary" type="button" ${state.isSigningOut ? 'disabled' : ''}>
        ${state.isSigningOut ? 'Cerrando...' : 'Cerrar sesion'}
      </button>
    </section>
  `;

  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', handleProfileSubmit);
  }

  const logoutButton = document.getElementById('logout-btn');
  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
  }
}

function renderProfileFull() {
  const message = state.profileError || 'El turno ya tiene 6 integrantes y no quedan plazas libres.';

  appRoot.innerHTML = `
    <section class="panel auth-panel">
      <h2>Alta no disponible</h2>
      <p class="auth-message auth-message--denied">${escapeHtml(message)}</p>
      <p class="muted">Si se libera una plaza, puedes intentar de nuevo.</p>
      <div class="auth-actions">
        <button id="retry-profile-btn" class="btn btn-primary" type="button">Reintentar alta</button>
        <button id="logout-btn" class="btn btn-secondary" type="button" ${state.isSigningOut ? 'disabled' : ''}>
          ${state.isSigningOut ? 'Cerrando...' : 'Cerrar sesion'}
        </button>
      </div>
    </section>
  `;

  const retryButton = document.getElementById('retry-profile-btn');
  if (retryButton) {
    retryButton.addEventListener('click', () => {
      state.profileStatus = 'needs_profile';
      state.profileError = '';
      refreshCurrentRoute();
    });
  }

  const logoutButton = document.getElementById('logout-btn');
  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
  }
}

function renderProfileError() {
  const message = state.profileError || 'No se pudo cargar tu perfil en este momento.';

  appRoot.innerHTML = `
    <section class="panel auth-panel">
      <h2>Error de perfil</h2>
      <p class="auth-message auth-message--error">${escapeHtml(message)}</p>
      <div class="auth-actions">
        <button id="retry-profile-load-btn" class="btn btn-primary" type="button">Reintentar</button>
        <button id="logout-btn" class="btn btn-secondary" type="button" ${state.isSigningOut ? 'disabled' : ''}>
          ${state.isSigningOut ? 'Cerrando...' : 'Cerrar sesion'}
        </button>
      </div>
    </section>
  `;

  const retryButton = document.getElementById('retry-profile-load-btn');
  if (retryButton) {
    retryButton.addEventListener('click', () => {
      if (state.authUser) {
        resolveProfileForAuthenticatedUser(state.authUser);
      }
    });
  }

  const logoutButton = document.getElementById('logout-btn');
  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
  }
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

  switch (state.profileStatus) {
    case 'loading':
      renderLoadingPanel('Cargando perfil...');
      return;
    case 'needs_profile':
      renderProfileSetup();
      return;
    case 'full':
      renderProfileFull();
      return;
    case 'error':
      renderProfileError();
      return;
    case 'ready':
      renderCalendarGrid();
      return;
    default:
      renderLoadingPanel('Preparando perfil...');
      return;
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

async function handleProfileSubmit(event) {
  event.preventDefault();

  if (!state.authUser || state.isProfileSaving) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const submittedName = String(formData.get('profileName') || '').trim();
  const submittedColor = String(formData.get('profileColor') || '').trim();

  state.profileDraft = {
    name: submittedName,
    color: submittedColor || DEFAULT_PROFILE_COLOR,
  };

  const validation = validateProfileInput(submittedName, state.profileDraft.color);
  if (!validation.ok) {
    state.profileError = validation.message;
    refreshCurrentRoute();
    return;
  }

  state.profileError = '';
  state.isProfileSaving = true;
  refreshCurrentRoute();

  try {
    const profile = await createUserProfileWithAutoSlot({
      uid: state.authUser.uid,
      email: state.authUser.email,
      name: validation.value.name,
      color: validation.value.color,
    });

    state.profileData = profile;
    state.profileStatus = 'ready';
    state.profileError = '';
  } catch (error) {
    if (error?.code === 'slots/full') {
      state.profileStatus = 'full';
      state.profileError = 'El turno ya tiene 6 integrantes. No quedan plazas libres.';
    } else {
      state.profileStatus = 'needs_profile';
      state.profileError = 'No se pudo completar el alta. Intentalo de nuevo.';
    }
  } finally {
    state.isProfileSaving = false;
    refreshCurrentRoute();
  }
}

async function resolveProfileForAuthenticatedUser(firebaseUser) {
  const token = ++state.authFlowToken;

  state.profileStatus = 'loading';
  state.profileData = null;
  state.profileError = '';
  state.isProfileSaving = false;
  setProfileDraftFromAuthUser(firebaseUser);

  const currentRoute = getCurrentRoute();
  if (currentRoute === ROUTES.LOGIN || currentRoute === ROUTES.HOME) {
    goTo(ROUTES.CALENDAR);
  } else {
    refreshCurrentRoute();
  }

  try {
    await ensureSlotsInitialized();
    const profile = await loadUserProfile(firebaseUser.uid);

    if (token !== state.authFlowToken || !state.authUser || state.authUser.uid !== firebaseUser.uid) {
      return;
    }

    if (profile) {
      state.profileStatus = 'ready';
      state.profileData = profile;
      state.profileDraft = {
        name: profile.name || state.profileDraft.name,
        color: profile.color || state.profileDraft.color,
      };
    } else {
      state.profileStatus = 'needs_profile';
      state.profileData = null;
    }
  } catch (_error) {
    if (token !== state.authFlowToken) {
      return;
    }

    state.profileStatus = 'error';
    state.profileError = 'No se pudo cargar la informacion de perfil/plazas. Revisa Firestore y permisos.';
  }

  refreshCurrentRoute();
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
      state.authFlowToken += 1;
      state.authStatus = 'unauthenticated';
      state.authUser = null;
      resetProfileState();

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
      state.authFlowToken += 1;
      state.authStatus = 'unauthenticated';
      state.authUser = null;
      state.authError = '';
      state.deniedEmail = email || '(sin email)';
      state.keepDeniedNotice = true;
      resetProfileState();

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

    await resolveProfileForAuthenticatedUser(firebaseUser);
  });

  if (!isAuthReadyForUse()) {
    state.authStatus = 'unauthenticated';
  }

  router.start();
}

bootstrap();
