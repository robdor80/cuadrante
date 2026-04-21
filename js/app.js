import {
  APP_NAME,
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
  listActiveProfilesBySlot,
  loadUserProfile,
  observeAuthState,
  saveUserDailyStatus,
  signInWithGoogle,
  signOutUser,
  subscribeMonthDailyStatuses,
} from './firebase.js';
import { createHashRouter } from './router.js';
import { getMonthGrid6x7, getShiftKindForDate } from './shiftCycle.js';

const appRoot = document.getElementById('app');
const headerActionsRoot = document.getElementById('header-actions');
const WEEKDAY_LABELS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const ROUTE_SET = new Set([ROUTES.HOME, ROUTES.LOGIN, ROUTES.CALENDAR]);
const DEFAULT_PROFILE_COLOR = PROFILE_COLOR_OPTIONS[0]?.value || '#1d4ed8';
const MONTH_KEY_REGEX = /^\d{4}-\d{2}$/;
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHIFT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const monthKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
});

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

  legendStatus: 'idle',
  legendUsers: [],
  legendError: '',

  visibleMonthDate: getMonthStartDate(new Date()),
  visibleMonthKey: getMonthKeyFromDate(getMonthStartDate(new Date())),
  selectedDateKey: '',
  dailyStatusByDate: {},
  dailyStatusStatus: 'idle',
  dailyStatusError: '',
  isDailyStatusSaving: false,
  monthListenerKey: '',
  unsubscribeMonthStatuses: null,
  dayModalOpen: false,
  dayModalDateKey: '',
  dayModalError: '',
  isMultiSelectMode: false,
  multiSelectedDateKeys: new Set(),
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getDateKey(dateValue) {
  return dateKeyFormatter.format(dateValue);
}

function getMonthStartDate(dateValue) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth(), 1);
}

function getMonthKeyFromDate(dateValue) {
  return monthKeyFormatter.format(dateValue);
}

function getMonthKeyFromDateKey(dateKey) {
  return String(dateKey || '').slice(0, 7);
}

function parseDateKey(dateKey) {
  if (!DATE_KEY_REGEX.test(dateKey)) {
    return null;
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function capitalizeFirst(text) {
  const raw = String(text || '');
  return raw ? `${raw.charAt(0).toUpperCase()}${raw.slice(1)}` : '';
}

function addMonths(baseDate, delta) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth() + delta, 1);
}

function isDateKeyInVisibleMonth(dateKey) {
  return DATE_KEY_REGEX.test(dateKey) && getMonthKeyFromDateKey(dateKey) === getMonthKeyFromDate(state.visibleMonthDate);
}

function getTodayKey() {
  return getDateKey(new Date());
}

