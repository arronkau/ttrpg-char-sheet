# Agent Guide

This repo is a small-scale hobby TTRPG character and inventory tracker. Favor practical, table-usable changes over heavy abstractions. Local responsiveness and simple workflows matter more than perfect conflict handling or exhaustive rules enforcement.

## Project Shape

- App stack: React 19, Vite, TypeScript, React Router, Zustand, plain CSS.
- Sync stack: Firebase anonymous auth and Firestore when Firebase env vars are configured.
- Local fallback: localStorage is used automatically when Firebase config is absent, so local/demo development should work without cloud setup.
- Main app entry: `src/App.tsx`, `src/main.tsx`, and route pages under `src/pages/`.
- Shared state: `src/store/campaignStore.ts`.
- Persistence abstraction: `src/lib/repository.ts`; Firebase setup is in `src/lib/firebase.ts`.
- Static reference catalogs: `data/*.json`, loaded and normalized through `src/lib/catalogs.ts`.
- Derived rules/calculations: `src/lib/rules.ts`.
- Core shared types: `src/types.ts`.
- Starter/demo data: `src/lib/seed.ts`.

## Commands

- Install deps: `npm install`.
- Run dev server: `npm run dev -- --host 127.0.0.1 --port 5173`.
- Run tests: `npm test`.
- Build check: `npm run build`.
- Firestore emulator smoke test: `npm run test:firestore`.

Before handing off code changes, run `npm test` and `npm run build` unless the change is docs-only. The Firestore smoke test is opt-in and expects emulator/env setup.

## Data Model Notes

- Treat catalog JSON as static reference data. Do not store mutable campaign state in `data/*.json`.
- Mutable play state lives as campaigns, entities, and inventory entries.
- Inventory entries reference item templates by `itemTemplateId`, or carry a `customItem` for treasure/custom gear.
- Derived values such as AC, movement, load, active lights, saves, level, and warnings should be calculated in `src/lib/rules.ts`, not stored.
- Class ids are generated from class names in `src/lib/catalogs.ts`; spell class ids normalize underscores to dashes.

## Product Guardrails

- Preserve the app's table-first feel: inventory logistics, party summary, light tracking, quick reference, and simple edits.
- Prefer warnings over hard blocks for legality and rules issues.
- GM/player mode is a trusted UI mode, not a security boundary. Do not add strict roles/auth rules unless explicitly requested.
- Keep inventory behavior optimistic and simple. Last-write-wins is acceptable for this app.
- Local performance and low-friction usability trump fully robust distributed-state handling.
- Avoid expanding into roll automation, mapping, campaign logs, or broad rules reference unless explicitly asked.

## Implementation Guardrails

- Do not edit `dist/`, `node_modules/`, `.vite/`, coverage output, TypeScript build info, or other generated caches.
- Keep changes scoped to the feature or fix at hand; avoid broad refactors unless they remove real complexity.
- For rules changes, add or update focused tests in `src/lib/*.test.ts`.
- For Firestore behavior, update the repository abstraction rather than bypassing it from UI components.
- Avoid Zustand selectors that return freshly-created arrays or objects directly in React components. Select stable store fields, then derive arrays/objects with `useMemo`.
- Keep catalog normalization tolerant of imperfect JSON. Prefer small normalizers over editing source catalogs unless the data itself is wrong.
- UI controls should remain dense and table-usable. Use existing CSS patterns and lucide-react icons where appropriate.

## Environment

Firebase config is read from Vite env vars. Use `.env.example` as the template:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

When these are missing, the app should continue to run against localStorage.
