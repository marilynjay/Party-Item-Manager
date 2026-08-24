// The party spellbook: player-entered spells (paid content the table owns,
// homebrew) layered over the generated SRD index. The entries live in app
// state (`spellbook` in api.ts — one more collection in the same blob a
// future server would sync) and are stamped into this module at load time,
// applyHolderNames-style, so every matching helper sees them without prop
// threading. Custom entries win name collisions with the SRD.
import type { SpellRef } from './spellIndex';
import { SPELL_NAMES } from './spellIndex';

let EXTRA = new Map<string, SpellRef>();
let stamp = 0; // bumped per apply so cached regexes know to rebuild

export function applySpellbook(spells: SpellRef[]): void {
  EXTRA = new Map(spells.map((s) => [s.n.trim().toLowerCase(), s]));
  stamp++;
}

export const spellbookStamp = (): number => stamp;

export const customSpell = (name: string): SpellRef | undefined => EXTRA.get(name.trim().toLowerCase());

export const spellKnown = (name: string): boolean => {
  const k = name.trim().toLowerCase();
  return EXTRA.has(k) || SPELL_NAMES.has(k);
};

export const spellDisplay = (name: string): string | undefined => {
  const k = name.trim().toLowerCase();
  return EXTRA.get(k)?.n ?? SPELL_NAMES.get(k);
};

// lowercase key → display name across both books.
export function allSpellNames(): Map<string, string> {
  const m = new Map(SPELL_NAMES);
  for (const [k, s] of EXTRA) m.set(k, s.n);
  return m;
}
