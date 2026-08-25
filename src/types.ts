export type HolderId = 'yiptik' | 'radish' | 'tuffany' | 'astrielle' | 'hyrroh' | 'senchez';

export interface Holder {
  id: HolderId;
  name: string;
  kind: 'member' | 'bag';
  emoji: string;
}

export const HOLDERS: Holder[] = [
  { id: 'yiptik', name: 'Yiptik', kind: 'member', emoji: '🗡️' },
  { id: 'radish', name: 'Radish', kind: 'member', emoji: '📖' },
  { id: 'tuffany', name: 'Tuffany', kind: 'member', emoji: '🔨' },
  { id: 'astrielle', name: 'Astrielle', kind: 'member', emoji: '✨' },
  { id: 'hyrroh', name: 'Hyrroh', kind: 'member', emoji: '🛡️' },
  { id: 'senchez', name: 'Senchez', kind: 'bag', emoji: '🎒' },
];

export const MEMBERS = HOLDERS.filter((h) => h.kind === 'member');
export const holderById = (id: HolderId): Holder => HOLDERS.find((h) => h.id === id)!;

// Holder ids are permanent slots; the names on them are not (characters die,
// players roll new ones). The stored `names` overrides are stamped onto the
// HOLDERS entries at load time so every `h.name` in the app shows the
// current character without threading a map through each component.
export type Names = Partial<Record<HolderId, string>>;
// Who the supper reminder applies to. Absent = eats and drinks like anyone;
// false = a warforged, construct, undead, or anything else that doesn't.
export type NeedsFood = Partial<Record<HolderId, boolean>>;
export type LastRest = Partial<Record<HolderId, { at: number; actor: string }>>;
// Senchez is the bag, not a boarder: he carries the rations, he has never
// once eaten one. Not a setting — there's nothing to toggle.
export const eatsFood = (needs: NeedsFood, id: HolderId): boolean => id !== 'senchez' && needs[id] !== false;
export const DEFAULT_HOLDER_NAMES: Record<HolderId, string> = Object.fromEntries(
  HOLDERS.map((h) => [h.id, h.name])
) as Record<HolderId, string>;
export function applyHolderNames(names: Names): void {
  for (const h of HOLDERS) h.name = names[h.id] ?? DEFAULT_HOLDER_NAMES[h.id];
}

export const ATTUNEMENT_SLOTS = 3;

export type CategoryKey = 'gear' | 'accessory' | 'consumable' | 'arcana' | 'supplies' | 'papers' | 'treasure' | 'other' | '';

export interface ItemCategory {
  key: CategoryKey;
  name: string;
  emoji: string;
  subtypes: string[];
}

export const CATEGORIES: ItemCategory[] = [
  { key: 'gear', name: 'Gear', emoji: '⚔️', subtypes: ['weapon', 'armor', 'shield', 'ammunition'] },
  { key: 'accessory', name: 'Accessories', emoji: '💍', subtypes: ['ring', 'cloak', 'boots', 'belt', 'headwear', 'amulet', 'gloves'] },
  { key: 'consumable', name: 'Consumables', emoji: '🧪', subtypes: ['potion', 'scroll', 'food & drink', 'alchemical'] },
  { key: 'arcana', name: 'Arcana', emoji: '🪄', subtypes: ['wand', 'staff', 'rod', 'focus', 'spellbook'] },
  { key: 'supplies', name: 'Supplies', emoji: '🎒', subtypes: ['tool', 'container', 'camp gear', 'instrument'] },
  { key: 'papers', name: 'Information', emoji: '📜', subtypes: ['note', 'map', 'deed', 'book'] },
  { key: 'treasure', name: 'Treasure', emoji: '👑', subtypes: ['gems', 'art'] },
  { key: 'other', name: 'Other', emoji: '❔', subtypes: [] },
];

export const categoryOf = (key: CategoryKey): ItemCategory | undefined => CATEGORIES.find((c) => c.key === key);
export const categoryLabel = (category: CategoryKey, subtype: string): string =>
  subtype || categoryOf(category)?.name.toLowerCase() || '';

