import { useState } from 'react';
import type { CatalogItem } from '../catalog';
import { CATALOG } from '../catalog';

const TABS: Array<[string, string]> = [
  ['all', 'All'],
  ['gear', 'Mundane'],
  ['weapon', 'Weapons'],
  ['armor', 'Armor'],
  ['potion', 'Potions'],
  ['common', 'Common'],
  ['uncommon', 'Uncommon'],
  ['rare', 'Rare'],
  ['very rare', 'Very rare'],
  ['legendary', 'Legendary'],
];

function inTab(it: CatalogItem, tab: string): boolean {
  switch (tab) {
    case 'all': return true;
    case 'gear': return !it.magic;
    case 'weapon': return it.type === 'weapon' || it.type === 'ammunition';
    case 'armor': return it.type === 'armor' || it.type === 'shield';
    case 'potion': return it.type === 'potion' || it.type === 'scroll';
    default: return it.rarity === tab;
  }
}

const LIMIT = 80;

export function CatalogBrowser({ onPick, onClose }: { onPick: (it: CatalogItem) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const query = q.trim().toLowerCase();
  const matches = CATALOG.filter((it) => inTab(it, tab) && (!query || it.name.toLowerCase().includes(query)));
  const shown = matches.slice(0, LIMIT);

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
          {shown.map((it) => (
            <button key={it.name} type="button" className="cat-row" onClick={() => onPick(it)}>
              <span className="cat-row-top">
                <span className="cat-name">{it.name}</span>
                <span className="item-tags">
                  {it.rarity && <span className={`tag rarity-${it.rarity.replace(/\s+/g, '-')}`}>{it.rarity}</span>}
                  <span className="tag">{it.type}</span>
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
