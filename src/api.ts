// Browser-only storage backend: the same operations the Express server
// exposed, implemented against localStorage. The server in server/ is
// dormant — to bring it back, restore the fetch-based version of this
// file from git history (commit 7fcebd2) and nothing else changes.
import type { AppState, Gold, HolderId, Item } from './types';
import { DEFAULT_HOLDER_NAMES, HOLDERS, applyHolderNames, classifyLegacy, isFood } from './types';
import { diceText, findRoll, neverRecharges } from './dice';
import type { SpellRef } from './spellIndex';
import { applySpellbook } from './spellbook';
import type { CatalogItem } from './catalog';
import { CATALOG } from './catalog';

const DB_KEY = 'pim-db';
const LOG_CAP = 500;

// Items saved before the category taxonomy carry a flat `type` string.
function migrateTaxonomy<T extends { name: string }>(entry: T): T {
  const legacy = entry as T & { type?: string; category?: string; subtype?: string };
  if (legacy.category === undefined) {
    const m = classifyLegacy(legacy.type ?? '', entry.name);
    legacy.category = m.category;
    legacy.subtype = legacy.subtype ?? m.subtype;
    delete legacy.type;
  }
  // gems and art moved from Papers into their own Treasure category
  if (legacy.category === 'papers' && (legacy.subtype === 'gems' || legacy.subtype === 'art')) {
    legacy.category = 'treasure';
  }
  // items created before stats existed inherit their catalogue entry's stats,
  // and packs added before contents existed inherit their component list
  if ((legacy as { stats?: unknown }).stats === undefined) {
    const cat = CATALOG.find((c) => c.name.toLowerCase() === entry.name.toLowerCase());
    if (cat?.stats) (legacy as { stats?: unknown }).stats = { ...cat.stats };
  }
  if ((legacy as { pack?: unknown }).pack === undefined) {
    const cat = CATALOG.find((c) => c.name.toLowerCase() === entry.name.toLowerCase());
    if (cat?.pack) (legacy as { pack?: unknown }).pack = cat.pack.map((e) => ({ ...e }));
  }
  // food tracked before the gauge existed starts with a full bar
  const fr = legacy as { freshness?: number; freshnessMax?: number };
  if (fr.freshness !== undefined && fr.freshnessMax === undefined) fr.freshnessMax = fr.freshness;
  // charged items stored before recharge data existed inherit the catalogue's
  // recharge text ("1d6+1 at dawn", "never") so long rests treat them right
  const stats = (legacy as { stats?: { chargesMax?: number; recharge?: string } }).stats;
  if (stats && stats.chargesMax !== undefined && stats.recharge === undefined) {
    const cat = CATALOG.find((c) => c.name.toLowerCase() === entry.name.toLowerCase());
    if (cat?.stats?.recharge) stats.recharge = cat.stats.recharge;
  }
  return entry;
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const db = JSON.parse(raw) as Partial<AppState>;
      applyHolderNames(db.names ?? {});
      applySpellbook(db.spellbook ?? []);
      return {
        items: (db.items ?? []).map(migrateTaxonomy),
        log: db.log ?? [],
        gold: (db.gold ?? {}) as Gold,
        platinum: (db.platinum ?? {}) as Gold,
        icons: db.icons ?? {},
        portraits: db.portraits ?? {},
        names: db.names ?? {},
        needsFood: db.needsFood ?? {},
        lastRest: db.lastRest ?? {},
        custom: (db.custom ?? []).map(migrateTaxonomy),
        spellbook: db.spellbook ?? [],
      };
    }
  } catch {
    // corrupted or unavailable storage — start fresh
  }
  applyHolderNames({});
  applySpellbook([]);
  return { items: [], log: [], gold: {} as Gold, platinum: {} as Gold, icons: {}, portraits: {}, names: {}, needsFood: {}, lastRest: {}, custom: [], spellbook: [] };
}

function save(db: AppState): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    throw new Error('Storage is full — remove a picture or two to make room.');
  }
}

const newId = () => Math.random().toString(16).slice(2, 10) + Date.now().toString(16);
const holderName = (id: HolderId) => HOLDERS.find((h) => h.id === id)!.name;

