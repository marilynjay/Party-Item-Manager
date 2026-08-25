import { useMemo, useState } from 'react';
import { AutoTextarea } from './AutoTextarea';
import type { CategoryKey, Item, JournalEntry } from '../types';
import { canJournal, categoryOf, defaultIcon, holderById, isFood } from '../types';
import { CATALOG } from '../catalog';
import { diceText, findRoll, neverRecharges, parseSpellLines } from '../dice';
import { spellDisplay, spellKnown } from '../spellbook';
import { findSpellForItem, tokenizeSpells } from '../spellLinks';
import { SpellCard } from './SpellCard';
import { RechargeDialog } from './RollDialog';
import { compressImage } from '../image';

// A little freshness bar: fill and color track the fraction of its shelf
// life remaining — green while it keeps, through yellow and orange, red on
// the last days. Shared by the plaque (mini) and the detail row.
export function FreshnessGauge({ left, max, mini = false }: { left: number; max: number; mini?: boolean }) {
  const frac = max > 0 ? Math.max(0, Math.min(1, left / max)) : 0;
  const hue = Math.round(120 * frac);
  return (
    <span className={`fresh-gauge ${mini ? 'fresh-mini' : ''}`} title={`${left} of ${max} rests left`} aria-hidden>
      <span className="fresh-fill" style={{ width: `${Math.round(frac * 100)}%`, background: `hsl(${hue}, 72%, 45%)` }} />
    </span>
  );
}

