import { useEffect, useMemo, useState } from 'react';
import type { SpellRef } from '../spellIndex';
import { SpellCard, loadSpells } from './SpellCard';

// The whole 2014 spellbook, browsable: search by name (or, with a longer
// query, by words in the text), narrow by level, tap a spell for its card.
// Opened from the quiet 📖 in Home's corner. The party's own entries
// (owned paid content, homebrew — stored in state, never shipped) appear
// alongside the SRD marked ✦, and the ＋ Add spell button (or an empty
// search) writes new ones in.

const levelOf = (m: string) => {
  const x = /^Level (\d)/.exec(m);
  return x ? Number(x[1]) : 0;
};
const schoolOf = (m: string) =>
  m.replace(/^Level \d /, '').replace(/ Cantrip/, '').replace(/\s*\(.*\)$/, '');
const classesOf = (m: string) => /\(([^)]*)\)\s*$/.exec(m)?.[1] ?? '';
const LEVEL_LABELS = ['Cantrips', '1st level', '2nd level', '3rd level', '4th level', '5th level', '6th level', '7th level', '8th level', '9th level'];
const levelTag = (lvl: number) => (lvl === 0 ? 'cantrip' : LEVEL_LABELS[lvl].replace(' level', ''));
const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];

interface Row {
  key: string;
  sp: SpellRef;
  lvl: number;
  custom: boolean;
}