function addLog(db: AppState, actor: string, text: string): void {
  db.log.unshift({ id: newId(), ts: Date.now(), actor: actor || 'Someone', text });
  if (db.log.length > LOG_CAP) db.log.length = LOG_CAP;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const getState = (): Promise<AppState> => Promise.resolve(clone(load()));

export function createItem(fields: Partial<Item> & { name: string }, actor: string): Promise<Item> {
  const db = load();
  const now = Date.now();
  const item: Item = {
    id: newId(),
    name: fields.name.trim(),
    category: fields.category ?? '',
    subtype: fields.subtype ?? '',
    rarity: fields.rarity ?? '',
    qty: Math.max(1, Math.floor(fields.qty ?? 1) || 1),
    weight: fields.weight ?? null,
    value: fields.value ?? '',
    fungible: fields.fungible,
    magic: fields.magic ?? false,
    requiresAttunement: fields.requiresAttunement ?? false,
    attuned: Boolean(fields.requiresAttunement && fields.attuned && (fields.location ?? 'senchez') !== 'senchez'),
    location: fields.location ?? 'senchez',
    notes: fields.notes ?? '',
    content: fields.content || undefined,
    image: fields.image || undefined,
    stats: fields.stats && Object.keys(fields.stats).length ? fields.stats : undefined,
    freshness: fields.freshness,
    freshnessMax: fields.freshness,
    createdAt: now,
    updatedAt: now,
  };
  // equipment packs arrive with their component list attached. Shelf life
  // deliberately isn't backfilled here: a bare typed name gets no category
  // either, and a perishable with no category can't tell spoiled from
  // expired. Picking the catalogue entry fills both (applyCatalog).
  const packCat = CATALOG.find((c) => c.pack && c.name.toLowerCase() === item.name.trim().toLowerCase());
  if (packCat?.pack) item.pack = packCat.pack.map((e) => ({ ...e }));
  db.items.push(item);
  addLog(db, actor, `added ${item.qty > 1 ? item.qty + ' × ' : ''}${item.name} to ${holderName(item.location)}`);
  save(db);
  return Promise.resolve(clone(item));
}

export function updateItem(id: string, fields: Partial<Item>, actor: string): Promise<Item> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item) return Promise.reject(new Error('Item not found — it may have been changed in another tab'));
  const before = item.location;
  const attuneOnly = Object.keys(fields).length === 1 && fields.attuned !== undefined;
  // freshness edits keep the gauge honest: clearing it clears the max, a
  // bigger value is a fresh batch (new max), a smaller one just adjusts
  // what's left of the old one
  // only when the clock itself actually changed — the editor sends the
  // field on every save, and tidying an item's notes shouldn't hand it a
  // fresh "not yet"
  if ('freshness' in fields && fields.freshness !== item.freshness) {
    fields.freshnessMax =
      fields.freshness === undefined ? undefined : Math.max(item.freshnessMax ?? 0, fields.freshness);
    fields.graced = undefined; // a re-set clock gets its "not yet" back
  }
  Object.assign(item, fields, { updatedAt: Date.now() });
  if (fields.location !== undefined && fields.location !== before) {
    addLog(db, actor, `moved ${item.name} from ${holderName(before)} to ${holderName(item.location)}`);
  } else if (attuneOnly) {
    addLog(db, actor, fields.attuned ? `${holderName(item.location)} attuned to ${item.name} ◈` : `${holderName(item.location)} ended attunement to ${item.name}`);
  } else {
    addLog(db, actor, `edited ${item.name}`);
  }
  save(db);
  return Promise.resolve(clone(item));
}

// Papers are information, and information spreads. A copy is a
// transcription: the same words, sketches and pages, taking on its own
// life from here — edit one and the other keeps what it always said. The
// only class of item that can be in two places at once.
export function copyItem(id: string, to: HolderId, actor: string): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item) return Promise.reject(new Error('Item not found — it may have been changed in another tab'));
  if (item.category !== 'papers') return Promise.reject(new Error('Only information can be copied'));
  const now = Date.now();
  const copy = clone(item);
  // A deed is an instrument, not just words: you can transcribe what it
  // says, but the copy carries no title. So a copied deed files as a note —
  // the wording travels, and only one thing in the party is ever the deed.
  const subtype = item.subtype === 'deed' ? 'note' : item.subtype;
  db.items.push({
    ...copy,
    id: newId(),
    // don't stack "(copy) (copy) (copy)" on a copy of a copy
    name: /\(copy\)\s*$/i.test(item.name) ? item.name : `${item.name} (copy)`,
    subtype,
    icon: item.subtype === 'deed' ? undefined : copy.icon,
    qty: 1,
    location: to,
    attuned: false,
    entries: copy.entries?.map((e) => ({ ...e, id: newId() })),
    createdAt: now,
    updatedAt: now,
  });
  addLog(
    db,
    actor,
    item.subtype === 'deed'
      ? `transcribed ${item.name} for ${holderName(to)} 📋 (a copy of a deed is just a note)`
      : `copied ${item.name} for ${holderName(to)} 📋`
  );
  save(db);
  return Promise.resolve({ ok: true });
}

// Move some or all of a stack; merges into a same-named stack at the target.
export function moveItem(id: string, to: HolderId, qty: number, actor: string): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item) return Promise.reject(new Error('Item not found — it may have been changed in another tab'));
  if (to === item.location) return Promise.reject(new Error('Already there'));
  const n = Math.max(1, Math.min(item.qty, Math.floor(qty) || item.qty));
  const from = item.location;
  const now = Date.now();

  // A journal is one-of-a-kind: never merge stacks when either side has
  // entries, or the pages of one would silently vanish.
  const mergeTarget = db.items.find(
    (i) =>
      i.id !== item.id &&
      i.location === to &&
      i.name.toLowerCase() === item.name.toLowerCase() &&
      i.category === item.category &&
      i.subtype === item.subtype &&
      i.rarity === item.rarity &&
      !i.entries?.length &&
      !item.entries?.length &&
      !i.liquid &&
      !item.liquid &&
      i.freshness === undefined &&
      item.freshness === undefined
  );

  if (n === item.qty) {
    if (mergeTarget) {
      mergeTarget.qty += n;
      mergeTarget.updatedAt = now;
      db.items = db.items.filter((i) => i.id !== item.id);
    } else {
      item.location = to;
      // Attunement doesn't travel: dropping an item in the bag ends the claim on a slot.
      item.attuned = false;
      item.updatedAt = now;
    }
  } else {
    item.qty -= n;
    item.updatedAt = now;
    if (mergeTarget) {
      mergeTarget.qty += n;
      mergeTarget.updatedAt = now;
    } else {
      // entries stay with the original stack — the split-off copy is blank pages
      db.items.push({ ...item, id: newId(), qty: n, location: to, attuned: false, entries: undefined, createdAt: now, updatedAt: now });
    }
  }
  addLog(db, actor, `moved ${n > 1 ? n + ' × ' : ''}${item.name} from ${holderName(from)} to ${holderName(to)}`);
  save(db);
  return Promise.resolve({ ok: true });
}