function getDefaultSelectedDateKeyForVisibleMonth() {
  const visibleMonthKey = getMonthKeyFromDate(state.visibleMonthDate);
  const todayKey = getTodayKey();

  if (getMonthKeyFromDateKey(todayKey) === visibleMonthKey) {
    return todayKey;
  }

  const year = state.visibleMonthDate.getFullYear();
  const month = String(state.visibleMonthDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function ensureSelectedDateKey() {
  if (!isDateKeyInVisibleMonth(state.selectedDateKey)) {
    state.selectedDateKey = getDefaultSelectedDateKeyForVisibleMonth();
  }
  return state.selectedDateKey;
}

function formatSelectedDateLabel(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    return 'Dia sin seleccionar';
  }

  return parsed.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function clearMonthStatusListener() {
  if (typeof state.unsubscribeMonthStatuses === 'function') {
    state.unsubscribeMonthStatuses();
  }

  state.unsubscribeMonthStatuses = null;
  state.monthListenerKey = '';
}

function closeDayModal({ skipRefresh = false } = {}) {
  state.dayModalOpen = false;
  state.dayModalDateKey = '';
  state.dayModalError = '';
  document.body.classList.remove('modal-open');

  if (!skipRefresh) {
    refreshCurrentRoute();
  }
}

function clearMultiSelection({ refresh = false } = {}) {
  state.multiSelectedDateKeys = new Set();
  if (refresh) {
    refreshCurrentRoute();
  }
}

function setMultiSelectMode(enabled) {
  const nextValue = Boolean(enabled);
  if (state.isMultiSelectMode === nextValue) {
    return;
  }

  state.isMultiSelectMode = nextValue;
  clearMultiSelection({ refresh: false });

  if (nextValue && state.dayModalOpen) {
    closeDayModal({ skipRefresh: true });
  }
}

function toggleMultiSelectedDate(dateKey) {
  if (!DATE_KEY_REGEX.test(dateKey)) {
    return;
  }

  if (state.multiSelectedDateKeys.has(dateKey)) {
    state.multiSelectedDateKeys.delete(dateKey);
  } else {
    state.multiSelectedDateKeys.add(dateKey);
  }
}

function openDayModal(dateKey) {
  if (!isDateKeyInVisibleMonth(dateKey)) {
    return;
  }

  state.selectedDateKey = dateKey;
  state.dayModalDateKey = dateKey;
  state.dayModalOpen = true;
  state.dayModalError = '';
  document.body.classList.add('modal-open');
  refreshCurrentRoute();
}

function resetCalendarState() {
  clearMonthStatusListener();
  closeDayModal({ skipRefresh: true });
  setMultiSelectMode(false);
  state.visibleMonthDate = getMonthStartDate(new Date());
  state.visibleMonthKey = getMonthKeyFromDate(state.visibleMonthDate);
  state.selectedDateKey = getDefaultSelectedDateKeyForVisibleMonth();
  state.dailyStatusByDate = {};
  state.dailyStatusStatus = 'idle';
  state.dailyStatusError = '';
  state.isDailyStatusSaving = false;
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

function getHeaderUserName() {
  return state.profileData?.name || state.authUser?.displayName || state.authUser?.email || 'Usuario';
}

function getHeaderUserColor() {
  return state.profileData?.color || DEFAULT_PROFILE_COLOR;
}

function renderHeaderActions() {
  if (!headerActionsRoot) {
    return;
  }

  if (state.authStatus === 'authenticated') {
    headerActionsRoot.classList.add('site-header__actions--session');
    headerActionsRoot.innerHTML = `
      <div class="header-user">
        <span class="header-user-dot" style="--header-user-color:${escapeHtml(getHeaderUserColor())}"></span>
        <span class="header-user-name">${escapeHtml(getHeaderUserName())}</span>
      </div>
      <button id="header-logout-btn" class="btn btn-secondary btn-header" type="button" ${
        state.isSigningOut ? 'disabled' : ''
      }>
        ${state.isSigningOut ? 'Cerrando...' : 'Cerrar sesion'}
      </button>
    `;

    const headerLogoutButton = document.getElementById('header-logout-btn');
    if (headerLogoutButton) {
      headerLogoutButton.addEventListener('click', handleLogout);
    }
    return;
  }

  headerActionsRoot.classList.remove('site-header__actions--session');
  headerActionsRoot.innerHTML = '';
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

  state.legendStatus = 'idle';
  state.legendUsers = [];
  state.legendError = '';

  resetCalendarState();
}

function setProfileDraftFromAuthUser(firebaseUser) {
  const displayName = String(firebaseUser?.displayName || '')
    .trim()
    .slice(0, 24);
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
      <p class="muted">Parte 5: estados diarios por usuario, realtime por mes visible y markers en calendario.</p>
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

function buildLegendContent() {
  if (state.legendStatus === 'loading') {
    return '<p class="muted legend-status">Cargando integrantes...</p>';
  }

  if (state.legendStatus === 'error') {
    return `<p class="muted legend-status">${escapeHtml(state.legendError || 'No se pudo cargar la leyenda.')}</p>`;
  }

  if (!state.legendUsers.length) {
    return '<p class="muted legend-status">Aun no hay integrantes activos.</p>';
  }

  const items = state.legendUsers
    .map(
      (user) => `
        <li class="legend-item">
          <span class="legend-dot" style="--legend-color:${escapeHtml(user.color || DEFAULT_PROFILE_COLOR)}"></span>
          <span class="legend-name">${escapeHtml(user.name || user.email || `Slot ${user.slotId}`)}</span>
        </li>
      `,
    )
    .join('');

  return `<ul class="legend-list">${items}</ul>`;
}

function getStatusByUidForDate(dateKey) {
  const dayMap = state.dailyStatusByDate?.[dateKey];
  if (!dayMap || typeof dayMap !== 'object') {
    return {};
  }
  return dayMap;
}

function getWorkingCountForDate(dateKey) {
  const dayMap = getStatusByUidForDate(dateKey);

  if (state.legendUsers.length > 0) {
    let noVoyCount = 0;
    state.legendUsers.forEach((user) => {
      if (dayMap[user.uid] === DailyStatus.NO_VOY) {
        noVoyCount += 1;
      }
    });
    return Math.max(0, state.legendUsers.length - noVoyCount);
  }

  const noVoyFallback = Object.values(dayMap).filter((status) => status === DailyStatus.NO_VOY).length;
  return Math.max(0, SLOT_COUNT - noVoyFallback);
}

function getAvailabilityClass(workingCount) {
  if (workingCount <= 3) {
    return 'availability-low';
  }

  if (workingCount === 4) {
    return 'availability-mid';
  }

  return 'availability-high';
}

function getCurrentUserStatusForDate(dateKey) {
  if (!state.authUser || !dateKey) {
    return DailyStatus.VOY;
  }

  const dayMap = getStatusByUidForDate(dateKey);
  const status = dayMap[state.authUser.uid];
  if (status === DailyStatus.NO_VOY || status === DailyStatus.VIALIA) {
    return status;
  }

  return DailyStatus.VOY;
}

function getDailyStatusInfoHtml() {
  if (state.dailyStatusStatus === 'loading') {
    return '<p class="muted daily-status-info">Cargando estados del mes...</p>';
  }

  if (state.dailyStatusStatus === 'error') {
    return `<p class="auth-message auth-message--error">${escapeHtml(
      state.dailyStatusError || 'No se pudieron cargar los estados del mes.',
    )}</p>`;
  }

  return '<p class="muted daily-status-info">El numero en cada dia indica cuantos trabajan ese dia.</p>';
}

function getShiftLabel(shiftKind) {
  switch (shiftKind) {
    case 'ma\u00f1ana':
      return 'Manana';
    case 'tarde':
      return 'Tarde';
    case 'noche':
      return 'Noche';
    default:
      return 'Libre';
  }
}

function isVialiaAllowedForDate(dateKey) {
  const shiftKind = getShiftKindForDate(dateKey);
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    return false;
  }

  const day = parsed.getDay();
  return shiftKind === 'tarde' && day !== 0 && day !== 6;
}

function getDayBuckets(dateKey) {
  const dayMap = getStatusByUidForDate(dateKey);
  const buckets = {
    principal: [],
    noVoy: [],
    vialia: [],
  };

  state.legendUsers.forEach((user) => {
    const status = dayMap[user.uid];
    const item = {
      uid: user.uid,
      name: user.name || user.email || `Slot ${user.slotId}`,
      color: user.color || DEFAULT_PROFILE_COLOR,
    };

    if (status === DailyStatus.NO_VOY) {
      buckets.noVoy.push(item);
      return;
    }

    if (status === DailyStatus.VIALIA) {
      buckets.vialia.push(item);
      return;
    }

    buckets.principal.push(item);
  });

  return buckets;
}

function buildModalUserList(users, emptyText) {
  if (!users.length) {
    return `<p class="muted day-modal-empty">${escapeHtml(emptyText)}</p>`;
  }

  const items = users
    .map(
      (user) => `
        <li class="day-modal-user-item">
          <span class="day-modal-user-dot" style="--modal-user-color:${escapeHtml(user.color)}"></span>
          <span class="day-modal-user-name">${escapeHtml(user.name)}</span>
        </li>
      `,
    )
    .join('');

  return `<ul class="day-modal-user-list">${items}</ul>`;
}

function buildDayModalHtml() {
  if (!state.dayModalOpen || !state.dayModalDateKey || !isDateKeyInVisibleMonth(state.dayModalDateKey)) {
    return '';
  }

  const dateKey = state.dayModalDateKey;
  const shiftKind = getShiftKindForDate(dateKey);
  const shiftLabel = getShiftLabel(shiftKind);
  const currentUserStatus = getCurrentUserStatusForDate(dateKey);
  const vialiaAllowed = isVialiaAllowedForDate(dateKey);
  const dateLabel = capitalizeFirst(formatSelectedDateLabel(dateKey));
  const buckets = getDayBuckets(dateKey);

  return `
    <div id="day-modal-overlay" class="day-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="day-modal-title">
      <div class="day-modal-card">
        <header class="day-modal-header">
          <div>
            <h3 id="day-modal-title">${escapeHtml(dateLabel)}</h3>
            <p class="day-modal-shift">Turno: <strong>${escapeHtml(shiftLabel)}</strong></p>
          </div>
          <button id="day-modal-close-btn" type="button" class="btn btn-secondary btn-modal-close" aria-label="Cerrar">&times;</button>
        </header>

        <section class="day-modal-columns">
          <article class="day-modal-column">
            <h4>Comisaria principal</h4>
            ${buildModalUserList(buckets.principal, 'Sin usuarios en principal.')}
          </article>
          <article class="day-modal-column">
            <h4>No trabajan</h4>
            ${buildModalUserList(buckets.noVoy, 'Nadie libra.')}
          </article>
          <article class="day-modal-column">
            <h4>Vialia</h4>
            ${buildModalUserList(buckets.vialia, 'Nadie en Vialia.')}
          </article>
        </section>

        <section class="day-modal-edit">
          <p class="day-modal-edit-title">Tu estado para este dia</p>
          <div class="day-modal-edit-actions">
            <button
              type="button"
              class="btn btn-secondary btn-status ${currentUserStatus === DailyStatus.VOY ? 'is-active' : ''}"
              data-modal-status-action="${DailyStatus.VOY}"
              ${state.isDailyStatusSaving ? 'disabled' : ''}
            >
              VOY
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-status ${currentUserStatus === DailyStatus.NO_VOY ? 'is-active' : ''}"
              data-modal-status-action="${DailyStatus.NO_VOY}"
              ${state.isDailyStatusSaving ? 'disabled' : ''}
            >
              NO VOY
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-status ${currentUserStatus === DailyStatus.VIALIA ? 'is-active' : ''}"
              data-modal-status-action="${DailyStatus.VIALIA}"
              ${state.isDailyStatusSaving || !vialiaAllowed ? 'disabled' : ''}
            >
              VIALIA
            </button>
          </div>
          ${!vialiaAllowed ? '<p class="muted day-modal-hint">Solo disponible en tardes laborables.</p>' : ''}
          ${state.dayModalError ? `<p class="auth-message auth-message--error">${escapeHtml(state.dayModalError)}</p>` : ''}
          ${state.isDailyStatusSaving ? '<p class="muted day-modal-hint">Guardando estado...</p>' : ''}
        </section>
      </div>
    </div>
  `;
}

function renderCalendarGrid() {
  ensureSelectedDateKey();

  const { monthLabel, cells } = getMonthGrid6x7(state.visibleMonthDate);
  const todayKey = getTodayKey();

  const dayCells = cells
    .map(({ dateKey, dayNumber, isCurrentMonth, shiftKind, cycleDay }) => {
      const shiftToneClass = toShiftToneClass(shiftKind);
      const shiftCode = getShiftCode(shiftKind);
      const isWorkShift = shiftKind !== 'libre';
      const isEditable = isCurrentMonth && isWorkShift;
      const outsideClass = isCurrentMonth ? '' : ' calendar-day--outside';
      const selectedClass =
        !state.isMultiSelectMode && state.selectedDateKey === dateKey && isEditable ? ' is-selected' : '';
      const multiSelectedClass = state.isMultiSelectMode && state.multiSelectedDateKeys.has(dateKey) ? ' is-multi-selected' : '';
      const workingCount = getWorkingCountForDate(dateKey);
      const availabilityClass = getAvailabilityClass(workingCount);
      const availabilityHtml = isWorkShift
        ? `<div class="calendar-availability-slot ${availabilityClass}" aria-label="Companeros que trabajan">${workingCount}</div>`
        : '';
      const interactiveAttrs = isEditable
        ? 'role="button" tabindex="0"'
        : 'aria-disabled="true" tabindex="-1"';
      const cursorStyle = isEditable ? 'pointer' : 'default';

      return `
        <article
          class="calendar-day ${shiftToneClass}${outsideClass}${selectedClass}${multiSelectedClass} ${
            dateKey === todayKey ? 'is-today' : ''
          }"
          title="${escapeHtml(dateKey)} | ciclo ${cycleDay}/12"
          data-date-key="${escapeHtml(dateKey)}"
          data-current-month="${isCurrentMonth ? '1' : '0'}"
          data-editable="${isEditable ? '1' : '0'}"
          style="cursor:${cursorStyle};"
          ${interactiveAttrs}
        >
          <div class="calendar-day-head">
            <p class="calendar-day-number">${dayNumber}</p>
            <span class="shift-code">${shiftCode}</span>
          </div>
          ${availabilityHtml}
        </article>
      `;
    })
    .join('');

  const weekdayHeaders = WEEKDAY_LABELS.map((label) => {
    const shortLabel = label.charAt(0).toUpperCase();
    return `<div class="calendar-weekday" data-short="${shortLabel}">${label}</div>`;
  }).join('');
  const dayModalHtml = buildDayModalHtml();
  const selectedCount = state.multiSelectedDateKeys.size;
  const multiModeInfo = state.isMultiSelectMode
    ? `<p class="calendar-multi-meta muted">Modo multiseleccion activo · ${selectedCount} dia${selectedCount === 1 ? '' : 's'} seleccionados</p>`
    : '';

  appRoot.innerHTML = `
    <section class="panel">
      <div class="calendar-header-row">
        <div class="calendar-header-main">
          <div class="month-nav">
            <button id="month-prev-btn" type="button" class="btn btn-secondary btn-month-nav" aria-label="Mes anterior">&lsaquo;</button>
            <h2>Calendario (${monthLabel})</h2>
            <button id="month-next-btn" type="button" class="btn btn-secondary btn-month-nav" aria-label="Mes siguiente">&rsaquo;</button>
          </div>
          ${getDailyStatusInfoHtml()}
        </div>
        <div class="calendar-header-tools">
          <button
            id="toggle-multi-select-btn"
            type="button"
            class="btn btn-secondary btn-multi-select ${state.isMultiSelectMode ? 'is-active' : ''}"
            aria-pressed="${state.isMultiSelectMode ? 'true' : 'false'}"
          >
            ${state.isMultiSelectMode ? 'Salir multiseleccion' : 'Multiseleccion'}
          </button>
          ${multiModeInfo}
        </div>
      </div>

      <section class="calendar-legend" aria-label="Leyenda de usuarios activos">
        <p class="legend-title">Integrantes activos</p>
        ${buildLegendContent()}
      </section>

      <div class="calendar-shell">
        <div class="calendar-weekdays">${weekdayHeaders}</div>
        <div class="calendar-month-grid">${dayCells}</div>
      </div>

      ${dayModalHtml}
    </section>
  `;

  const prevButton = document.getElementById('month-prev-btn');
  if (prevButton) {
    prevButton.addEventListener('click', () => handleMonthNavigation(-1));
  }

  const nextButton = document.getElementById('month-next-btn');
  if (nextButton) {
    nextButton.addEventListener('click', () => handleMonthNavigation(1));
  }

  const toggleMultiSelectButton = document.getElementById('toggle-multi-select-btn');
  if (toggleMultiSelectButton) {
    toggleMultiSelectButton.addEventListener('click', () => {
      setMultiSelectMode(!state.isMultiSelectMode);
      refreshCurrentRoute();
    });
  }

  const dayCards = document.querySelectorAll('.calendar-day[data-date-key]');
  dayCards.forEach((card) => {
    const onSelect = () => {
      const dateKey = String(card.dataset.dateKey || '');
      const isEditable = String(card.dataset.editable || '') === '1';
      if (!isEditable || !DATE_KEY_REGEX.test(dateKey)) {
        return;
      }

      if (state.isMultiSelectMode) {
        toggleMultiSelectedDate(dateKey);
        refreshCurrentRoute();
        return;
      }

      openDayModal(dateKey);
    };

    card.addEventListener('click', onSelect);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect();
      }
    });
  });

  const modalOverlay = document.getElementById('day-modal-overlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (event) => {
      if (event.target === modalOverlay) {
        closeDayModal();
      }
    });
  }

  const modalCloseButton = document.getElementById('day-modal-close-btn');
  if (modalCloseButton) {
    modalCloseButton.addEventListener('click', () => {
      closeDayModal();
    });
  }

  const modalStatusButtons = document.querySelectorAll('[data-modal-status-action]');
  modalStatusButtons.forEach((button) => {
    button.addEventListener('click', () => {
      handleStatusUpdate(String(button.dataset.modalStatusAction || ''), state.dayModalDateKey);
    });
  });
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
    </section>
  `;

  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', handleProfileSubmit);
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
}

function renderProfileError() {
  const message = state.profileError || 'No se pudo cargar tu perfil en este momento.';

  appRoot.innerHTML = `
    <section class="panel auth-panel">
      <h2>Error de perfil</h2>
      <p class="auth-message auth-message--error">${escapeHtml(message)}</p>
      <div class="auth-actions">
        <button id="retry-profile-load-btn" class="btn btn-primary" type="button">Reintentar</button>
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
}

