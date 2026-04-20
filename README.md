# Cuadrante

Parte 1 migrada a HTML + CSS + JavaScript vanilla (sin React, sin Vite, sin TypeScript, sin build).

## Rutas (hash routing)

- `#/`
- `#/login`
- `#/calendario`

## Dominio base

- `anchorDate = 2026-04-18`
- Patron de 12 dias: MORNING x2, AFTERNOON x2, NIGHT x2, OFF x6
- Estado diario: `VOY | NO_VOY | VIALIA`
- `VIALIA` es estado explicito, no ausencia ni booleano

## Firebase

`js/firebase.js` deja la inicializacion preparada, sin login real ni Firestore real en esta fase.

## GitHub Pages

Este proyecto esta preparado para `Deploy from branch` usando `main / root`.
No necesita build.
