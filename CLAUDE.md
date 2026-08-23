# Party Item Manager

Shared D&D party inventory tracker. Five party members (Yiptik, Radish, Tuffany, Astrielle, Hyrroh) plus Senchez, a sentient bag of holding, tracked as a sixth "holder".

## Architecture

- **Frontend**: React 19 + TypeScript + Vite, in `src/`. No router — one screen with a scope selector (`Sidebar`) and orthogonal filters (`FilterBar`).
- **Backend**: Express (plain ESM JavaScript, no build step) in `server/`. Serves the API and, in production, the built `dist/`.
- **Storage**: single JSON file `data/db.json` via `server/store.js` (load once at boot, atomic write-on-mutation). No database. `data/` is gitignored.
- **Auth**: optional. If `PARTY_PASSWORD` is unset/empty, all API routes are open (playtesting mode). If set, login → HMAC-signed session cookie (`SESSION_SECRET`) guards all `/api/*` except `/api/login`. The login UI only appears when the server returns 401s.
- **Sync**: frontend polls `/api/state` every 10 s; every mutation re-fetches.

## Commands

- `npm run dev` — Vite dev server (:5173, proxies `/api` → :3001) + API server, concurrently.
- `npm run build` — typecheck (`tsc --noEmit`) then `vite build`. **Run this before committing frontend changes.**
- `npm run typecheck` — typecheck only.
- `npm start` — production server on `PORT` (default 3001).

There are no automated tests; verify server changes by exercising the API with curl (login sets a cookie jar) and frontend changes via `npm run build` at minimum.

## Domain rules encoded in the app

- Holder ids are fixed: `yiptik`, `radish`, `tuffany`, `astrielle`, `hyrroh`, `senchez`. They live in both `server/index.js` (`MEMBER_IDS`) and `src/types.ts` (`HOLDERS`) — keep them in sync.
- Moves can split stacks (qty < stack) and auto-merge with a same-name/type/rarity stack at the destination (`/api/items/:id/move`).
- Attunement: max 3 per member (warning only, not enforced); moving an item into Senchez clears `attuned`.
- "Magic" for filtering = `magic` flag OR `requiresAttunement` OR rarity above common (`isMagic` in `src/types.ts`).
- Senchez capacity: 500 lb (`BAG_CAPACITY_LB`), warning only.
- Party gold: per-holder integer gp in `db.gold`, `PATCH /api/gold {holder, gold}` sets an absolute amount and logs the delta. `GoldTracker` shows the total, expanding to a per-holder editable breakdown.
- Change log: server-side, capped at 500 entries, actor comes from the client's "Playing as" picker (localStorage).

## Conventions

- Server code is dependency-light on purpose (express only). Don't add a database or auth library without being asked.
- Sandbox note: don't `pkill -f 'node server/index.js'` in scripts whose own command line contains that pattern.
