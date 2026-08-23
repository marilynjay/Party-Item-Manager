// Browser-only storage backend: the same operations the Express server
// exposed, implemented against localStorage. The server in server/ is
// dormant — to bring it back, restore the fetch-based version of this
// file from git history (commit 7fcebd2) and nothing else changes.
import type { AppState, Gold, HolderId, Item } from './types';
import { HOLDERS } from './types';
import { CATALOG } from './catalog';

const DB_KEY = 'pim-db';
const LOG_CAP = 500;

function load(): AppState {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const db = JSON.parse(raw) as Partial<AppState>;
      return { items: db.items ?? [], log: db.log ?? [], gold: (db.gold ?? {}) as Gold };
    }
  } catch {
    // corrupted or unavailable storage — start fresh
  }
  return { items: [], log: [], gold: {} as Gold };
}

function save(db: AppState): void {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
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
        type: cat?.type ?? '',
        rarity: cat?.rarity ?? '',
        qty,
        weight: cat?.weight ?? null,
        value: '',
        magic: cat?.magic ?? false,
        requiresAttunement: cat?.requiresAttunement ?? false,
        attuned: Boolean(attuned),
        location,
        notes: cat?.rules ?? '',
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
    type: fields.type ?? '',
    rarity: fields.rarity ?? '',
    qty: Math.max(1, Math.floor(fields.qty ?? 1) || 1),
    weight: fields.weight ?? null,
    value: fields.value ?? '',
    magic: fields.magic ?? false,
    requiresAttunement: fields.requiresAttunement ?? false,
    attuned: false,
    location: fields.location ?? 'senchez',
    notes: fields.notes ?? '',
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
      i.type === item.type &&
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

export function deleteItem(id: string, actor: string): Promise<{ ok: true }> {
  const db = load();
  const item = db.items.find((i) => i.id === id);
  if (!item) return Promise.reject(new Error('Item not found — it may have been changed in another tab'));
  db.items = db.items.filter((i) => i.id !== id);
  addLog(db, actor, `removed ${item.name} from ${holderName(item.location)}`);
  save(db);
  return Promise.resolve({ ok: true });
}

export function setGold(holder: HolderId, gold: number, actor: string): Promise<{ gold: Gold }> {
  const db = load();
  const amount = Math.max(0, Math.floor(gold) || 0);
  const before = Math.max(0, Math.floor(Number(db.gold[holder]) || 0));
  if (amount !== before) {
    db.gold[holder] = amount;
    const delta = amount - before;
    addLog(
      db,
      actor,
      `${delta > 0 ? 'added' : 'removed'} ${Math.abs(delta)} gp ${delta > 0 ? 'to' : 'from'} ${holderName(holder)} (now ${amount} gp)`
    );
    save(db);
  }
  return Promise.resolve({ gold: clone(db.gold) });
}
