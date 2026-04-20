import { ROUTES } from './config.js';

function normalizeRouteFromHash(hashValue) {
  const raw = (hashValue || '').replace(/^#/, '').trim();

  if (!raw) {
    return ROUTES.LOGIN;
  }

  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function createHashRouter({ routeHandlers, fallbackRoute = ROUTES.LOGIN, onRouteChange }) {
  const knownRoutes = Object.keys(routeHandlers);

  function applyRoute() {
    const route = normalizeRouteFromHash(window.location.hash);
    const resolved = knownRoutes.includes(route) ? route : fallbackRoute;

    if (route !== resolved) {
      window.location.hash = `#${resolved}`;
      return;
    }

    routeHandlers[resolved]();

    if (typeof onRouteChange === 'function') {
      onRouteChange(resolved);
    }
  }

  return {
    start() {
      if (!window.location.hash) {
        window.location.hash = `#${fallbackRoute}`;
      }
      applyRoute();
      window.addEventListener('hashchange', applyRoute);
    },
    stop() {
      window.removeEventListener('hashchange', applyRoute);
    },
    go(route) {
      window.location.hash = `#${route}`;
    },
  };
}
