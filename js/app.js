import { APP_NAME, DailyStatus, ROUTES, SHIFT_PATTERN, SLOT_COUNT } from './config.js';
import { initFirebase, isFirebaseConfigured } from './firebase.js';
import { createHashRouter } from './router.js';
import { getMonthAssignments } from './shiftCycle.js';

const appRoot = document.getElementById('app');

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
        <span class="badge morning">MORNING</span>
        <span class="badge afternoon">AFTERNOON</span>
        <span class="badge night">NIGHT</span>
        <span class="badge off">OFF</span>
      </div>
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

function toShiftClass(shiftKind) {
  switch (shiftKind) {
    case 'MORNING':
      return 'morning';
    case 'AFTERNOON':
      return 'afternoon';
    case 'NIGHT':
      return 'night';
    default:
      return 'off';
  }
}

function renderCalendar() {
  const { monthLabel, days } = getMonthAssignments(new Date());
  const cards = days
    .map(
      ({ dateKey, shiftKind, cycleDay }) => `
        <article class="day-card">
          <p><strong>${dateKey}</strong></p>
          <p class="muted">Dia de ciclo: ${cycleDay}/12</p>
          <span class="badge ${toShiftClass(shiftKind)}">${shiftKind}</span>
        </article>
      `,
    )
    .join('');

  appRoot.innerHTML = `
    <section class="panel">
      <h2>Calendario (${monthLabel})</h2>
      <p class="muted">anchorDate=2026-04-18 | timezone=Europe/Madrid | patron 12 dias.</p>
      <div class="calendar-grid">${cards}</div>
      <p class="muted">Estado diario (VOY/NO_VOY/VIALIA) y persistencia se implementaran despues.</p>
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
