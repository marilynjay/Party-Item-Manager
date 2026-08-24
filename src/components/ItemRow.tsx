import { useEffect, useRef, useState } from 'react';
import type { CategoryKey, HolderId, Icons, Item } from '../types';
import { HOLDERS, categoryLabel, defaultIcon, holderById, holderIcon, isFood, itemIcon, parseGoldValue } from '../types';
import { CATALOG } from '../catalog';
import { parseRoll } from '../dice';
import { FreshnessGauge, ItemDetail } from './ItemDetail';
import { ItemEditor } from './ItemEditor';
import { RollDialog } from './RollDialog';

export interface ItemListProps {
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
  onRecharge: (id: string, rolled?: number) => void;
  onCast: (id: string, spell: string, cost: number) => void;
  onUpdate: (id: string, fields: Partial<Item>) => void;
  onDelete: (id: string, disposition?: 'lost' | 'destroyed' | 'given' | 'spoiled', qty?: number) => void;
  onSell: (id: string, amount: number, unit: 'gp' | 'pp', qty?: number) => void;
  onAddEntry: (id: string, fields: { title?: string; text: string; image?: string }) => void;
  onUpdateEntry: (id: string, entryId: string, fields: { title?: string; text: string; image?: string }) => void;
  onDeleteEntry: (id: string, entryId: string) => void;
  // a send launches a shrinking ghost of the plaque toward the recipient's tab
  onFly?: (flight: { icon: string; name: string; rect: { x: number; y: number; w: number; h: number }; to: HolderId }) => void;
  onUnpack: (id: string) => void;
  onTakePack: (id: string, entryName: string, to: HolderId) => void;
  onDiscardPack: (id: string, entryName: string) => void;
  onFill: (id: string, name: string, doses: number) => void;
  onEmpty: (id: string) => void;
  onSip: (id: string) => void;
  onAmmo: (id: string, delta: number) => void;
}

const rarityClass = (r: string) => 'rarity-' + r.replace(/\s+/g, '-');

const NOTES_PREVIEW_CHARS = 90;
const previewText = (n: string) =>
  n.length > NOTES_PREVIEW_CHARS ? n.slice(0, NOTES_PREVIEW_CHARS).trimEnd() + '…' : n;

