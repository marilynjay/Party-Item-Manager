# 🎒 Party Item Manager

A shared inventory tracker for our D&D party — **Yiptik, Radish, Tuffany, Astrielle, and Hyrroh** — plus **Senchez**, our sentient bag of holding.

Everyone logs in with the same party password, and everyone sees the same live inventory. Every item is tagged with where it currently lives, so "show me all our magic items" answers itself, grouped by who's carrying what.

## Features

- **Left-rail tabs** — Everything / each party member / Senchez, with live item counts.
- **Party gold tracker** — total gp always visible at the top; click it to break down who's holding what, and edit any holder's stash inline.
- **Quick add** — name, quantity, and who gets it. An **Advanced ▾** toggle reveals type, rarity, weight, value, magic flag, attunement, and notes.
- **Filters everywhere** — search, type, rarity, and a ✨ Magic-only toggle. Filters apply to whichever tab you're on; on "Everything" results are grouped by holder.
- **Give to…** — move an item (or part of a stack: 3 of 10 arrows) to anyone in one click. Identical stacks merge automatically at the destination.
- **Senchez's weight meter** — running total against the bag of holding's 500 lb limit, with a warning when the party is tempting fate.
- **Attunement tracking** — 3 slots per character, with a warning when someone overreaches. Items dropped into Senchez automatically lose attunement.
- **Change log** — every add, move, edit, and delete is recorded ("Radish moved 5 × Arrows from Radish to Yiptik"), attributed via the "Playing as" picker.
- **Phone-friendly** — the rail collapses to a chip strip on small screens.

## Running it

**Easiest: just open the site.** Every push auto-deploys to GitHub Pages:

> https://marilynjay.github.io/Party-Item-Manager/

Data currently lives in your browser's localStorage — each browser/device keeps its own copy (see "Where the data lives" below).

To run locally instead (requires Node 20+):

```bash
npm install
npm run dev            # app at http://localhost:5173
```

For development (Vite dev server with hot reload + API server):

```bash
npm run dev            # app at http://localhost:5173
```

## Where the data lives

**Right now: in the browser.** All items, gold, and the change log persist to `localStorage`, so the app needs no server at all — which also means each browser has its own separate copy, and clearing site data clears the inventory. That's fine for playtesting; it is not real party sharing.

**Later: the dormant server.** `server/` still contains the original Express backend (shared JSON-file storage plus optional party-password login). To switch back to shared storage, restore the fetch-based `src/api.ts` from git history — the components are written against the same API either way. Run it with `npm run server` after `npm run build`; env vars `PARTY_PASSWORD`, `SESSION_SECRET`, `PORT`, `DATA_DIR` (see `.env.example`).
