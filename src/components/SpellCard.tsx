import { useEffect, useState } from 'react';
import type { SpellRef } from '../spellIndex';

// The full compendium loads once, on the first card (or compendium) anyone
// opens, and is kept for the session — the main bundle only carries the
// name index.
let loaded: Record<string, SpellRef> | null = null;

export function loadSpells(): Promise<Record<string, SpellRef>> {
  return loaded ? Promise.resolve(loaded) : import('../spells2014').then((m) => (loaded = m.default));
}

export function SpellCard({ name, onClose }: { name: string; onClose: () => void }) {
  const [spells, setSpells] = useState(loaded);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loaded) return;
    loadSpells()
      .then(setSpells)
      .catch(() => setFailed(true));
  }, []);

  const sp = spells?.[name.trim().toLowerCase()];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal spell-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>📖 {sp?.n ?? name}</h2>
          <button type="button" className="link-button" onClick={onClose}>✕</button>
        </div>
        {failed ? (
          <p className="muted">Couldn't open the spellbook — check your connection and try again.</p>
        ) : !spells ? (
          <p className="muted">Opening the book…</p>
        ) : !sp ? (
          <p className="muted">That one isn't in the 2014 compendium.</p>
        ) : (
          <>
            <p className="spell-card-meta muted">{sp.m}</p>
            <dl className="item-detail-grid spell-card-grid">
              {(
                [
                  ['Casting time', sp.ct],
                  ['Range', sp.rg],
                  ['Components', sp.cp],
                  ['Duration', sp.du],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="item-detail-row">
                  <dt className="muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="spell-card-desc">{sp.d}</p>
          </>
        )}
      </div>
    </div>
  );
}
