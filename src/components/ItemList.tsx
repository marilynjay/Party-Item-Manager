import { AutoTextarea } from './AutoTextarea';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CategoryKey, HolderId, Icons, Item, JournalEntry } from '../types';
import type { FormField, ItemStats } from '../types';
import { CATEGORIES, HOLDERS, RARITIES, canJournal, categoryLabel, categoryOf, defaultIcon, formPlan, notesLabel, parseGoldValue, planHas, statPlan, holderById, holderIcon, itemIcon } from '../types';
import { CATALOG } from '../catalog';
import { StatFieldControl, cleanStats } from './StatFields';
import { DiceGroup } from './Dice';
import { parseRoll, parseSpellLines, rollDice } from '../dice';
import type { RollResult } from '../dice';
import { CategoryPicker } from './CategoryPicker';
import { ITEM_ICON_PRESETS, IconPicker } from './IconPicker';
import { compressImage } from '../image';
import { SPELL_NAMES } from '../spellIndex';
import { findSpellForItem, tokenizeSpells } from '../spellLinks';
import { SpellCard } from './SpellCard';

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
  onDelete: (id: string, disposition?: 'lost' | 'destroyed' | 'given', qty?: number) => void;
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

// A hand-drawn tumbleweed rolls across the empty space every 5–10 seconds
// (re-rolled per pass). Three layers fake the physics: the outer span
// drifts right linearly, the middle one hops in decaying bounces, and the
// twig-ball SVG spins the whole way.
function Tumbleweed() {
  const [pass, setPass] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!alive) return;
        setPass((p) => p + 1);
        schedule();
      }, 5000 + Math.random() * 5000);
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  if (pass === 0) return null;
  return (
    <span key={pass} className="tumbleweed" aria-hidden>
      <span className="tw-bounce">
        <svg className="tw-svg" viewBox="0 0 32 32" width="30" height="30">
          <g fill="none" stroke="#a5875a" strokeWidth="1.1" strokeLinecap="round">
            <circle cx="16" cy="16" r="13" opacity="0.4" />
            <path d="M16 3 C 8 8, 8 24, 16 29" opacity="0.8" />
            <path d="M16 3 C 24 8, 24 24, 16 29" opacity="0.7" />
            <path d="M3 16 C 8 8, 24 8, 29 16" opacity="0.8" />
            <path d="M3 16 C 8 24, 24 24, 29 16" opacity="0.7" />
            <path d="M6 7 C 14 12, 20 20, 26 25" opacity="0.6" />
            <path d="M26 7 C 18 12, 12 20, 6 25" opacity="0.6" />
            <path d="M16 6 C 12 14, 20 20, 15 26" opacity="0.55" />
            <path d="M8 20 C 14 16, 22 14, 25 10" opacity="0.55" />
            <path d="M10 5 C 16 10, 14 22, 22 27" opacity="0.5" />
          </g>
        </svg>
      </span>
    </span>
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
}: Props & { item: Item }) {
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
    if (confirm(`Use a ${item.name}? ${tail}`)) onConsume(item.id);
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
          onUse={item.category === 'consumable' ? useOne : undefined}
          onToggleAttune={item.requiresAttunement && item.location !== 'senchez' ? toggleAttune : undefined}
          onSpend={() => onSpend(item.id)}
          onRecharge={() => onRecharge(item.id)}
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

const NOTES_PREVIEW_CHARS = 90;
const previewText = (n: string) =>
  n.length > NOTES_PREVIEW_CHARS ? n.slice(0, NOTES_PREVIEW_CHARS).trimEnd() + '…' : n;

function ItemDetail({ item, onEdit, onUse, onToggleAttune, onSpend, onRecharge, onCast, onAddEntry, onUpdateEntry, onDeleteEntry, onUnpack, onPackRow, onSip, onEmpty, onFill }: { item: Item; onEdit: () => void; onUse?: () => void; onToggleAttune?: () => void; onSpend: () => void; onRecharge: () => void; onCast: (spell: string, cost: number) => void; onAddEntry: (fields: { title?: string; text: string; image?: string }) => void; onUpdateEntry: (entryId: string, fields: { title?: string; text: string; image?: string }) => void; onDeleteEntry: (entryId: string) => void; onUnpack?: () => void; onPackRow?: (entryName: string) => void; onSip?: () => void; onEmpty?: () => void; onFill?: () => void }) {
  const [zoomed, setZoomed] = useState(false);
  const [spellView, setSpellView] = useState<string | null>(null);
  const [castFx, setCastFx] = useState<number | null>(null); // sparkling spell row
  const [sunrise, setSunrise] = useState(false); // recharge glow sweep
  const rows: Array<[string, React.ReactNode]> = [];
  const cat = categoryOf(item.category);
  const s = item.stats ?? {};
  // an item named for a known spell ("Spell Scroll: Fireball", "Wand of
  // Fireballs") gets a lookup card, unless its spell list already covers that
  const nameSpell = useMemo(
    () => (s.spells ? null : findSpellForItem(item.name, item.subtype)),
    [s.spells, item.subtype, item.name]
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
        {s.chargesMax !== undefined && (s.charges ?? 0) < s.chargesMax && (
          <button
            type="button"
            className="charge-btn"
            onClick={() => {
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
  if (s.spellLevel || s.dc || nameSpell)
    rows.push([
      'Spell',
      <span className="charges-row">
        {[s.spellLevel && `${s.spellLevel} level`, s.dc].filter(Boolean).join(' · ')}
        {nameSpell && (
          <button type="button" className="charge-btn" title="Read the spell" onClick={() => setSpellView(nameSpell)}>
            📖 {SPELL_NAMES.get(nameSpell)}
          </button>
        )}
      </span>,
    ]);
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
  if (item.rarity) rows.push(['Rarity', <span className={`rarity-${item.rarity.replace(/\s+/g, '-')}`}>{item.rarity}</span>]);
  if (item.qty > 1) rows.push(['Quantity', item.qty]);
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
              {SPELL_NAMES.has(sp.name.trim().toLowerCase()) ? (
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
    fungible: item.fungible !== false,
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
    Boolean(
      item.rarity || item.value || item.magic || item.requiresAttunement || item.weight !== null || item.stats?.cursed || item.stats?.properties ||
      (sPlan.advanced.includes('spells') && item.stats?.spells) ||
      (sPlan.advanced.includes('charges') && (item.stats?.charges !== undefined || item.stats?.chargesMax !== undefined))
    )
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
      case 'fungible':
        return (
          <label key={field} className="check" title="Unchecked = set aside (a diamond saved for a spell) — the value won't count toward the purse">
            <input type="checkbox" checked={f.fungible} onChange={(e) => set({ fungible: e.target.checked })} />
            💰 Counts toward gold total
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
          fungible: planHas(f.category, f.subtype, 'fungible') ? f.fungible : undefined,
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
  onConsume: (note?: string, total?: number) => void;
  onCancel: () => void;
}) {
  const [result, setResult] = useState<RollResult | null>(null);
  const [settled, setSettled] = useState(false);
  const parsed = parseRoll(formula)!;
  // the table cheers max rolls and groans at min rolls; so does the app
  const allMax = result !== null && result.rolls.every((r) => r === parsed.d);
  const allMin = result !== null && result.rolls.every((r) => r === 1);

  return (
    <div className="overlay" onClick={result ? undefined : onCancel}>
      <div className="modal roll-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🧪 {itemName}</h2>
          {!result && <button type="button" className="link-button" onClick={onCancel}>✕</button>}
        </div>
        {!result ? (
          <>
            <p className="muted roll-blurb">
              Heals {formula}. Who's rolling?
              <span className="bubbles"><span /><span /><span /></span>
            </p>
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
            <div className={`roll-total ${settled ? 'shown' : ''} ${settled && allMax ? 'crit' : ''} ${settled && allMin ? 'fumble' : ''}`}>
              {settled && allMax && <span className="crit-spark" aria-hidden>✨</span>}
              {result.rolls.join(' + ')}
              {result.mod !== 0 && ` ${result.mod > 0 ? '+' : '−'} ${Math.abs(result.mod)}`} ={' '}
              <strong>{result.total} HP</strong>
              {settled && allMax && <span className="crit-spark late" aria-hidden>✨</span>}
              {settled && allMin && <span className="fumble-puff" aria-hidden>💨</span>}
            </div>
            <button
              type="button"
              className={`coin-add roll-done ${settled ? 'shown' : ''}`}
              onClick={() => onConsume(`rolled ${formula} = ${result.total} HP`, result.total)}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
