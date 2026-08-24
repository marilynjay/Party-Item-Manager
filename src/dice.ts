// "2d4+2" style formulas: parse, roll, and describe.
export interface ParsedRoll { n: number; d: number; mod: number }
export interface RollResult { rolls: number[]; mod: number; total: number }

export function parseRoll(formula: string): ParsedRoll | null {
  const m = formula.trim().toLowerCase().replace(/\s+/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const d = parseInt(m[2], 10);
  if (!n || !d || n > 40) return null;
  return { n, d, mod: m[3] ? parseInt(m[3], 10) : 0 };
}

// Just the dice from a recharge phrase: "1d6+1 at dawn" → "1d6+1".
export const diceText = (text: string): string =>
  text.match(/\d+d\d+(\s*[+-]\s*\d+)?/)?.[0].replace(/\s+/g, '') ?? text.trim();

// A dice formula buried in prose ("1d6+1 at dawn") — the first one found.
export function findRoll(text: string): ParsedRoll | null {
  const m = text.toLowerCase().match(/(\d+)d(\d+)(\s*[+-]\s*\d+)?/);
  if (!m) return null;
  return parseRoll(`${m[1]}d${m[2]}${m[3] ? m[3].replace(/\s+/g, '') : ''}`);
}

export function rollDice(p: ParsedRoll): RollResult {
  const rolls = Array.from({ length: p.n }, () => 1 + Math.floor(Math.random() * p.d));
  const total = rolls.reduce((s, r) => s + r, 0) + p.mod;
  return { rolls, mod: p.mod, total };
}

// "Awaken — 5" / "Cure Wounds 1" / "Light" → name + charge cost (default 1).
export interface SpellLine { name: string; cost: number }

export function parseSpellLines(text: string): SpellLine[] {
  return text
    .split('\n')
    .map((raw) => raw.trim().replace(/^[-•·]\s*/, ''))
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)[\s—–:-]*(\d+)\s*(?:charges?)?$/i);
      if (m && m[1].trim()) return { name: m[1].trim(), cost: Math.max(1, parseInt(m[2], 10)) };
      return { name: line.replace(/[\s—–:-]+$/, ''), cost: 1 };
    });
}