// Name-flavored icons first, then category/subtype defaults.
const NAME_ICONS: Array<[RegExp, string]> = [
  [/sword|blade|scimitar|rapier|dagger|defender/, '🗡️'],
  [/axe|battleaxe|greataxe|handaxe/, '🪓'],
  [/hammer|maul|mace|club|morningstar|flail|thunderbolts/, '🔨'],
  [/bow|longbow|shortbow|crossbow|sling|oathbow|arrow|ammunition/, '🏹'],
  [/trident/, '🔱'],
  [/crown/, '👑'],
  [/helm|circlet|headband/, '🪖'],
  [/goggles|eyes of/, '🥽'],
  [/horn of/, '📯'],
  [/key/, '🗝️'],
  [/lantern/, '🏮'],
  [/torch|candle/, '🕯️'],
  [/rope/, '🪢'],
  [/mirror/, '🪞'],
  [/crystal ball|orb|pearl/, '🔮'],
  [/deck of/, '🃏'],
  [/figurine|statue|stone golem/, '🗿'],
  [/feather/, '🪶'],
  [/bead|necklace|medallion|periapt|talisman|scarab|amulet|brooch/, '📿'],
  [/map/, '🗺️'],
];

const SUBTYPE_ICONS: Record<string, string> = {
  'weapon': '⚔️', 'armor': '🛡️', 'shield': '🛡️', 'ammunition': '🏹',
  'ring': '💍', 'cloak': '🧥', 'boots': '🥾', 'belt': '➰', 'headwear': '🎩', 'amulet': '📿', 'gloves': '🧤',
  'potion': '🧪', 'scroll': '📜', 'food & drink': '🍖', 'alchemical': '⚗️',
  'wand': '🪄', 'staff': '🦯', 'rod': '🪄', 'focus': '🔮', 'spellbook': '📖',
  'tool': '🛠️', 'container': '🎒', 'camp gear': '🏕️', 'instrument': '🪕',
  'note': '📝', 'map': '🗺️', 'deed': '📜', 'book': '📕', 'gems': '💎', 'art': '🏺',
};

const CATEGORY_ICONS: Record<string, string> = {
  gear: '⚔️', accessory: '💍', consumable: '🧪', arcana: '🪄', supplies: '🎒', papers: '📜', treasure: '👑', other: '📦',
};

export function defaultIcon(category: CategoryKey, subtype: string, name: string): string {
  const n = name.toLowerCase();
  for (const [re, icon] of NAME_ICONS) if (re.test(n)) return icon;
  return SUBTYPE_ICONS[subtype] || CATEGORY_ICONS[category] || '📦';
}

export const itemIcon = (i: Pick<Item, 'icon' | 'category' | 'subtype' | 'name'>): string =>
  i.icon || defaultIcon(i.category, i.subtype, i.name);

// Each kind of item gets the fields that make sense for it up front; the
// rest wait under "More options". A field in neither list is hidden and
// scrubbed on save. "Other"/unset subtypes get the full generic form.
export type FormField = 'rarity' | 'weight' | 'value' | 'magic' | 'attunement' | 'content' | 'fungible' | 'freshness';
export interface FormPlan { primary: FormField[]; advanced: FormField[] }

const GENERIC: FormPlan = { primary: ['rarity', 'weight', 'value', 'magic', 'attunement'], advanced: [] };
const PAPERY = ['note', 'map', 'deed'];

// Perishables are usually food, but a harvested liver, a body under Gentle
// Repose, or a writ with a deadline all tick down the same way — so every
// plan offers the field, buried under "More options" unless it's food.
export const isFood = (category: CategoryKey, subtype: string): boolean =>
  category === 'consumable' && subtype === 'food & drink';

export function formPlan(category: CategoryKey, subtype: string): FormPlan {
  const p = basePlan(category, subtype);
  if (p.primary.includes('freshness') || p.advanced.includes('freshness')) return p;
  return { primary: p.primary, advanced: [...p.advanced, 'freshness'] };
}

