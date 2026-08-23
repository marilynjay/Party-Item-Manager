import { useState } from 'react';
import type { CategoryKey, Item } from '../types';
import { CATEGORIES, RARITIES, categoryOf, isMagic } from '../types';

export interface Filters {
  search: string;
  category: CategoryKey;
  subtype: string;
  rarity: string;
  magicOnly: boolean;
}

export const emptyFilters: Filters = { search: '', category: '', subtype: '', rarity: '', magicOnly: false };

export function applyFilters(items: Item[], f: Filters): Item[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((i) => {
    if (q && !(i.name.toLowerCase().includes(q) || i.notes.toLowerCase().includes(q))) return false;
    if (f.category && i.category !== f.category) return false;
    if (f.subtype && i.subtype !== f.subtype) return false;
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
  const active = !!(filters.search || filters.category || filters.subtype || filters.rarity || filters.magicOnly);
  const expanded = focused || active;
  const cat = categoryOf(filters.category);

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
          <select
            value={filters.category}
            onChange={(e) => set({ category: e.target.value as CategoryKey, subtype: '' })}
          >
            <option value="">Any category</option>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
          {cat && cat.subtypes.length > 0 && (
            <select value={filters.subtype} onChange={(e) => set({ subtype: e.target.value })}>
              <option value="">All {cat.name.toLowerCase()}</option>
              {cat.subtypes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
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