export function ItemDetail({ item, onEdit, onToss, onUse, onToggleAttune, onSpend, onRecharge, onCast, onAddEntry, onUpdateEntry, onDeleteEntry, onUnpack, onPackRow, onSip, onEmpty, onFill, onAmmo }: { item: Item; onEdit: () => void; onToss?: () => void; onUse?: () => void; onToggleAttune?: () => void; onSpend: () => void; onRecharge: (rolled?: number) => void; onCast: (spell: string, cost: number) => void; onAddEntry: (fields: { title?: string; text: string; image?: string }) => void; onUpdateEntry: (entryId: string, fields: { title?: string; text: string; image?: string }) => void; onDeleteEntry: (entryId: string) => void; onUnpack?: () => void; onPackRow?: (entryName: string) => void; onSip?: () => void; onEmpty?: () => void; onFill?: () => void; onAmmo?: (delta: number) => void }) {
  const [zoomed, setZoomed] = useState(false);
  const [spellView, setSpellView] = useState<string | null>(null);
  const [castFx, setCastFx] = useState<number | null>(null); // sparkling spell row
  const [sunrise, setSunrise] = useState(false); // recharge glow sweep
  const [recharging, setRecharging] = useState(false); // the dice-recharge dialog
  const rows: Array<[string, React.ReactNode]> = [];
  const cat = categoryOf(item.category);
  const s = item.stats ?? {};
  // an item named for a known spell ("Spell Scroll: Fireball", "Wand of
  // Fireballs") gets a lookup card, unless its spell list already covers that
  const nameSpell = useMemo(
    () => (s.spells || s.spell ? null : findSpellForItem(item.name, item.subtype)),
    [s.spells, s.spell, item.subtype, item.name]
  );
  // prose with a spell name in book casing gets an inline link
  const prose = (text: string) =>
    tokenizeSpells(text).map((t, i) =>
      t.spell ? (
        <button key={i} type="button" className="spell-link" title="Read the spell" onClick={() => setSpellView(t.spell!)}>
          {t.text}
        </button>
      ) : (
        <span key={i}>{t.text}</span>
      )
    );
  if (cat) rows.push(['Type', `${cat.emoji} ${cat.name}${item.subtype ? ' · ' + item.subtype : ''}`]);
  if (s.dmg || s.dtype || s.bonus)
    rows.push(['Damage', [s.dmg, s.dtype, s.bonus ? `+${s.bonus}` : ''].filter(Boolean).join(' ')]);
  if (s.properties) rows.push(['Properties', s.properties]);
  if (s.ac)
    rows.push(['AC', [s.ac, s.armorClass, s.stealthDis ? 'Stealth dis.' : '', s.strReq ? `Str ${s.strReq}` : ''].filter(Boolean).join(' · ')]);
  if (s.charges !== undefined || s.chargesMax !== undefined)
    rows.push([
      'Charges',
      <span className={`charges-row ${sunrise ? 'sunrise' : ''}`}>
        <span key={`c${s.charges}`} className="pop">⚡ {s.charges ?? '?'}{s.chargesMax !== undefined ? `/${s.chargesMax}` : ''}</span>
        {s.recharge && <span className="muted"> · {s.recharge}</span>}
        <button type="button" className="charge-btn" disabled={(s.charges ?? 0) <= 0} onClick={onSpend}>− Spend</button>
        {s.chargesMax !== undefined && (s.charges ?? 0) < s.chargesMax && !neverRecharges(s.recharge) && (
          <button
            type="button"
            className="charge-btn"
            onClick={() => {
              // dice recharges ask for the roll; automatic ones just refill
              if (s.recharge && findRoll(s.recharge)) {
                setRecharging(true);
                return;
              }
              setSunrise(true);
              setTimeout(() => setSunrise(false), 900);
              onRecharge();
            }}
          >
            ↺ Recharge
          </button>
        )}
      </span>,
    ]);
  const carried = s.spell?.trim();
  if (carried || s.spellLevel || s.dc || nameSpell) {
    const meta = [s.spellLevel && `${s.spellLevel} level`, s.dc].filter(Boolean).join(' · ');
    rows.push([
      'Spell',
      <span className="charges-row">
        {carried &&
          (spellKnown(carried) ? (
            <button
              type="button"
              className="spell-link"
              title="Read the spell"
              onClick={() => setSpellView(carried.toLowerCase())}
            >
              {spellDisplay(carried)}
            </button>
          ) : (
            <span>{carried}</span>
          ))}
        {meta && <span className="muted">{meta}</span>}
        {!carried && nameSpell && (
          <button type="button" className="charge-btn" title="Read the spell" onClick={() => setSpellView(nameSpell)}>
            📖 {spellDisplay(nameSpell)}
          </button>
        )}
      </span>,
    ]);
  }
  if (s.capacity) rows.push(['Capacity', s.capacity]);
  if (item.liquid)
    rows.push([
      'Contains',
      <span className="charges-row">
        <span key={`l${item.liquid.doses}`} className="pop">
          🫗 {item.liquid.name}
          {item.liquid.doses > 1 && <span className="muted"> · {item.liquid.doses} doses</span>}
        </span>
        {onSip && <button type="button" className="charge-btn" onClick={onSip}>Use 1</button>}
        {onEmpty && <button type="button" className="charge-btn" onClick={onEmpty}>🫗 Empty</button>}
      </span>,
    ]);
  else if (onFill)
    rows.push([
      'Contains',
      <span className="charges-row">
        <span className="muted">— empty —</span>
        <button type="button" className="charge-btn" onClick={onFill}>🫗 Fill…</button>
      </span>,
    ]);
  if (s.language) rows.push(['Language', s.language]);
  if (s.cursed) rows.push(['💀 Cursed', <span className="curse-flicker">{s.curseText || 'Yes — someone should probably mention that.'}</span>]);
  if (item.freshness !== undefined) {
    const food = isFood(item.category, item.subtype);
    rows.push([
      food ? 'Freshness' : 'Keeps until',
      item.freshness <= 0 ? (
        <span className="charges-row">
          <span className="spoiled-text">
            {food ? '🤢 Spoiled — eat at your own risk' : '⌛ Expired — no longer any good'}
          </span>
          {onToss && (
            <button type="button" className="charge-btn" title="Throw the whole lot out — no questions asked" onClick={onToss}>
              🗑 Toss it
            </button>
          )}
        </span>
      ) : (
        <span className="charges-row">
          <FreshnessGauge left={item.freshness} max={item.freshnessMax ?? item.freshness} />
          {item.freshness} of {item.freshnessMax ?? item.freshness} rest{(item.freshnessMax ?? item.freshness) === 1 ? '' : 's'} left
          {item.freshness <= 2 && <span className="muted"> — {food ? 'eat it soon' : 'not much time left'}</span>}
        </span>
      ),
    ]);
  }
  if (item.rarity) rows.push(['Rarity', <span className={`rarity-${item.rarity.replace(/\s+/g, '-')}`}>{item.rarity}</span>]);
  if (onAmmo) rows.push(['Ammo', <AmmoRow qty={item.qty} onAmmo={onAmmo} />]);
  else if (item.qty > 1) rows.push(['Quantity', item.qty]);
  if (item.weight !== null)
    rows.push(['Weight', item.qty > 1 ? `${item.weight} lb each · ${item.weight * item.qty} lb total` : `${item.weight} lb`]);
  if (item.value)
    rows.push([
      'Value',
      item.fungible === false ? (
        <span>
          {item.value} <span className="muted" title="Not counted in the purse's worth">· 🔒 set aside</span>
        </span>
      ) : (
        item.value
      ),
    ]);
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
    <div className={`item-detail ${['very rare', 'legendary', 'artifact'].includes(item.rarity) ? 'glint' : ''}`}>
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
      {item.pack && item.pack.length > 0 && (
        <div className="pack-list">
          <span className="item-menu-heading muted">Contents · {item.pack.length}</span>
          {item.pack.map((e) => {
            const cat = CATALOG.find((c) => c.name.toLowerCase() === e.name.toLowerCase());
            const icon = cat ? defaultIcon(cat.category as CategoryKey, cat.subtype, cat.name) : '📦';
            return (
              <div className="pack-row" key={e.name}>
                <span className="pack-name">
                  <span className="item-icon">{icon}</span> {e.name}
                  {e.qty > 1 && <span className="item-qty">×{e.qty}</span>}
                </span>
                {onPackRow && (
                  <button type="button" className="pack-send" title="Take out, send, or discard" onClick={() => onPackRow(e.name)}>
                    ➤
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {s.spells && (
        <div className="spell-list">
          <span className="item-menu-heading muted">Spells</span>
          {parseSpellLines(s.spells).map((sp, i) => (
            <div className={`spell-row ${castFx === i ? 'casting' : ''}`} key={sp.name + i}>
              {spellKnown(sp.name) ? (
                <button
                  type="button"
                  className="spell-name spell-link"
                  title="Read the spell"
                  onClick={() => setSpellView(sp.name.trim().toLowerCase())}
                >
                  {sp.name}
                </button>
              ) : (
                <span className="spell-name">{sp.name}</span>
              )}
              <span className="spell-cost muted">⚡{sp.cost}</span>
              {s.charges !== undefined && (
                <button
                  type="button"
                  className="charge-btn"
                  disabled={(s.charges ?? 0) < sp.cost}
                  title={(s.charges ?? 0) < sp.cost ? 'Not enough charges' : `Spend ${sp.cost} charge${sp.cost === 1 ? '' : 's'}`}
                  onClick={() => {
                    setCastFx(i);
                    setTimeout(() => setCastFx((c) => (c === i ? null : c)), 750);
                    onCast(sp.name, sp.cost);
                  }}
                >
                  Cast
                </button>
              )}
              {castFx === i && (
                <span className="cast-spark" aria-hidden>✨</span>
              )}
            </div>
          ))}
        </div>
      )}
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
      {item.notes && <p className="item-detail-notes">{prose(item.notes)}</p>}
      {!item.notes && rows.length === 0 && <p className="muted item-detail-notes">Nothing more to tell about this one.</p>}
      {spellView && <SpellCard name={spellView} onClose={() => setSpellView(null)} />}
      {recharging && s.recharge && (
        <RechargeDialog
          itemName={item.name}
          formula={diceText(s.recharge)}
          onDone={(total) => {
            setRecharging(false);
            setSunrise(true);
            setTimeout(() => setSunrise(false), 900);
            onRecharge(total);
          }}
          onCancel={() => setRecharging(false)}
        />
      )}
      <div className="item-detail-actions">
        {onUnpack && (
          <button type="button" className="detail-use" onClick={onUnpack}>
            📤 Unpack
          </button>
        )}
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

// Ammunition's count doubles as a spend/recover tool: − opens a little
// count form ("loosed 3 arrows"), ＋ the same for scavenging them back.
// One commit, one log line — no tap-tap-tap spam.
function AmmoRow({ qty, onAmmo }: { qty: number; onAmmo: (delta: number) => void }) {
  const [mode, setMode] = useState<null | 'spend' | 'recover'>(null);
  const [count, setCount] = useState('1');
  if (!mode) {
    return (
      <span className="charges-row">
        <span key={`q${qty}`} className="pop">🏹 {qty}</span>
        <button type="button" className="charge-btn" disabled={qty <= 0} onClick={() => { setCount('1'); setMode('spend'); }}>− Spend</button>
        <button type="button" className="charge-btn" onClick={() => { setCount('1'); setMode('recover'); }}>＋ Recover</button>
      </span>
    );
  }
  const max = mode === 'spend' ? qty : 999;
  const n = Math.min(max, Math.max(1, Math.floor(Number(count) || 1)));
  const commit = () => {
    setMode(null);
    onAmmo(mode === 'spend' ? -n : n);
  };
  return (
    <span className="charges-row ammo-form">
      <input
        autoFocus
        type="number"
        min={1}
        max={max}
        value={count}
        onChange={(e) => setCount(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setMode(null);
        }}
      />
      <span className="muted">of {mode === 'spend' ? qty : '∞'}</span>
      <button type="button" className="charge-btn" onClick={commit}>
        {mode === 'spend' ? `− Spend ${n}` : `＋ Recover ${n}`}
      </button>
      <button type="button" className="link-button" title="Cancel" onClick={() => setMode(null)}>✕</button>
    </span>
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
  // the torn page animates out before the delete lands
  const [leaving, setLeaving] = useState<string | null>(null);
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
          <div key={e.id} className={`entry ${leaving === e.id ? 'entry-leaving' : ''}`}>
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
                    if (confirm(`Tear this page out of ${itemName}?${e.title ? ` (“${e.title}”)` : ''}`)) {
                      setLeaving(e.id);
                      setTimeout(() => {
                        setLeaving(null);
                        onDelete(e.id);
                      }, 300);
                    }
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
