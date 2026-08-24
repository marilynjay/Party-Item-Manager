import { useState } from 'react';
import type { Item } from '../types';
import { CATEGORIES, HOLDERS, holderIcon } from '../types';
import { ItemRow, type ItemListProps } from './ItemRow';
import { Tumbleweed } from './Tumbleweed';

const catIndex = (c: string) => {
  const i = CATEGORIES.findIndex((x) => x.key === c);
  return i < 0 ? CATEGORIES.length : i; // uncategorized sorts last
};
const subIndex = (c: string, s2: string) => {
  const cat = CATEGORIES.find((x) => x.key === c);
  if (!cat || !s2) return 99;
  const i = cat.subtypes.indexOf(s2);
  return i < 0 ? 99 : i;
};
// Which group headers are folded up, remembered per browser.
const COLLAPSE_KEY = 'pim-collapsed';
const readCollapsed = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]') as string[]);
  } catch {
    return new Set();
  }
};

const byTaxonomy = (a: Item, b: Item) =>
  catIndex(a.category) - catIndex(b.category) ||
  subIndex(a.category, a.subtype) - subIndex(b.category, b.subtype) ||
  a.name.localeCompare(b.name);

export function ItemList(props: ItemListProps) {
  const { items, groupByHolder, emptyMessage, collapseScope, filtering } = props;
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
    } catch {
      // fine — collapse state is a convenience
    }
  };
  // an active search always shows its matches, collapsed or not
  const isFolded = (key: string) => !filtering && collapsed.has(key);
  if (items.length === 0)
    return (
      <div className="empty muted">
        {emptyMessage}
        <Tumbleweed />
      </div>
    );

  if (!groupByHolder) {
    // one holder's inventory: sections per category, empties omitted
    const sorted = [...items].sort(byTaxonomy);
    const groups: Array<{ key: string; label: string; items: Item[] }> = [];
    for (const cat of CATEGORIES) {
      const inCat = sorted.filter((i) => i.category === cat.key);
      if (inCat.length) groups.push({ key: cat.key, label: `${cat.emoji} ${cat.name}`, items: inCat });
    }
    const loose = sorted.filter((i) => !CATEGORIES.some((c) => c.key === i.category));
    if (loose.length) groups.push({ key: 'loose', label: 'Uncategorized', items: loose });
    return (
      <>
        {groups.map((g) => {
          const key = `${collapseScope}:${g.key}`;
          const folded = isFolded(key);
          const lb = Math.round(g.items.reduce((sum, i) => sum + (i.weight ?? 0) * i.qty, 0) * 10) / 10;
          return (
            <section key={g.key} className="cat-group">
              <button type="button" className="cat-group-heading muted" onClick={() => toggle(key)}>
                <span className={`fold-caret ${folded ? 'fold-caret-closed' : ''}`}>▾</span>
                {g.label} <span className="cat-group-count">· {g.items.length}</span>
                {lb > 0 && <span className="cat-group-weight">{lb.toLocaleString()} lb</span>}
              </button>
              <div className={`fold ${folded ? 'folded' : ''}`}>
                <div className="fold-inner">
                  <ul className="item-list">
                    {g.items.map((i) => (
                      <ItemRow key={i.id} item={i} {...props} />
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          );
        })}
      </>
    );
  }

  return (
    <>
      {HOLDERS.filter((h) => items.some((i) => i.location === h.id)).map((h) => {
        const key = `${collapseScope}:${h.id}`;
        const folded = isFolded(key);
        return (
          <section key={h.id} className="holder-group">
            <button type="button" className="holder-heading" onClick={() => toggle(key)}>
              <span className={`fold-caret muted ${folded ? 'fold-caret-closed' : ''}`}>▾</span>
              <span>{holderIcon(props.icons, h)}</span> {h.name}
              <span className="muted"> · {items.filter((i) => i.location === h.id).length}</span>
            </button>
            <div className={`fold ${folded ? 'folded' : ''}`}>
              <div className="fold-inner">
                <ul className="item-list">
                  {items
                    .filter((i) => i.location === h.id)
                    .sort(byTaxonomy)
                    .map((i) => (
                      <ItemRow key={i.id} item={i} {...props} />
                    ))}
                </ul>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
