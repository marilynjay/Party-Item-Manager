import { AutoTextarea } from './AutoTextarea';
import { useMemo, useRef, useState } from 'react';
import type { ItemStats, StatField } from '../types';
import { DAMAGE_TYPES } from '../types';
import { SPELL_NAMES } from '../spellIndex';
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

// The Spells box helps with the typing: suggestion chips complete long
// names ("loc" → Locate Animals or Plants) with a default cost of 1 left
// selected for overtyping, and a live check row shows which lines the
// compendium recognizes (✓ opens a readable card in play; ? stays plain).
function SpellsField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [cursor, setCursor] = useState(-1);

  // the name being typed on the cursor's line, until a cost shows up
  const partial = useMemo(() => {
    if (cursor < 0 || cursor > value.length) return null;
    const lineStart = value.lastIndexOf('\n', cursor - 1) + 1;
    const nextBreak = value.indexOf('\n', cursor);
    const lineEnd = nextBreak < 0 ? value.length : nextBreak;
    const raw = value.slice(lineStart, lineEnd).replace(/^[-•·]\s*/, '');
    if (/\d/.test(raw)) return null;
    const name = raw.replace(/[\s—–:-]+$/, '').trim().toLowerCase();
    if (name.length < 2 || SPELL_NAMES.has(name)) return null;
    return { name, lineStart, lineEnd };
  }, [value, cursor]);

  const matches = useMemo(() => {
    if (!partial) return [];
    const starts: string[] = [];
    const contains: string[] = [];
    for (const [key, display] of SPELL_NAMES) {
      if (key.startsWith(partial.name)) starts.push(display);
      else if (key.includes(partial.name)) contains.push(display);
    }
    return [...starts, ...contains].slice(0, 5);
  }, [partial]);

  const complete = (display: string) => {
    if (!partial) return;
    const insert = `${display} — 1`;
    onChange(value.slice(0, partial.lineStart) + insert + value.slice(partial.lineEnd));
    const end = partial.lineStart + insert.length;
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(end - 1, end); // the default cost, ready to overtype
      }
    });
    setCursor(-1);
  };

  const lines = parseSpellLines(value);

  return (
    <label className="wide">
      Spells <span className="muted">— one per line, cost last: Cure Wounds — 1</span>
      <AutoTextarea
        rows={3}
        placeholder={'Animal Friendship — 1\nAwaken — 5\nWall of Thorns — 6'}
        value={value}
        onChange={(e) => {
          taRef.current = e.target;
          setCursor(e.target.selectionStart);
          onChange(e.target.value);
        }}
        onSelect={(e) => {
          taRef.current = e.currentTarget;
          setCursor(e.currentTarget.selectionStart);
        }}
        onBlur={() => setTimeout(() => setCursor(-1), 150)}
      />
      {matches.length > 0 && (
        <span className="spell-suggest">
          {matches.map((m) => (
            <button key={m} type="button" className="chip" onMouseDown={(e) => e.preventDefault()} onClick={() => complete(m)}>
              {m}
            </button>
          ))}
        </span>
      )}
      {lines.length > 0 && (
        <span className="spell-check-row">
          {lines.map((sp, i) =>
            SPELL_NAMES.has(sp.name.trim().toLowerCase()) ? (
              <span key={sp.name + i} className="spell-check known" title="In the compendium — tappable to read in play">
                ✓ {sp.name}
              </span>
            ) : (
              <span key={sp.name + i} className="spell-check muted" title="Not in the 2014 compendium — stays plain text">
                ? {sp.name}
              </span>
            )
          )}
        </span>
      )}
    </label>
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