export function SpellCompendium({
  spellbook,
  onSave,
  onDelete,
  onClose,
}: {
  spellbook: SpellRef[];
  onSave: (spell: SpellRef) => void;
  onDelete: (name: string) => void;
  onClose: () => void;
}) {
  const [spells, setSpells] = useState<Record<string, SpellRef> | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<number | null>(null);
  const [view, setView] = useState<string | null>(null);
  // null = closed; a SpellRef = editing that entry; 'new' = blank form
  const [editing, setEditing] = useState<SpellRef | 'new' | null>(null);

  useEffect(() => {
    loadSpells()
      .then(setSpells)
      .catch(() => setFailed(true));
  }, []);

  const all = useMemo<Row[]>(() => {
    const ownKeys = new Set(spellbook.map((s) => s.n.trim().toLowerCase()));
    const rows: Row[] = spellbook.map((sp) => ({ key: sp.n.trim().toLowerCase(), sp, lvl: levelOf(sp.m), custom: true }));
    if (spells) {
      for (const [key, sp] of Object.entries(spells)) {
        if (!ownKeys.has(key)) rows.push({ key, sp, lvl: levelOf(sp.m), custom: false });
      }
    }
    return rows.sort((a, b) => a.lvl - b.lvl || a.sp.n.localeCompare(b.sp.n));
  }, [spells, spellbook]);

  const q = query.trim().toLowerCase();
  const pool = level === null ? all : all.filter((e) => e.lvl === level);
  const nameHits = q ? pool.filter((e) => e.sp.n.toLowerCase().includes(q)) : pool;
  // short queries stay name-only; three letters on is enough to grep the text
  const textHits =
    q.length >= 3 ? pool.filter((e) => !e.sp.n.toLowerCase().includes(q) && (e.sp.d + ' ' + e.sp.m).toLowerCase().includes(q)) : [];

  const row = (e: Row, tagged: boolean) => (
    <div key={e.key} className={e.custom ? 'spell-comp-own' : undefined}>
      <button type="button" className="cat-row" onClick={() => setView(e.key)}>
        <span className="cat-row-top">
          <span className="cat-name spell-comp-name">
            {e.custom && <span className="custom-mark">✦ </span>}
            {e.sp.n}
          </span>
          <span className="muted spell-comp-meta">
            {tagged ? `${levelTag(e.lvl)} · ` : ''}
            {schoolOf(e.sp.m)}
          </span>
        </span>
      </button>
      {e.custom && (
        <button type="button" className="link-button spell-comp-edit" title="Edit this spell" onClick={() => setEditing(e.sp)}>
          ✎
        </button>
      )}
    </div>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal spell-comp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>📖 Spellbook</h2>
          <span>
            <button type="button" className="link-button" title="Add a spell the book is missing" onClick={() => setEditing('new')}>
              ＋ Add spell
            </button>
            <button type="button" className="link-button" onClick={onClose}>✕</button>
          </span>
        </div>
        <input
          className="cat-search"
          autoFocus
          placeholder={`Search ${all.length || 319} spells…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && (query ? setQuery('') : onClose())}
        />
        <div className="cat-tabs spell-comp-levels">
          {LEVEL_LABELS.map((_, lvl) => (
            <button
              key={lvl}
              type="button"
              className={`chip ${level === lvl ? 'chip-on' : ''}`}
              title={LEVEL_LABELS[lvl]}
              onClick={() => setLevel(level === lvl ? null : lvl)}
            >
              {lvl === 0 ? 'C' : lvl}
            </button>
          ))}
        </div>
        {failed && spellbook.length === 0 ? (
          <p className="muted">Couldn't open the spellbook — check your connection and try again.</p>
        ) : !spells && !failed && spellbook.length === 0 ? (
          <p className="muted">Opening the book…</p>
        ) : (
          <div className="cat-list">
            {q === '' ? (
              LEVEL_LABELS.map((label, lvl) => {
                const inLevel = pool.filter((e) => e.lvl === lvl);
                if (inLevel.length === 0) return null;
                return (
                  <div key={label} className="spell-comp-group">
                    <span className="item-menu-heading muted">{label} · {inLevel.length}</span>
                    {inLevel.map((e) => row(e, false))}
                  </div>
                );
              })
            ) : (
              <>
                {nameHits.map((e) => row(e, true))}
                {textHits.length > 0 && (
                  <>
                    <span className="item-menu-heading muted">Mentioned in the text</span>
                    {textHits.map((e) => row(e, true))}
                  </>
                )}
                {nameHits.length === 0 && textHits.length === 0 && (
                  <div className="spell-comp-empty">
                    <p className="muted">Nothing in the book matches that{level !== null ? ' at this level' : ''}.</p>
                    <button type="button" className="link-button" onClick={() => setEditing('new')}>
                      ＋ Add “{query.trim()}” to the party spellbook
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {view && <SpellCard name={view} onClose={() => setView(null)} />}
        {editing && (
          <SpellEditor
            initial={editing === 'new' ? undefined : editing}
            initialName={editing === 'new' ? query.trim() : undefined}
            onSave={(sp) => {
              onSave(sp);
              setEditing(null);
            }}
            onDelete={
              editing !== 'new'
                ? () => {
                    if (confirm(`Tear ${editing.n} out of the party spellbook?`)) {
                      onDelete(editing.n);
                      setEditing(null);
                    }
                  }
                : undefined
            }
            onCancel={() => setEditing(null)}
          />
        )}
      </div>
    </div>
  );
}

// Write a spell into the party's book. The form composes the same meta
// string the SRD entries use ("Level 3 Evocation (Sorcerer, Wizard)"), so
// storage, cards, grouping, and matching all treat both books the same.
function SpellEditor({
  initial,
  initialName,
  onSave,
  onDelete,
  onCancel,
}: {
  initial?: SpellRef;
  initialName?: string;
  onSave: (spell: SpellRef) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.n ?? initialName ?? '');
  const [lvl, setLvl] = useState(initial ? levelOf(initial.m) : 1);
  const [school, setSchool] = useState(initial ? schoolOf(initial.m) : 'Evocation');
  const [classes, setClasses] = useState(initial ? classesOf(initial.m) : '');
  const [ct, setCt] = useState(initial?.ct ?? '');
  const [rg, setRg] = useState(initial?.rg ?? '');
  const [cp, setCp] = useState(initial?.cp ?? '');
  const [du, setDu] = useState(initial?.du ?? '');
  const [text, setText] = useState(initial?.d ?? '');
  const ready = name.trim() !== '' && text.trim() !== '';

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal spell-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>✦ {initial ? initial.n : 'Add a spell'}</h2>
          <button type="button" className="link-button" onClick={onCancel}>✕</button>
        </div>
        <p className="muted spell-edit-hint">
          For official spells the free compendium can't include, and homebrew. Lives in the party's own book, marked ✦.
        </p>
        <div className="spell-edit-grid">
          <label className="rename-label wide">
            Name
            <input autoFocus={!initial} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="rename-label">
            Level
            <select value={lvl} onChange={(e) => setLvl(Number(e.target.value))}>
              <option value={0}>Cantrip</option>
              {LEVEL_LABELS.slice(1).map((l, i) => (
                <option key={l} value={i + 1}>{l}</option>
              ))}
            </select>
          </label>
          <label className="rename-label">
            School
            <select value={school} onChange={(e) => setSchool(e.target.value)}>
              {SCHOOLS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              {!SCHOOLS.includes(school) && <option value={school}>{school}</option>}
            </select>
          </label>
          <label className="rename-label wide">
            Classes <span className="muted">(optional)</span>
            <input placeholder="e.g. Bard, Sorcerer, Wizard" value={classes} onChange={(e) => setClasses(e.target.value)} />
          </label>
          <label className="rename-label">
            Casting time
            <input placeholder="Action" value={ct} onChange={(e) => setCt(e.target.value)} />
          </label>
          <label className="rename-label">
            Range
            <input placeholder="60 feet" value={rg} onChange={(e) => setRg(e.target.value)} />
          </label>
          <label className="rename-label">
            Components
            <input placeholder="V, S, M (…)" value={cp} onChange={(e) => setCp(e.target.value)} />
          </label>
          <label className="rename-label">
            Duration
            <input placeholder="Instantaneous" value={du} onChange={(e) => setDu(e.target.value)} />
          </label>
          <label className="rename-label wide">
            Spell text
            <textarea rows={6} placeholder="What the book says it does…" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        </div>
        <div className="torch-actions">
          <button
            type="button"
            disabled={!ready}
            onClick={() => {
              const trimmedClasses = classes.trim();
              const meta =
                (lvl === 0 ? `${school} Cantrip` : `Level ${lvl} ${school}`) +
                (trimmedClasses ? ` (${trimmedClasses})` : '');
              onSave({ n: name.trim(), m: meta, ct: ct.trim(), rg: rg.trim(), cp: cp.trim(), du: du.trim(), d: text.trim() });
            }}
          >
            ✦ {initial ? 'Save changes' : 'Add to the spellbook'}
          </button>
          {onDelete && (
            <button type="button" className="link-button danger-link" onClick={onDelete}>
              🗑 Tear it out
            </button>
          )}
          <button type="button" className="link-button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
