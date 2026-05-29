# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A small-scale, table-usable TTRPG (OSE / Arden Vul) character and inventory tracker. Favor practical, low-friction changes over heavy abstractions: local responsiveness and simple workflows matter more than perfect conflict handling or exhaustive rules enforcement. A more detailed product/agent guide lives in `AGENTS.md` — read it for product guardrails and data-model conventions.

## Commands

- Install: `npm install`
- Dev server: `npm run dev` (or `npm run dev -- --host 127.0.0.1 --port 5173`)
- Build (type-check + bundle): `npm run build` (`tsc -b && vite build`)
- Test (run once): `npm test`
- Test (watch): `npm run test:watch`
- Single test file: `npx vitest run src/lib/rules.test.ts`
- Single test by name: `npx vitest run -t "name substring"`
- Firestore emulator smoke test (opt-in): `npm run test:firestore`

Run `npm test` and `npm run build` before handing off non-docs changes. Tests use Vitest in a `node` environment (`vite.config.ts`); files match `src/**/*.test.ts`.

## Architecture

**Stack:** React 19 + Vite + TypeScript, React Router (`react-router-dom`), Zustand state, plain CSS (`src/styles.css`), `@dnd-kit` for drag/drop, `lucide-react` icons.

**Data flow — single source of truth is the Zustand store:**
`src/store/campaignStore.ts` holds all mutable play state (`campaign`, `entities`, `inventoryEntries`, `viewMode`) and exposes every mutation as an async action. UI components read store fields and call actions; they should not mutate or persist directly.

**Persistence is abstracted behind a repository (`src/lib/repository.ts`):**
- `createRepository()` picks the backend at runtime: Firestore when Firebase env vars are present (`src/lib/firebaseConfig.ts` → `firebaseConfigPresent()`), otherwise an in-memory/localStorage repository. The local fallback means the app runs fully offline with no cloud setup.
- The Firestore implementation (`src/lib/repository.firestore.ts`) is lazy-imported so Firebase isn't bundled when unused.
- The store subscribes to a `CampaignSnapshot` stream (`subscribeCampaign`) and writes back through `saveEntity` / `saveInventoryEntry(ies)` / `deleteInventoryEntry`. Mutations are optimistic; **last-write-wins is acceptable** for this app.
- Add new persistence behavior to the repository interface, not directly in UI components.

**Derived values are computed, never stored** (`src/lib/rules.ts`): AC, movement, encumbrance/load, level/XP, active lights, saves, hand occupancy, skill rows, and warnings. `summarizeEntity()` produces the per-entity summary (incl. warnings) used across pages; `buildInventoryTree()` turns the flat `inventoryEntries` list into the nested view. If you need a computed value, add it here and call it from the UI — don't persist it.

**Static reference catalogs** (`data/*.json`: OSE classes, equipment, spells) are loaded and normalized through `src/lib/catalogs.ts` (`buildCatalogs()` → exported `catalogs` singleton; spells via `src/lib/spellCatalog.ts`). Treat these as read-only reference data — never store mutable campaign state in `data/*.json`. Class ids are derived from class names (`classNameToId`); spell class ids normalize underscores to dashes (`normalizeSpellClassId`).

**Core types** are centralized in `src/types.ts` (`Entity`, `InventoryEntry`, `ItemTemplate`, `InventoryLocation`, `Campaign`, etc.).

**Inventory model:** entries are a flat list; nesting is expressed via `InventoryLocation` (`{ kind: "equipped" }` or `{ kind: "contained"; parentEntryId }`). Entries reference catalog items by `itemTemplateId` or carry a `customItem` (treasure/custom gear). `src/lib/inventoryIntegrity.ts` validates placement, prevents container cycles (`collectInventoryDescendantIds`), and snapshot-shape-checks persisted data (`isCurrentCampaignSnapshot`, used to discard stale localStorage).

**Routing/UI:** `src/App.tsx` → `StartPage` and `CampaignShell` (lazy). `CampaignShell.tsx` mounts route pages from `src/pages/` (Party, Character, Inventory, Items, Spells). The main reusable component is `src/components/InventoryTree.tsx`. Demo/starter data: `src/lib/seed.ts` (`createStarterCampaign`).

## Conventions specific to this codebase

- **Zustand selectors:** never return a freshly-created array/object from a selector inside a component. Select stable store fields, then derive arrays/objects with `useMemo` (see `CampaignShell.tsx`).
- **Ordering:** entities carry an explicit `sortOrder`; reordering updates `sortOrder` and persists via the store.
- **GM/player mode** (`viewMode`) is a trusted UI mode, not a security boundary — `visibleItem()`/`displayName()` hide secret item details in player mode. Don't add real auth/roles unless asked.
- **Rules changes** require focused tests in `src/lib/*.test.ts` (`rules.test.ts`, `catalogs.test.ts`, `campaignStore.test.ts`).
- Keep catalog normalization tolerant of imperfect JSON — write small normalizers rather than editing source catalogs unless the data is genuinely wrong.
- Don't edit generated dirs: `node_modules/`, `.vite/`, build output, `*.tsbuildinfo`.
