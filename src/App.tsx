import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api';
import type { AppState, Holder, HolderId, Item } from './types';
import { diceText, findRoll, neverRecharges, rollDice } from './dice';
import { ATTUNEMENT_SLOTS, HOLDERS, MEMBERS, eatsFood, holderById, holderIcon, isFood, isMagic, itemIcon, parseGoldValue } from './types';
import { Sidebar, type Scope } from './components/Sidebar';
import { FilterBar, type Filters, emptyFilters, applyFilters } from './components/FilterBar';
import { AddItemForm } from './components/AddItemForm';
import { ItemList } from './components/ItemList';
import { LogPanel } from './components/LogPanel';
import { GoldTracker } from './components/GoldTracker';
import { HOLDER_ICON_PRESETS, IconPicker } from './components/IconPicker';
import { PP_IN_GP } from './types';
import { compressImage } from './image';
import { SenchezFace } from './components/SenchezFace';
import { DiceGroup } from './components/Dice';
import { SpellCompendium } from './components/SpellCompendium';

// The holder's portrait beside their inventory heading: a round photo
// (tap to enlarge, with replace/remove) or a quiet camera button to add one.
function HolderPortrait({
  name,
  image,
  onSave,
  onError,
}: {
  name: string;
  image: string | undefined;
  onSave: (image: string | undefined) => void;
  onError: (message: string) => void;
}) {
  const [zoomed, setZoomed] = useState(false);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    compressImage(file)
      .then((dataUrl) => {
        setZoomed(false);
        onSave(dataUrl);
      })
      .catch((e: Error) => onError(e.message));
  };

  if (!image) {
    return (
      <label className="portrait-add" title={`Add a picture of ${name}`}>
        📷
        <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
    );
  }

  return (
    <>
      <button type="button" className="portrait-btn" title={`${name}’s portrait — tap to enlarge`} onClick={() => setZoomed(true)}>
        <img className="portrait-img" src={image} alt={name} />
      </button>
      {zoomed && (
        <div className="overlay photo-zoom portrait-zoom" onClick={() => setZoomed(false)}>
          <img src={image} alt={name} onClick={(e) => e.stopPropagation()} />
          <div className="portrait-zoom-actions" onClick={(e) => e.stopPropagation()}>
            <label className="link-button photo-pick">
              Replace picture
              <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <button
              type="button"
              className="link-button danger-link"
              onClick={() => {
                if (confirm(`Remove ${name}’s portrait?`)) {
                  setZoomed(false);
                  onSave(undefined);
                }
              }}
            >
              Remove
            </button>
            <button type="button" className="link-button" onClick={() => setZoomed(false)}>✕ Close</button>
          </div>
        </div>
      )}
    </>
  );
}

// Renaming a holder covers two very different days: fixing a typo, and the
// sad one where a character dies and the player rolls someone new. The
// second path is deliberately gated behind its own confirmation so nobody
// wanders into it while tidying spelling.
function RenameDialog({
  holder,
  eats,
  onRename,
  onSetEats,
  onTorch,
  onClose,
}: {
  holder: Holder;
  eats: boolean;
  onRename: (name: string) => void;
  onSetEats: (eats: boolean) => void;
  onTorch: (newName: string, sweep: boolean) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(holder.name);
  const [torch, setTorch] = useState(false);
  const [newName, setNewName] = useState('');
  const [sweep, setSweep] = useState(false);
  const [gone, setGone] = useState(false);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal rename-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>✎ {holder.name}</h2>
          <button type="button" className="link-button" onClick={onClose}>✕</button>
        </div>
        <form
          className="rename-fix"
          onSubmit={(e) => {
            e.preventDefault();
            const v = name.trim();
            if (v && v !== holder.name) onRename(v);
          }}
        >
          <label className="rename-label">
            Fix the name
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" disabled={!name.trim() || name.trim() === holder.name}>Save</button>
        </form>
        <p className="muted rename-hint">Same character, better spelling — nothing else changes.</p>
        <label className="check eats-toggle" title="Warforged, constructs, the undead — long rests won't nudge them about supper">
          <input type="checkbox" checked={!eats} onChange={(e) => onSetEats(!e.target.checked)} />
          🔩 Doesn’t need food or water
        </label>
        {holder.kind === 'member' &&
          (!torch ? (
            <button type="button" className="torch-open" onClick={() => setTorch(true)}>
              💀 Character death…
            </button>
          ) : (
            <form
              className="torch-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (gone && newName.trim()) onTorch(newName.trim(), sweep);
              }}
            >
              <h3>🕯️ Passing the torch</h3>
              <p className="muted">
                For when {holder.name} has died or retired. Attunements end, and the portrait and
                icon are cleared for the newcomer. Old log entries keep {holder.name}’s name — history
                stays history.
              </p>
              <label className="rename-label">
                New character’s name
                <input value={newName} maxLength={40} placeholder="Who joins the party?" onChange={(e) => setNewName(e.target.value)} />
              </label>
              <div className="torch-choice">
                <label>
                  <input type="radio" name="torch-fate" checked={!sweep} onChange={() => setSweep(false)} />
                  The new character inherits {holder.name}’s items and gold
                </label>
                <label>
                  <input type="radio" name="torch-fate" checked={sweep} onChange={() => setSweep(true)} />
                  Send everything to Senchez for the party to sort out
                </label>
              </div>
              <label className="torch-confirm">
                <input type="checkbox" checked={gone} onChange={(e) => setGone(e.target.checked)} />
                {holder.name} is truly gone — this isn’t a spelling fix
              </label>
              <div className="torch-actions">
                <button type="submit" disabled={!gone || !newName.trim()}>🕯️ Pass the torch</button>
                <button type="button" className="link-button" onClick={() => setTorch(false)}>Cancel</button>
              </div>
            </form>
          ))}
      </div>
    </div>
  );
}

