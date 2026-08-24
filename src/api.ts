// Browser-only storage backend: the same operations the Express server
// exposed, implemented against localStorage. The server in server/ is
// dormant — to bring it back, restore the fetch-based version of this
// file from git history (commit 7fcebd2) and nothing else changes.
import type { AppState, Gold, HolderId, Item } from './types';
import { HOLDERS, classifyLegacy } from './types';
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
  return entry;
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const db = JSON.parse(raw) as Partial<AppState>;
      return {
        items: (db.items ?? []).map(migrateTaxonomy),
        log: db.log ?? [],
        gold: (db.gold ?? {}) as Gold,
        platinum: (db.platinum ?? {}) as Gold,
        icons: db.icons ?? {},
        portraits: db.portraits ?? {},
        custom: (db.custom ?? []).map(migrateTaxonomy),
      };
    }
  } catch {
    // corrupted or unavailable storage — start fresh
  }
  return { items: [], log: [], gold: {} as Gold, platinum: {} as Gold, icons: {}, portraits: {}, custom: [] };
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

// ---- one-time playtest seed -------------------------------------------
// Stocks this browser once with sample gear and gold so the app isn't empty
// during playtesting. Additive (never touches existing items) and guarded by
// a flag, so it runs a single time per browser. Delete anything freely.
const SEED_FLAG = 'pim-seed-v1';

const SEED_ITEMS: Array<[string, HolderId, number, boolean?]> = [
  ['Dagger of Venom', 'yiptik', 1],
  ['Boots of Elvenkind', 'yiptik', 1],
  ['Shield, +1', 'radish', 1],
  ['Potion of Healing (Greater)', 'radish', 1],
  ['Longbow', 'tuffany', 1],
  ['Quiver of Ehlonna', 'tuffany', 1],
  ['Wand of Magic Missiles', 'astrielle', 1],
  ['Pearl of Power', 'astrielle', 1, true],
  ['Greataxe', 'hyrroh', 1],
  ['Gauntlets of Ogre Power', 'hyrroh', 1, true],
  ['Potion of Healing', 'senchez', 3],
  ['Spell Scroll (2nd Level)', 'senchez', 2],
  ['Rope of Climbing', 'senchez', 1],
  ['Bag of Tricks', 'senchez', 1],
  ['Alchemy Jug', 'senchez', 1],
  ['Chain Mail', 'senchez', 1],
  ['Immovable Rod', 'senchez', 1],
  ['Driftglobe', 'senchez', 1],
  ['Oil of Slipperiness', 'senchez', 1],
  ['Lantern of Revealing', 'senchez', 1],
];

const SEED_GOLD: Partial<Record<HolderId, number>> = { radish: 150, astrielle: 75, senchez: 2000 };

