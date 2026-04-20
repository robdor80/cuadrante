# Cuadrante

Proyecto web en HTML + CSS + JavaScript vanilla para GitHub Pages (sin build).

## Rutas (hash routing)

- `#/`
- `#/login`
- `#/calendario`

## Estado actual

### Parte 2
- Login con Google (`signInWithPopup`)
- Sesion persistente local (Firebase Auth)
- Whitelist local en `js/config.js`
- Acceso denegado en `#/login` para emails no permitidos

### Parte 3
- Alta inicial de perfil para usuario autenticado sin perfil
- Campos de alta: `name` + `color` (paleta cerrada)
- Asignacion automatica al primer slot libre `1..6`
- Persistencia en Firestore (`users` + `slots`)
- Reutilizacion de perfil en accesos posteriores
- Si no hay slots libres: mensaje claro de turno completo

## Configuracion principal

### Firebase + whitelist
Editar en `js/config.js`:
- `FIREBASE_CONFIG`
- `ALLOWED_EMAILS`

### Paleta de colores de perfil
Tambien en `js/config.js`:
- `PROFILE_COLOR_OPTIONS`

## Firestore esperado

Colecciones usadas:
- `users/{uid}`
- `slots/{slotId}` con ids `'1'..'6'`

Notas:
- `slots` se inicializa automaticamente desde codigo si faltan documentos.
- La asignacion de slot se hace en transaccion para evitar condiciones de carrera.

## Firebase Console (manual)

1. `Authentication > Sign-in method`: habilitar Google.
2. `Authentication > Settings > Authorized domains`: anadir
   - `localhost`
   - `robdor80.github.io`
3. `Firestore Database`: crear base en modo prueba o con reglas acordes para esta fase.

## GitHub Pages

- `Settings > Pages`
  - Source: `Deploy from branch`
  - Branch: `main`
  - Folder: `/ (root)`
