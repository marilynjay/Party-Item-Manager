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
- Item taxonomy: items carry `category` (gear / accessory / consumable / arcana / supplies / papers [shown as Information 📜] / treasure 👑 / other, `CATEGORIES` in `src/types.ts`) plus an optional `subtype`; `CategoryPicker` is a progressive wizard: picking a category collapses the others and reveals subtypes ('none of these' skips), picking a subtype collapses the rest, and only then does the add form reveal its fields (`adv.catDone` gates them); chosen chips tap back a stage. Each category/subtype has a form plan (`formPlan` in `src/types.ts`): primary fields show up front, the rest sit behind a "More options" toggle, and fields in neither list are hidden and scrubbed on save (papery subtypes drop weight/attunement, food drops attunement/value-by-default, gems lead with value). Papery items get a `content` field ("what's written on it", searchable, shown as a quoted block in the detail view) with notes relabeled "What it looks like". Photos attach in the builder and the editor.
- Inventory grouping: a holder's tab groups items under category headers (taxonomy order, empties omitted, `byTaxonomy` sort by category/subtype/name; uncategorized last); the Everything view has a By holder / By category toggle (remembered in localStorage `pim-all-mode`): holder mode keeps holder groups with the same sort inside; category mode uses the category headers with party-wide weight totals and a right-aligned holder chip on every row.
- Potion rolling: consumables with a `heal` formula ("2d4+2") intercept "Use one" with a dialog — roll in-app (DM-Screen's ported SVG dice tumble in `src/components/Dice.tsx`, parser in `src/dice.ts`) or roll your own (no animation); in-app results land in the change log via `consumeItem`'s note param. Seed and load-time migration backfill stats from the catalogue by name.
- Item stats: `item.stats` (`ItemStats` in `src/catalog.ts`) holds type-specific mechanics; `statPlan` in `src/types.ts` decides which stat controls each type shows (weapons: damage/type/bonus; armor: AC/weight class; wands/staves/rods: charges with spend/recharge actions in the detail view via `spendCharge`/`rechargeItem`; scrolls: spell level/DC; containers: capacity; papery: language; cursed rides with magic). `StatFieldControl`/`cleanStats` in `src/components/StatFields.tsx` render and scrub them. The catalogue is enriched with DM-Screen's weapon/armor/charge data (118 entries). `classifyLegacy` maps the old flat `type` strings (and "wondrous item" by name) — `migrateTaxonomy` in `src/api.ts` applies it to stored items and custom entries on load; keep the copy of the classifier in any catalog-regeneration script in sync.
- Senchez has no weight limit (homebrew bag) — the rail badge and category headers show carried weight as information only.
- Party money: per-holder integer gp and pp (`gold`/`platinum` in state, 1 pp = 10 gp via `PP_IN_GP`). All displayed totals are gp-equivalent; the split shows in the ledger row editor and the holder-tab purse line. `setPurse` sets a purse outright, `addMoney` adds coins; both log. Typing "25 gp" / "3 pp" into the quick-add box routes to `addMoney` instead of creating an item (`parseMoney` in `AddItemForm`).
- Change log: capped at 500 entries, actor comes from the client's "Playing as" picker (localStorage).

- Home tab (default scope): the party-gold number (click for the ledger breakdown), a quiet search field that searches the whole party (results grouped by holder), and the + Add pill. Adding everywhere goes through the same modal (`AddItemForm`); there is no inline add form. The search field (`FilterBar`) reveals type/rarity/magic controls only on focus or when a filter is active.
- Holder icons: per-holder emoji stored in state (`icons`), editable from the holder's own tab via the heading icon (`IconPicker`); defaults live on `HOLDERS`. The phone rail shows icons only.
- Party custom catalogue: items built through the custom-item wizard save to the catalogue automatically (catalogue picks that are merely adjusted do not); entries live in state (`custom`, same `CatalogItem` shape); they outrank SRD entries in autocomplete, appear under Browse's ✦ Custom tab (with delete), and upsert by name (`saveCustomItem`/`deleteCustomItem`).
- Item icons: derived at display time (`itemIcon`/`defaultIcon` in `src/types.ts` — name rules, then subtype, then category), stored on the item only when a player overrides via the editor's icon button (`IconPicker`, generalized with `title`/`presets`).
- Item photos: `item.image` holds a small JPEG data URL compressed client-side (`src/image.ts`, ~1000px/0.72 with a 640px retry, ~300 KB target); attach/replace/remove in the editor, thumbnail + tap-to-zoom in the detail view. `save()` turns a storage-quota failure into a friendly error.
- Item catalogue: `src/catalog.ts` holds 252 SRD items (generated from the DM-Screen project's item list, enriched with SRD attunement flags and standard weights). It powers the quick-add autocomplete and the 📖 Browse modal (`CatalogBrowser`); picking an item prefills the advanced fields. One-off data fixes inline are fine.

## Conventions

- Keep it dependency-light. Don't add a database, state library, or auth library without being asked.
- Sandbox note: don't `pkill -f 'node server/index.js'` in scripts whose own command line contains that pattern.