function basePlan(category: CategoryKey, subtype: string): FormPlan {
  switch (category) {
    case 'papers':
      if (PAPERY.includes(subtype)) return { primary: ['content'], advanced: ['rarity', 'value', 'magic'] };
      if (subtype === 'book') return { primary: ['content', 'weight'], advanced: ['rarity', 'value', 'magic', 'attunement'] };
      return { primary: ['content', ...GENERIC.primary], advanced: [] };
    case 'treasure':
      // gems can opt out of the purse's worth figures (saved for a spell, not spendable)
      if (subtype === 'gems') return { primary: ['value', 'weight', 'fungible'], advanced: ['rarity', 'magic'] };
      if (subtype === 'art') return { primary: ['value', 'weight'], advanced: ['rarity', 'magic'] };
      return { primary: ['value', 'weight', 'rarity', 'magic', 'attunement'], advanced: [] };
    case 'consumable':
      // nothing you drink or throw requires attunement
      if (subtype === 'food & drink') return { primary: ['weight', 'freshness'], advanced: ['rarity', 'value', 'magic'] };
      if (subtype) return { primary: ['rarity'], advanced: ['weight', 'value', 'magic'] };
      return GENERIC;
    case 'gear':
      // damage stats carry a weapon's identity; rarity and weight are afterthoughts
      if (subtype === 'weapon') return { primary: ['attunement'], advanced: ['rarity', 'weight', 'value', 'magic'] };
      // ammunition virtually never attunes — tuck it away
      if (subtype === 'ammunition') return { primary: [], advanced: ['rarity', 'weight', 'value', 'magic', 'attunement'] };
      if (subtype === 'armor' || subtype === 'shield') return { primary: ['weight', 'attunement'], advanced: ['rarity', 'value', 'magic'] };
      return GENERIC;
    case 'accessory':
    case 'arcana':
      return subtype ? { primary: ['rarity', 'attunement'], advanced: ['weight', 'value', 'magic'] } : GENERIC;
    case 'supplies':
      return subtype ? { primary: ['weight'], advanced: ['rarity', 'value', 'magic', 'attunement'] } : GENERIC;
    default:
      return GENERIC;
  }
}

export function planHas(category: CategoryKey, subtype: string, field: FormField): boolean {
  const p = formPlan(category, subtype);
  return p.primary.includes(field) || p.advanced.includes(field);
}

// Type-specific mechanics: which stat controls each kind of item shows,
// and whether up front or under More options. 'stealthStr' bundles the
// stealth-disadvantage check with the Str requirement; 'charges' bundles
// current/max/recharge. Cursed rides along wherever magic does.
export type StatField =
  | 'heal'
  | 'dmg' | 'dtype' | 'bonus' | 'properties'
  | 'ac' | 'armorClass' | 'stealthStr'
  | 'charges' | 'spells' | 'spell' | 'spellLevel' | 'dc'
  | 'capacity' | 'language' | 'cursed';
export interface StatPlan { primary: StatField[]; advanced: StatField[] }

export function statPlan(category: CategoryKey, subtype: string): StatPlan {
  const plan: StatPlan = (() => {
    if (category === 'gear') {
      if (subtype === 'weapon' || subtype === 'ammunition') return { primary: ['dmg', 'dtype', 'bonus'], advanced: ['properties'] };
      if (subtype === 'armor') return { primary: ['ac', 'armorClass'], advanced: ['stealthStr'] };
      if (subtype === 'shield') return { primary: ['ac'], advanced: [] };
      return { primary: [], advanced: [] };
    }
    // staffs and rods double as weapons (Staff of Striking, Rod of Lordly Might)
    if (category === 'arcana' && (subtype === 'staff' || subtype === 'rod')) return { primary: ['charges', 'spells'], advanced: ['dmg', 'dtype', 'bonus'] };
    if (category === 'arcana' && (subtype === 'wand' || subtype === 'focus')) return { primary: ['charges', 'spells'], advanced: [] };
    if (category === 'arcana' && subtype === 'spellbook') return { primary: ['spells'], advanced: [] };
    // accessories with an AC rider (Cloak of Protection, Bracers of Defense)
    if (category === 'accessory' && subtype) return { primary: [], advanced: ['ac'] };
    // harmful potions exist too (Potion of Poison)
    if (category === 'consumable' && subtype === 'potion') return { primary: ['heal'], advanced: ['dmg', 'dc'] };
    if (category === 'consumable' && subtype === 'food & drink') return { primary: [], advanced: ['heal'] };
    if (category === 'consumable' && subtype === 'scroll') return { primary: ['spell', 'spellLevel', 'dc'], advanced: [] };
    if (category === 'consumable' && subtype === 'alchemical') return { primary: ['dmg', 'dc'], advanced: ['heal'] };
    if (category === 'supplies' && subtype === 'container') return { primary: ['capacity'], advanced: [] };
    if (category === 'papers') return { primary: [], advanced: ['language'] };
    return { primary: [], advanced: [] };
  })();
  // Plenty of items beyond arcana cast spells (Luck Blade, Cloak of the Bat,
  // Instrument of the Bards) — everything except consumables, papers, and
  // treasure offers the charges + spells pair, tucked under More options
  // wherever the plan above didn't already surface it.
  if (!['consumable', 'papers', 'treasure', ''].includes(category)) {
    for (const f of ['charges', 'spells'] as const) {
      if (!plan.primary.includes(f) && !plan.advanced.includes(f)) plan.advanced.push(f);
    }
  }
  if (planHas(category, subtype, 'magic')) plan.advanced.push('cursed');
  return plan;
}