// The camp-supper nudge inside the rest dialog: this inventory's food and
// filled vessels, each with a one-tap Eat/Drink. Deliberately no quotas or
// enforcement — rations math is the table's business; the app just makes
// remembering (and the ticking down) effortless.
// The camp-supper page of the rest flow: this inventory's food, its filled
// vessels (a dose each tap), and any empty ones with a one-tap fill from
// the stream. Deliberately no quotas — rations math is the table's
// business. Characters who don't eat (warforged, constructs) opt out here
// and are never nudged again.
function SupperSection({
  items,
  who,
  eats,
  onEat,
  onDrink,
  onFillWater,
}: {
  items: Item[];
  who: string;
  eats: boolean;
  onEat: (id: string) => void;
  onDrink: (id: string) => void;
  onFillWater: (id: string, doses: number) => void;
}) {
  const larder = items.filter((i) => i.category === 'consumable' && i.subtype === 'food & drink' && i.qty > 0);
  const vessels = items.filter((i) => i.category === 'supplies' && i.subtype === 'container' && !i.pack?.length);
  const filled = vessels.filter((i) => i.liquid);
  const empty = vessels.filter((i) => !i.liquid);
  // "4 pints" → 4 doses when filling at the stream; a plain skin gets 4
  const capacityOf = (i: Item) => {
    const m = /(\d+)/.exec(i.stats?.capacity ?? '');
    return m ? Math.max(1, Math.min(20, Number(m[1]))) : 4;
  };

  // constructs sit supper out entirely — the toggle lives on their name
  if (!eats) return null;

  return (
    <div className="supper-section">
      <p className="rest-line">🍽️ Supper — {who} should eat and drink:</p>
      {larder.map((i) => (
        <div className="rest-roll-row" key={i.id}>
          <span className="rest-roll-name">
            {itemIcon(i)} {i.name}
            {i.qty > 1 && <span key={i.qty} className="muted pop"> ×{i.qty}</span>}
            {i.freshness !== undefined && i.freshness <= 0 && <span title="Spoiled"> 🤢</span>}
          </span>
          <button type="button" className="charge-btn" onClick={() => onEat(i.id)}>🍽️ Eat one</button>
        </div>
      ))}
      {filled.map((i) => (
        <div className="rest-roll-row" key={i.id}>
          <span className="rest-roll-name">
            {itemIcon(i)} {i.name}{' '}
            <span key={i.liquid!.doses} className="muted pop">({i.liquid!.name} · {i.liquid!.doses} left)</span>
          </span>
          <button type="button" className="charge-btn" onClick={() => onDrink(i.id)}>💧 Drink 1</button>
        </div>
      ))}
      {empty.map((i) => (
        <div className="rest-roll-row" key={i.id}>
          <span className="rest-roll-name muted">
            {itemIcon(i)} {i.name} <span className="muted">(empty)</span>
          </span>
          <button type="button" className="charge-btn" title="Fill it at the stream" onClick={() => onFillWater(i.id, capacityOf(i))}>
            🫗 Fill with water
          </button>
        </div>
      ))}
      {larder.length === 0 && (
        <p className="rest-line muted">🍽️ No food in this pack — someone had better go hunting.</p>
      )}
      {filled.length === 0 && (
        <p className="rest-line muted">
          💧 {empty.length > 0 ? 'Nothing to drink — fill a skin above.' : 'No waterskin here at all — thirsty work.'}
        </p>
      )}
      <p className="rest-line muted rest-roll-hint">No bookkeeping police — just don’t wake up hungry.</p>
    </div>
  );
}