// ---- journal entries ---------------------------------------------------
// Information items collect dated entries — a sketch, a name, a clue.
// Text or a picture (or both); an entry with neither is rejected.

const findEntry = (item: Item, entryId: string) => (item.entries ?? []).find((e) => e.id === entryId);

export function addEntry(
  itemId: string,
  fields: { title?: string; text: string; image?: string },
  actor: string
): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === itemId);
  if (!item) return Promise.reject(new Error('Item not found — it may have been changed in another tab'));
  const title = fields.title?.trim() || undefined;
  const text = fields.text.trim();
  if (!text && !fields.image) return Promise.reject(new Error('Write something (or add a sketch) first'));
  item.entries = item.entries ?? [];
  item.entries.push({ id: newId(), at: Date.now(), title, text, image: fields.image || undefined });
  item.updatedAt = Date.now();
  addLog(db, actor, `wrote in ${item.name}${title ? ` — “${title}”` : ''}`);
  save(db);
  return Promise.resolve({ ok: true });
}

export function updateEntry(
  itemId: string,
  entryId: string,
  fields: { title?: string; text: string; image?: string },
  actor: string
): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === itemId);
  const entry = item && findEntry(item, entryId);
  if (!item || !entry) return Promise.reject(new Error('Entry not found — it may have been changed in another tab'));
  const text = fields.text.trim();
  if (!text && !fields.image) return Promise.reject(new Error('Write something (or add a sketch) first'));
  entry.title = fields.title?.trim() || undefined;
  entry.text = text;
  entry.image = fields.image || undefined;
  item.updatedAt = Date.now();
  addLog(db, actor, `edited an entry in ${item.name}`);
  save(db);
  return Promise.resolve({ ok: true });
}

export function deleteEntry(itemId: string, entryId: string, actor: string): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === itemId);
  if (!item || !findEntry(item, entryId)) return Promise.reject(new Error('Entry not found — it may have been changed in another tab'));
  item.entries = (item.entries ?? []).filter((e) => e.id !== entryId);
  item.updatedAt = Date.now();
  addLog(db, actor, `tore a page out of ${item.name}`);
  save(db);
  return Promise.resolve({ ok: true });
}

// The party's homebrew catalogue: entries behave like SRD items in the
// autocomplete and Browse. Upserts by name, case-insensitively.
export function saveCustomItem(entry: CatalogItem, actor: string): Promise<{ ok: true }> {
  const name = entry.name.trim();
  if (!name) return Promise.reject(new Error('The item needs a name'));
  const db = load();
  const key = name.toLowerCase();
  const existing = db.custom.findIndex((c) => c.name.toLowerCase() === key);
  const clean: CatalogItem = { ...entry, name };
  if (existing >= 0) {
    db.custom[existing] = clean;
    addLog(db, actor, `updated ${name} in the party catalogue`);
  } else {
    db.custom.push(clean);
    db.custom.sort((x, y) => x.name.localeCompare(y.name));
    addLog(db, actor, `added ${name} to the party catalogue ✦`);
  }
  save(db);
  return Promise.resolve({ ok: true });
}

export function deleteCustomItem(name: string, actor: string): Promise<{ ok: true }> {
  const db = load();
  const key = name.toLowerCase();
  if (!db.custom.some((c) => c.name.toLowerCase() === key)) return Promise.reject(new Error('Not in the catalogue'));
  db.custom = db.custom.filter((c) => c.name.toLowerCase() !== key);
  addLog(db, actor, `removed ${name} from the party catalogue`);
  save(db);
  return Promise.resolve({ ok: true });
}

// ---- the party spellbook -----------------------------------------------
// Player-entered spells (owned paid content, homebrew) that the shipped
// SRD compendium can't include. Upserts by name; custom entries outrank
// SRD ones everywhere names are matched.
export function saveSpell(spell: SpellRef, actor: string): Promise<{ ok: true }> {
  const n = spell.n.trim();
  if (!n) return Promise.reject(new Error('The spell needs a name'));
  if (!spell.d.trim()) return Promise.reject(new Error('Write in the spell text — that’s the point of the book'));
  const db = load();
  const key = n.toLowerCase();
  const entry: SpellRef = { ...spell, n };
  const at = db.spellbook.findIndex((s) => s.n.toLowerCase() === key);
  if (at >= 0) {
    db.spellbook[at] = entry;
    addLog(db, actor, `rewrote ${n} in the party spellbook ✦`);
  } else {
    db.spellbook.push(entry);
    db.spellbook.sort((x, y) => x.n.localeCompare(y.n));
    addLog(db, actor, `added ${n} to the party spellbook ✦`);
  }
  save(db);
  applySpellbook(db.spellbook);
  return Promise.resolve({ ok: true });
}

