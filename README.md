# Cuadrante

Base de la Parte 1 para la app privada del turno 6x6.

## Estado actual

- Rutas minimas: `/`, `/login`, `/calendario`, `*`
- Dominio base preparado para:
  - ciclo 12 dias (2 manana, 2 tarde, 2 noche, 6 libre)
  - `anchorDate = 2026-04-18` (dia 1 = primera manana)
  - estados diarios `VOY | NO_VOY | VIALIA`
- Firebase preparado (cliente/auth/firestore) sin cerrar aun el modelo final de persistencia de estados diarios.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run test`
- `npm run lint`

## Variables de entorno

Copia `.env.example` a `.env.local` y completa tus claves de Firebase.
