import { AutoTextarea } from './AutoTextarea';
import { useMemo, useRef, useState } from 'react';
import type { ItemStats, StatField } from '../types';
import { DAMAGE_TYPES } from '../types';
import { allSpellNames, spellKnown } from '../spellbook';
import { parseSpellLines } from '../dice';

// Strip empty values; undefined result means "no stats worth storing".
export function cleanStats(stats: ItemStats, allowed: StatField[]): ItemStats | undefined {
  const out: ItemStats = {};
  const has = (f: StatField) => allowed.includes(f);
  if (has('heal') && stats.heal?.trim()) out.heal = stats.heal.trim();
  if (has('dmg') && stats.dmg?.trim()) out.dmg = stats.dmg.trim();
  if (has('dtype') && stats.dtype) out.dtype = stats.dtype;
  if (has('bonus') && stats.bonus) out.bonus = stats.bonus;
  if (has('properties') && stats.properties?.trim()) out.properties = stats.properties.trim();
  if (has('ac') && stats.ac?.trim()) out.ac = stats.ac.trim();
  if (has('armorClass') && stats.armorClass) out.armorClass = stats.armorClass;
  if (has('stealthStr')) {
    if (stats.stealthDis) out.stealthDis = true;
    if (stats.strReq?.trim()) out.strReq = stats.strReq.trim();
  }
  if (has('charges')) {
    if (stats.chargesMax !== undefined) out.chargesMax = stats.chargesMax;
    if (stats.charges !== undefined) out.charges = stats.charges;
    else if (stats.chargesMax !== undefined) out.charges = stats.chargesMax;
    if (stats.recharge?.trim()) out.recharge = stats.recharge.trim();
  }
  if (has('spells') && stats.spells?.trim()) out.spells = stats.spells.trim();
  if (has('spell') && stats.spell?.trim()) out.spell = stats.spell.trim();
  if (has('spellLevel') && stats.spellLevel) out.spellLevel = stats.spellLevel;
  if (has('dc') && stats.dc?.trim()) out.dc = stats.dc.trim();
  if (has('capacity') && stats.capacity?.trim()) out.capacity = stats.capacity.trim();
  if (has('language') && stats.language?.trim()) out.language = stats.language.trim();
  if (has('cursed') && stats.cursed) {
    out.cursed = true;
    if (stats.curseText?.trim()) out.curseText = stats.curseText.trim();
  }
  return Object.keys(out).length ? out : undefined;
}

const SPELL_LEVELS = ['cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

// Compendium (and party spellbook) names matching what's been typed so far;
// names that start with the query come first. Shared by the single-spell
// field on scrolls and the per-row names in the spells list.
function spellMatches(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2 || spellKnown(q)) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const [key, display] of allSpellNames()) {
    if (key.startsWith(q)) starts.push(display);
    else if (key.includes(q)) contains.push(display);
  }
  return [...starts, ...contains].slice(0, 5);
}

// A live ✓/? beside a typed spell name: in the book, or your own words.
const spellMark = (name: string) =>
  !name.trim() ? null : spellKnown(name) ? (
    <span className="spell-check known" title="In the compendium — tappable to read in play">✓</span>
  ) : (
    <span className="spell-check muted" title="Not in the compendium — stays plain text (add it from 📖 if you own it)">?</span>
  );

// One spell, for the things that carry exactly one — a scroll. Same
// autocomplete as the spells list, no charge cost, and anything you type
// is accepted whether the book knows it or not.
function SpellNameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => (open ? spellMatches(value) : []), [value, open]);
  return (
    <label className="wide spell-one">
      Spell
      <span className="spell-one-row">
        <input
          placeholder="e.g. Polymorph"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {spellMark(value)}
      </span>
      {matches.length > 0 && (
        <span className="spell-suggest">
          {matches.map((m) => (
            <button
              key={m}
              type="button"
              className="chip"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(m);
                setOpen(false);
              }}
            >
              {m}
            </button>
          ))}
        </span>
      )}
    </label>
  );
}

// Spells entry as one row per spell — a name field (with compendium
// autocomplete and a live ✓/? match mark) plus a small charge-cost field,
// and a ＋ Spell button for more rows. Storage stays the "Name — cost"
// text lines the rest of the app reads, so this is purely an editor view.
interface SpellRow {
  name: string;
  cost: string;
}

