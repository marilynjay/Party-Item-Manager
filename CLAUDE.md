# Party Item Manager

Shared D&D party inventory tracker. Five party members (Yiptik, Radish, Tuffany, Astrielle, Hyrroh) plus Senchez, a sentient bag of holding, tracked as a sixth "holder".

## Architecture

- **Frontend**: React 19 + TypeScript + Vite, in `src/`. No router — one screen with a scope selector (`Sidebar`) and orthogonal filters (`FilterBar`).
- **Storage (current)**: browser localStorage via `src/api.ts`, which implements the full domain logic (moves/merges, gold, change log) client-side. The app is a pure static site; GitHub Pages deploys it on every push (`.github/workflows/deploy.yml`).
- **Backend (dormant)**: `server/` keeps the original Express API + JSON-file store + optional password login. To revive shared storage, restore the fetch-based `src/api.ts` from git history (commit 7fcebd2) — component code is unchanged either way. `npm run server` runs it.
- **Sync**: the frontend polls `getState()` every 10 s and re-fetches after each mutation; with localStorage this keeps multiple tabs of the same browser in sync.

## Commands

- `npm run dev` — Vite dev server (:5173).
- `npm run build` — typecheck (`tsc --noEmit`) then `vite build`. **Run this before committing frontend changes.**
- `npm run typecheck` — typecheck only.
- `npm run preview` — serve the production build locally.
- `npm run server` — the dormant Express backend (only relevant if shared storage is revived).

There are no automated tests; verify changes via `npm run build` at minimum, ideally by driving the built app in a browser.

## Domain rules encoded in the app

- Holder ids are fixed: `yiptik`, `radish`, `tuffany`, `astrielle`, `hyrroh`, `senchez` (`HOLDERS` in `src/types.ts`; the dormant `server/index.js` has a matching `MEMBER_IDS` — keep them in sync if the server comes back).
- Moves can split stacks (qty < stack) and auto-merge with a same-name/type/rarity stack at the destination (`moveItem` in `src/api.ts`).
- Attunement: max 3 per member (warning only, not enforced); moving an item into Senchez clears `attuned`.
- "Magic" for filtering = `magic` flag OR `requiresAttunement` OR rarity above common (`isMagic` in `src/types.ts`).
- Senchez capacity: 500 lb (`BAG_CAPACITY_LB`), warning only.
- Party gold: per-holder integer gp, `setGold` in `src/api.ts` sets an absolute amount and logs the delta. `GoldTracker` shows the total, expanding to a per-holder editable breakdown.
- Change log: capped at 500 entries, actor comes from the client's "Playing as" picker (localStorage).

## Conventions

- Keep it dependency-light. Don't add a database, state library, or auth library without being asked.
- Sandbox note: don't `pkill -f 'node server/index.js'` in scripts whose own command line contains that pattern.