export function ItemRow({
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
  onSell,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onFly,
  onUnpack,
  onTakePack,
  onDiscardPack,
  onFill,
  onEmpty,
  onSip,
  onAmmo,
}: ItemListProps & { item: Item }) {
  const [view, setView] = useState<'closed' | 'detail' | 'edit'>('closed');
  const [menuOpen, setMenuOpen] = useState(false);
  const [rollFor, setRollFor] = useState(false);
  const [moveTo, setMoveTo] = useState<HolderId | ''>('');
  const [moveQty, setMoveQty] = useState(1);
  const liRef = useRef<HTMLLIElement>(null);

  // the disposal dialog: what happened to the item decides its exit
  const [disposing, setDisposing] = useState(false);
  const [dispMode, setDispMode] = useState<'menu' | 'sold' | 'given'>('menu');
  const [dispQty, setDispQty] = useState(1);
  const [salePrice, setSalePrice] = useState('');
  const [saleUnit, setSaleUnit] = useState<'gp' | 'pp'>('gp');
  const [leaving, setLeaving] = useState<string | null>(null);
  // "+9 HP" drifting up from the plaque after an in-app potion roll
  const [healFx, setHealFx] = useState<null | { x: number; y: number; total: number }>(null);
  // which pack component's take-out/send/discard dialog is open
  const [packPick, setPackPick] = useState<string | null>(null);
  // the refill dialog for liquid containers
  const [filling, setFilling] = useState(false);
  const [fillName, setFillName] = useState('');
  const [fillDoses, setFillDoses] = useState('1');
  // a vessel can be filled: containers (that aren't equipment packs)
  const isVessel = item.category === 'supplies' && item.subtype === 'container' && !item.pack?.length;

  const unpack = () => {
    const kinds = item.pack?.length ?? 0;
    if (
      confirm(
        `Unpack ${item.name}? Its contents (${kinds} kinds of gear) become individual items in ${holderById(item.location).name}’s inventory, and the pack itself disappears.`
      )
    ) {
      onUnpack(item.id);
    }
  };
  // burst overlay at the plaque's on-screen rect: an emoji pop (💥 / 🎁),
  // with flying shards when there's a demolition to do
  const [boom, setBoom] = useState<null | {
    x: number;
    y: number;
    w: number;
    h: number;
    emoji: string;
    shards?: Array<{ l: number; t: number; s: number; dx: number; dy: number; rot: number; delay: number }>;
  }>(null);

  const openDisposal = () => {
    setMenuOpen(false);
    setDispMode('menu');
    setDispQty(1);
    setSalePrice('');
    setDisposing(true);
  };

  // play the exit animation, then actually let go of the goods. A partial
  // disposal keeps the plaque (the stack just shrinks), so it gets a quick
  // blip instead of the full send-off — though destruction always blasts
  // debris off the plaque, whole stack or not.
  const dispose = (exit: string, action: () => void) => {
    setDisposing(false);
    if (exit === 'destroy' || exit === 'gift') {
      const r = liRef.current?.getBoundingClientRect();
      if (r) {
        setBoom({
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          emoji: exit === 'destroy' ? '💥' : '🎁',
          shards:
            exit === 'destroy'
              ? Array.from({ length: 14 }, () => {
                  const l = 6 + Math.random() * 88; // start position, % across the plaque
                  const t = 8 + Math.random() * 84;
                  return {
                    l,
                    t,
                    s: 7 + Math.random() * 13,
                    dx: (l - 50) * (1.6 + Math.random()) + Math.random() * 30 - 15,
                    dy: (t - 50) * 1.2 - 20 - Math.random() * 60,
                    rot: Math.random() * 520 - 260,
                    delay: Math.random() * 70,
                  };
                })
              : undefined,
        });
      }
    }
    // destroys and gifts must stay transform-free on the plaque (a
    // transformed ancestor would drag the fixed burst overlay with it),
    // so their partial variants flash instead of playing the scaling blip
    setLeaving(
      dispQty >= item.qty ? exit : exit === 'destroy' ? 'boomflash' : exit === 'gift' ? 'giftflash' : 'part'
    );
    setTimeout(() => {
      setLeaving(null);
      setBoom(null);
      action();
    }, 520);
  };

  const fly = (to: HolderId) => {
    const r = liRef.current?.getBoundingClientRect();
    if (r) onFly?.({ icon: itemIcon(item), name: item.name, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, to });
  };

  const useOne = () => {
    setMenuOpen(false);
    // heal formulas go through the roll dialog, which has its own cancel
    if (item.stats?.heal && parseRoll(item.stats.heal)) {
      setRollFor(true);
      return;
    }
    const tail = item.qty > 1 ? `(${item.qty - 1} left after)` : "that's the last one!";
    if (confirm(`Use 1 ${item.name}? ${tail}`)) onConsume(item.id);
  };

  const startMove = (to: HolderId) => {
    if (item.qty === 1) {
      setMenuOpen(false);
      fly(to);
      onMove(item.id, to, 1);
    } else {
      setMoveTo(to);
      // giving one from a stack is the common case; "give all" is the shortcut
      setMoveQty(1);
    }
  };

  const holderAttuned = item.location !== 'senchez' ? (attunedCounts.get(item.location) ?? 0) : 0;

  // cursed items leak: at a genuinely random interval (15–75 s, re-rolled
  // after each burst) the card glitches for ~0.8 s — skull, desaturation,
  // and shell grays all mounted together for that window only
  const cursed = !!item.stats?.cursed;
  const [cursing, setCursing] = useState(false);
  useEffect(() => {
    if (!cursed) return;
    let alive = true;
    let waitTimer: number;
    let burstTimer: number;
    const schedule = () => {
      waitTimer = window.setTimeout(() => {
        if (!alive) return;
        setCursing(true);
        burstTimer = window.setTimeout(() => {
          if (!alive) return;
          setCursing(false);
          schedule();
        }, 850);
      }, 15_000 + Math.random() * 60_000);
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(waitTimer);
      clearTimeout(burstTimer);
    };
  }, [cursed]);
  const curseNow = cursing && view === 'closed';

  // a glint sweeps the plaque when attunement takes hold; breaking it dims
  const [shimmer, setShimmer] = useState(false);
  const [dimming, setDimming] = useState(false);
  const prevAttuned = useRef(item.attuned);
  useEffect(() => {
    const was = prevAttuned.current;
    prevAttuned.current = item.attuned;
    if (item.attuned && !was) {
      setShimmer(true);
      const t = setTimeout(() => setShimmer(false), 750);
      return () => clearTimeout(t);
    }
    if (!item.attuned && was) {
      setDimming(true);
      const t = setTimeout(() => setDimming(false), 700);
      return () => clearTimeout(t);
    }
  }, [item.attuned]);

  const toggleAttune = () => {
    if (!item.requiresAttunement || item.location === 'senchez') return;
    if (!item.attuned && holderAttuned >= attunementSlots) {
      if (!confirm(`${holderById(item.location).name} already has ${holderAttuned}/${attunementSlots} attunement slots in use. Attune anyway?`)) return;
    }
    onUpdate(item.id, { attuned: !item.attuned });
  };

  return (
    <li
      ref={liRef}
      className={`item-row ${isMagic(item) ? 'magic' : ''} ${shimmer ? 'attune-flash' : ''} ${dimming ? 'attune-dim' : ''} ${Date.now() - item.createdAt < 4000 ? 'item-new' : ''} ${curseNow ? 'cursed-shell' : ''} ${leaving ? `exit-${leaving}` : ''}`}
    >
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
      <button type="button" className="item-trash" title="Sold, lost, destroyed, or given away" onClick={openDisposal}>
        🗑
      </button>
      )}
      <div
        className={`item-main ${curseNow ? 'cursed-idle' : ''}`}
        onClick={() => { setView(view === 'closed' ? 'detail' : 'closed'); setMenuOpen(false); }}
      >
        <span className="item-name">
          <span className="item-icon">{itemIcon(item)}</span>
          {item.name}
          {item.qty > 1 && <span className="item-qty">×{item.qty}</span>}
          {curseNow && (
            <span className="curse-peek" aria-hidden>
              💀
            </span>
          )}
          {item.freshness !== undefined && item.freshness <= 0 && (
            <span className="spoiled-peek" title={isFood(item.category, item.subtype) ? 'Spoiled' : 'Expired'}>
              {isFood(item.category, item.subtype) ? '🤢' : '⌛'}
            </span>
          )}
          {item.freshness !== undefined && item.freshness > 0 && (
            <FreshnessGauge mini left={item.freshness} max={item.freshnessMax ?? item.freshness} />
          )}
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
              // keyed by value so the chip pops when charges change, and only then
              <span key={`c${item.stats.charges}`} className="tag charges-tag pop">⚡ {item.stats.charges}{item.stats.chargesMax !== undefined ? `/${item.stats.chargesMax}` : ''}</span>
            )}
            {item.freshness !== undefined && (
              <span
                className={`tag ${item.freshness <= 0 ? 'spoiled-tag' : 'muted-tag'}`}
                style={
                  item.freshness > 0
                    ? { color: `hsl(${Math.round(120 * Math.min(1, item.freshness / (item.freshnessMax || item.freshness)))}, 65%, 60%)` }
                    : undefined
                }
              >
                {item.freshness <= 0
                  ? isFood(item.category, item.subtype)
                    ? '🤢 spoiled'
                    : '⌛ expired'
                  : `${isFood(item.category, item.subtype) ? '🍏' : '⏳'} ${item.freshness} rest${item.freshness === 1 ? '' : 's'}`}
              </span>
            )}
            {item.weight !== null && <span className="tag muted-tag">{item.weight * item.qty} lb</span>}
            {item.value && <span className="tag muted-tag">{item.value}</span>}
          </span>
        )}
        {view === 'closed' && (() => {
          // preview: what's poured in, else contents line, else freshest entry, else notes
          const latest = item.entries?.length ? item.entries[item.entries.length - 1] : undefined;
          const held = item.liquid ? `Contains ${item.liquid.name}${item.liquid.doses > 1 ? ` (${item.liquid.doses} doses)` : ''}` : '';
          const line = held || item.content || latest?.title || latest?.text || item.notes;
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
                    fly(moveTo);
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
              <button type="button" className="danger" onClick={openDisposal}>
                🗑️ Discard
              </button>
            </div>
            <button type="button" className="link-button send-cancel" onClick={() => setMenuOpen(false)}>
              Cancel — keep it where it is
            </button>
          </div>
        </div>
      )}
      {disposing && (
        <div className="overlay" onClick={() => setDisposing(false)}>
          <div className="modal send-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>
                {itemIcon(item)} {item.name}
                {item.qty > 1 && <span className="item-qty">×{item.qty}</span>}
              </h2>
              <button type="button" className="link-button" onClick={() => setDisposing(false)}>✕</button>
            </div>
            {dispMode === 'menu' && (
              <>
                {item.qty > 1 && (
                  <div className="dispose-qty">
                    <div className="qty-stepper">
                      <button type="button" disabled={dispQty <= 1} onClick={() => setDispQty(dispQty - 1)}>−</button>
                      <input
                        type="number"
                        min={1}
                        max={item.qty}
                        value={dispQty}
                        onChange={(e) => setDispQty(Math.min(item.qty, Math.max(1, Number(e.target.value) || 1)))}
                      />
                      <button type="button" disabled={dispQty >= item.qty} onClick={() => setDispQty(dispQty + 1)}>＋</button>
                    </div>
                    <span className="muted">of {item.qty}</span>
                    {dispQty < item.qty && (
                      <button type="button" className="link-button" onClick={() => setDispQty(item.qty)}>
                        all {item.qty}
                      </button>
                    )}
                  </div>
                )}
                <div className="item-menu-heading muted">
                  What happened to {item.qty > 1 ? `${dispQty < item.qty ? `${dispQty} of them` : `all ${item.qty}`}` : 'it'}?
                </div>
                <div className="dispose-options">
                  <button type="button" onClick={() => setDispMode('sold')}>💰 Sold</button>
                  <button type="button" onClick={() => dispose('toss', () => onDelete(item.id, 'lost', dispQty))}>🗑 Discarded / lost</button>
                  <button type="button" onClick={() => dispose('destroy', () => onDelete(item.id, 'destroyed', dispQty))}>💥 Destroyed</button>
                  <button type="button" onClick={() => setDispMode('given')}>🎁 Given away</button>
                </div>
                <button type="button" className="link-button send-cancel" onClick={() => setDisposing(false)}>
                  Cancel — keep it
                </button>
              </>
            )}
            {dispMode === 'sold' && (
              <>
                <div className="item-menu-heading muted">
                  Sold{item.qty > 1 ? ` ${dispQty} —` : ''} for how much{dispQty > 1 ? ' total' : ''}? (goes to {holderById(item.location).name}’s purse)
                </div>
                {(() => {
                  // used gear usually fetches half list — offer both as one-tap fills
                  const each = item.value ? parseGoldValue(item.value) : null;
                  if (!each) return null;
                  const full = each * dispQty;
                  const half = Math.max(1, Math.floor(full / 2));
                  const fill = (n: number) => {
                    setSalePrice(String(n));
                    setSaleUnit('gp');
                  };
                  return (
                    <div className="sell-hints muted">
                      List {full.toLocaleString()} gp{dispQty > 1 ? ' total' : ''} · used gear usually fetches half:
                      <button type="button" className="chip" onClick={() => fill(half)}>½ — {half.toLocaleString()} gp</button>
                      <button type="button" className="chip" onClick={() => fill(full)}>full — {full.toLocaleString()} gp</button>
                    </div>
                  );
                })()}
                <form
                  className="dispose-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = Math.floor(Number(salePrice) || 0);
                    if (n > 0) dispose('sell', () => onSell(item.id, n, saleUnit, dispQty));
                  }}
                >
                  <input
                    autoFocus
                    type="number"
                    min={1}
                    placeholder="amount"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                  />
                  <select value={saleUnit} onChange={(e) => setSaleUnit(e.target.value as 'gp' | 'pp')}>
                    <option value="gp">gp</option>
                    <option value="pp">pp</option>
                  </select>
                  <button type="submit" disabled={Math.floor(Number(salePrice) || 0) <= 0}>💰 Sell</button>
                </form>
                <button type="button" className="link-button send-cancel" onClick={() => setDispMode('menu')}>‹ Back</button>
              </>
            )}
            {dispMode === 'given' && (
              <>
                <div className="item-menu-heading muted">Given to whom?</div>
                <div className="dispose-options">
                  <button type="button" onClick={() => dispose('gift', () => onDelete(item.id, 'given', dispQty))}>🧙 An NPC</button>
                  <button
                    type="button"
                    onClick={() => {
                      // hand off to the familiar send flow (grid, split, flight)
                      setDisposing(false);
                      setMoveTo('');
                      setMenuOpen(true);
                    }}
                  >
                    ➤ A party member
                  </button>
                </div>
                <button type="button" className="link-button send-cancel" onClick={() => setDispMode('menu')}>‹ Back</button>
              </>
            )}
          </div>
        </div>
      )}
      {boom && (
        <span className="demolition" aria-hidden style={{ left: boom.x, top: boom.y, width: boom.w, height: boom.h }}>
          <span className="boom">{boom.emoji}</span>
          {boom.shards?.map((sh, i) => (
            <span
              key={i}
              className="shard"
              style={{
                left: `${sh.l}%`,
                top: `${sh.t}%`,
                width: sh.s,
                height: Math.max(4, sh.s * 0.7),
                '--dx': `${Math.round(sh.dx)}px`,
                '--dy': `${Math.round(sh.dy)}px`,
                '--rot': `${Math.round(sh.rot)}deg`,
                '--delay': `${Math.round(sh.delay)}ms`,
              } as React.CSSProperties}
            />
          ))}
        </span>
      )}
      {rollFor && item.stats?.heal && (
        <RollDialog
          itemName={item.name}
          formula={item.stats.heal}
          onConsume={(note, total) => {
            setRollFor(false);
            if (total !== undefined) {
              // float the healing up from the plaque; the consume waits a
              // beat so the plaque is still there to float from
              const r = liRef.current?.getBoundingClientRect();
              if (r) {
                setHealFx({ x: r.x + r.width / 2, y: r.y + 6, total });
                setTimeout(() => setHealFx(null), 950);
                setTimeout(() => onConsume(item.id, note), 650);
                return;
              }
            }
            onConsume(item.id, note);
          }}
          onCancel={() => setRollFor(false)}
        />
      )}
      {healFx && (
        <span className="heal-float" aria-hidden style={{ left: healFx.x, top: healFx.y }}>
          +{healFx.total} HP
        </span>
      )}
      {view === 'detail' && (
        <ItemDetail
          item={item}
          onEdit={() => setView('edit')}
          onToss={
            item.freshness !== undefined && item.freshness <= 0
              ? () => dispose('toss', () => onDelete(item.id, 'spoiled', item.qty))
              : undefined
          }
          onUse={item.category === 'consumable' ? useOne : undefined}
          onToggleAttune={item.requiresAttunement && item.location !== 'senchez' ? toggleAttune : undefined}
          onSpend={() => onSpend(item.id)}
          onRecharge={(rolled) => onRecharge(item.id, rolled)}
          onCast={(spell, cost) => onCast(item.id, spell, cost)}
          onAddEntry={(fields) => onAddEntry(item.id, fields)}
          onUpdateEntry={(entryId, fields) => onUpdateEntry(item.id, entryId, fields)}
          onDeleteEntry={(entryId) => onDeleteEntry(item.id, entryId)}
          onUnpack={item.pack?.length ? unpack : undefined}
          onPackRow={item.pack?.length ? setPackPick : undefined}
          onSip={item.liquid ? () => onSip(item.id) : undefined}
          onEmpty={
            item.liquid
              ? () => {
                  if (confirm(`Dump the ${item.liquid!.name} out of the ${item.name}?`)) onEmpty(item.id);
                }
              : undefined
          }
          onFill={
            isVessel && !item.liquid
              ? () => {
                  setFillName('');
                  setFillDoses('1');
                  setFilling(true);
                }
              : undefined
          }
          onAmmo={item.subtype === 'ammunition' ? (delta) => onAmmo(item.id, delta) : undefined}
        />
      )}
      {filling && (
        <div className="overlay" onClick={() => setFilling(false)}>
          <div className="modal send-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>🫗 Fill the {item.name}</h2>
              <button type="button" className="link-button" onClick={() => setFilling(false)}>✕</button>
            </div>
            <div className="item-menu-heading muted">With what? (doses = how many uses it holds)</div>
            <form
              className="dispose-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!fillName.trim()) return;
                setFilling(false);
                onFill(item.id, fillName.trim(), Math.max(1, Math.floor(Number(fillDoses) || 1)));
              }}
            >
              <input
                autoFocus
                placeholder="e.g. swamp water, fire potion…"
                value={fillName}
                onChange={(e) => setFillName(e.target.value)}
              />
              <input
                type="number"
                min={1}
                className="fill-doses"
                title="Doses"
                value={fillDoses}
                onChange={(e) => setFillDoses(e.target.value)}
              />
              <button type="submit" disabled={!fillName.trim()}>🫗 Fill</button>
            </form>
            <button type="button" className="link-button send-cancel" onClick={() => setFilling(false)}>
              Cancel — leave it empty
            </button>
          </div>
        </div>
      )}
      {packPick && (() => {
        const entry = item.pack?.find((e) => e.name === packPick);
        if (!entry) return null;
        const cat = CATALOG.find((c) => c.name.toLowerCase() === entry.name.toLowerCase());
        const icon = cat ? defaultIcon(cat.category as CategoryKey, cat.subtype, cat.name) : '📦';
        return (
          <div className="overlay" onClick={() => setPackPick(null)}>
            <div className="modal send-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h2>
                  {icon} {entry.name}
                  {entry.qty > 1 && <span className="item-qty">×{entry.qty}</span>}
                </h2>
                <button type="button" className="link-button" onClick={() => setPackPick(null)}>✕</button>
              </div>
              <div className="item-menu-heading muted">From {item.name}</div>
              <div className="send-holders">
                {[holderById(item.location), ...HOLDERS.filter((h) => h.id !== item.location)].map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="send-holder"
                    onClick={() => {
                      setPackPick(null);
                      if (h.id !== item.location) {
                        const r = liRef.current?.getBoundingClientRect();
                        if (r) onFly?.({ icon, name: entry.name, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, to: h.id });
                      }
                      onTakePack(item.id, entry.name, h.id);
                    }}
                  >
                    <span className="send-holder-emoji">{holderIcon(icons, h)}</span> {h.name}
                    {h.id === item.location && <span className="muted"> — take out</span>}
                  </button>
                ))}
              </div>
              <div className="item-menu-actions">
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setPackPick(null);
                    onDiscardPack(item.id, entry.name);
                  }}
                >
                  🗑️ Discard it
                </button>
              </div>
              <button type="button" className="link-button send-cancel" onClick={() => setPackPick(null)}>
                Cancel — leave it packed
              </button>
            </div>
          </div>
        );
      })()}
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