export const hidesWeight = (category: CategoryKey, subtype: string): boolean => !planHas(category, subtype, 'weight');
export const hidesAttunement = (category: CategoryKey, subtype: string): boolean => !planHas(category, subtype, 'attunement');

export const notesLabel = (category: CategoryKey, subtype: string): string =>
  category === 'papers' && (PAPERY.includes(subtype) || subtype === 'book') ? 'What it looks like' : 'Notes';

// Maps the old flat type strings (and "wondrous item" by name) onto the
// category/subtype taxonomy. Used to migrate stored items and the catalogue.
export function classifyLegacy(type: string, name: string): { category: CategoryKey; subtype: string } {
  const direct: Record<string, [CategoryKey, string]> = {
    'weapon': ['gear', 'weapon'], 'armor': ['gear', 'armor'], 'shield': ['gear', 'shield'],
    'ammunition': ['gear', 'ammunition'], 'ring': ['accessory', 'ring'],
    'potion': ['consumable', 'potion'], 'scroll': ['consumable', 'scroll'],
    'wand': ['arcana', 'wand'], 'staff': ['arcana', 'staff'], 'rod': ['arcana', 'rod'],
    'tool': ['supplies', 'tool'], 'gear': ['supplies', ''], 'treasure': ['treasure', 'gems'],
    'other': ['other', ''],
  };
  const key = (type || '').toLowerCase();
  const hit = direct[key];
  if (hit) return { category: hit[0], subtype: hit[1] };
  if (key !== 'wondrous item' && key !== '') return { category: 'other', subtype: '' };
  const n = name.toLowerCase();
  const rules: Array<[RegExp, CategoryKey, string]> = [
    [/boots|slipper/, 'accessory', 'boots'],
    [/cloak|cape|mantle|robe|wings of flying/, 'accessory', 'cloak'],
    [/belt of/, 'accessory', 'belt'],
    [/helm|hat|circlet|headband|goggles|eyes of|crown/, 'accessory', 'headwear'],
    [/amulet|necklace|medallion|periapt|brooch|talisman/, 'accessory', 'amulet'],
    [/gauntlet|glove|bracer/, 'accessory', 'gloves'],
    [/ring of/, 'accessory', 'ring'],
    [/dust of|bead of|elemental gem|feather token|ointment|oil of/, 'consumable', 'alchemical'],
    [/crystal ball|pearl of power|orb/, 'arcana', 'focus'],
    [/manual|tome|book|libram/, 'papers', 'book'],
    [/bag of|haversack|quiver|bottle|decanter|jug|flask|portable hole/, 'supplies', 'container'],
    [/rope of|lantern|driftglobe|candle|lamp of/, 'supplies', 'camp gear'],
    [/instrument|pipes of|horn of/, 'supplies', 'instrument'],
  ];
  for (const [re, category, subtype] of rules) if (re.test(n)) return { category, subtype };
  return { category: 'other', subtype: '' };
}

export const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] as const;

export const DAMAGE_TYPES = [
  'slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'lightning', 'thunder',
  'acid', 'poison', 'necrotic', 'radiant', 'force', 'psychic',
] as const;

