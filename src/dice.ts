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