function ensureMonthListenerForVisibleMonth() {
  if (state.authStatus !== 'authenticated' || state.profileStatus !== 'ready' || !state.authUser) {
    return;
  }

  const monthKey = getMonthKeyFromDate(state.visibleMonthDate);
  state.visibleMonthKey = monthKey;

  if (state.monthListenerKey === monthKey && typeof state.unsubscribeMonthStatuses === 'function') {
    return;
  }

  clearMonthStatusListener();
  state.monthListenerKey = monthKey;
  state.dailyStatusByDate = {};
  state.dailyStatusStatus = 'loading';
  state.dailyStatusError = '';

  try {
    state.unsubscribeMonthStatuses = subscribeMonthDailyStatuses(
      monthKey,
      (payload) => {
        const currentMonthKey = getMonthKeyFromDate(state.visibleMonthDate);
        if (currentMonthKey !== monthKey) {
          return;
        }

        state.dailyStatusByDate = payload?.days && typeof payload.days === 'object' ? payload.days : {};
        state.dailyStatusStatus = 'ready';
        state.dailyStatusError = '';
        ensureSelectedDateKey();
        refreshCurrentRoute();
      },
      () => {
        const currentMonthKey = getMonthKeyFromDate(state.visibleMonthDate);
        if (currentMonthKey !== monthKey) {
          return;
        }

        state.dailyStatusByDate = {};
        state.dailyStatusStatus = 'error';
        state.dailyStatusError = 'No se pudieron escuchar los estados en tiempo real para este mes.';
        refreshCurrentRoute();
      },
    );
  } catch (_error) {
    state.dailyStatusByDate = {};
    state.dailyStatusStatus = 'error';
    state.dailyStatusError = 'No se pudo iniciar el listener del mes visible.';
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
      ensureMonthListenerForVisibleMonth();
      renderCalendarGrid();
      return;
    default:
      renderLoadingPanel('Preparando perfil...');
      return;
  }
}

