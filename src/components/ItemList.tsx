import { AutoTextarea } from './AutoTextarea';
import { useState } from 'react';
import type { CategoryKey, HolderId, Icons, Item, JournalEntry } from '../types';
import type { FormField, ItemStats } from '../types';
import { CATEGORIES, HOLDERS, RARITIES, canJournal, categoryLabel, categoryOf, formPlan, notesLabel, planHas, statPlan, holderById, holderIcon, itemIcon } from '../types';
import { StatFieldControl, cleanStats } from './StatFields';
import { DiceGroup } from './Dice';
import { parseRoll, parseSpellLines, rollDice } from '../dice';
import type { RollResult } from '../dice';
import { CategoryPicker } from './CategoryPicker';
import { ITEM_ICON_PRESETS, IconPicker } from './IconPicker';
import { compressImage } from '../image';

interface Props {
  items: Item[];
  icons: Icons;
  groupByHolder: boolean;
  holderChips?: boolean;
  collapseScope: string;
  filtering: boolean;
  highlightMagic: boolean;
  attunedCounts: Map<HolderId, number>;
  attunementSlots: number;
  isMagic: (i: Item) => boolean;
  emptyMessage: string;
  onMove: (id: string, to: HolderId, qty: number) => void;
  onConsume: (id: string, note?: string) => void;
  onSpend: (id: string) => void;
  onRecharge: (id: string) => void;
  onCast: (id: string, spell: string, cost: number) => void;
  onUpdate: (id: string, fields: Partial<Item>) => void;
  onDelete: (id: string) => void;
  onAddEntry: (id: string, fields: { title?: string; text: string; image?: string }) => void;
  onUpdateEntry: (id: string, entryId: string, fields: { title?: string; text: string; image?: string }) => void;
  onDeleteEntry: (id: string, entryId: string) => void;
}

const rarityClass = (r: string) => 'rarity-' + r.replace(/\s+/g, '-');

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