const rowsFromValue = (value: string): SpellRow[] =>
  parseSpellLines(value).map((sp) => ({ name: sp.name, cost: String(sp.cost) }));

const serializeRows = (rows: SpellRow[]): string =>
  rows
    .filter((r) => r.name.trim())
    .map((r) => `${r.name.trim()} — ${Math.max(1, parseInt(r.cost, 10) || 1)}`)
    .join('\n');

function SpellsField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // start with one empty row, so the field looks like somewhere to type
  // rather than a lone ＋ link nobody notices
  const [rows, setRows] = useState<SpellRow[]>(() => {
    const parsed = rowsFromValue(value);
    return parsed.length ? parsed : [{ name: '', cost: '' }];
  });
  const [focused, setFocused] = useState(-1);
  const nameRefs = useRef<Array<HTMLInputElement | null>>([]);
  const costRefs = useRef<Array<HTMLInputElement | null>>([]);

  const commit = (next: SpellRow[]) => {
    setRows(next);
    onChange(serializeRows(next));
  };
  const update = (i: number, patch: Partial<SpellRow>) => commit(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => commit(rows.filter((_, j) => j !== i));
  const addRow = () => {
    setRows([...rows, { name: '', cost: '' }]);
    requestAnimationFrame(() => nameRefs.current[rows.length]?.focus());
  };

  const matches = useMemo(() => spellMatches(rows[focused]?.name ?? ''), [rows, focused]);

  const complete = (i: number, display: string) => {
    update(i, { name: display });
    requestAnimationFrame(() => {
      const cost = costRefs.current[i];
      if (cost) {
        cost.focus();
        cost.select();
      }
    });
    setFocused(-1);
  };

  return (
    <div className="wide spell-field">
      <span className="spell-field-label">
        Spells <span className="muted">— cost in ⚡ charges</span>
      </span>
      {rows.map((r, i) => (
        <span key={i} className="spell-edit-wrap">
          <span className="spell-edit-row">
            <input
              ref={(el) => { nameRefs.current[i] = el; }}
              className="spell-name-input"
              placeholder="Spell name"
              value={r.name}
              onChange={(e) => update(i, { name: e.target.value })}
              onFocus={() => setFocused(i)}
              onBlur={() => setTimeout(() => setFocused((f) => (f === i ? -1 : f)), 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  costRefs.current[i]?.focus();
                }
              }}
            />
            {spellMark(r.name)}
            <input
              ref={(el) => { costRefs.current[i] = el; }}
              className="spell-cost-input"
              type="number"
              min={1}
              placeholder="1"
              title="Charge cost"
              value={r.cost}
              onChange={(e) => update(i, { cost: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addRow();
                }
              }}
            />
            <button type="button" className="link-button spell-remove" title="Remove this spell" onClick={() => remove(i)}>
              ✕
            </button>
          </span>
          {focused === i && matches.length > 0 && (
            <span className="spell-suggest">
              {matches.map((m) => (
                <button key={m} type="button" className="chip" onMouseDown={(e) => e.preventDefault()} onClick={() => complete(i, m)}>
                  {m}
                </button>
              ))}
            </span>
          )}
        </span>
      ))}
      <button type="button" className="link-button spell-add" onClick={addRow}>
        ＋ Spell
      </button>
    </div>
  );
}

interface Props {
  field: StatField;
  stats: ItemStats;
  onChange: (patch: Partial<ItemStats>) => void;
}

