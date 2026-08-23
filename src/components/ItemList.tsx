import { useState } from 'react';
import type { HolderId, Icons, Item } from '../types';
import { HOLDERS, ITEM_TYPES, RARITIES, holderById, holderIcon } from '../types';

interface Props {
  items: Item[];
  icons: Icons;
  groupByHolder: boolean;
  highlightMagic: boolean;
  attunedCounts: Map<HolderId, number>;
  attunementSlots: number;
  isMagic: (i: Item) => boolean;
  emptyMessage: string;
  onMove: (id: string, to: HolderId, qty: number) => void;
  onConsume: (id: string) => void;
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
            <span>{holderIcon(props.icons, h)}</span> {h.name}
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
  icons,
  isMagic,
  attunedCounts,
  attunementSlots,
  onMove,
  onConsume,
  onUpdate,
  onDelete,
}: Props & { item: Item }) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveTo, setMoveTo] = useState<HolderId | ''>('');
  const [moveQty, setMoveQty] = useState(1);

  const startMove = (to: HolderId) => {
    if (item.qty === 1) {
      setMenuOpen(false);
      onMove(item.id, to, 1);
    } else {
      setMoveTo(to);
      setMoveQty(item.qty);
    }
  };

  const holderAttuned = item.location !== 'senchez' ? (attunedCounts.get(item.location) ?? 0) : 0;

  return (
    <li className={`item-row ${isMagic(item) ? 'magic' : ''}`}>
      <button
        type="button"
        className={`item-send ${menuOpen ? 'open' : ''}`}
        title={menuOpen ? 'Close' : 'Give away, use, or discard'}
        onClick={() => {
          setMenuOpen(!menuOpen);
          setMoveTo('');
          setExpanded(false);
        }}
      >
        {menuOpen ? '✕' : '➤'}
      </button>
      <div className="item-main" onClick={() => { setExpanded(!expanded); setMenuOpen(false); }}>
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
      {menuOpen && (
        <div className="item-menu">
          <div className="item-menu-heading muted">Give to</div>
          {moveTo === '' ? (
            <div className="item-menu-holders">
              {HOLDERS.filter((h) => h.id !== item.location).map((h) => (
                <button key={h.id} type="button" className="chip" onClick={() => startMove(h.id)}>
                  {holderIcon(icons, h)} {h.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="move-qty-form">
              <input
                type="number"
                min={1}
                max={item.qty}
                value={moveQty}
                autoFocus
                onChange={(e) => setMoveQty(Math.min(item.qty, Math.max(1, Number(e.target.value) || 1)))}
              />
              <span className="muted">of {item.qty}</span>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setMoveTo('');
                  onMove(item.id, moveTo, moveQty);
                }}
              >
                → {holderById(moveTo).name}
              </button>
              <button type="button" className="link-button" onClick={() => setMoveTo('')}>
                ✕
              </button>
            </div>
          )}
          <div className="item-menu-actions">
            <button type="button" onClick={() => { setMenuOpen(false); onConsume(item.id); }}>
              🧪 Use one
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (confirm(`Discard ${item.qty > 1 ? `all ${item.qty} × ` : ''}${item.name}? (Sold, lost, or trashed — it comes off the list.)`)) {
                  setMenuOpen(false);
                  onDelete(item.id);
                }
              }}
            >
              🗑️ Discard
            </button>
          </div>
        </div>
      )}
      {expanded && (
        <ItemEditor
          item={item}
          holderAttuned={holderAttuned}
          attunementSlots={attunementSlots}
          onUpdate={(fields) => {
            onUpdate(item.id, fields);
            setExpanded(false);
          }}
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
}: {
  item: Item;
  holderAttuned: number;
  attunementSlots: number;
  onUpdate: (fields: Partial<Item>) => void;
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
      </div>
    </form>
  );
}