function renderRoute(route) {
  renderHeaderActions();
  if (route !== ROUTES.CALENDAR && state.isMultiSelectMode) {
    setMultiSelectMode(false);
  }

  if (route !== ROUTES.CALENDAR && state.dayModalOpen) {
    closeDayModal({ skipRefresh: true });
  }

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

async function refreshLegendUsers({ showLoading = false } = {}) {
  if (!state.authUser) {
    state.legendStatus = 'idle';
    state.legendUsers = [];
    state.legendError = '';
    return;
  }

  const expectedUid = state.authUser.uid;

  if (showLoading || state.legendStatus === 'idle') {
    state.legendStatus = 'loading';
    state.legendError = '';
    refreshCurrentRoute();
  }

  try {
    const users = await listActiveProfilesBySlot();

    if (!state.authUser || state.authUser.uid !== expectedUid) {
      return;
    }

    state.legendUsers = users;
    state.legendStatus = 'ready';
    state.legendError = '';
  } catch (_error) {
    if (!state.authUser || state.authUser.uid !== expectedUid) {
      return;
    }

    state.legendStatus = 'error';
    state.legendUsers = [];
    state.legendError = 'No se pudo cargar la leyenda de integrantes.';
  }
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

function handleMonthNavigation(delta) {
  closeDayModal({ skipRefresh: true });
  clearMultiSelection({ refresh: false });
  state.visibleMonthDate = addMonths(state.visibleMonthDate, delta);
  state.visibleMonthKey = getMonthKeyFromDate(state.visibleMonthDate);
  state.selectedDateKey = getDefaultSelectedDateKeyForVisibleMonth();
  state.dayModalError = '';
  ensureMonthListenerForVisibleMonth();
  refreshCurrentRoute();
}

async function handleStatusUpdate(status, targetDateKey = state.dayModalDateKey || state.selectedDateKey) {
  if (state.isDailyStatusSaving) {
    return;
  }

  if (!state.authUser || !targetDateKey || !DATE_KEY_REGEX.test(targetDateKey)) {
    return;
  }

  if (![DailyStatus.VOY, DailyStatus.NO_VOY, DailyStatus.VIALIA].includes(status)) {
    return;
  }

  if (status === DailyStatus.VIALIA && !isVialiaAllowedForDate(targetDateKey)) {
    state.dayModalError = 'VIALIA solo disponible en tardes laborables.';
    refreshCurrentRoute();
    return;
  }

  const monthKey = getMonthKeyFromDateKey(targetDateKey);
  if (!MONTH_KEY_REGEX.test(monthKey)) {
    return;
  }

  state.isDailyStatusSaving = true;
  state.dayModalError = '';
  refreshCurrentRoute();

  try {
    await saveUserDailyStatus({
      monthKey,
      dateKey: targetDateKey,
      uid: state.authUser.uid,
      status,
    });
  } catch (_error) {
    state.dayModalError = 'No se pudo guardar el estado diario. Intentalo de nuevo.';
  } finally {
    state.isDailyStatusSaving = false;
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
    resetCalendarState();
    await refreshLegendUsers({ showLoading: true });
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

  state.legendStatus = 'idle';
  state.legendUsers = [];
  state.legendError = '';

  resetCalendarState();

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

      await refreshLegendUsers({ showLoading: true });
    } else {
      state.profileStatus = 'needs_profile';
      state.profileData = null;
      state.legendStatus = 'idle';
      state.legendUsers = [];
      state.legendError = '';
      clearMonthStatusListener();
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

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.dayModalOpen) {
      event.preventDefault();
      closeDayModal();
    }
  });

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

