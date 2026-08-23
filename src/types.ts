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

export const BAG_CAPACITY_LB = 500;
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
export type FormField = 'rarity' | 'weight' | 'value' | 'magic' | 'attunement' | 'content';
export interface FormPlan { primary: FormField[]; advanced: FormField[] }

const GENERIC: FormPlan = { primary: ['rarity', 'weight', 'value', 'magic', 'attunement'], advanced: [] };
const PAPERY = ['note', 'map', 'deed'];

export function formPlan(category: CategoryKey, subtype: string): FormPlan {
  switch (category) {
    case 'papers':
      if (PAPERY.includes(subtype)) return { primary: ['content'], advanced: ['rarity', 'value', 'magic'] };
      if (subtype === 'book') return { primary: ['content', 'weight'], advanced: ['rarity', 'value', 'magic', 'attunement'] };
      return { primary: ['content', ...GENERIC.primary], advanced: [] };
    case 'treasure':
      if (subtype === 'gems' || subtype === 'art') return { primary: ['value', 'weight'], advanced: ['rarity', 'magic', 'attunement'] };
      return { primary: ['value', 'weight', 'rarity', 'magic', 'attunement'], advanced: [] };
    case 'consumable':
      if (subtype === 'food & drink') return { primary: ['weight'], advanced: ['rarity', 'value', 'magic'] };
      if (subtype) return { primary: ['rarity'], advanced: ['weight', 'value', 'magic', 'attunement'] };
      return GENERIC;
    case 'gear':
      return subtype ? { primary: ['rarity', 'weight', 'attunement'], advanced: ['value', 'magic'] } : GENERIC;
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

export interface Item {
  id: string;
  name: string;
  icon?: string;   // chosen emoji; display falls back to defaultIcon()
  image?: string;  // small data-URL photo (compressed client-side)
  content?: string; // papery items: the text written on the thing
  category: CategoryKey;
  subtype: string;
  rarity: string;
  qty: number;
  weight: number | null;
  value: string;
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

// Standard 5e exchange rate: 1 platinum = 10 gold.
export const PP_IN_GP = 10;

import type { CatalogItem } from './catalog';

export interface AppState {
  items: Item[];
  log: LogEntry[];
  gold: Gold;
  platinum: Gold;
  icons: Icons;
  custom: CatalogItem[];
}

// A holder's icon: their chosen one, falling back to the default emoji.
export const holderIcon = (icons: Icons, h: Holder): string => icons[h.id] || h.emoji;

// An item counts as "magic" for filtering if flagged, or if it has any rarity
// above common, or if it needs attunement.
export const isMagic = (i: Item) =>
  i.magic || i.requiresAttunement || (i.rarity !== '' && i.rarity !== 'common');
