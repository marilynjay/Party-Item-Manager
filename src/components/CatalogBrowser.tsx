import { useState } from 'react';
import type { CatalogItem } from '../catalog';
import { CATALOG } from '../catalog';
import type { CategoryKey } from '../types';
import { CATEGORIES, categoryLabel } from '../types';

const TABS: Array<[string, string]> = [
  ['all', 'All'],
  ['mine', '✦ Custom'],
  ['mundane', 'Mundane'],
  ...CATEGORIES.filter((c) => c.key !== 'other').map((c): [string, string] => [c.key, `${c.emoji} ${c.name}`]),
  ['common', 'Common'],
  ['uncommon', 'Uncommon'],
  ['rare', 'Rare'],
  ['very rare', 'Very rare'],
  ['legendary', 'Legendary'],
];

function inTab(it: CatalogItem, tab: string): boolean {
  switch (tab) {
    case 'all': return true;
    case 'mine': return true; // custom-ness is decided by the list, not the entry
    case 'mundane': return !it.magic;
    default:
      if (CATEGORIES.some((c) => c.key === tab)) return it.category === tab;
      return it.rarity === tab;
  }
}

const LIMIT = 80;

interface Props {
  custom: CatalogItem[];
  onPick: (it: CatalogItem) => void;
  onDeleteCustom: (name: string) => Promise<unknown> | void;
  onClose: () => void;
}

export function CatalogBrowser({ custom, onPick, onDeleteCustom, onClose }: Props) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const query = q.trim().toLowerCase();
  const hit = (it: CatalogItem) => inTab(it, tab) && (!query || it.name.toLowerCase().includes(query));
  const customMatches = custom.filter(hit);
  const matches = tab === 'mine' ? [] : CATALOG.filter(hit);
  const shown = matches.slice(0, Math.max(0, LIMIT - customMatches.length));

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>📖 Item catalogue</h2>
          <button type="button" className="link-button" onClick={onClose}>✕</button>
        </div>
        <input
          type="search"
          className="cat-search"
          placeholder="Search 252 items…"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="cat-tabs">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`chip ${tab === key ? 'chip-on' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="cat-list">
          {customMatches.map((it) => (
            <div key={'✦' + it.name} className="cat-custom-row">
              <button type="button" className="cat-row" onClick={() => onPick(it)}>
                <span className="cat-row-top">
                  <span className="cat-name"><span className="custom-mark">✦</span> {it.name}</span>
                  <span className="item-tags">
                    {it.rarity && <span className={`tag rarity-${it.rarity.replace(/\s+/g, '-')}`}>{it.rarity}</span>}
                    {categoryLabel(it.category as CategoryKey, it.subtype) && <span className="tag">{categoryLabel(it.category as CategoryKey, it.subtype)}</span>}
                    {it.requiresAttunement && <span className="tag attune-tag">◇ attunement</span>}
                    {it.weight !== null && <span className="tag muted-tag">{it.weight} lb</span>}
                  </span>
                </span>
                {it.rules && <span className="cat-rules muted">{it.rules}</span>}
              </button>
              <button
                type="button"
                className="cat-custom-delete"
                title="Remove from the party catalogue (items already handed out stay put)"
                onClick={() => {
                  if (confirm(`Remove ${it.name} from the party catalogue? Items already in inventories are untouched.`)) {
                    void onDeleteCustom(it.name);
                  }
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {tab === 'mine' && customMatches.length === 0 && (
            <div className="empty muted">
              Nothing saved yet — when adding a homebrew item, tick "✦ Save to our catalogue" under Advanced.
            </div>
          )}
          {shown.map((it) => (
            <button key={it.name} type="button" className="cat-row" onClick={() => onPick(it)}>
              <span className="cat-row-top">
                <span className="cat-name">{it.name}</span>
                <span className="item-tags">
                  {it.rarity && <span className={`tag rarity-${it.rarity.replace(/\s+/g, '-')}`}>{it.rarity}</span>}
                  {categoryLabel(it.category as CategoryKey, it.subtype) && <span className="tag">{categoryLabel(it.category as CategoryKey, it.subtype)}</span>}
                  {it.requiresAttunement && <span className="tag attune-tag">◇ attunement</span>}
                  {it.weight !== null && <span className="tag muted-tag">{it.weight} lb</span>}
                </span>
              </span>
              {it.rules && <span className="cat-rules muted">{it.rules}</span>}
            </button>
          ))}
          {matches.length > LIMIT && (
            <div className="muted cat-more">…{matches.length - LIMIT} more — search to narrow it down.</div>
          )}
          {matches.length === 0 && <div className="empty muted">Nothing matches.</div>}
        </div>
      </div>
    </div>
  );
}
