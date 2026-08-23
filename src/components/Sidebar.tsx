import type { HolderId, Item } from '../types';
import { ATTUNEMENT_SLOTS, BAG_CAPACITY_LB, HOLDERS } from '../types';

export type Scope = 'all' | 'log' | HolderId;

interface Props {
  scope: Scope;
  onSelect: (scope: Scope) => void;
  items: Item[];
  attunedCounts: Map<HolderId, number>;
}

const stackWeight = (i: Item) => (i.weight === null ? 0 : i.weight * i.qty);

export function Sidebar({ scope, onSelect, items, attunedCounts }: Props) {
  const bagWeight = items.filter((i) => i.location === 'senchez').reduce((s, i) => s + stackWeight(i), 0);
  const overCap = bagWeight > BAG_CAPACITY_LB;

  // `short` swaps in on narrow screens where the rail shows sideways labels.
  const tab = (key: Scope, label: string, emoji: string, extra?: React.ReactNode, short?: string) => (
    <button
      key={key}
      className={`tab ${scope === key ? 'active' : ''}`}
      onClick={() => onSelect(key)}
    >
      <span className="tab-emoji">{emoji}</span>
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
      {tab('all', 'Everything', '📜', <span className="badge">{items.length}</span>, 'All')}
      <div className="rail-heading">Party</div>
      {HOLDERS.filter((h) => h.kind === 'member').map((h) => {
        const count = items.filter((i) => i.location === h.id).length;
        const attuned = attunedCounts.get(h.id) ?? 0;
        return tab(
          h.id,
          h.name,
          h.emoji,
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
        '🎒',
        <span className="tab-badges">
          <span className={`badge weight ${overCap ? 'over' : ''}`} title={`${bagWeight} / ${BAG_CAPACITY_LB} lb`}>
            {Math.round(bagWeight)} lb
          </span>
          <span className="badge">{items.filter((i) => i.location === 'senchez').length}</span>
        </span>
      )}
      <div className="bag-meter" title={`Senchez: ${bagWeight} / ${BAG_CAPACITY_LB} lb`}>
        <div
          className={`bag-meter-fill ${overCap ? 'over' : ''}`}
          style={{ width: `${Math.min(100, (bagWeight / BAG_CAPACITY_LB) * 100)}%` }}
        />
      </div>
      {overCap && <div className="bag-warning">⚠️ Senchez is over 500 lb!</div>}
      <div className="rail-spacer" />
      {tab('log', 'Change log', '🕯️', undefined, 'Log')}
    </nav>
  );
}
