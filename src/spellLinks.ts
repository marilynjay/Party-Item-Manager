// Matching logic for the 2014 spell compendium: which item names and which
// stretches of prose earn a tappable lookup card. Hand-written — the data it
// leans on (spellIndex.ts / spells2014.ts) is generated.
import { SPELL_NAMES } from './spellIndex';

const pad = (t: string) => ' ' + t.toLowerCase().replace(/[^a-z']+/g, ' ') + ' ';
// "Fireballs" → "fireball", so plural item names still find their spell
const depluralize = (t: string) => t.replace(/s\b/g, '');

// Longest known spell name appearing as whole words inside the text, or null.
export function findSpellInText(text: string): string | null {
  const p = pad(text);
  const p2 = pad(depluralize(text));
  let best: string | null = null;
  for (const key of SPELL_NAMES.keys()) {
    const needle = ' ' + key + ' ';
    if ((p.includes(needle) || p2.includes(needle)) && (!best || key.length > best.length)) best = key;
  }
  return best;
}

// A scroll matches anywhere in its name ("Spell Scroll: Fireball"); anything
// else only after " of " ("Wand of Fireballs", "Ring of Invisibility") so
// mundane names like "Light Crossbow" or "Shield, +1" stay quiet.
export function findSpellForItem(name: string, subtype: string): string | null {
  if (subtype === 'scroll') return findSpellInText(name);
  const i = name.toLowerCase().indexOf(' of ');
  return i < 0 ? null : findSpellInText(name.slice(i + 4));
}

// Split prose into plain-text and spell tokens. Only the compendium's exact
// casing links ("Magic Missile", the way the books write it) — matching
// lowercase too would underline half the rules text ("sheds bright light").
export interface SpellToken {
  text: string;
  spell?: string;
}

let SPELL_RE: RegExp | null = null;

export function tokenizeSpells(text: string): SpellToken[] {
  if (!SPELL_RE) {
    const names = [...SPELL_NAMES.values()]
      .sort((a, b) => b.length - a.length)
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    SPELL_RE = new RegExp(`\\b(?:${names.join('|')})\\b`, 'g');
  }
  const out: SpellToken[] = [];
  let last = 0;
  for (const m of text.matchAll(SPELL_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ text: m[0], spell: m[0].toLowerCase() });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
