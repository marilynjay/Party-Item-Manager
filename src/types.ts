export type HolderId = 'yiptik' | 'radish' | 'tuffany' | 'astrielle' | 'hyrroh' | 'senchez';

export interface Holder {
  id: HolderId;
  name: string;
  kind: 'member' | 'bag';
  emoji: string;
}

export const HOLDERS: Holder[] = [
  { id: 'yiptik', name: 'Yiptik', kind: 'member', emoji: '🗡️' },
  { id: 'radish', name: 'Radish', kind: 'member', emoji: '🛡️' },
  { id: 'tuffany', name: 'Tuffany', kind: 'member', emoji: '🏹' },
  { id: 'astrielle', name: 'Astrielle', kind: 'member', emoji: '✨' },
  { id: 'hyrroh', name: 'Hyrroh', kind: 'member', emoji: '🪓' },
  { id: 'senchez', name: 'Senchez', kind: 'bag', emoji: '🎒' },
];

export const MEMBERS = HOLDERS.filter((h) => h.kind === 'member');
export const holderById = (id: HolderId): Holder => HOLDERS.find((h) => h.id === id)!;

export const BAG_CAPACITY_LB = 500;
export const ATTUNEMENT_SLOTS = 3;

export const ITEM_TYPES = [
  'weapon', 'armor', 'shield', 'potion', 'scroll', 'wand', 'ring', 'rod', 'staff',
  'wondrous item', 'ammunition', 'gear', 'tool', 'treasure', 'other',
] as const;

export const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] as const;

export interface Item {
  id: string;
  name: string;
  type: string;
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

export interface AppState {
  items: Item[];
  log: LogEntry[];
  gold: Gold;
}

// An item counts as "magic" for filtering if flagged, or if it has any rarity
// above common, or if it needs attunement.
export const isMagic = (i: Item) =>
  i.magic || i.requiresAttunement || (i.rarity !== '' && i.rarity !== 'common');
