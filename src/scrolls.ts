// "Scroll of Fireball" and its 318 siblings, invented on demand.
//
// Every spell name already ships in the main bundle (spellIndex.ts), so
// these cost no stored data: type "scroll of fi" and the add form conjures
// catalogue entries for the matching spells, complete with the SRD spell
// scroll table's rarity, save DC and attack bonus. They stay invisible
// otherwise — not in Browse, not in ordinary searches — so the catalogue
// isn't drowned in scrolls nobody is looking for. Spells the party added to
// their own spellbook come along for free.
import type { CatalogItem } from './catalog';
import { SPELL_LEVELS } from './spellIndex';
import { allSpellNames, customSpell } from './spellbook';

const LEVEL_LABEL = ['cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

// The SRD's spell scroll table, indexed by spell level.
const SCROLL_TABLE: Array<{ rarity: string; dc: string }> = [
  { rarity: 'common', dc: 'DC 13, +5' },      // cantrip
  { rarity: 'common', dc: 'DC 13, +5' },      // 1st
  { rarity: 'uncommon', dc: 'DC 13, +5' },    // 2nd
  { rarity: 'uncommon', dc: 'DC 15, +7' },    // 3rd
  { rarity: 'rare', dc: 'DC 15, +7' },        // 4th
  { rarity: 'rare', dc: 'DC 17, +9' },        // 5th
  { rarity: 'very rare', dc: 'DC 17, +9' },   // 6th
  { rarity: 'very rare', dc: 'DC 18, +10' },  // 7th
  { rarity: 'very rare', dc: 'DC 18, +10' },  // 8th
  { rarity: 'legendary', dc: 'DC 19, +11' },  // 9th
];

// "Level 3 Evocation (Wizard)" → 3; the party's own spells carry the same
// meta format, so homebrew and paid-content scrolls size themselves too.
const levelOf = (display: string): number => {
  const key = display.trim().toLowerCase();
  const srd = SPELL_LEVELS.get(key);
  if (srd !== undefined) return srd;
  const m = /^Level (\d)/.exec(customSpell(key)?.m ?? '');
  return m ? Number(m[1]) : 0;
};

export function scrollFor(display: string): CatalogItem {
  const level = levelOf(display);
  const { rarity, dc } = SCROLL_TABLE[level] ?? SCROLL_TABLE[0];
  return {
    name: `Scroll of ${display}`,
    category: 'consumable',
    subtype: 'scroll',
    rarity,
    magic: true,
    requiresAttunement: false,
    weight: null,
    stats: { spell: display, spellLevel: LEVEL_LABEL[level], dc },
    rules: `Cast ${display} from the scroll — then it crumbles to ash.`,
  };
}

// Matches "scroll of fi", "Spell Scroll of Fireball", "scrolls of fire".
const SCROLL_QUERY = /^(?:spell\s+)?scrolls?\s+of\s*(.*)$/;

export function scrollSuggestions(query: string, limit = 6): CatalogItem[] {
  const m = SCROLL_QUERY.exec(query.trim().toLowerCase());
  if (!m) return [];
  const rest = m[1].trim();
  const starts: string[] = [];
  const contains: string[] = [];
  for (const [key, display] of allSpellNames()) {
    if (!rest || key.startsWith(rest)) starts.push(display);
    else if (key.includes(rest)) contains.push(display);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit).map(scrollFor);
}