function seedOnce(): void {
  try {
    if (localStorage.getItem(SEED_FLAG)) return;
    const db = load();
    const now = Date.now();
    for (const [name, location, qty, attuned] of SEED_ITEMS) {
      const cat = CATALOG.find((c) => c.name === name);
      db.items.push({
        id: newId(),
        name,
        category: (cat?.category ?? '') as Item['category'],
        subtype: cat?.subtype ?? '',
        rarity: cat?.rarity ?? '',
        qty,
        weight: cat?.weight ?? null,
        value: '',
        magic: cat?.magic ?? false,
        requiresAttunement: cat?.requiresAttunement ?? false,
        attuned: Boolean(attuned),
        location,
        notes: cat?.rules ?? '',
        stats: cat?.stats ? { ...cat.stats } : undefined,
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const [holder, gp] of Object.entries(SEED_GOLD) as Array<[HolderId, number]>) {
      db.gold[holder] = Math.max(0, Math.floor(Number(db.gold[holder]) || 0)) + gp;
    }
    addLog(db, 'Senchez', 'coughed up a pile of sample gear and gold for playtesting');
    save(db);
    localStorage.setItem(SEED_FLAG, '1');
  } catch {
    // storage unavailable — nothing to seed
  }
}
seedOnce();

// A pouch of playtest gems for trying the purse panel's gem accounting:
// varied values, a couple set aside, one with a prose value. Same additive
// one-time-per-browser pattern as the main seed.
const GEM_SEED_FLAG = 'pim-seed-gems-v1';

function seedGemsOnce(): void {
  try {
    if (localStorage.getItem(GEM_SEED_FLAG)) return;
    const db = load();
    const now = Date.now();
    const gems: Array<{ name: string; location: HolderId; qty: number; value: string; fungible?: boolean; notes: string }> = [
      { name: 'Fire Opal', location: 'senchez', qty: 1, value: '500 gp', notes: 'Glows faintly warm to the touch.' },
      { name: 'Garnets', location: 'senchez', qty: 4, value: '100 gp each', notes: 'A matched set from the wyvern hoard.' },
      { name: 'Resurrection Diamond', location: 'senchez', qty: 1, value: '1,000 gp', fungible: false, notes: 'NOT FOR SPENDING — this is the spell component. Ask Radish.' },
      { name: 'Uncut Stone', location: 'senchez', qty: 1, value: 'who knows?', notes: 'Might be worthless, might be a star sapphire. Needs an appraiser.' },
      { name: 'Moonstone', location: 'astrielle', qty: 1, value: '250 gp', notes: 'A gift from the grove — Astrielle carries it for luck.' },
      { name: 'Black Pearl', location: 'yiptik', qty: 2, value: '75 pp', fungible: false, notes: 'Yiptik insists these are "an investment".' },
    ];
    for (const g of gems) {
      db.items.push({
        id: newId(),
        name: g.name,
        category: 'treasure',
        subtype: 'gems',
        rarity: '',
        qty: g.qty,
        weight: null,
        value: g.value,
        fungible: g.fungible,
        magic: false,
        requiresAttunement: false,
        attuned: false,
        location: g.location,
        notes: g.notes,
        createdAt: now,
        updatedAt: now,
      });
    }
    addLog(db, 'Senchez', 'coughed up a pouch of assorted gems for playtesting 💎');
    save(db);
    localStorage.setItem(GEM_SEED_FLAG, '1');
  } catch {
    // storage unavailable — nothing to seed
  }
}
seedGemsOnce();

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
    createdAt: now,
    updatedAt: now,
  };
  // equipment packs arrive with their component list attached
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
      !item.liquid
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

export function rechargeItem(id: string, actor: string): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item || !item.stats || item.stats.chargesMax === undefined) return Promise.reject(new Error('Nothing to recharge'));
  item.stats.charges = item.stats.chargesMax;
  item.updatedAt = Date.now();
  addLog(db, actor, `recharged ${item.name} (${item.stats.chargesMax} charges)`);
  save(db);
  return Promise.resolve({ ok: true });
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
    addLog(db, actor, `used a ${item.name}${suffix} (${item.qty} left)${vialText}`);
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
export type Disposition = 'lost' | 'destroyed' | 'given';

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
  const text =
    disposition === 'destroyed'
      ? `destroyed ${label} 💥`
      : disposition === 'given'
        ? `gave ${label} away 🎁`
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

// Drop coins into a holder's purse (quick-add money and the give picker).
export function addMoney(holder: HolderId, amount: number, unit: 'gp' | 'pp', actor: string): Promise<{ ok: true }> {
  const n = coins(amount);
  if (n <= 0) return Promise.reject(new Error('Amount must be at least 1'));
  const db = load();
  const store = unit === 'pp' ? db.platinum : db.gold;
  store[holder] = coins(store[holder]) + n;
  addLog(db, actor, `added ${n} ${unit} to ${holderName(holder)} (now ${purseText(coins(db.gold[holder]), coins(db.platinum[holder]))})`);
  save(db);
  return Promise.resolve({ ok: true });
}

// Pass coins to another holder — one log line, refuses to overdraw.
export function transferMoney(from: HolderId, to: HolderId, amount: number, unit: 'gp' | 'pp', actor: string): Promise<{ ok: true }> {
  const n = coins(amount);
  if (n <= 0) return Promise.reject(new Error('Amount must be at least 1'));
  if (from === to) return Promise.reject(new Error('Already theirs'));
  const db = load();
  const store = unit === 'pp' ? db.platinum : db.gold;
  const have = coins(store[from]);
  if (n > have) return Promise.reject(new Error(`${holderName(from)} only has ${have} ${unit}`));
  store[from] = have - n;
  store[to] = coins(store[to]) + n;
  addLog(db, actor, `sent ${n} ${unit} from ${holderName(from)} to ${holderName(to)}`);
  save(db);
  return Promise.resolve({ ok: true });
}

// Take coins out (the tavern bill) — refuses to overdraw the purse.
export function spendMoney(holder: HolderId, amount: number, unit: 'gp' | 'pp', actor: string): Promise<{ ok: true }> {
  const n = coins(amount);
  if (n <= 0) return Promise.reject(new Error('Amount must be at least 1'));
  const db = load();
  const store = unit === 'pp' ? db.platinum : db.gold;
  const have = coins(store[holder]);
  if (n > have) return Promise.reject(new Error(`${holderName(holder)} only has ${have} ${unit}`));
  store[holder] = have - n;
  addLog(db, actor, `spent ${n} ${unit} from ${holderName(holder)}’s purse (now ${purseText(coins(db.gold[holder]), coins(db.platinum[holder]))})`);
  save(db);
  return Promise.resolve({ ok: true });
}