// One page of a journal-style item: a dated jot with an optional title
// and an optional sketch (compressed like item photos).
export interface JournalEntry {
  id: string;
  at: number;
  title?: string;
  text: string;
  image?: string;
}

// Information items (notebooks, maps, deeds…) can accumulate entries.
export const canJournal = (category: CategoryKey): boolean => category === 'papers';

export interface Item {
  id: string;
  name: string;
  icon?: string;   // chosen emoji; display falls back to defaultIcon()
  image?: string;  // small data-URL photo (compressed client-side)
  content?: string; // papery items: the text written on the thing
  entries?: JournalEntry[]; // papery items: appended journal entries
  stats?: ItemStats; // type-specific mechanics (damage, AC, charges, …)
  category: CategoryKey;
  subtype: string;
  rarity: string;
  qty: number;
  weight: number | null;
  value: string;
  // gems: whether the value counts toward the purse's worth (default yes;
  // false = set aside, e.g. a diamond saved for a spell)
  fungible?: boolean;
  // equipment packs: remaining component items, individually removable
  pack?: Array<{ name: string; qty: number }>;
  // liquid containers (waterskins, bottles, vials…): what's inside right now
  liquid?: { name: string; doses: number };
  // food only: long rests in its inventory tick this down; 0 = spoiled.
  // Absent = keeps forever (jerky, hardtack, iron rations). freshnessMax
  // remembers how long it kept when new, so the gauge shows a fraction.
  freshness?: number;
  freshnessMax?: number;
  // said "not yet" once when its last day came due; the next rest is final
  graced?: boolean;
  magic: boolean;
  requiresAttunement: boolean;
  attuned: boolean;
  location: HolderId;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface LogEntry {
  id: string;
  ts: number;
  actor: string;
  text: string;
}

export type Gold = Record<HolderId, number>;
export type Icons = Partial<Record<HolderId, string>>;
// Holder portraits: compressed data-URL photos, like item pictures.
export type Portraits = Partial<Record<HolderId, string>>;

// Standard 5e exchange rate: 1 platinum = 10 gold.
export const PP_IN_GP = 10;

// "500 gp", "2,500gp", "5 pp" — money-looking item values, converted to gp.
// Prose ("priceless?") returns null and simply doesn't count.
export function parseGoldValue(v: string): number | null {
  const m = v.trim().replace(/,/g, '').match(/^(\d+)\s*(gp|gold|pp|plat|platinum)?\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!n) return null;
  return (m[2] ?? 'gp').toLowerCase().startsWith('g') ? n : n * PP_IN_GP;
}

// "1,000 gp" on a stack of two rubies is ambiguous — each, or the lot?
// Weight has always said "each · total"; value should too, whenever the
// number is one we can actually multiply. Prose values ("priceless", "a
// king's ransom") are left exactly as written.
export function valueParts(value: string, qty: number): { compact: string; full: string } {
  if (!value) return { compact: '', full: '' };
  const each = parseGoldValue(value);
  if (qty <= 1 || each === null) return { compact: value, full: value };
  // totals are gp-equivalent everywhere else in the app, so they are here too
  return { compact: `${value} ea.`, full: `${value} each · ${(each * qty).toLocaleString()} gp total` };
}

import type { CatalogItem, ItemStats } from './catalog';
import type { SpellRef } from './spellIndex';

export type { ItemStats } from './catalog';

export interface AppState {
  items: Item[];
  log: LogEntry[];
  gold: Gold;
  platinum: Gold;
  icons: Icons;
  portraits: Portraits;
  names: Names;
  needsFood: NeedsFood;
  // when each holder last took a long rest, and who pressed it — anyone can
  // rest Senchez, so the dialog can say whether someone already has
  lastRest: LastRest;
  custom: CatalogItem[];
  spellbook: SpellRef[];
}

// A holder's icon: their chosen one, falling back to the default emoji.
export const holderIcon = (icons: Icons, h: Holder): string => icons[h.id] || h.emoji;

// An item counts as "magic" for filtering if flagged, or if it has any rarity
// above common, or if it needs attunement.
export const isMagic = (i: Item) =>
  i.magic || i.requiresAttunement || (i.rarity !== '' && i.rarity !== 'common');
