// Browser-only storage backend: the same operations the Express server
// exposed, implemented against localStorage. The server in server/ is
// dormant — to bring it back, restore the fetch-based version of this
// file from git history (commit 7fcebd2) and nothing else changes.
import type { AppState, Gold, HolderId, Item } from './types';
import { HOLDERS } from './types';

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
