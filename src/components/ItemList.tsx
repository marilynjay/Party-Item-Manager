import { useState } from 'react';
import type { HolderId, Item } from '../types';
import { HOLDERS, ITEM_TYPES, RARITIES, holderById } from '../types';

interface Props {
  items: Item[];
  groupByHolder: boolean;
  highlightMagic: boolean;
  attunedCounts: Map<HolderId, number>;
  attunementSlots: number;
  isMagic: (i: Item) => boolean;
  emptyMessage: string;
  onMove: (id: string, to: HolderId, qty: number) => void;
  onUpdate: (id: string, fields: Partial<Item>) => void;
  onDelete: (id: string) => void;
}

const rarityClass = (r: string) => 'rarity-' + r.replace(/\s+/g, '-');

export function ItemList(props: Props) {
  const { items, groupByHolder, emptyMessage } = props;
  if (items.length === 0) return <div className="empty muted">{emptyMessage}</div>;

  if (!groupByHolder) return <ul className="item-list">{items.map((i) => <ItemRow key={i.id} item={i} {...props} />)}</ul>;

  return (
    <>
      {HOLDERS.filter((h) => items.some((i) => i.location === h.id)).map((h) => (
        <section key={h.id} className="holder-group">
          <h2 className="holder-heading">
            <span>{h.emoji}</span> {h.name}
            <span className="muted"> · {items.filter((i) => i.location === h.id).length}</span>
          </h2>
          <ul className="item-list">
            {items
              .filter((i) => i.location === h.id)
              .map((i) => (
                <ItemRow key={i.id} item={i} {...props} />
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function ItemRow({
  item,
  isMagic,
  attunedCounts,
  attunementSlots,
  onMove,
  onUpdate,
  onDelete,
}: Props & { item: Item }) {
  const [expanded, setExpanded] = useState(false);
  const [moveTo, setMoveTo] = useState<HolderId | ''>('');
  const [moveQty, setMoveQty] = useState(1);

  const startMove = (to: HolderId) => {
    if (item.qty === 1) {
      onMove(item.id, to, 1);
    } else {
      setMoveTo(to);
      setMoveQty(item.qty);
    }
  };

  const holderAttuned = item.location !== 'senchez' ? (attunedCounts.get(item.location) ?? 0) : 0;

  return (
    <li className={`item-row ${isMagic(item) ? 'magic' : ''}`}>
      <div className="item-main" onClick={() => setExpanded(!expanded)}>
        <span className="item-name">
          {isMagic(item) && <span className="magic-spark">✨</span>}
          {item.name}
          {item.qty > 1 && <span className="item-qty">×{item.qty}</span>}
        </span>
        <span className="item-tags">
          {item.type && <span className="tag">{item.type}</span>}
          {item.rarity && <span className={`tag ${rarityClass(item.rarity)}`}>{item.rarity}</span>}
          {item.requiresAttunement && (
            <span className={`tag attune-tag ${item.attuned ? 'attuned' : ''}`}>
              {item.attuned ? '◈ attuned' : '◇ attunement'}
            </span>
          )}
          {item.weight !== null && <span className="tag muted-tag">{item.weight * item.qty} lb</span>}
          {item.value && <span className="tag muted-tag">{item.value}</span>}
        </span>
      </div>
      <div className="item-actions">
        {moveTo === '' ? (
          <select
            className="move-select"
            value=""
            onChange={(e) => e.target.value && startMove(e.target.value as HolderId)}
          >
            <option value="">Give to…</option>
            {HOLDERS.filter((h) => h.id !== item.location).map((h) => (
              <option key={h.id} value={h.id}>
                {h.emoji} {h.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="move-qty-form">
            <input
              type="number"
              min={1}
              max={item.qty}
              value={moveQty}
              onChange={(e) => setMoveQty(Math.min(item.qty, Math.max(1, Number(e.target.value) || 1)))}
            />
            <button
              type="button"
              onClick={() => {
                onMove(item.id, moveTo, moveQty);
                setMoveTo('');
              }}
            >
              → {holderById(moveTo).name}
            </button>
            <button type="button" className="link-button" onClick={() => setMoveTo('')}>
              ✕
            </button>
          </span>
        )}
      </div>
      {expanded && (
        <ItemEditor
          item={item}
          holderAttuned={holderAttuned}
          attunementSlots={attunementSlots}
          onUpdate={(fields) => {
            onUpdate(item.id, fields);
            setExpanded(false);
          }}
          onDelete={() => onDelete(item.id)}
        />
      )}
    </li>
  );
}

function ItemEditor({
  item,
  holderAttuned,
  attunementSlots,
  onUpdate,
  onDelete,
}: {
  item: Item;
  holderAttuned: number;
  attunementSlots: number;
  onUpdate: (fields: Partial<Item>) => void;
  onDelete: () => void;
}) {
  const [f, setF] = useState({
    name: item.name,
    qty: item.qty,
    type: item.type,
    rarity: item.rarity,
    weight: item.weight === null ? '' : String(item.weight),
    value: item.value,
    magic: item.magic,
    requiresAttunement: item.requiresAttunement,
    attuned: item.attuned,
    notes: item.notes,
  });
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });

  const attuningNew = f.attuned && !item.attuned;
  const wouldExceed = attuningNew && item.location !== 'senchez' && holderAttuned >= attunementSlots;

  return (
    <form
      className="item-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onUpdate({
          name: f.name,
          qty: f.qty,
          type: f.type,
          rarity: f.rarity,
          weight: f.weight === '' ? null : Number(f.weight),
          value: f.value,
          magic: f.magic,
          requiresAttunement: f.requiresAttunement,
          attuned: f.requiresAttunement ? f.attuned : false,
          notes: f.notes,
        });
      }}
    >
      <label>
        Name
        <input value={f.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label>
        Qty
        <input type="number" min={1} value={f.qty} onChange={(e) => set({ qty: Math.max(1, Number(e.target.value) || 1) })} />
      </label>
      <label>
        Type
        <select value={f.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">—</option>
          {ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Rarity
        <select value={f.rarity} onChange={(e) => set({ rarity: e.target.value })}>
          <option value="">—</option>
          {RARITIES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label>
        Weight (lb each)
        <input type="number" min={0} step="0.1" value={f.weight} onChange={(e) => set({ weight: e.target.value })} />
      </label>
      <label>
        Value
        <input value={f.value} onChange={(e) => set({ value: e.target.value })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={f.magic} onChange={(e) => set({ magic: e.target.checked })} />
        Magic item
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={f.requiresAttunement}
          onChange={(e) => set({ requiresAttunement: e.target.checked, attuned: e.target.checked ? f.attuned : false })}
        />
        Requires attunement
      </label>
      {f.requiresAttunement && item.location !== 'senchez' && (
        <label className="check">
          <input type="checkbox" checked={f.attuned} onChange={(e) => set({ attuned: e.target.checked })} />
          Attuned to {holderById(item.location).name}
        </label>
      )}
      <label className="wide">
        Notes
        <input value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      {wouldExceed && (
        <div className="attune-warning wide">
          ⚠️ {holderById(item.location).name} already has {holderAttuned}/{attunementSlots} attunement slots in use.
          You can still save, but the rules will judge you.
        </div>
      )}
      <div className="editor-buttons wide">
        <button type="submit">Save</button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (confirm(`Remove ${item.name} entirely?`)) onDelete();
          }}
        >
          Delete
        </button>
      </div>
    </form>
  );
}