// Per-inventory long rest, walked through in order: a preview that explains
// what resting will do, then (only when there are dice recharges of yours)
// the roll page, then supper. Two etiquette rules hold: dice recharges
// belong to the item's owner (they only appear when the presser is playing
// that character; Senchez's things are party property), and nothing rolls
// those dice without being asked — each gets a field for the rolled total,
// plus a 🎲 that tumbles the dice in-app on request. Blank fields wait.
function LongRestDialog({
  items,
  actor,
  who,
  eats,
  result,
  onRest,
  onEat,
  onDrink,
  onFillWater,
  onClose,
}: {
  items: Item[];
  actor: string;
  who: string;
  eats: boolean;
  result: api.LongRestResult | null;
  onRest: (rolls: Record<string, number>) => void;
  onEat: (id: string) => void;
  onDrink: (id: string) => void;
  onFillWater: (id: string, doses: number) => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<'preview' | 'rolls' | 'supper'>('preview');
  // one entry per dice item of "mine": what the player says they rolled
  const [rollVals, setRollVals] = useState<Record<string, string>>({});
  // an in-app 🎲 tumbles real dice under the row before filling the field;
  // one stage at a time, keyed so a re-roll re-tumbles
  const [rolling, setRolling] = useState<null | { id: string; key: number; d: number; rolls: number[]; mod: number; total: number }>(null);
  // preview: the same partition longRest itself will make
  const pending = items.filter(
    (i) =>
      i.stats?.chargesMax !== undefined &&
      (i.stats.charges ?? 0) < i.stats.chargesMax &&
      i.category !== 'consumable' &&
      !neverRecharges(i.stats.recharge)
  );
  const auto = pending.filter((i) => !i.stats?.recharge || !findRoll(i.stats.recharge));
  const dicey = pending.filter((i) => i.stats?.recharge && findRoll(i.stats.recharge));
  const mine = dicey.filter((i) => actor && (holderById(i.location).name === actor || i.location === 'senchez'));
  const waiting = dicey.filter((i) => !mine.includes(i));
  // charged gear that's already topped up: worth saying so on the preview
  // (so nothing looks forgotten), then left out of every later page
  const full = items.filter(
    (i) =>
      i.stats?.chargesMax !== undefined &&
      (i.stats.charges ?? 0) >= i.stats.chargesMax &&
      i.category !== 'consumable' &&
      !neverRecharges(i.stats.recharge)
  );
  // fresh food ages a day when this inventory rests
  const aging = items.filter((i) => i.freshness !== undefined && i.freshness > 0);

  const supper = (
    <SupperSection
      items={items}
      who={who}
      eats={eats}
      onEat={onEat}
      onDrink={onDrink}
      onFillWater={onFillWater}
    />
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal rest-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🌅 Long rest — {who}</h2>
          <button type="button" className="link-button" onClick={onClose}>✕</button>
        </div>
        {stage === 'preview' ? (
          <>
            <p className="rest-line muted">A long rest here will:</p>
            {auto.length > 0 && (
              <p className="rest-line">⚡ Recharge with the dawn: {auto.map((i) => i.name).join(', ')}</p>
            )}
            {mine.length > 0 && (
              <p className="rest-line">
                🎲 Recharge on a roll from you: {mine.map((i) => `${i.name} (${diceText(i.stats!.recharge!)})`).join(', ')}
              </p>
            )}
            {waiting.length > 0 && (
              <p className="rest-line muted">
                ⏳ Leave these for their owners to roll: {waiting.map((i) => `${holderById(i.location).name}’s ${i.name} (${diceText(i.stats!.recharge!)})`).join(', ')}
                {!actor && ' — set “Playing as” to roll yours.'}
              </p>
            )}
            {full.length > 0 && (
              <p className="rest-line muted">
                ✅ Leave these be — already full: {full.map((i) => `${i.name} (⚡ ${i.stats!.charges}/${i.stats!.chargesMax})`).join(', ')}
              </p>
            )}
            {aging.length > 0 && (
              <p className="rest-line muted">
                {aging.every((i) => isFood(i.category, i.subtype)) ? '🍏 Age the rations a day: ' : '⏳ Tick the perishables down a day: '}
                {aging
                  .map((i) => `${i.name}${i.freshness === 1 ? (isFood(i.category, i.subtype) ? ' (will spoil!)' : ' (expires!)') : ` (${i.freshness! - 1} left after)`}`)
                  .join(', ')}
              </p>
            )}
            {pending.length === 0 && aging.length === 0 && full.length === 0 && (
              <p className="rest-line muted">⚡ Nothing here needs recharging.</p>
            )}
            <p className="rest-line muted">
              {eats
                ? '🍽️ Then remind you to eat and drink.'
                : `🔩 ${who} doesn’t need food or water, so there's no supper to see to.`}
            </p>
            <div className="torch-actions">
              <button
                type="button"
                onClick={() => {
                  if (mine.length > 0) {
                    setStage('rolls');
                  } else {
                    onRest({});
                    setStage('supper');
                  }
                }}
              >
                🌅 Take a long rest
              </button>
              <button type="button" className="link-button" onClick={onClose}>Cancel</button>
            </div>
          </>
        ) : stage === 'rolls' ? (
          <>
            {auto.length > 0 && (
              <p className="rest-line muted">⚡ {auto.length === 1 ? auto[0].name : `${auto.length} items`} will recharge automatically.</p>
            )}
            <p className="rest-line">🎲 Roll for the rest — type what the dice said, or let the app roll:</p>
            {mine.map((i) => {
              const formula = diceText(i.stats!.recharge!);
              return (
                <div key={i.id}>
                  <div className="rest-roll-row">
                    <span className="rest-roll-name">
                      {i.name} <span className="muted">({formula})</span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      placeholder="rolled"
                      value={rollVals[i.id] ?? ''}
                      onChange={(e) => setRollVals({ ...rollVals, [i.id]: e.target.value })}
                    />
                    <button
                      type="button"
                      className="charge-btn"
                      title={`Roll ${formula} in the app`}
                      onClick={() => {
                        const parsed = findRoll(i.stats!.recharge!)!;
                        const r = rollDice(parsed);
                        setRolling({ id: i.id, key: Date.now(), d: parsed.d, rolls: r.rolls, mod: r.mod, total: r.total });
                      }}
                    >
                      🎲 Roll
                    </button>
                  </div>
                  {rolling?.id === i.id && (
                    <div className="rest-roll-stage" key={rolling.key}>
                      <DiceGroup
                        sides={rolling.d}
                        rolls={rolling.rolls}
                        size={30}
                        onSettled={() => setRollVals((v) => ({ ...v, [i.id]: String(rolling.total) }))}
                      />
                      {rolling.mod !== 0 && (
                        <span className="muted rest-roll-mod">{rolling.mod > 0 ? `+${rolling.mod}` : rolling.mod}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <p className="rest-line muted rest-roll-hint">Left blank = not recharged (roll it later from the item).</p>
            <div className="torch-actions">
              <button
                type="button"
                onClick={() => {
                  const rolls: Record<string, number> = {};
                  for (const i of mine) {
                    const v = rollVals[i.id] ?? '';
                    if (v !== '') rolls[i.id] = Math.max(0, Math.floor(Number(v) || 0));
                  }
                  onRest(rolls);
                  setStage('supper');
                }}
              >
                {eats ? 'Next — supper ›' : '☀️ Finish the rest'}
              </button>
              <button type="button" className="link-button" onClick={() => setStage('preview')}>‹ Back</button>
            </div>
          </>
        ) : (
          <>
            {result && (
              <>
                {result.restored.length > 0 && (
                  <p className="rest-line">
                    ⚡ {result.restored.length === 1 ? result.restored[0] : `${result.restored.length} items`} recharged with the dawn.
                  </p>
                )}
                {result.rolled.map((r) => (
                  <p className="rest-line" key={r.name}>
                    🎲 {r.name}: {r.formula.trim()} = <strong>{r.total}</strong> · now ⚡ {r.charges}/{r.max}
                  </p>
                ))}
                {result.spoiled.map((sp) => (
                  <p className="rest-line" key={sp.name}>
                    {sp.food ? `🤢 The ${sp.name} spoiled overnight.` : `⌛ The ${sp.name} expired overnight.`}
                  </p>
                ))}
                {result.restored.length === 0 && result.rolled.length === 0 && result.spoiled.length === 0 && (
                  <p className="rest-line muted">
                    {result.aged > 0 ? 'The rations age a day; nothing needed recharging.' : 'Nothing needed recharging.'}
                  </p>
                )}
                {result.waiting.length > 0 && (
                  <p className="rest-line muted">
                    ⏳ Waiting on their owners: {result.waiting.map((w) => `${w.holder}’s ${w.name} (${w.formula.trim()})`).join(', ')}
                  </p>
                )}
              </>
            )}
            {supper}
            <div className="torch-actions">
              <button type="button" onClick={onClose}>Good morning ☀️</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// A holder's coin line: collapsed it shows the coins' gp worth; tapping
// expands a purse panel with the gold/platinum/gems breakdown, Add and
// Spend buttons, and a small ✎ for setting exact amounts.
interface GemSummary {
  count: number;     // gems held (qty-aware)
  countedGp: number; // total gp worth of gems that count toward the purse
  asideCount: number; // gems marked "set aside" (not counted)
}

function PursePanel({
  self,
  name,
  gp,
  pp,
  gems,
  icons,
  onAdd,
  onSpend,
  onSend,
  onSetExact,
}: {
  self: HolderId;
  name: string;
  gp: number;
  pp: number;
  gems: GemSummary;
  icons: AppState['icons'];
  onAdd: (gp: number, pp: number) => void;
  onSpend: (gp: number, pp: number) => void;
  onSend: (to: HolderId, gp: number, pp: number) => void;
  onSetExact: (gp: number, pp: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'add' | 'spend' | 'send' | 'exact' | null>(null);
  const [sendTo, setSendTo] = useState<HolderId | ''>('');
  const fmt = (n: number) => n.toLocaleString();
  const coinsWorth = gp + pp * PP_IN_GP;
  const totalWorth = coinsWorth + gems.countedGp;

  // the purse winces when its coins go down
  const [wincing, setWincing] = useState(false);
  const prevCoins = useRef(coinsWorth);
  useEffect(() => {
    const was = prevCoins.current;
    prevCoins.current = coinsWorth;
    if (coinsWorth < was) {
      setWincing(true);
      const t = setTimeout(() => setWincing(false), 500);
      return () => clearTimeout(t);
    }
  }, [coinsWorth]);
  const wince = wincing ? 'purse-wince' : '';

  if (!open) {
    return (
      <button type="button" className={`purse-line muted ${wince}`} title={`${name}’s purse — tap for the breakdown`} onClick={() => setOpen(true)}>
        🟡 {fmt(coinsWorth)} gp
        {gems.count > 0 && <span> · 💎 {gems.count}</span>}
        <span className="purse-edit-hint">▾</span>
      </button>
    );
  }

  return (
    <div className="purse-panel">
      <button type="button" className={`purse-line muted ${wince}`} title="Fold the purse back up" onClick={() => { setOpen(false); setMode(null); }}>
        🟡 {fmt(coinsWorth)} gp
        <span className="purse-edit-hint">▴</span>
      </button>
      <div className="purse-rows">
        <div className="purse-row">
          <span>🟡 Gold</span>
          <span className="purse-amt">{fmt(gp)} gp</span>
        </div>
        {pp > 0 && (
          <div className="purse-row">
            <span>⚪ Platinum</span>
            <span className="purse-amt">
              {fmt(pp)} pp <span className="muted">(= {fmt(pp * PP_IN_GP)} gp)</span>
            </span>
          </div>
        )}
        {gems.count > 0 && (
          <div className="purse-row">
            <span>💎 Gems <span className="muted">×{gems.count}</span></span>
            <span className="purse-amt">
              {gems.countedGp > 0 ? `~${fmt(gems.countedGp)} gp` : '—'}
              {gems.asideCount > 0 && <span className="muted"> ({gems.asideCount} set aside)</span>}
            </span>
          </div>
        )}
        {(pp > 0 || gems.countedGp > 0) && (
          <div className="purse-row purse-total">
            <span>Total worth</span>
            <span className="purse-amt">{gems.countedGp > 0 ? '~' : ''}{fmt(totalWorth)} gp</span>
          </div>
        )}
      </div>
      {mode === null ? (
        <div className="purse-actions">
          <button type="button" title="Add coins" onClick={() => setMode('add')}>＋ Add</button>
          <button type="button" title="Spend coins" disabled={coinsWorth <= 0} onClick={() => setMode('spend')}>− Spend</button>
          <button type="button" title="Send coins to someone" disabled={coinsWorth <= 0} onClick={() => { setMode('send'); setSendTo(''); }}>➤ Send</button>
          <button type="button" className="link-button" title="Set exact amounts" onClick={() => setMode('exact')}>✎</button>
        </div>
      ) : mode === 'exact' ? (
        <ExactPurseForm gp={gp} pp={pp} onSave={(g, p) => { onSetExact(g, p); setMode(null); }} onCancel={() => setMode(null)} />
      ) : mode === 'send' ? (
        sendTo === '' ? (
          <div className="purse-send">
            <div className="send-holders">
              {HOLDERS.filter((h) => h.id !== self).map((h) => (
                <button key={h.id} type="button" className="send-holder" onClick={() => setSendTo(h.id)}>
                  <span className="send-holder-emoji">{holderIcon(icons, h)}</span> {h.name}
                </button>
              ))}
            </div>
            <button type="button" className="link-button" onClick={() => setMode(null)}>✕ Cancel</button>
          </div>
        ) : (
          <CoinDelta
            verb={`➤ Send to ${holderById(sendTo).name}`}
            onDone={(g, p) => {
              onSend(sendTo, g, p);
              setMode(null);
              setSendTo('');
            }}
            onCancel={() => setSendTo('')}
          />
        )
      ) : (
        <CoinDelta
          verb={mode === 'add' ? '＋ Add' : '− Spend'}
          onDone={(g, p) => {
            (mode === 'add' ? onAdd : onSpend)(g, p);
            setMode(null);
          }}
          onCancel={() => setMode(null)}
        />
      )}
    </div>
  );
}

// Gold and platinum fields side by side — shared by Add, Spend, and Send.
// Both can move in one action; coins never convert (DM's table rules).
function CoinDelta({ verb, onDone, onCancel }: { verb: string; onDone: (gp: number, pp: number) => void; onCancel: () => void }) {
  const [gpVal, setGpVal] = useState('');
  const [ppVal, setPpVal] = useState('');
  const parse = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
  return (
    <form
      className="purse-line purse-editing"
      onSubmit={(e) => {
        e.preventDefault();
        const g = parse(gpVal);
        const p = parse(ppVal);
        if (g + p > 0) onDone(g, p);
        else onCancel();
      }}
    >
      <label className="coin-field">
        <input
          autoFocus
          type="number"
          min={0}
          placeholder="0"
          value={gpVal}
          onChange={(e) => setGpVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        />
        gp
      </label>
      <label className="coin-field">
        <input
          type="number"
          min={0}
          placeholder="0"
          value={ppVal}
          onChange={(e) => setPpVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        />
        pp
      </label>
      <button type="submit">{verb}</button>
      <button type="button" className="link-button" title="Cancel" onClick={onCancel}>✕</button>
    </form>
  );
}

// The old outright editor, demoted to the correction tool.
function ExactPurseForm({ gp, pp, onSave, onCancel }: { gp: number; pp: number; onSave: (gp: number, pp: number) => void; onCancel: () => void }) {
  const [gpVal, setGpVal] = useState(String(gp));
  const [ppVal, setPpVal] = useState(String(pp));
  const parse = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
  return (
    <form
      className="purse-line purse-editing"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(parse(gpVal), parse(ppVal));
      }}
    >
      <label className="coin-field">
        <input autoFocus type="number" min={0} value={gpVal} onChange={(e) => setGpVal(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
        gp
      </label>
      <label className="coin-field">
        <input type="number" min={0} value={ppVal} onChange={(e) => setPpVal(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
        pp
      </label>
      <button type="submit" title="Save">✓</button>
      <button type="button" className="link-button" title="Cancel" onClick={onCancel}>✕</button>
    </form>
  );
}

// A short shower of coins — the tiny celebration for money coming in.
// Purely decorative: fixed overlay, pointer-events none, self-removes.
const COIN_GLYPHS = ['🪙', '🟡', '🪙', '✨', '🟡', '🪙', '🟡', '✨', '🪙', '🟡', '🪙', '🪙'];

function CoinBurst({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [onDone]);
  const coins = useMemo(
    () =>
      COIN_GLYPHS.map((glyph, i) => ({
        glyph,
        dx: `${Math.round((Math.random() * 2 - 1) * 150)}px`,
        up: `${Math.round(-70 - Math.random() * 100)}px`,
        rot: `${Math.round((Math.random() * 2 - 1) * 280)}deg`,
        delay: `${i * 45}ms`,
        dur: `${900 + Math.round(Math.random() * 250)}ms`,
      })),
    []
  );
  return (
    <div className="coin-burst" aria-hidden>
      {coins.map((c, i) => (
        <span key={i} className="coin-x" style={{ '--dx': c.dx, '--dur': c.dur, '--delay': c.delay } as React.CSSProperties}>
          <span className="coin-y" style={{ '--up': c.up, '--rot': c.rot, '--dur': c.dur, '--delay': c.delay } as React.CSSProperties}>
            {c.glyph}
          </span>
        </span>
      ))}
    </div>
  );
}

// Spending's animation: a few coins tumble away downward (gravity only —
// no celebration) under a drifting −N gp label. When a spend empties
// someone's purse entirely, a moth flutters out instead of the coins.
function SpendFall({ amount, moth, onDone }: { amount: number; moth: boolean; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [onDone]);
  const coins = useMemo(
    () =>
      moth
        ? []
        : ['🪙', '🟡', '🪙', '🟡'].map((glyph, i) => ({
            glyph,
            dx0: `${-30 + i * 20}px`,
            dx: `${-46 + i * 30 + Math.round((Math.random() * 2 - 1) * 14)}px`,
            rot: `${Math.round((Math.random() * 2 - 1) * 200)}deg`,
            delay: `${i * 70}ms`,
            dur: `${750 + Math.round(Math.random() * 200)}ms`,
          })),
    [moth]
  );
  return (
    <div className="coin-burst spend-fall" aria-hidden>
      {moth ? (
        <span className="moth">🦋</span>
      ) : (
        coins.map((c, i) => (
          <span
            key={i}
            className="spend-coin"
            style={{ '--dx0': c.dx0, '--dx': c.dx, '--rot': c.rot, '--delay': c.delay, '--dur': c.dur } as React.CSSProperties}
          >
            {c.glyph}
          </span>
        ))
      )}
      <span className="spend-label">−{amount.toLocaleString()} gp</span>
    </div>
  );
}

// Sent coins stream from mid-screen to the recipient's rail tab,
// shrinking as they arrive. The tab is found by its data-scope attribute
// at fire time, so the vector is right for whatever layout is on screen.
function CoinStream({ to, onDone }: { to: HolderId; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1300);
    return () => clearTimeout(t);
  }, [onDone]);
  const [vec, setVec] = useState<{ tx: number; ty: number } | null>(null);
  useEffect(() => {
    const el = document.querySelector(`.tab[data-scope="${to}"]`);
    if (!el) {
      setVec({ tx: -window.innerWidth / 2 + 26, ty: 0 });
      return;
    }
    const r = el.getBoundingClientRect();
    setVec({ tx: r.left + r.width / 2 - window.innerWidth / 2, ty: r.top + r.height / 2 - window.innerHeight * 0.38 });
  }, [to]);
  if (!vec) return null;
  return (
    <div className="coin-burst coin-stream" aria-hidden>
      {['🪙', '🟡', '🪙', '🟡', '🪙', '🟡', '🪙'].map((glyph, i) => (
        <span
          key={i}
          className="stream-coin"
          style={{
            '--tx': `${Math.round(vec.tx)}px`,
            '--ty': `${Math.round(vec.ty)}px`,
            '--jx': `${((i % 3) - 1) * 16}px`,
            '--jy': `${(i % 2) * 14 - 7}px`,
            '--delay': `${i * 75}ms`,
          } as React.CSSProperties}
        >
          {glyph}
        </span>
      ))}
    </div>
  );
}

// A sent item's ghost: a mini plaque (icon + name) that lifts off from the
// real plaque's position and shoots into the recipient's rail tab,
// shrinking to nothing — the item-shaped cousin of the coin stream.
function ItemFlight({
  icon,
  name,
  rect,
  to,
  onDone,
}: {
  icon: string;
  name: string;
  rect: { x: number; y: number; w: number; h: number };
  to: HolderId;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 800);
    return () => clearTimeout(t);
  }, [onDone]);
  const [vec, setVec] = useState<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    const el = document.querySelector(`.tab[data-scope="${to}"]`);
    const r = el?.getBoundingClientRect();
    setVec(
      r
        ? { dx: r.left + r.width / 2 - (rect.x + rect.w / 2), dy: r.top + r.height / 2 - (rect.y + rect.h / 2) }
        : { dx: -rect.x - rect.w / 2 + 26, dy: 0 }
    );
  }, [to, rect]);
  if (!vec) return null;
  return (
    <div
      className="item-flight"
      aria-hidden
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        '--dx': `${Math.round(vec.dx)}px`,
        '--dy': `${Math.round(vec.dy)}px`,
      } as React.CSSProperties}
    >
      <span className="item-icon">{icon}</span> {name}
    </div>
  );
}

type Phase = 'checking' | 'ready';

export function App() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [state, setState] = useState<AppState>({ items: [], log: [], gold: {} as AppState['gold'], platinum: {} as AppState['gold'], icons: {}, portraits: {}, names: {}, needsFood: {}, custom: [], spellbook: [] });
  const [scope, setScope] = useState<Scope>('home');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [actor, setActor] = useState<string>(() => localStorage.getItem('pim_actor') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [allMode, setAllMode] = useState<'holder' | 'category'>(
    () => (localStorage.getItem('pim-all-mode') === 'category' ? 'category' : 'holder')
  );
  const [pickingIcon, setPickingIcon] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  // rests are per-inventory: each holder tab's heading 🌅 rests that holder
  const [resting, setResting] = useState<HolderId | null>(null);
  const [restResult, setRestResult] = useState<api.LongRestResult | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.getState());
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Light polling keeps other tabs of the same browser in sync.
  useEffect(() => {
    if (phase !== 'ready') return;
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, [phase, refresh]);

  useEffect(() => {
    localStorage.setItem('pim_actor', actor);
  }, [actor]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setError(null);
      try {
        await fn();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [refresh]
  );

  const attunedCounts = useMemo(() => {
    const counts = new Map<HolderId, number>();
    for (const m of MEMBERS) counts.set(m.id, 0);
    for (const i of state.items) {
      if (i.attuned && i.location !== 'senchez') {
        counts.set(i.location, (counts.get(i.location) ?? 0) + 1);
      }
    }
    return counts;
  }, [state.items]);

  // gems in the current holder's hoard, for their purse panel
  const gemSummary = useMemo<GemSummary>(() => {
    const out = { count: 0, countedGp: 0, asideCount: 0 };
    for (const i of state.items) {
      if (i.location !== scope || i.category !== 'treasure' || i.subtype !== 'gems') continue;
      out.count += i.qty;
      if (i.fungible === false) {
        out.asideCount += i.qty;
      } else {
        const worth = i.value ? parseGoldValue(i.value) : null;
        if (worth) out.countedGp += worth * i.qty;
      }
    }
    return out;
  }, [state.items, scope]);

  // coins coming in (any path: purse Add, quick-add "25 gp", ledger give,
  // coin dialog) rain a little celebration; spending stays sober
  const coinWorth = useMemo(
    () => HOLDERS.reduce((s, h) => s + (state.gold[h.id] ?? 0) + (state.platinum[h.id] ?? 0) * PP_IN_GP, 0),
    [state.gold, state.platinum]
  );
  const [bursting, setBursting] = useState(false);
  const [spendFx, setSpendFx] = useState<{ amount: number; moth: boolean } | null>(null);
  const prevWorth = useRef<number | null>(null);
  const prevPerHolder = useRef<Partial<Record<HolderId, number>> | null>(null);
  useEffect(() => {
    // wait for real data — the initial 0 → loaded jump is not a payday
    if (phase !== 'ready') return;
    const per: Partial<Record<HolderId, number>> = {};
    for (const h of HOLDERS) per[h.id] = (state.gold[h.id] ?? 0) + (state.platinum[h.id] ?? 0) * PP_IN_GP;
    const was = prevWorth.current;
    const wasPer = prevPerHolder.current;
    prevWorth.current = coinWorth;
    prevPerHolder.current = per;
    if (was === null) return;
    if (coinWorth > was) {
      setBursting(true);
    } else if (coinWorth < was) {
      // a purse emptied to exactly zero earns the moth
      const moth = !!wasPer && HOLDERS.some((h) => (wasPer[h.id] ?? 0) > 0 && per[h.id] === 0);
      setSpendFx({ amount: was - coinWorth, moth });
    }
  }, [coinWorth, phase, state.gold, state.platinum]);
  const endBurst = useCallback(() => setBursting(false), []);
  const endSpendFx = useCallback(() => setSpendFx(null), []);
  // sent coins stream toward the recipient's rail tab
  const [stream, setStream] = useState<{ to: HolderId; key: number } | null>(null);
  const endStream = useCallback(() => setStream(null), []);
  // sent items launch a shrinking ghost of their plaque the same way
  type Flight = { icon: string; name: string; rect: { x: number; y: number; w: number; h: number }; to: HolderId; key: number };
  const [flight, setFlight] = useState<Flight | null>(null);
  const launchItem = useCallback((f: Omit<Flight, 'key'>) => setFlight({ ...f, key: Date.now() }), []);
  const endFlight = useCallback(() => setFlight(null), []);

  if (phase === 'checking')
    return (
      <div className="centered muted">
        <span className="bag-wiggle">🎒</span> Opening the bag…
      </div>
    );

  const isHolderScope = scope !== 'home' && scope !== 'all' && scope !== 'log';
  const scopedItems = isHolderScope ? state.items.filter((i) => i.location === scope) : state.items;
  const visible = applyFilters(scopedItems, filters);
  const filtering = filters.search !== '' || filters.category !== '' || filters.subtype !== '' || filters.rarity !== '' || filters.magicOnly;
  const scopeHolder = isHolderScope ? holderById(scope) : null;

  const addModal = adding && (
    <div className="overlay" onClick={() => setAdding(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Add an item</h2>
          <button type="button" className="link-button" onClick={() => setAdding(false)}>✕</button>
        </div>
        <AddItemForm
          defaultLocation={isHolderScope ? scope : 'senchez'}
          custom={state.custom}
          onAdd={(fields) => run(() => api.createItem(fields, actor))}
          onAddMoney={(amount, unit, location) => run(() => api.addMoney(location, unit === 'pp' ? 0 : amount, unit === 'pp' ? amount : 0, actor))}
          onSaveCustom={(entry) => run(() => api.saveCustomItem(entry, actor))}
          onDeleteCustom={(name) => run(() => api.deleteCustomItem(name, actor))}
          onClose={() => setAdding(false)}
        />
      </div>
    </div>
  );

  return (
    <div className="app">
      <Sidebar scope={scope} onSelect={setScope} items={state.items} icons={state.icons} attunedCounts={attunedCounts} />
      <main className="main">
        <header className="topbar">
          <h1>
            {scope === 'home' ? (
              '🎒 Party Items'
            ) : scope === 'all' ? (
              'Party inventory'
            ) : scope === 'log' ? (
              'Change log'
            ) : (
              <>
                <HolderPortrait
                  name={scopeHolder!.name}
                  image={state.portraits[scopeHolder!.id]}
                  onSave={(image) => run(() => api.setPortrait(scopeHolder!.id, image, actor))}
                  onError={setError}
                />
                <button
                  type="button"
                  className="heading-icon"
                  title={`Change ${scopeHolder!.name}’s icon`}
                  onClick={() => setPickingIcon(true)}
                >
                  {scopeHolder!.id === 'senchez' && !state.icons.senchez ? (
                    <SenchezFace busy={null} size={44} />
                  ) : (
                    holderIcon(state.icons, scopeHolder!)
                  )}
                </button>
                <button
                  type="button"
                  className="heading-name"
                  title={`Rename ${scopeHolder!.name}`}
                  onClick={() => setRenaming(true)}
                >
                  {scopeHolder!.name}
                </button>
                ’s inventory
                <button
                  type="button"
                  className="heading-rest"
                  title={`Long rest — recharge ${scopeHolder!.name}’s items`}
                  onClick={() => {
                    setRestResult(null);
                    setResting(scopeHolder!.id);
                  }}
                >
                  🌅
                </button>
              </>
            )}
          </h1>
          {scope === 'home' && (
            <label className="actor-picker">
              Playing as{' '}
              <select value={actor} onChange={(e) => setActor(e.target.value)}>
                <option value="">— pick —</option>
                {MEMBERS.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </header>

        {error && (
          <div className="error-banner" onClick={() => setError(null)}>
            {error} <span className="muted">(click to dismiss)</span>
          </div>
        )}

        {scope === 'home' ? (
          <div className="home">
            <GoldTracker
              gold={state.gold}
              platinum={state.platinum}
              icons={state.icons}
              onSetPurse={(holder, gp, pp) => run(() => api.setPurse(holder, gp, pp, actor))}
              onGive={(holder, gp, pp) => run(() => api.addMoney(holder, gp, pp, actor))}
              onSpend={(holder, gp, pp) => run(() => api.spendMoney(holder, gp, pp, actor))}
              onTransfer={(from, to, gp, pp) =>
                run(async () => {
                  await api.transferMoney(from, to, gp, pp, actor);
                  setStream({ to, key: Date.now() });
                })
              }
            />
            <FilterBar filters={filters} onChange={setFilters} />
            <button type="button" className="add-big" onClick={() => setAdding(true)}>
              <span className="add-big-plus">＋</span> Add
            </button>
            {filtering && (
              <div className="home-results">
                <ItemList
                  items={visible}
                  icons={state.icons}
                  collapseScope="home"
                  filtering
                  groupByHolder
                  highlightMagic={filters.magicOnly}
                  attunedCounts={attunedCounts}
                  attunementSlots={ATTUNEMENT_SLOTS}
                  isMagic={isMagic}
                  emptyMessage="Nothing matches that search."
                  onMove={(id, to, qty) => run(() => api.moveItem(id, to, qty, actor))}
                  onConsume={(id, note) => run(() => api.consumeItem(id, actor, note))}
                  onSpend={(id) => run(() => api.spendCharge(id, actor))}
                  onRecharge={(id, rolled) => run(() => api.rechargeItem(id, actor, rolled))}
                  onCast={(id, spell, cost) => run(() => api.castSpell(id, spell, cost, actor))}
                  onUpdate={(id, fields) => run(() => api.updateItem(id, fields, actor))}
                  onDelete={(id, disposition, qty) => run(() => api.deleteItem(id, actor, disposition, qty))}
                  onSell={(id, n, unit, qty) => run(() => api.sellItem(id, n, unit, actor, qty))}
                  onAddEntry={(id, fields) => run(() => api.addEntry(id, fields, actor))}
                  onUpdateEntry={(id, entryId, fields) => run(() => api.updateEntry(id, entryId, fields, actor))}
                  onDeleteEntry={(id, entryId) => run(() => api.deleteEntry(id, entryId, actor))}
                  onFly={launchItem}
                  onUnpack={(id) => run(() => api.unpackItem(id, actor))}
                  onTakePack={(id, entryName, to) => run(() => api.takeFromPack(id, entryName, to, actor))}
                  onDiscardPack={(id, entryName) => run(() => api.discardFromPack(id, entryName, actor))}
                  onFill={(id, name, doses) => run(() => api.fillContainer(id, name, doses, actor))}
                  onEmpty={(id) => run(() => api.emptyContainer(id, actor))}
                  onSip={(id) => run(() => api.drinkFromContainer(id, actor))}
                  onAmmo={(id, delta) => run(() => api.adjustAmmo(id, delta, actor))}
                />
              </div>
            )}
          </div>
        ) : scope === 'log' ? (
          <LogPanel log={state.log} icons={state.icons} />
        ) : (
          <>
            {scopeHolder && scopeHolder.kind === 'member' && (() => {
              const att = state.items.filter((i) => i.location === scopeHolder.id && i.attuned);
              if (att.length === 0) return null;
              return (
                <div className="attuned-line muted">
                  ◈ Attuned ({att.length}/{ATTUNEMENT_SLOTS}): {att.map((i) => i.name).join(' · ')}
                </div>
              );
            })()}
            {scopeHolder && (
              <PursePanel
                key={scopeHolder.id}
                self={scopeHolder.id}
                name={scopeHolder.name}
                gp={state.gold[scopeHolder.id] ?? 0}
                pp={state.platinum[scopeHolder.id] ?? 0}
                gems={gemSummary}
                icons={state.icons}
                onAdd={(gp, pp) => run(() => api.addMoney(scopeHolder.id, gp, pp, actor))}
                onSpend={(gp, pp) => run(() => api.spendMoney(scopeHolder.id, gp, pp, actor))}
                onSend={(to, gp, pp) =>
                  run(async () => {
                    await api.transferMoney(scopeHolder.id, to, gp, pp, actor);
                    setStream({ to, key: Date.now() });
                  })
                }
                onSetExact={(gp, pp) => run(() => api.setPurse(scopeHolder.id, gp, pp, actor))}
              />
            )}
            {scope === 'all' && (
              <div className="group-toggle">
                {(['holder', 'category'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`chip ${allMode === m ? 'chip-on' : ''}`}
                    onClick={() => {
                      setAllMode(m);
                      localStorage.setItem('pim-all-mode', m);
                    }}
                  >
                    {m === 'holder' ? 'By holder' : 'By category'}
                  </button>
                ))}
              </div>
            )}
            <div className="list-tools">
              <FilterBar filters={filters} onChange={setFilters} />
              <button type="button" className="add-big add-small" onClick={() => setAdding(true)}>
                <span className="add-big-plus">＋</span> Add
              </button>
            </div>
            <ItemList
              items={visible}
              icons={state.icons}
              collapseScope={scope === 'all' ? `all-${allMode}` : scope}
              filtering={filtering}
              groupByHolder={scope === 'all' && allMode === 'holder'}
              holderChips={scope === 'all' && allMode === 'category'}
              highlightMagic={filters.magicOnly}
              attunedCounts={attunedCounts}
              attunementSlots={ATTUNEMENT_SLOTS}
              isMagic={isMagic}
              emptyMessage={
                filtering ? 'Nothing matches those filters.' : 'Nothing here yet — add something above.'
              }
              onMove={(id, to, qty) => run(() => api.moveItem(id, to, qty, actor))}
              onConsume={(id, note) => run(() => api.consumeItem(id, actor, note))}
              onSpend={(id) => run(() => api.spendCharge(id, actor))}
              onRecharge={(id, rolled) => run(() => api.rechargeItem(id, actor, rolled))}
              onCast={(id, spell, cost) => run(() => api.castSpell(id, spell, cost, actor))}
              onUpdate={(id, fields) => run(() => api.updateItem(id, fields, actor))}
              onDelete={(id, disposition, qty) => run(() => api.deleteItem(id, actor, disposition, qty))}
              onSell={(id, n, unit, qty) => run(() => api.sellItem(id, n, unit, actor, qty))}
              onAddEntry={(id, fields) => run(() => api.addEntry(id, fields, actor))}
              onUpdateEntry={(id, entryId, fields) => run(() => api.updateEntry(id, entryId, fields, actor))}
              onDeleteEntry={(id, entryId) => run(() => api.deleteEntry(id, entryId, actor))}
              onFly={launchItem}
              onUnpack={(id) => run(() => api.unpackItem(id, actor))}
              onTakePack={(id, entryName, to) => run(() => api.takeFromPack(id, entryName, to, actor))}
              onDiscardPack={(id, entryName) => run(() => api.discardFromPack(id, entryName, actor))}
              onFill={(id, name, doses) => run(() => api.fillContainer(id, name, doses, actor))}
              onEmpty={(id) => run(() => api.emptyContainer(id, actor))}
              onSip={(id) => run(() => api.drinkFromContainer(id, actor))}
              onAmmo={(id, delta) => run(() => api.adjustAmmo(id, delta, actor))}
            />
          </>
        )}
        {scope === 'home' && (
          <button
            type="button"
            className="spell-book-btn"
            title="Spell compendium"
            onClick={() => setBookOpen(true)}
          >
            📖
          </button>
        )}
        {bookOpen && (
          <SpellCompendium
            spellbook={state.spellbook}
            onSave={(sp) => run(() => api.saveSpell(sp, actor))}
            onDelete={(name) => run(() => api.deleteSpell(name, actor))}
            onClose={() => setBookOpen(false)}
          />
        )}
        {addModal}
        {bursting && <CoinBurst onDone={endBurst} />}
        {spendFx && <SpendFall amount={spendFx.amount} moth={spendFx.moth} onDone={endSpendFx} />}
        {stream && <CoinStream key={stream.key} to={stream.to} onDone={endStream} />}
        {flight && <ItemFlight key={flight.key} icon={flight.icon} name={flight.name} rect={flight.rect} to={flight.to} onDone={endFlight} />}
        {resting && (
          <LongRestDialog
            items={state.items.filter((i) => i.location === resting)}
            actor={actor}
            who={holderById(resting).name}
            eats={eatsFood(state.needsFood, resting)}
            result={restResult}
            onRest={async (rolls) => {
              setError(null);
              try {
                const res = await api.longRest(actor, resting, rolls);
                setRestResult(res);
                await refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
            onEat={(id) => run(() => api.consumeItem(id, actor, 'supper at camp 🍽️'))}
            onDrink={(id) => run(() => api.drinkFromContainer(id, actor))}
            onFillWater={(id, doses) => run(() => api.fillContainer(id, 'water', doses, actor))}
            onClose={() => setResting(null)}
          />
        )}
        {renaming && scopeHolder && (
          <RenameDialog
            holder={scopeHolder}
            eats={eatsFood(state.needsFood, scopeHolder.id)}
            onSetEats={(needs) => run(() => api.setNeedsFood(scopeHolder.id, needs, actor))}
            onRename={(name) => {
              const old = scopeHolder.name;
              setRenaming(false);
              void run(async () => {
                await api.renameHolder(scopeHolder.id, name, actor);
                if (actor === old) setActor(name);
              });
            }}
            onTorch={(newName, sweep) => {
              const old = scopeHolder.name;
              setRenaming(false);
              void run(async () => {
                await api.passTorch(scopeHolder.id, newName, sweep, actor);
                if (actor === old) setActor(newName);
              });
            }}
            onClose={() => setRenaming(false)}
          />
        )}
        {pickingIcon && scopeHolder && (
          <IconPicker
            title={`${scopeHolder.name}’s icon`}
            presets={HOLDER_ICON_PRESETS}
            current={holderIcon(state.icons, scopeHolder)}
            onPick={(icon) => {
              void run(() => api.setIcon(scopeHolder.id, icon, actor));
              setPickingIcon(false);
            }}
            onClose={() => setPickingIcon(false)}
          />
        )}
      </main>
    </div>
  );
}
