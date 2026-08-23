# 🎒 Party Item Manager

A shared inventory tracker for our D&D party — **Yiptik, Radish, Tuffany, Astrielle, and Hyrroh** — plus **Senchez**, our sentient bag of holding.

Everyone logs in with the same party password, and everyone sees the same live inventory. Every item is tagged with where it currently lives, so "show me all our magic items" answers itself, grouped by who's carrying what.

## Features

- **Left-rail tabs** — Everything / each party member / Senchez, with live item counts.
- **Quick add** — name, quantity, and who gets it. An **Advanced ▾** toggle reveals type, rarity, weight, value, magic flag, attunement, and notes.
- **Filters everywhere** — search, type, rarity, and a ✨ Magic-only toggle. Filters apply to whichever tab you're on; on "Everything" results are grouped by holder.
- **Give to…** — move an item (or part of a stack: 3 of 10 arrows) to anyone in one click. Identical stacks merge automatically at the destination.
- **Senchez's weight meter** — running total against the bag of holding's 500 lb limit, with a warning when the party is tempting fate.
- **Attunement tracking** — 3 slots per character, with a warning when someone overreaches. Items dropped into Senchez automatically lose attunement.
- **Change log** — every add, move, edit, and delete is recorded ("Radish moved 5 × Arrows from Radish to Yiptik"), attributed via the "Playing as" picker.
- **Phone-friendly** — the rail collapses to a chip strip on small screens.

## Running it

Requires Node 20+.

```bash
npm install
cp .env.example .env   # then edit: set PARTY_PASSWORD and SESSION_SECRET
npm run build
npm start              # serves the app on http://localhost:3001
```

For development (Vite dev server with hot reload + API server):

```bash
npm run dev            # app at http://localhost:5173
```

## Deploying

This is a single Node process that serves both the API and the built frontend, storing data in `data/db.json`. Any host that runs Node and gives you a persistent disk works — Railway, Render, Fly.io, a VPS, a Raspberry Pi under the DM's desk.

1. Set env vars: `PARTY_PASSWORD` (what the party types to log in) and `SESSION_SECRET` (any long random string).
2. Make sure the `data/` directory is on persistent storage (set `DATA_DIR` to relocate it if needed).
3. Build command: `npm install && npm run build` · Start command: `npm start`.
4. Share the URL and the password with the party.

> Note: platforms with ephemeral filesystems (e.g. Vercel/Netlify serverless) will lose the inventory on redeploy — pick a host with a disk.

## How data is stored

A single JSON file (`data/db.json`) holds all items and the change log, written atomically on every mutation. For a party of five and a bag, that's all the database anyone needs.