export function StatFieldControl({ field, stats: s, onChange }: Props) {
  const numOr = (v: string) => (v === '' ? undefined : Math.max(0, parseInt(v, 10) || 0));
  switch (field) {
    case 'heal':
      return (
        <label>
          Healing
          <input placeholder="e.g. 2d4+2" value={s.heal ?? ''} onChange={(e) => onChange({ heal: e.target.value })} />
        </label>
      );
    case 'dmg':
      return (
        <label>
          Damage
          <input placeholder="e.g. 1d8" value={s.dmg ?? ''} onChange={(e) => onChange({ dmg: e.target.value })} />
        </label>
      );
    case 'dtype':
      return (
        <label>
          Damage type
          <select value={s.dtype ?? ''} onChange={(e) => onChange({ dtype: e.target.value || undefined })}>
            <option value="">—</option>
            {DAMAGE_TYPES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
      );
    case 'bonus':
      return (
        <label>
          Bonus
          <select value={s.bonus ?? 0} onChange={(e) => onChange({ bonus: Number(e.target.value) || undefined })}>
            <option value={0}>—</option>
            <option value={1}>+1</option>
            <option value={2}>+2</option>
            <option value={3}>+3</option>
          </select>
        </label>
      );
    case 'properties':
      return (
        <label>
          Properties
          <input placeholder="finesse, thrown 20/60…" value={s.properties ?? ''} onChange={(e) => onChange({ properties: e.target.value })} />
        </label>
      );
    case 'ac':
      return (
        <label>
          AC
          <input placeholder="e.g. 14 + Dex (max 2), or +2" value={s.ac ?? ''} onChange={(e) => onChange({ ac: e.target.value })} />
        </label>
      );
    case 'armorClass':
      return (
        <label>
          Armor weight
          <select value={s.armorClass ?? ''} onChange={(e) => onChange({ armorClass: e.target.value || undefined })}>
            <option value="">—</option>
            <option value="light">light</option>
            <option value="medium">medium</option>
            <option value="heavy">heavy</option>
          </select>
        </label>
      );
    case 'stealthStr':
      return (
        <span className="attune-pair">
          <label className="check">
            <input type="checkbox" checked={!!s.stealthDis} onChange={(e) => onChange({ stealthDis: e.target.checked })} />
            Stealth disadvantage
          </label>
          <label className="check str-req">
            Str required
            <input value={s.strReq ?? ''} placeholder="—" onChange={(e) => onChange({ strReq: e.target.value })} />
          </label>
        </span>
      );
    case 'charges':
      return (
        <span className="charges-group">
          <label>
            ⚡ Charges
            <span className="charges-inputs">
              <input type="number" min={0} placeholder="now" value={s.charges ?? ''} onChange={(e) => onChange({ charges: numOr(e.target.value) })} />
              <span className="muted">of</span>
              <input type="number" min={0} placeholder="max" value={s.chargesMax ?? ''} onChange={(e) => onChange({ chargesMax: numOr(e.target.value) })} />
            </span>
          </label>
          <label>
            Recharge
            <input placeholder="e.g. 1d6+1 at dawn" value={s.recharge ?? ''} onChange={(e) => onChange({ recharge: e.target.value })} />
          </label>
        </span>
      );
    case 'spells':
      return <SpellsField value={s.spells ?? ''} onChange={(v) => onChange({ spells: v })} />;
    case 'spell':
      return <SpellNameField value={s.spell ?? ''} onChange={(v) => onChange({ spell: v })} />;
    case 'spellLevel':
      return (
        <label>
          Spell level
          <select value={s.spellLevel ?? ''} onChange={(e) => onChange({ spellLevel: e.target.value || undefined })}>
            <option value="">—</option>
            {SPELL_LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
      );
    case 'dc':
      return (
        <label>
          Save / attack
          <input placeholder="e.g. DC 15, +7" value={s.dc ?? ''} onChange={(e) => onChange({ dc: e.target.value })} />
        </label>
      );
    case 'capacity':
      return (
        <label>
          Capacity
          <input placeholder="e.g. 500 lb" value={s.capacity ?? ''} onChange={(e) => onChange({ capacity: e.target.value })} />
        </label>
      );
    case 'language':
      return (
        <label>
          Language / cipher
          <input placeholder="e.g. written in Infernal" value={s.language ?? ''} onChange={(e) => onChange({ language: e.target.value })} />
        </label>
      );
    case 'cursed':
      return (
        <span className="cursed-pair wide">
          <label className="check">
            <input type="checkbox" checked={!!s.cursed} onChange={(e) => onChange({ cursed: e.target.checked })} />
            💀 Cursed <span className="muted">(shows only when expanded)</span>
          </label>
          {s.cursed && (
            <label className="curse-text">
              What does the curse do?
              <AutoTextarea
                rows={2}
                placeholder="e.g. Once attuned, the wielder cannot let go of the blade…"
                value={s.curseText ?? ''}
                onChange={(e) => onChange({ curseText: e.target.value })}
              />
            </label>
          )}
        </span>
      );
  }
}