export function deleteSpell(name: string, actor: string): Promise<{ ok: true }> {
  const db = load();
  const key = name.trim().toLowerCase();
  const entry = db.spellbook.find((s) => s.n.toLowerCase() === key);
  if (!entry) return Promise.reject(new Error('Not in the party spellbook'));
  db.spellbook = db.spellbook.filter((s) => s.n.toLowerCase() !== key);
  addLog(db, actor, `tore ${entry.n} out of the party spellbook`);
  save(db);
  applySpellbook(db.spellbook);
  return Promise.resolve({ ok: true });
}

// Tick a charge off a charged item; recharge restores it to max.
export function spendCharge(id: string, actor: string): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item || !item.stats || item.stats.charges === undefined) return Promise.reject(new Error('No charges to spend'));
  if (item.stats.charges <= 0) return Promise.reject(new Error(`${item.name} is out of charges`));
  item.stats.charges -= 1;
  item.updatedAt = Date.now();
  addLog(db, actor, `spent a charge of ${item.name} (${item.stats.charges} left)`);
  save(db);
  return Promise.resolve({ ok: true });
}

// Cast one of a charged item's listed spells, paying its cost in charges.
export function castSpell(id: string, spell: string, cost: number, actor: string): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item || !item.stats || item.stats.charges === undefined) return Promise.reject(new Error('That item has no charges'));
  if (item.stats.charges < cost) {
    return Promise.reject(new Error(`${item.name} doesn't have enough charges — ${spell} needs ${cost}, ${item.stats.charges} left`));
  }
  item.stats.charges -= cost;
  item.updatedAt = Date.now();
  addLog(db, actor, `cast ${spell} from ${item.name} — ${cost} charge${cost === 1 ? '' : 's'} (${item.stats.charges} left)`);
  save(db);
  return Promise.resolve({ ok: true });
}

// Manual ↺ Recharge from the detail view. Items with a dice recharge
// ("1d6+4 at dawn") must come with the rolled total — the UI collects it
// (in-app roll or the player's own dice); auto-recharge items refill.
export function rechargeItem(id: string, actor: string, rolled?: number): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  const s = item?.stats;
  if (!item || !s || s.chargesMax === undefined) return Promise.reject(new Error('Nothing to recharge'));
  const dice = s.recharge && !neverRecharges(s.recharge) ? findRoll(s.recharge) : null;
  if (dice && rolled === undefined) return Promise.reject(new Error(`${item.name} recharges on a roll (${diceText(s.recharge!)})`));
  if (rolled !== undefined) {
    const n = Math.max(0, Math.floor(rolled));
    s.charges = Math.min(s.chargesMax, (s.charges ?? 0) + n);
    addLog(db, actor, `recharged ${item.name} — ${dice ? `${diceText(s.recharge!)} = ` : '+'}${n} (${s.charges}/${s.chargesMax})`);
  } else {
    s.charges = s.chargesMax;
    addLog(db, actor, `recharged ${item.name} (${s.chargesMax} charges)`);
  }
  item.updatedAt = Date.now();
  save(db);
  return Promise.resolve({ ok: true });
}

// Ammunition bookkeeping: loose a few arrows (negative delta), scavenge a
// few back (positive). The last one spent removes the stack.
export function adjustAmmo(id: string, delta: number, actor: string): Promise<{ ok: true }> {
  const n = Math.trunc(delta);
  if (!n) return Promise.resolve({ ok: true });
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item) return Promise.reject(new Error('Item not found'));
  if (n < 0 && item.qty + n < 0) return Promise.reject(new Error(`Only ${item.qty} left`));
  item.qty += n;
  item.updatedAt = Date.now();
  if (n > 0) {
    addLog(db, actor, `recovered ${n} × ${item.name} (${item.qty} now) 🏹`);
  } else if (item.qty === 0) {
    db.items = db.items.filter((i) => i.id !== id);
    addLog(db, actor, `spent the last of ${holderName(item.location)}’s ${item.name} 🏹`);
  } else {
    addLog(db, actor, `spent ${-n} × ${item.name} (${item.qty} left) 🏹`);
  }
  save(db);
  return Promise.resolve({ ok: true });
}

// The party beds down. Charged items refill with the dawn — except those
// whose recharge text carries a dice formula: those rolls belong to the
// item's owner, so they only happen when the presser is playing that
// character (items in Senchez are party property; whoever's playing rolls).
// Consumables are skipped — their "charges" are doses, not dawn magic.
export interface LongRestResult {
  restored: string[];
  rolled: Array<{ name: string; formula: string; total: number; charges: number; max: number }>;
  waiting: Array<{ holder: string; name: string; formula: string }>;
  spoiled: Array<{ name: string; food: boolean }>; // perished overnight
  spared: Array<{ name: string; food: boolean }>; // last day, given one more
  aged: number;      // food items that ticked down but still keep
}

