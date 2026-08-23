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
  // items created before stats existed inherit their catalogue entry's stats
  if ((legacy as { stats?: unknown }).stats === undefined) {
    const cat = CATALOG.find((c) => c.name.toLowerCase() === entry.name.toLowerCase());
    if (cat?.stats) (legacy as { stats?: unknown }).stats = { ...cat.stats };
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
        custom: (db.custom ?? []).map(migrateTaxonomy),
      };
    }
  } catch {
    // corrupted or unavailable storage — start fresh
  }
  return { items: [], log: [], gold: {} as Gold, platinum: {} as Gold, icons: {}, custom: [] };
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
  Object.assign(item, fields, { updatedAt: Date.now() });
  if (fields.location !== undefined && fields.location !== before) {
    addLog(db, actor, `moved ${item.name} from ${holderName(before)} to ${holderName(item.location)}`);
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

  const mergeTarget = db.items.find(
    (i) =>
      i.id !== item.id &&
      i.location === to &&
      i.name.toLowerCase() === item.name.toLowerCase() &&
      i.category === item.category &&
      i.subtype === item.subtype &&
      i.rarity === item.rarity
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
      db.items.push({ ...item, id: newId(), qty: n, location: to, attuned: false, createdAt: now, updatedAt: now });
    }
  }
  addLog(db, actor, `moved ${n > 1 ? n + ' × ' : ''}${item.name} from ${holderName(from)} to ${holderName(to)}`);
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
  if (item.qty > 1) {
    item.qty -= 1;
    item.updatedAt = Date.now();
    addLog(db, actor, `used a ${item.name}${suffix} (${item.qty} left)`);
  } else {
    db.items = db.items.filter((i) => i.id !== id);
    addLog(db, actor, `used the last ${item.name}${suffix}`);
  }
  save(db);
  return Promise.resolve({ ok: true });
}

export function deleteItem(id: string, actor: string): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item) return Promise.reject(new Error('Item not found — it may have been changed in another tab'));
  db.items = db.items.filter((i) => i.id !== id);
  addLog(db, actor, `discarded ${item.name} from ${holderName(item.location)}`);
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
