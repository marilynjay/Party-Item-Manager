import { useState } from 'react';
import type { CategoryKey, HolderId, Icons, Item } from '../types';
import { HOLDERS, RARITIES, categoryLabel, categoryOf, hidesAttunement, hidesWeight, holderById, holderIcon, itemIcon } from '../types';
import { CategoryPicker } from './CategoryPicker';
import { ITEM_ICON_PRESETS, IconPicker } from './IconPicker';
import { compressImage } from '../image';

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
  const [view, setView] = useState<'closed' | 'detail' | 'edit'>('closed');
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveTo, setMoveTo] = useState<HolderId | ''>('');
  const [moveQty, setMoveQty] = useState(1);

  const startMove = (to: HolderId) => {
    if (item.qty === 1) {
      setMenuOpen(false);
      onMove(item.id, to, 1);
    } else {
      setMoveTo(to);
      // giving one from a stack is the common case; "give all" is the shortcut
      setMoveQty(1);
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
          setView('closed');
        }}
      >
        {menuOpen ? '✕' : '➤'}
      </button>
      <div className="item-main" onClick={() => { setView(view === 'closed' ? 'detail' : 'closed'); setMenuOpen(false); }}>
        <span className="item-name">
          <span className="item-icon">{itemIcon(item)}</span>
          {item.name}
          {item.qty > 1 && <span className="item-qty">×{item.qty}</span>}
        </span>
        {view !== 'closed' && (
          <span className="item-tags">
            {categoryLabel(item.category, item.subtype) && <span className="tag">{categoryLabel(item.category, item.subtype)}</span>}
            {item.rarity && <span className={`tag ${rarityClass(item.rarity)}`}>{item.rarity}</span>}
            {item.requiresAttunement && (
              <span className={`tag attune-tag ${item.attuned ? 'attuned' : ''}`}>
                {item.attuned ? '◈ attuned' : '◇ attunement'}
              </span>
            )}
            {item.weight !== null && <span className="tag muted-tag">{item.weight * item.qty} lb</span>}
            {item.value && <span className="tag muted-tag">{item.value}</span>}
          </span>
        )}
        {item.notes && view === 'closed' && (
          <span className="item-notes-preview muted">{previewText(item.notes)}</span>
        )}
      </div>
      {menuOpen && (
        <div className="overlay" onClick={() => setMenuOpen(false)}>
          <div className="modal send-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>
                {itemIcon(item)} {item.name}
                {item.qty > 1 && <span className="item-qty">×{item.qty}</span>}
              </h2>
              <button type="button" className="link-button" onClick={() => setMenuOpen(false)}>✕</button>
            </div>
            <div className="item-menu-heading muted">Give to</div>
            {moveTo === '' ? (
              <div className="send-holders">
                {HOLDERS.filter((h) => h.id !== item.location).map((h) => (
                  <button key={h.id} type="button" className="send-holder" onClick={() => startMove(h.id)}>
                    <span className="send-holder-emoji">{holderIcon(icons, h)}</span> {h.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="move-qty-form">
                <div className="qty-stepper">
                  <button type="button" disabled={moveQty <= 1} onClick={() => setMoveQty(moveQty - 1)}>−</button>
                  <input
                    type="number"
                    min={1}
                    max={item.qty}
                    value={moveQty}
                    onChange={(e) => setMoveQty(Math.min(item.qty, Math.max(1, Number(e.target.value) || 1)))}
                  />
                  <button type="button" disabled={moveQty >= item.qty} onClick={() => setMoveQty(moveQty + 1)}>＋</button>
                </div>
                <span className="muted">of {item.qty}</span>
                <button
                  type="button"
                  className="qty-confirm"
                  onClick={() => {
                    setMenuOpen(false);
                    setMoveTo('');
                    onMove(item.id, moveTo, moveQty);
                  }}
                >
                  Give {moveQty} → {holderById(moveTo).name}
                </button>
                {moveQty < item.qty && (
                  <button type="button" className="link-button" onClick={() => setMoveQty(item.qty)}>
                    all {item.qty}
                  </button>
                )}
                <button type="button" className="link-button" onClick={() => setMoveTo('')}>
                  ✕
                </button>
              </div>
            )}
            <div className="item-menu-heading muted">Or</div>
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
            <button type="button" className="link-button send-cancel" onClick={() => setMenuOpen(false)}>
              Cancel — keep it where it is
            </button>
          </div>
        </div>
      )}
      {view === 'detail' && <ItemDetail item={item} onEdit={() => setView('edit')} />}
      {view === 'edit' && (
        <ItemEditor
          item={item}
          holderAttuned={holderAttuned}
          attunementSlots={attunementSlots}
          onUpdate={(fields) => {
            onUpdate(item.id, fields);
            setView('closed');
          }}
          onCancel={() => setView('detail')}
        />
      )}
    </li>
  );
}

const NOTES_PREVIEW_CHARS = 90;
const previewText = (n: string) =>
  n.length > NOTES_PREVIEW_CHARS ? n.slice(0, NOTES_PREVIEW_CHARS).trimEnd() + '…' : n;

function ItemDetail({ item, onEdit }: { item: Item; onEdit: () => void }) {
  const [zoomed, setZoomed] = useState(false);
  const rows: Array<[string, React.ReactNode]> = [];
  const cat = categoryOf(item.category);
  if (cat) rows.push(['Type', `${cat.emoji} ${cat.name}${item.subtype ? ' · ' + item.subtype : ''}`]);
  if (item.rarity) rows.push(['Rarity', <span className={`rarity-${item.rarity.replace(/\s+/g, '-')}`}>{item.rarity}</span>]);
  if (item.qty > 1) rows.push(['Quantity', item.qty]);
  if (item.weight !== null)
    rows.push(['Weight', item.qty > 1 ? `${item.weight} lb each · ${item.weight * item.qty} lb total` : `${item.weight} lb`]);
  if (item.value) rows.push(['Value', item.value]);
  if (item.requiresAttunement)
    rows.push(['Attunement', item.attuned ? `◈ Attuned to ${holderById(item.location).name}` : '◇ Required, not attuned']);
  else if (item.magic) rows.push(['Magic', 'Yes']);

  return (
    <div className="item-detail">
      {item.image && (
        <img
          className="item-photo-thumb"
          src={item.image}
          alt={item.name}
          title="Tap to enlarge"
          onClick={() => setZoomed(true)}
        />
      )}
      {zoomed && item.image && (
        <div className="overlay photo-zoom" onClick={() => setZoomed(false)}>
          <img src={item.image} alt={item.name} />
        </div>
      )}
      {item.notes && <p className="item-detail-notes">{item.notes}</p>}
      {rows.length > 0 && (
        <dl className="item-detail-grid">
          {rows.map(([label, value]) => (
            <div key={label} className="item-detail-row">
              <dt className="muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {!item.notes && rows.length === 0 && <p className="muted item-detail-notes">Nothing more to tell about this one.</p>}
      <div className="item-detail-actions">
        <button type="button" className="link-button" onClick={onEdit}>✎ Edit</button>
      </div>
    </div>
  );
}

function ItemEditor({
  item,
  holderAttuned,
  attunementSlots,
  onUpdate,
  onCancel,
}: {
  item: Item;
  holderAttuned: number;
  attunementSlots: number;
  onUpdate: (fields: Partial<Item>) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    name: item.name,
    icon: item.icon ?? '',
    image: item.image,
    qty: item.qty,
    category: item.category as CategoryKey,
    subtype: item.subtype,
    rarity: item.rarity,
    weight: item.weight === null ? '' : String(item.weight),
    value: item.value,
    magic: item.magic,
    requiresAttunement: item.requiresAttunement,
    attuned: item.attuned,
    notes: item.notes,
  });
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const [pickingIcon, setPickingIcon] = useState(false);
  const [catDone, setCatDone] = useState(item.category !== '');
  const [photoError, setPhotoError] = useState('');
  const shownIcon = f.icon || itemIcon({ ...item, icon: '', name: f.name, category: f.category, subtype: f.subtype });

  const onPhotoFile = (file: File | undefined) => {
    if (!file) return;
    setPhotoError('');
    compressImage(file)
      .then((dataUrl) => set({ image: dataUrl }))
      .catch((e: Error) => setPhotoError(e.message));
  };

  const attuningNew = f.attuned && !item.attuned;
  const wouldExceed = attuningNew && item.location !== 'senchez' && holderAttuned >= attunementSlots;

  return (
    <form
      className="item-editor"
      onSubmit={(e) => {
        e.preventDefault();
        const noWeight = hidesWeight(f.category, f.subtype);
        const noAttune = hidesAttunement(f.category, f.subtype);
        onUpdate({
          name: f.name,
          icon: f.icon || undefined,
          image: f.image,
          qty: f.qty,
          category: f.category,
          subtype: f.subtype,
          rarity: f.rarity,
          weight: noWeight || f.weight === '' ? null : Number(f.weight),
          value: f.value,
          magic: f.magic,
          requiresAttunement: !noAttune && f.requiresAttunement,
          attuned: !noAttune && f.requiresAttunement ? f.attuned : false,
          notes: f.notes,
        });
      }}
    >
      <label>
        Name
        <span className="name-with-icon">
          <button type="button" className="item-icon-button" title="Change icon" onClick={() => setPickingIcon(true)}>
            {shownIcon}
          </button>
          <input value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </span>
      </label>
      <label>
        Qty
        <input type="number" min={1} value={f.qty} onChange={(e) => set({ qty: Math.max(1, Number(e.target.value) || 1) })} />
      </label>
      <div className="wide">
        <CategoryPicker
          category={f.category}
          subtype={f.subtype}
          complete={catDone}
          onChange={(category, subtype, done) => {
            set({ category, subtype });
            setCatDone(done);
          }}
        />
      </div>
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
      {!hidesWeight(f.category, f.subtype) && (
        <label>
          Weight (lb each)
          <input type="number" min={0} step="0.1" value={f.weight} onChange={(e) => set({ weight: e.target.value })} />
        </label>
      )}
      <label>
        Value
        <input value={f.value} onChange={(e) => set({ value: e.target.value })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={f.magic} onChange={(e) => set({ magic: e.target.checked })} />
        Magic item
      </label>
      {!hidesAttunement(f.category, f.subtype) && (
        <label className="check">
          <input
            type="checkbox"
            checked={f.requiresAttunement}
            onChange={(e) => set({ requiresAttunement: e.target.checked, attuned: e.target.checked ? f.attuned : false })}
          />
          Requires attunement
        </label>
      )}
      {!hidesAttunement(f.category, f.subtype) && f.requiresAttunement && item.location !== 'senchez' && (
        <label className="check">
          <input type="checkbox" checked={f.attuned} onChange={(e) => set({ attuned: e.target.checked })} />
          Attuned to {holderById(item.location).name}
        </label>
      )}
      <label className="wide">
        Notes
        <textarea rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      {wouldExceed && (
        <div className="attune-warning wide">
          ⚠️ {holderById(item.location).name} already has {holderAttuned}/{attunementSlots} attunement slots in use.
          You can still save, but the rules will judge you.
        </div>
      )}
      <div className="wide photo-field">
        {f.image ? (
          <span className="photo-controls">
            <img className="item-photo-mini" src={f.image} alt="" />
            <label className="link-button photo-pick">
              Replace picture
              <input type="file" accept="image/*" hidden onChange={(e) => onPhotoFile(e.target.files?.[0])} />
            </label>
            <button type="button" className="link-button danger-link" onClick={() => set({ image: undefined })}>
              Remove
            </button>
          </span>
        ) : (
          <label className="link-button photo-pick">
            📷 Add a picture
            <input type="file" accept="image/*" hidden onChange={(e) => onPhotoFile(e.target.files?.[0])} />
          </label>
        )}
        {photoError && <span className="muted photo-error">{photoError}</span>}
      </div>
      <div className="editor-buttons wide">
        <button type="submit">Save</button>
        <button type="button" className="link-button" onClick={onCancel}>Cancel</button>
      </div>
      {pickingIcon && (
        <IconPicker
          title={`${f.name || 'item'} icon`}
          presets={ITEM_ICON_PRESETS}
          current={shownIcon}
          onPick={(icon) => {
            set({ icon });
            setPickingIcon(false);
          }}
          onClose={() => setPickingIcon(false)}
        />
      )}
    </form>
  );
}