export function longRest(
  actor: string,
  holder?: HolderId,
  rolls?: Record<string, number>,
  expiries?: Record<string, boolean>
): Promise<LongRestResult> {
  const db = load();
  const out: LongRestResult = { restored: [], rolled: [], waiting: [], spoiled: [], spared: [], aged: 0 };
  const now = Date.now();
  for (const item of db.items) {
    // rest can be scoped to one holder's inventory (their tab's 🌅)
    if (holder && item.location !== holder) continue;
    // a night passes: perishables in this inventory age a day. Only a
    // single-day clock is genuinely ambiguous — a 24-hour goodberry can
    // outlive one 8-hour rest — so those get asked about once instead of
    // being destroyed, and the answer buys exactly one more day. Anything
    // with a longer shelf life was counted out in days already and simply
    // expires on schedule.
    if (item.freshness !== undefined && item.freshness > 0) {
      const food = isFood(item.category, item.subtype);
      const dayOnly = (item.freshnessMax ?? item.freshness) === 1;
      if (dayOnly && item.freshness === 1 && !item.graced && expiries?.[item.id] !== true) {
        item.graced = true;
        item.updatedAt = now;
        out.spared.push({ name: item.name, food });
      } else {
        item.freshness -= 1;
        item.updatedAt = now;
        if (item.freshness === 0) out.spoiled.push({ name: item.name, food });
        else out.aged += 1;
      }
    }
    const s = item.stats;
    if (!s || s.chargesMax === undefined) continue;
    if (item.category === 'consumable') continue;
    // beans, beads, and wishes don't come back at dawn
    if (neverRecharges(s.recharge)) continue;
    const cur = s.charges ?? 0;
    if (cur >= s.chargesMax) continue;
    const dice = s.recharge ? findRoll(s.recharge) : null;
    if (!dice) {
      s.charges = s.chargesMax;
      item.updatedAt = now;
      out.restored.push(item.name);
    } else if (rolls && rolls[item.id] !== undefined) {
      // dice recharges are never rolled here — the dialog collects each
      // roll (in-app or the player's real dice) and passes the totals in
      const n = Math.max(0, Math.floor(rolls[item.id]));
      s.charges = Math.min(s.chargesMax, cur + n);
      item.updatedAt = now;
      out.rolled.push({ name: item.name, formula: diceText(s.recharge!), total: n, charges: s.charges, max: s.chargesMax });
    } else {
      out.waiting.push({ holder: holderName(item.location), name: item.name, formula: diceText(s.recharge!) });
    }
  }
  // remember the rest itself, even when nothing needed doing — anyone can
  // rest Senchez, and "did someone already?" is the question worth answering
  if (holder) db.lastRest[holder] = { at: now, actor: actor || 'someone' };
  if (out.restored.length || out.rolled.length || out.spoiled.length || out.spared.length || out.aged > 0) {
    const bits: string[] = [];
    if (out.restored.length) bits.push(`${out.restored.length} item${out.restored.length === 1 ? '' : 's'} recharged with the dawn`);
    for (const r of out.rolled) bits.push(`rolled ${r.formula} = ${r.total} for ${r.name} (${r.charges}/${r.max})`);
    for (const s of out.spoiled) bits.push(s.food ? `the ${s.name} spoiled 🤢` : `the ${s.name} expired ⌛`);
    for (const s of out.spared) bits.push(`the ${s.name} ${s.food ? 'keeps another day' : 'holds out another day'}`);
    if (bits.length === 0) bits.push('the perishables age a day');
    addLog(db, actor, `🌅 ${holder ? `long rest for ${holderName(holder)}` : 'called a long rest'} — ${bits.join(' · ')}`);
  }
  save(db);
  return Promise.resolve(out);
}

// Use up one from a stack (drink the potion, throw the dagger of returning-nowhere).
export function consumeItem(id: string, actor: string, note?: string): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item) return Promise.reject(new Error('Item not found — it may have been changed in another tab'));
  const suffix = note ? ` — ${note}` : '';
  // drinking a potion leaves the empty vial behind
  const keepVial = item.category === 'consumable' && item.subtype === 'potion';
  const vialText = keepVial ? ' · kept the empty vial' : '';
  if (item.qty > 1) {
    item.qty -= 1;
    item.updatedAt = Date.now();
    addLog(db, actor, `used 1 ${item.name}${suffix} (${item.qty} left)${vialText}`);
  } else {
    db.items = db.items.filter((i) => i.id !== id);
    addLog(db, actor, `used the last ${item.name}${suffix}${vialText}`);
  }
  if (keepVial) {
    const existing = db.items.find(
      (i) => i.location === item.location && i.name.toLowerCase() === 'vial' && !i.liquid && !i.entries?.length
    );
    if (existing) {
      existing.qty += 1;
      existing.updatedAt = Date.now();
    } else {
      db.items.push(materialize('Vial', 1, item.location, Date.now()));
    }
  }
  save(db);
  return Promise.resolve({ ok: true });
}

// ---- liquid containers ---------------------------------------------------
// Waterskins, bottles, buckets, vials: they hold whatever the party pours
// in — a name and a dose count — and can be drunk down, dumped, refilled.

