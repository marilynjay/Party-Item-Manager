import { useEffect, useMemo, useState } from 'react';
import type { SpellRef } from '../spellIndex';
import { SpellCard, loadSpells } from './SpellCard';

// The whole 2014 spellbook, browsable: search by name (or, with a longer
// query, by words in the text), narrow by level, tap a spell for its card.
// Opened from the quiet 📖 in Home's corner.

const levelOf = (m: string) => {
  const x = /^Level (\d)/.exec(m);
  return x ? Number(x[1]) : 0;
};
const schoolOf = (m: string) =>
  m.replace(/^Level \d /, '').replace(/ Cantrip/, '').replace(/\s*\(.*\)$/, '');
const LEVEL_LABELS = ['Cantrips', '1st level', '2nd level', '3rd level', '4th level', '5th level', '6th level', '7th level', '8th level', '9th level'];
const levelTag = (lvl: number) => (lvl === 0 ? 'cantrip' : LEVEL_LABELS[lvl].replace(' level', ''));

interface Row {
  key: string;
  sp: SpellRef;
  lvl: number;
}

export function SpellCompendium({ onClose }: { onClose: () => void }) {
  const [spells, setSpells] = useState<Record<string, SpellRef> | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<number | null>(null);
  const [view, setView] = useState<string | null>(null);

  useEffect(() => {
    loadSpells()
      .then(setSpells)
      .catch(() => setFailed(true));
  }, []);

  const all = useMemo<Row[]>(
    () =>
      spells
        ? Object.entries(spells)
            .map(([key, sp]) => ({ key, sp, lvl: levelOf(sp.m) }))
            .sort((a, b) => a.lvl - b.lvl || a.sp.n.localeCompare(b.sp.n))
        : [],
    [spells]
  );

  const q = query.trim().toLowerCase();
  const pool = level === null ? all : all.filter((e) => e.lvl === level);
  const nameHits = q ? pool.filter((e) => e.sp.n.toLowerCase().includes(q)) : pool;
  // short queries stay name-only; three letters on is enough to grep the text
  const textHits =
    q.length >= 3 ? pool.filter((e) => !e.sp.n.toLowerCase().includes(q) && (e.sp.d + ' ' + e.sp.m).toLowerCase().includes(q)) : [];

  const row = (e: Row, tagged: boolean) => (
    <button key={e.key} type="button" className="cat-row" onClick={() => setView(e.key)}>
      <span className="cat-row-top">
        <span className="cat-name spell-comp-name">{e.sp.n}</span>
        <span className="muted spell-comp-meta">
          {tagged ? `${levelTag(e.lvl)} · ` : ''}
          {schoolOf(e.sp.m)}
        </span>
      </span>
    </button>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal spell-comp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>📖 Spellbook</h2>
          <button type="button" className="link-button" onClick={onClose}>✕</button>
        </div>
        <input
          className="cat-search"
          autoFocus
          placeholder="Search 319 spells…"
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
        {failed ? (
          <p className="muted">Couldn't open the spellbook — check your connection and try again.</p>
        ) : !spells ? (
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
                  <p className="muted">Nothing in the book matches that{level !== null ? ' at this level' : ''}.</p>
                )}
              </>
            )}
          </div>
        )}
        {view && <SpellCard name={view} onClose={() => setView(null)} />}
      </div>
    </div>
  );
}
