# Cuadrante

Proyecto web en HTML + CSS + JavaScript vanilla para GitHub Pages (sin build).

## Rutas (hash routing)

- `#/`
- `#/login`
- `#/calendario`

## Dominio base

- `anchorDate = 2026-04-18`
- Patron de 12 dias: ma\u00f1ana x2, tarde x2, noche x2, libre x6
- Estado diario: `VOY | NO_VOY | VIALIA`
- `VIALIA` es estado explicito, no ausencia ni booleano

## Parte 2 (Auth + whitelist)

Se ha integrado:

- Login con Google (`signInWithPopup`)
- Sesion persistente local (Firebase Auth)
- Whitelist local de emails en `js/config.js`
- Proteccion de `#/calendario` (si no hay sesion valida, redirige a `#/login`)
- Acceso denegado visible en `#/login` cuando el email no esta autorizado

### Donde poner tus datos reales

1. Firebase config:
   - Edita `FIREBASE_CONFIG` en `js/config.js`.
2. Emails permitidos:
   - Edita `ALLOWED_EMAILS` en `js/config.js`.
   - Sustituye los placeholders por tus correos reales.

## Pasos en Firebase Console

1. En Firebase Console crea/usa tu proyecto.
2. En `Authentication > Sign-in method`, habilita `Google`.
3. En `Authentication > Settings > Authorized domains`, anade:
   - `localhost` (pruebas locales)
   - `robdor80.github.io` (GitHub Pages)
4. En `Project settings > General > Your apps > Web app`, copia la config y pegala en `FIREBASE_CONFIG`.

## GitHub Pages

- Configurar en `Settings > Pages`:
  - Source: `Deploy from branch`
  - Branch: `main`
  - Folder: `/ (root)`
