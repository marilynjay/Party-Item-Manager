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
      return { name: line, cost: 1 };
    });
}
