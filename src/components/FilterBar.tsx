import { useState } from 'react';
import type { Item } from '../types';
import { ITEM_TYPES, RARITIES, isMagic } from '../types';

export interface Filters {
  search: string;
  type: string;
  rarity: string;
  magicOnly: boolean;
}

export const emptyFilters: Filters = { search: '', type: '', rarity: '', magicOnly: false };

export function applyFilters(items: Item[], f: Filters): Item[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((i) => {
    if (q && !(i.name.toLowerCase().includes(q) || i.notes.toLowerCase().includes(q))) return false;
    if (f.type && i.type !== f.type) return false;
    if (f.rarity && i.rarity !== f.rarity) return false;
    if (f.magicOnly && !isMagic(i)) return false;
    return true;
  });
}

// A quiet search field; the filter controls only appear once you engage
// with it (focus or an active search/filter).
export function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const [focused, setFocused] = useState(false);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const active = !!(filters.search || filters.type || filters.rarity || filters.magicOnly);
  const expanded = focused || active;

  return (
    <div
      className="filter-min"
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
      }}
    >
      <input
        type="search"
        className="search-min"
        placeholder="🔍 Search items…"
        value={filters.search}
        onChange={(e) => set({ search: e.target.value })}
      />
      {expanded && (
        <div className="filter-row">
          <select value={filters.type} onChange={(e) => set({ type: e.target.value })}>
            <option value="">Any type</option>
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={filters.rarity} onChange={(e) => set({ rarity: e.target.value })}>
            <option value="">Any rarity</option>
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`chip ${filters.magicOnly ? 'chip-on' : ''}`}
            onClick={() => set({ magicOnly: !filters.magicOnly })}
          >
            ✨ Magic
          </button>
          {active && (
            <button
              type="button"
              className="chip"
              onClick={() => {
                onChange(emptyFilters);
                // this button unmounts itself, so no blur event will fire
                setFocused(false);
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
