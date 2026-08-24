import { useEffect, useRef, useState } from 'react';
import type { HolderId, Icons, Item } from '../types';
import { ATTUNEMENT_SLOTS, HOLDERS, holderIcon } from '../types';

export type Scope = 'home' | 'all' | 'log' | HolderId;

interface Props {
  scope: Scope;
  onSelect: (scope: Scope) => void;
  items: Item[];
  icons: Icons;
  attunedCounts: Map<HolderId, number>;
}

const stackWeight = (i: Item) => (i.weight === null ? 0 : i.weight * i.qty);

export function Sidebar({ scope, onSelect, items, icons, attunedCounts }: Props) {
  const bagWeight = items.filter((i) => i.location === 'senchez').reduce((s, i) => s + stackWeight(i), 0);

  // Senchez gulps when something new lands in him. Counts qty (not stacks)
  // so merging into an existing stack still registers; the poll leaves the
  // count unchanged, so sync never triggers it.
  const bagQty = items.filter((i) => i.location === 'senchez').reduce((s, i) => s + i.qty, 0);
  const [gulping, setGulping] = useState(false);
  const prevBag = useRef<number | null>(null);
  useEffect(() => {
    const was = prevBag.current;
    prevBag.current = bagQty;
    if (was !== null && bagQty > was) {
      setGulping(true);
      const t = setTimeout(() => setGulping(false), 550);
      return () => clearTimeout(t);
    }
  }, [bagQty]);

  // `short` swaps in on narrow screens; home/all/log are "utility" tabs that
  // drop their icon and read horizontally there.
  const tab = (key: Scope, label: string, emoji: string, extra?: React.ReactNode, short?: string, emojiClass = '') => (
    <button
      key={key}
      data-scope={key}
      className={`tab ${key === 'home' || key === 'all' || key === 'log' ? 'tab-util' : 'tab-holder'} ${scope === key ? 'active' : ''}`}
      title={label}
      onClick={() => onSelect(key)}
    >
      <span className={`tab-emoji ${emojiClass}`}>{emoji}</span>
      <span className="tab-label tab-label-full">{label}</span>
      <span className="tab-label tab-label-short">{short ?? label}</span>
      {extra}
    </button>
  );

  return (
    <nav className="sidebar">
      <div className="brand">
        <span className="brand-emoji">🎒</span>
        <span>Party Items</span>
      </div>
      {tab('home', 'Home', '⛺', undefined, 'Home')}
      {tab('all', 'Everything', '📜', <span className="badge">{items.length}</span>, 'All')}
      <div className="rail-heading">Party</div>
      {HOLDERS.filter((h) => h.kind === 'member').map((h) => {
        const count = items.filter((i) => i.location === h.id).length;
        const attuned = attunedCounts.get(h.id) ?? 0;
        return tab(
          h.id,
          h.name,
          holderIcon(icons, h),
          <span className="tab-badges">
            {attuned > 0 && (
              <span
                className={`badge attune ${attuned > ATTUNEMENT_SLOTS ? 'over' : ''}`}
                title={`${attuned}/${ATTUNEMENT_SLOTS} attunement slots`}
              >
                ◈{attuned}
              </span>
            )}
            <span className="badge">{count}</span>
          </span>
        );
      })}
      <div className="rail-heading">Bag of Holding</div>
      {tab(
        'senchez',
        'Senchez',
        holderIcon(icons, HOLDERS[5]),
        <span className="tab-badges">
          <span className="badge weight" title={`Senchez is carrying ${bagWeight} lb (no limit — homebrew bag)`}>
            {Math.round(bagWeight)} lb
          </span>
          <span className="badge">{items.filter((i) => i.location === 'senchez').length}</span>
        </span>,
        undefined,
        gulping ? 'gulping' : ''
      )}
      <div className="rail-spacer" />
      {tab('log', 'Change log', '🕯️', undefined, 'Log')}
    </nav>
  );
}