export function fillContainer(id: string, name: string, doses: number, actor: string): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item) return Promise.reject(new Error('Item not found — it may have been changed in another tab'));
  const what = name.trim();
  if (!what) return Promise.reject(new Error('Filled with what?'));
  const n = Math.max(1, Math.floor(doses) || 1);
  item.liquid = { name: what, doses: n };
  item.updatedAt = Date.now();
  addLog(db, actor, `filled the ${item.name} with ${what}${n > 1 ? ` (${n} doses)` : ''}`);
  save(db);
  return Promise.resolve({ ok: true });
}

export function emptyContainer(id: string, actor: string): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item?.liquid) return Promise.reject(new Error('It’s already empty'));
  const what = item.liquid.name;
  item.liquid = undefined;
  item.updatedAt = Date.now();
  addLog(db, actor, `dumped the ${what} out of the ${item.name}`);
  save(db);
  return Promise.resolve({ ok: true });
}

export function drinkFromContainer(id: string, actor: string): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item?.liquid) return Promise.reject(new Error('It’s empty'));
  if (item.liquid.doses > 1) {
    item.liquid = { ...item.liquid, doses: item.liquid.doses - 1 };
    addLog(db, actor, `used a dose of ${item.liquid.name} from the ${item.name} (${item.liquid.doses} left)`);
  } else {
    addLog(db, actor, `used the last of the ${item.liquid.name} in the ${item.name} — it’s empty now`);
    item.liquid = undefined;
  }
  item.updatedAt = Date.now();
  save(db);
  return Promise.resolve({ ok: true });
}

// ---- equipment packs -----------------------------------------------------
// A pack's components can be pulled out one entry at a time, or dumped all
// at once. Components materialize from their catalogue entries; the pack's
// own carried weight sheds the component's share as things leave it.

function materialize(name: string, qty: number, location: HolderId, now: number): Item {
  const cat = CATALOG.find((c) => c.name.toLowerCase() === name.toLowerCase());
  return {
    id: newId(),
    name,
    category: (cat?.category as Item['category']) ?? '',
    subtype: cat?.subtype ?? '',
    rarity: cat?.rarity ?? '',
    qty,
    weight: cat?.weight ?? null,
    value: cat?.value ?? '',
    magic: cat?.magic ?? false,
    requiresAttunement: cat?.requiresAttunement ?? false,
    attuned: false,
    location,
    notes: cat?.rules ?? '',
    stats: cat?.stats ? { ...cat.stats } : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

function shedWeight(pack: Item, name: string, qty: number): void {
  const cat = CATALOG.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (pack.weight !== null && cat?.weight) {
    pack.weight = Math.max(0, Math.round((pack.weight - cat.weight * qty) * 100) / 100);
  }
}

const entryLabel = (e: { name: string; qty: number }) => (e.qty > 1 ? `${e.name} ×${e.qty}` : e.name);

export function unpackItem(id: string, actor: string): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item) return Promise.reject(new Error('Item not found — it may have been changed in another tab'));
  if (!item.pack?.length) return Promise.reject(new Error('Nothing left in the pack'));
  const now = Date.now();
  for (const e of item.pack) {
    db.items.push(materialize(e.name, e.qty * item.qty, item.location, now));
  }
  const kinds = item.pack.length;
  db.items = db.items.filter((i) => i.id !== id);
  addLog(db, actor, `unpacked ${item.name} — ${kinds} kinds of gear tumble into ${holderName(item.location)}’s inventory`);
  save(db);
  return Promise.resolve({ ok: true });
}

export function takeFromPack(id: string, entryName: string, to: HolderId, actor: string): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  const entry = item?.pack?.find((e) => e.name === entryName);
  if (!item || !entry) return Promise.reject(new Error('That’s no longer in the pack'));
  item.pack = item.pack!.filter((e) => e.name !== entryName);
  shedWeight(item, entry.name, entry.qty);
  item.updatedAt = Date.now();
  db.items.push(materialize(entry.name, entry.qty, to, Date.now()));
  addLog(
    db,
    actor,
    to === item.location
      ? `took ${entryLabel(entry)} out of ${item.name}`
      : `sent ${entryLabel(entry)} from ${holderName(item.location)}’s ${item.name} to ${holderName(to)}`
  );
  save(db);
  return Promise.resolve({ ok: true });
}

export function discardFromPack(id: string, entryName: string, actor: string): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  const entry = item?.pack?.find((e) => e.name === entryName);
  if (!item || !entry) return Promise.reject(new Error('That’s no longer in the pack'));
  item.pack = item.pack!.filter((e) => e.name !== entryName);
  shedWeight(item, entry.name, entry.qty);
  item.updatedAt = Date.now();
  addLog(db, actor, `tossed ${entryLabel(entry)} from ${item.name}`);
  save(db);
  return Promise.resolve({ ok: true });
}

// An item leaves the party. The disposition decides the log line:
// lost (default, the old "discarded"), destroyed, or given away.
export type Disposition = 'lost' | 'destroyed' | 'given' | 'spoiled';