export function ItemList(props: Props) {
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
  if (items.length === 0) return <div className="empty muted">{emptyMessage}</div>;

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
                <span className="fold-caret">{folded ? '▸' : '▾'}</span>
                {g.label} <span className="cat-group-count">· {g.items.length}</span>
                {lb > 0 && <span className="cat-group-weight">{lb.toLocaleString()} lb</span>}
              </button>
              {!folded && (
                <ul className="item-list">
                  {g.items.map((i) => (
                    <ItemRow key={i.id} item={i} {...props} />
                  ))}
                </ul>
              )}
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
              <span className="fold-caret muted">{folded ? '▸' : '▾'}</span>
              <span>{holderIcon(props.icons, h)}</span> {h.name}
              <span className="muted"> · {items.filter((i) => i.location === h.id).length}</span>
            </button>
            {!folded && (
              <ul className="item-list">
                {items
                  .filter((i) => i.location === h.id)
                  .sort(byTaxonomy)
                  .map((i) => (
                    <ItemRow key={i.id} item={i} {...props} />
                  ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

function ItemRow({
  item,
  icons,
  holderChips,
  isMagic,
  attunedCounts,
  attunementSlots,
  onMove,
  onConsume,
  onSpend,
  onRecharge,
  onCast,
  onUpdate,
  onDelete,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
}: Props & { item: Item }) {
  const [view, setView] = useState<'closed' | 'detail' | 'edit'>('closed');
  const [menuOpen, setMenuOpen] = useState(false);
  const [rollFor, setRollFor] = useState(false);
  const [moveTo, setMoveTo] = useState<HolderId | ''>('');
  const [moveQty, setMoveQty] = useState(1);

  const useOne = () => {
    setMenuOpen(false);
    // heal formulas go through the roll dialog, which has its own cancel
    if (item.stats?.heal && parseRoll(item.stats.heal)) {
      setRollFor(true);
      return;
    }
    const tail = item.qty > 1 ? `(${item.qty - 1} left after)` : "that's the last one!";
    if (confirm(`Use a ${item.name}? ${tail}`)) onConsume(item.id);
  };

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

  const toggleAttune = () => {
    if (!item.requiresAttunement || item.location === 'senchez') return;
    if (!item.attuned && holderAttuned >= attunementSlots) {
      if (!confirm(`${holderById(item.location).name} already has ${holderAttuned}/${attunementSlots} attunement slots in use. Attune anyway?`)) return;
    }
    onUpdate(item.id, { attuned: !item.attuned });
  };

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
      {view !== 'closed' && (
      <button
        type="button"
        className="item-trash"
        title="Discard"
        onClick={() => {
          if (confirm(`Discard ${item.qty > 1 ? `all ${item.qty} × ` : ''}${item.name}? (Sold, lost, or trashed — it comes off the list.)`)) {
            onDelete(item.id);
          }
        }}
      >
        🗑
      </button>
      )}
      <div className="item-main" onClick={() => { setView(view === 'closed' ? 'detail' : 'closed'); setMenuOpen(false); }}>
        <span className="item-name">
          <span className="item-icon">{itemIcon(item)}</span>
          {item.name}
          {item.qty > 1 && <span className="item-qty">×{item.qty}</span>}
        </span>
        {holderChips && (
          <span className="holder-chip muted">
            {holderIcon(icons, holderById(item.location))} {holderById(item.location).name}
          </span>
        )}
        {view !== 'closed' && (
          <span className="item-tags">
            {categoryLabel(item.category, item.subtype) && <span className="tag">{categoryLabel(item.category, item.subtype)}</span>}
            {item.rarity && <span className={`tag ${rarityClass(item.rarity)}`}>{item.rarity}</span>}
            {item.requiresAttunement && (
              <button
                type="button"
                className={`tag attune-tag attune-toggle ${item.attuned ? 'attuned' : ''}`}
                title={item.location === 'senchez' ? 'Attunement needs a wielder, not a bag' : item.attuned ? 'Tap to end attunement' : `Tap to attune ${holderById(item.location).name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAttune();
                }}
              >
                {item.attuned ? '◈ attuned' : '◇ attunement'}
              </button>
            )}
            {item.stats?.charges !== undefined && (
              <span className="tag charges-tag">⚡ {item.stats.charges}{item.stats.chargesMax !== undefined ? `/${item.stats.chargesMax}` : ''}</span>
            )}
            {item.weight !== null && <span className="tag muted-tag">{item.weight * item.qty} lb</span>}
            {item.value && <span className="tag muted-tag">{item.value}</span>}
          </span>
        )}
        {view === 'closed' && (() => {
          // papery preview: the contents line, else the freshest journal entry, else notes
          const latest = item.entries?.length ? item.entries[item.entries.length - 1] : undefined;
          const line = item.content || latest?.title || latest?.text || item.notes;
          return line ? <span className="item-notes-preview muted">{previewText(line)}</span> : null;
        })()}
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
              <button type="button" onClick={useOne}>
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
      {rollFor && item.stats?.heal && (
        <RollDialog
          itemName={item.name}
          formula={item.stats.heal}
          onConsume={(note) => {
            setRollFor(false);
            onConsume(item.id, note);
          }}
          onCancel={() => setRollFor(false)}
        />
      )}
      {view === 'detail' && (
        <ItemDetail
          item={item}
          onEdit={() => setView('edit')}
          onUse={item.category === 'consumable' ? useOne : undefined}
          onToggleAttune={item.requiresAttunement && item.location !== 'senchez' ? toggleAttune : undefined}
          onSpend={() => onSpend(item.id)}
          onRecharge={() => onRecharge(item.id)}
          onCast={(spell, cost) => onCast(item.id, spell, cost)}
          onAddEntry={(fields) => onAddEntry(item.id, fields)}
          onUpdateEntry={(entryId, fields) => onUpdateEntry(item.id, entryId, fields)}
          onDeleteEntry={(entryId) => onDeleteEntry(item.id, entryId)}
        />
      )}
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

function ItemDetail({ item, onEdit, onUse, onToggleAttune, onSpend, onRecharge, onCast, onAddEntry, onUpdateEntry, onDeleteEntry }: { item: Item; onEdit: () => void; onUse?: () => void; onToggleAttune?: () => void; onSpend: () => void; onRecharge: () => void; onCast: (spell: string, cost: number) => void; onAddEntry: (fields: { title?: string; text: string; image?: string }) => void; onUpdateEntry: (entryId: string, fields: { title?: string; text: string; image?: string }) => void; onDeleteEntry: (entryId: string) => void }) {
  const [zoomed, setZoomed] = useState(false);
  const rows: Array<[string, React.ReactNode]> = [];
  const cat = categoryOf(item.category);
  const s = item.stats ?? {};
  if (cat) rows.push(['Type', `${cat.emoji} ${cat.name}${item.subtype ? ' · ' + item.subtype : ''}`]);
  if (s.dmg || s.dtype || s.bonus)
    rows.push(['Damage', [s.dmg, s.dtype, s.bonus ? `+${s.bonus}` : ''].filter(Boolean).join(' ')]);
  if (s.properties) rows.push(['Properties', s.properties]);
  if (s.ac)
    rows.push(['AC', [s.ac, s.armorClass, s.stealthDis ? 'Stealth dis.' : '', s.strReq ? `Str ${s.strReq}` : ''].filter(Boolean).join(' · ')]);
  if (s.charges !== undefined || s.chargesMax !== undefined)
    rows.push([
      'Charges',
      <span className="charges-row">
        ⚡ {s.charges ?? '?'}{s.chargesMax !== undefined ? `/${s.chargesMax}` : ''}
        {s.recharge && <span className="muted"> · {s.recharge}</span>}
        <button type="button" className="charge-btn" disabled={(s.charges ?? 0) <= 0} onClick={onSpend}>− Spend</button>
        {s.chargesMax !== undefined && (s.charges ?? 0) < s.chargesMax && (
          <button type="button" className="charge-btn" onClick={onRecharge}>↺ Recharge</button>
        )}
      </span>,
    ]);
  if (s.spellLevel || s.dc) rows.push(['Spell', [s.spellLevel && `${s.spellLevel} level`, s.dc].filter(Boolean).join(' · ')]);
  if (s.capacity) rows.push(['Capacity', s.capacity]);
  if (s.language) rows.push(['Language', s.language]);
  if (s.cursed) rows.push(['💀 Cursed', s.curseText || 'Yes — someone should probably mention that.']);
  if (item.rarity) rows.push(['Rarity', <span className={`rarity-${item.rarity.replace(/\s+/g, '-')}`}>{item.rarity}</span>]);
  if (item.qty > 1) rows.push(['Quantity', item.qty]);
  if (item.weight !== null)
    rows.push(['Weight', item.qty > 1 ? `${item.weight} lb each · ${item.weight * item.qty} lb total` : `${item.weight} lb`]);
  if (item.value) rows.push(['Value', item.value]);
  if (item.requiresAttunement)
    rows.push([
      'Attunement',
      <span className="charges-row">
        {item.attuned ? `◈ Attuned to ${holderById(item.location).name}` : '◇ Required, not attuned'}
        {onToggleAttune && (
          <button type="button" className="charge-btn" onClick={onToggleAttune}>
            {item.attuned ? 'End attunement' : `Attune ${holderById(item.location).name}`}
          </button>
        )}
      </span>,
    ]);
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
      {item.content && (
        <div className="item-detail-contents">
          <span className="item-menu-heading muted">Contents</span>
          <p className="item-detail-notes item-content-text">{item.content}</p>
        </div>
      )}
      {canJournal(item.category) && (
        <EntriesSection
          entries={item.entries ?? []}
          itemName={item.name}
          onAdd={onAddEntry}
          onUpdate={onUpdateEntry}
          onDelete={onDeleteEntry}
        />
      )}
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
      {s.spells && (
        <div className="spell-list">
          <span className="item-menu-heading muted">Spells</span>
          {parseSpellLines(s.spells).map((sp, i) => (
            <div className="spell-row" key={sp.name + i}>
              <span className="spell-name">{sp.name}</span>
              <span className="spell-cost muted">⚡{sp.cost}</span>
              {s.charges !== undefined && (
                <button
                  type="button"
                  className="charge-btn"
                  disabled={(s.charges ?? 0) < sp.cost}
                  title={(s.charges ?? 0) < sp.cost ? 'Not enough charges' : `Spend ${sp.cost} charge${sp.cost === 1 ? '' : 's'}`}
                  onClick={() => onCast(sp.name, sp.cost)}
                >
                  Cast
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!item.notes && rows.length === 0 && <p className="muted item-detail-notes">Nothing more to tell about this one.</p>}
      <div className="item-detail-actions">
        {onUse && (
          <button type="button" className="detail-use" onClick={onUse}>
            🧪 Use one
          </button>
        )}
        <button type="button" className="link-button" onClick={onEdit}>✎ Edit</button>
      </div>
    </div>
  );
}

// A journal's pages: dated entries in the order written, each with an
// optional title and sketch, editable in place. Lives in the detail view
// so jotting something down never goes through the full item editor.
function EntriesSection({
  entries,
  itemName,
  onAdd,
  onUpdate,
  onDelete,
}: {
  entries: JournalEntry[];
  itemName: string;
  onAdd: (fields: { title?: string; text: string; image?: string }) => void;
  onUpdate: (entryId: string, fields: { title?: string; text: string; image?: string }) => void;
  onDelete: (entryId: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null); // entry id, or 'new'
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  const zoomed = entries.find((e) => e.id === zoomedId);
  const when = (at: number) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="entry-section">
      {entries.length > 0 && <span className="item-menu-heading muted">Entries</span>}
      {entries.map((e) =>
        editing === e.id ? (
          <EntryEditor
            key={e.id}
            initial={e}
            itemName={itemName}
            onSave={(fields) => {
              onUpdate(e.id, fields);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div key={e.id} className="entry">
            <div className="entry-head">
              {e.title && <span className="entry-title">{e.title}</span>}
              <span className="entry-date muted">{when(e.at)}</span>
              <span className="entry-tools">
                <button type="button" className="entry-tool" title="Edit this entry" onClick={() => setEditing(e.id)}>✎</button>
                <button
                  type="button"
                  className="entry-tool"
                  title="Tear out this page"
                  onClick={() => {
                    if (confirm(`Tear this page out of ${itemName}?${e.title ? ` (“${e.title}”)` : ''}`)) onDelete(e.id);
                  }}
                >
                  🗑
                </button>
              </span>
            </div>
            {e.text && <p className="entry-text">{e.text}</p>}
            {e.image && (
              <img className="entry-photo" src={e.image} alt={e.title || 'sketch'} title="Tap to enlarge" onClick={() => setZoomedId(e.id)} />
            )}
          </div>
        )
      )}
      {zoomed?.image && (
        <div className="overlay photo-zoom" onClick={() => setZoomedId(null)}>
          <img src={zoomed.image} alt={zoomed.title || 'sketch'} />
        </div>
      )}
      {editing === 'new' ? (
        <EntryEditor
          itemName={itemName}
          onSave={(fields) => {
            onAdd(fields);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" className="link-button entry-add" onClick={() => setEditing('new')}>
          ＋ Add entry
        </button>
      )}
    </div>
  );
}

// Deliberately not a <form>: the editor can render inside other layouts,
// and buttons submit explicitly.
function EntryEditor({
  initial,
  itemName,
  onSave,
  onCancel,
}: {
  initial?: JournalEntry;
  itemName: string;
  onSave: (fields: { title?: string; text: string; image?: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [image, setImage] = useState(initial?.image);
  const [photoError, setPhotoError] = useState('');

  const onPhotoFile = (file: File | undefined) => {
    if (!file) return;
    setPhotoError('');
    compressImage(file)
      .then(setImage)
      .catch((e: Error) => setPhotoError(e.message));
  };

  return (
    <div className="entry-editor">
      <input
        className="entry-title-input"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <AutoTextarea
        rows={3}
        autoFocus={!initial}
        placeholder={`Write in ${itemName}…`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="entry-editor-photo">
        {image ? (
          <span className="photo-controls">
            <img className="item-photo-mini" src={image} alt="" />
            <label className="link-button photo-pick">
              Replace sketch
              <input type="file" accept="image/*" hidden onChange={(e) => onPhotoFile(e.target.files?.[0])} />
            </label>
            <button type="button" className="link-button danger-link" onClick={() => setImage(undefined)}>
              Remove
            </button>
          </span>
        ) : (
          <label className="link-button photo-pick">
            📷 Add a sketch
            <input type="file" accept="image/*" hidden onChange={(e) => onPhotoFile(e.target.files?.[0])} />
          </label>
        )}
        {photoError && <span className="muted photo-error">{photoError}</span>}
      </div>
      <div className="entry-editor-buttons">
        <button
          type="button"
          className="entry-save"
          disabled={!text.trim() && !image}
          onClick={() => onSave({ title: title.trim() || undefined, text, image })}
        >
          Save entry
        </button>
        <button type="button" className="link-button" onClick={onCancel}>Cancel</button>
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
    content: item.content ?? '',
    stats: { ...(item.stats ?? {}) } as ItemStats,
  });
  const plan = formPlan(item.category, item.subtype);
  const sPlan = statPlan(item.category, item.subtype);
  // surface the tucked-away fields if any of them already hold a value
  const [moreOpen, setMoreOpen] = useState(
    Boolean(item.rarity || item.value || item.magic || item.requiresAttunement || item.weight !== null || item.stats?.cursed || item.stats?.properties)
  );
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

  const editorField = (field: FormField, advanced = false): React.ReactNode => {
    const tier = advanced ? plan.advanced : plan.primary;
    if (!tier.includes(field)) return null;
    switch (field) {
      case 'rarity':
        return (
          <label key={field}>
            Rarity
            <select value={f.rarity} onChange={(e) => set({ rarity: e.target.value })}>
              <option value="">—</option>
              {RARITIES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
        );
      case 'weight':
        return (
          <label key={field}>
            Weight (lb each)
            <input type="number" min={0} step="0.1" value={f.weight} onChange={(e) => set({ weight: e.target.value })} />
          </label>
        );
      case 'value':
        return (
          <label key={field}>
            Value
            <input value={f.value} onChange={(e) => set({ value: e.target.value })} />
          </label>
        );
      case 'magic':
        return (
          <label key={field} className="check">
            <input type="checkbox" checked={f.magic} onChange={(e) => set({ magic: e.target.checked })} />
            Magic item
          </label>
        );
      case 'attunement':
        return (
          <span key={field} className="attune-pair">
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
          </span>
        );
      case 'content':
        return (
          <label key={field} className="wide">
            Contents — what's written on it
            <AutoTextarea rows={3} value={f.content} onChange={(e) => set({ content: e.target.value })} />
          </label>
        );
    }
  };

  const attuningNew = f.attuned && !item.attuned;
  const wouldExceed = attuningNew && item.location !== 'senchez' && holderAttuned >= attunementSlots;

  return (
    <form
      className="item-editor"
      onSubmit={(e) => {
        e.preventDefault();
        const noWeight = !planHas(f.category, f.subtype, 'weight');
        const noAttune = !planHas(f.category, f.subtype, 'attunement');
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
          content: planHas(f.category, f.subtype, 'content') ? f.content : '',
          stats: cleanStats(f.stats, [...sPlan.primary, ...sPlan.advanced]),
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
      {editorField('rarity')}
      {editorField('weight')}
      {editorField('value')}
      {sPlan.primary.map((sf) => (
        <StatFieldControl key={sf} field={sf} stats={f.stats} onChange={(patch) => set({ stats: { ...f.stats, ...patch } })} />
      ))}
      {editorField('content')}
      <label className="wide">
        {notesLabel(f.category, f.subtype)}
        <AutoTextarea rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      {plan.advanced.length + sPlan.advanced.length > 0 && (
        <div className="wide">
          <button type="button" className="link-button" onClick={() => setMoreOpen(!moreOpen)}>
            More options {moreOpen ? '▴' : '▾'}
          </button>
        </div>
      )}
      {moreOpen && (<>
        {editorField('rarity', true)}
        {editorField('weight', true)}
        {editorField('value', true)}
        {editorField('magic', true)}
        {editorField('attunement', true)}
        {sPlan.advanced.map((sf) => (
          <StatFieldControl key={sf} field={sf} stats={f.stats} onChange={(patch) => set({ stats: { ...f.stats, ...patch } })} />
        ))}
      </>)}
      {editorField('magic')}
      {editorField('attunement')}
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


// Drink-a-potion dialog: roll in the app (with the tumble) or roll real dice.
function RollDialog({
  itemName,
  formula,
  onConsume,
  onCancel,
}: {
  itemName: string;
  formula: string;
  onConsume: (note?: string) => void;
  onCancel: () => void;
}) {
  const [result, setResult] = useState<RollResult | null>(null);
  const [settled, setSettled] = useState(false);
  const parsed = parseRoll(formula)!;

  return (
    <div className="overlay" onClick={result ? undefined : onCancel}>
      <div className="modal roll-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🧪 {itemName}</h2>
          {!result && <button type="button" className="link-button" onClick={onCancel}>✕</button>}
        </div>
        {!result ? (
          <>
            <p className="muted roll-blurb">Heals {formula}. Who's rolling?</p>
            <div className="roll-choices">
              <button type="button" className="coin-add" onClick={() => setResult(rollDice(parsed))}>
                🎲 Roll it here
              </button>
              <button type="button" onClick={() => onConsume(undefined)}>
                I'll roll my own dice
              </button>
            </div>
            <button type="button" className="link-button send-cancel" onClick={onCancel}>
              Cancel — don't use it
            </button>
          </>
        ) : (
          <div className="roll-stage">
            <DiceGroup sides={parsed.d} rolls={result.rolls} onSettled={() => setSettled(true)} />
            <div className={`roll-total ${settled ? 'shown' : ''}`}>
              {result.rolls.join(' + ')}
              {result.mod !== 0 && ` ${result.mod > 0 ? '+' : '−'} ${Math.abs(result.mod)}`} ={' '}
              <strong>{result.total} HP</strong>
            </div>
            <button
              type="button"
              className={`coin-add roll-done ${settled ? 'shown' : ''}`}
              onClick={() => onConsume(`rolled ${formula} = ${result.total} HP`)}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