// Removes `take` from the stack — the whole item when that empties it —
// and returns the log label for what left ("Garnets ×2").
function takeFromStack(db: AppState, item: Item, take: number | undefined): { n: number; label: string } {
  const n = Math.max(1, Math.min(item.qty, Math.floor(take ?? item.qty)));
  if (n >= item.qty) {
    db.items = db.items.filter((i) => i.id !== item.id);
  } else {
    item.qty -= n;
    item.updatedAt = Date.now();
  }
  return { n, label: n > 1 ? `${item.name} ×${n}` : item.name };
}

export function deleteItem(id: string, actor: string, disposition: Disposition = 'lost', qty?: number): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item) return Promise.reject(new Error('Item not found — it may have been changed in another tab'));
  const { label } = takeFromStack(db, item, qty);
  const food = isFood(item.category, item.subtype);
  const text =
    disposition === 'destroyed'
      ? `destroyed ${label} 💥`
      : disposition === 'given'
        ? `gave ${label} away 🎁`
        : disposition === 'spoiled'
          ? `tossed the ${food ? 'spoiled' : 'expired'} ${label} ${food ? '🤢' : '⌛'}`
          : `discarded ${label} from ${holderName(item.location)}`;
  addLog(db, actor, text);
  save(db);
  return Promise.resolve({ ok: true });
}

// Sold: the goods leave and the proceeds land in the holder's purse,
// as one logged step. `amount` is the total received for the lot.
export function sellItem(id: string, amount: number, unit: 'gp' | 'pp', actor: string, qty?: number): Promise<{ ok: true }> {
  const n = coins(amount);
  if (n <= 0) return Promise.reject(new Error('Sale price must be at least 1'));
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item) return Promise.reject(new Error('Item not found — it may have been changed in another tab'));
  const { label } = takeFromStack(db, item, qty);
  const store = unit === 'pp' ? db.platinum : db.gold;
  store[item.location] = coins(store[item.location]) + n;
  addLog(db, actor, `sold ${label} for ${n} ${unit} (${holderName(item.location)} now ${purseText(coins(db.gold[item.location]), coins(db.platinum[item.location]))})`);
  save(db);
  return Promise.resolve({ ok: true });
}

// A holder's portrait photo; undefined removes it.
export function setPortrait(holder: HolderId, image: string | undefined, actor: string): Promise<{ ok: true }> {
  const db = load();
  if (image) {
    db.portraits[holder] = image;
    addLog(db, actor, `gave ${holderName(holder)} a portrait 🖼️`);
  } else {
    if (!db.portraits[holder]) return Promise.resolve({ ok: true });
    delete db.portraits[holder];
    addLog(db, actor, `removed ${holderName(holder)}’s portrait`);
  }
  save(db);
  return Promise.resolve({ ok: true });
}

export function setIcon(holder: HolderId, icon: string, actor: string): Promise<{ ok: true }> {
  const trimmed = icon.trim().slice(0, 8);
  if (!trimmed) return Promise.reject(new Error('Pick an icon first'));
  const db = load();
  if (db.icons[holder] !== trimmed) {
    db.icons[holder] = trimmed;
    addLog(db, actor, `gave ${holderName(holder)} a new icon: ${trimmed}`);
    save(db);
  }
  return Promise.resolve({ ok: true });
}

// Spelling fix or mid-campaign name change — the slot keeps everything.
export function renameHolder(holder: HolderId, name: string, actor: string): Promise<{ ok: true }> {
  const next = name.trim().slice(0, 40);
  if (!next) return Promise.reject(new Error('A name is required'));
  const db = load();
  const old = holderName(holder);
  if (next === old) return Promise.resolve({ ok: true });
  if (next === DEFAULT_HOLDER_NAMES[holder]) delete db.names[holder];
  else db.names[holder] = next;
  addLog(db, actor, `renamed ${old} to ${next} ✎`);
  save(db);
  applyHolderNames(db.names);
  return Promise.resolve({ ok: true });
}

// A character has died or retired and a new one takes the slot: attunements
// end, portrait and icon are cleared, and the belongings either stay with
// the newcomer or pass to Senchez for the party to sort out.
export function passTorch(holder: HolderId, newName: string, sweep: boolean, actor: string): Promise<{ ok: true }> {
  const next = newName.trim().slice(0, 40);
  if (!next) return Promise.reject(new Error('The new character needs a name'));
  const db = load();
  const old = holderName(holder);
  for (const i of db.items) {
    if (i.location !== holder) continue;
    i.attuned = false;
    if (sweep) i.location = 'senchez';
  }
  if (sweep) {
    const gp = db.gold[holder] ?? 0;
    const pp = db.platinum[holder] ?? 0;
    if (gp || pp) {
      db.gold[holder] = 0;
      db.platinum[holder] = 0;
      db.gold.senchez = (db.gold.senchez ?? 0) + gp;
      db.platinum.senchez = (db.platinum.senchez ?? 0) + pp;
    }
  }
  delete db.portraits[holder];
  delete db.icons[holder];
  if (next === DEFAULT_HOLDER_NAMES[holder]) delete db.names[holder];
  else db.names[holder] = next;
  addLog(
    db,
    actor,
    sweep
      ? `🕯️ ${old}’s story has ended — their belongings pass to Senchez for safekeeping. ${next} takes up the journey.`
      : `🕯️ ${old}’s story has ended. ${next} takes up the journey, pack and all.`
  );
  save(db);
  applyHolderNames(db.names);
  return Promise.resolve({ ok: true });
}

// Warforged, constructs, the occasional undead: some characters sit supper
// out, so the rest dialog stops nudging them about food and water.
export function setNeedsFood(holder: HolderId, needs: boolean, actor: string): Promise<{ ok: true }> {
  const db = load();
  if (needs) delete db.needsFood[holder];
  else db.needsFood[holder] = false;
  addLog(db, actor, needs ? `${holderName(holder)} eats and drinks again` : `${holderName(holder)} doesn’t need food or water 🔩`);
  save(db);
  return Promise.resolve({ ok: true });
}

const coins = (n: unknown) => Math.max(0, Math.floor(Number(n) || 0));
const purseText = (gp: number, pp: number) => (pp > 0 ? `${gp} gp + ${pp} pp` : `${gp} gp`);

// Set a holder's purse outright (the ledger's row editor).
export function setPurse(holder: HolderId, gp: number, pp: number, actor: string): Promise<{ ok: true }> {
  const db = load();
  const nextGp = coins(gp);
  const nextPp = coins(pp);
  const beforeGp = coins(db.gold[holder]);
  const beforePp = coins(db.platinum[holder]);
  if (nextGp !== beforeGp || nextPp !== beforePp) {
    db.gold[holder] = nextGp;
    db.platinum[holder] = nextPp;
    addLog(
      db,
      actor,
      `set ${holderName(holder)}’s purse to ${purseText(nextGp, nextPp)} (was ${purseText(beforeGp, beforePp)})`
    );
    save(db);
  }
  return Promise.resolve({ ok: true });
}

// "25 gp + 3 pp" / "25 gp" — a coin delta for log lines (never both zero).
const deltaText = (gp: number, pp: number) => [gp ? `${gp} gp` : '', pp ? `${pp} pp` : ''].filter(Boolean).join(' + ');

// Coins never convert on their own — the DM hasn't licensed a money
// changer, so platinum doesn't break into gold. Every operation moves gp
// and pp as-is, and each coin type is checked against its own supply.
function checkPurse(db: AppState, holder: HolderId, gp: number, pp: number): string | null {
  const haveGp = coins(db.gold[holder]);
  const havePp = coins(db.platinum[holder]);
  if (gp <= haveGp && pp <= havePp) return null;
  let msg = `${holderName(holder)} only has ${purseText(haveGp, havePp)}`;
  if (gp > haveGp && havePp - pp > 0) msg += ' — and platinum doesn’t break into gold';
  return msg;
}

// Drop coins into a holder's purse (quick-add money and the give picker).
export function addMoney(holder: HolderId, gp: number, pp: number, actor: string): Promise<{ ok: true }> {
  const g = coins(gp);
  const p = coins(pp);
  if (g + p <= 0) return Promise.reject(new Error('Amount must be at least 1'));
  const db = load();
  db.gold[holder] = coins(db.gold[holder]) + g;
  db.platinum[holder] = coins(db.platinum[holder]) + p;
  addLog(db, actor, `added ${deltaText(g, p)} to ${holderName(holder)} (now ${purseText(coins(db.gold[holder]), coins(db.platinum[holder]))})`);
  save(db);
  return Promise.resolve({ ok: true });
}

// Pass coins to another holder — one log line, refuses to overdraw.
export function transferMoney(from: HolderId, to: HolderId, gp: number, pp: number, actor: string): Promise<{ ok: true }> {
  const g = coins(gp);
  const p = coins(pp);
  if (g + p <= 0) return Promise.reject(new Error('Amount must be at least 1'));
  if (from === to) return Promise.reject(new Error('Already theirs'));
  const db = load();
  const short = checkPurse(db, from, g, p);
  if (short) return Promise.reject(new Error(short));
  db.gold[from] = coins(db.gold[from]) - g;
  db.platinum[from] = coins(db.platinum[from]) - p;
  db.gold[to] = coins(db.gold[to]) + g;
  db.platinum[to] = coins(db.platinum[to]) + p;
  addLog(db, actor, `sent ${deltaText(g, p)} from ${holderName(from)} to ${holderName(to)}`);
  save(db);
  return Promise.resolve({ ok: true });
}

// Take coins out (the tavern bill) — refuses to overdraw either coin type.
export function spendMoney(holder: HolderId, gp: number, pp: number, actor: string): Promise<{ ok: true }> {
  const g = coins(gp);
  const p = coins(pp);
  if (g + p <= 0) return Promise.reject(new Error('Amount must be at least 1'));
  const db = load();
  const short = checkPurse(db, holder, g, p);
  if (short) return Promise.reject(new Error(short));
  db.gold[holder] = coins(db.gold[holder]) - g;
  db.platinum[holder] = coins(db.platinum[holder]) - p;
  addLog(db, actor, `spent ${deltaText(g, p)} from ${holderName(holder)}’s purse (now ${purseText(coins(db.gold[holder]), coins(db.platinum[holder]))})`);
  save(db);
  return Promise.resolve({ ok: true });
}
