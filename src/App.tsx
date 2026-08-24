import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api';
import type { AppState, HolderId } from './types';
import { ATTUNEMENT_SLOTS, MEMBERS, holderById, holderIcon, isMagic, parseGoldValue } from './types';
import { Sidebar, type Scope } from './components/Sidebar';
import { FilterBar, type Filters, emptyFilters, applyFilters } from './components/FilterBar';
import { AddItemForm } from './components/AddItemForm';
import { ItemList } from './components/ItemList';
import { LogPanel } from './components/LogPanel';
import { GoldTracker } from './components/GoldTracker';
import { HOLDER_ICON_PRESETS, IconPicker } from './components/IconPicker';
import { PP_IN_GP } from './types';
import { compressImage } from './image';

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

// A holder's coin line: collapsed it shows the coins' gp worth; tapping
// expands a purse panel with the gold/platinum/gems breakdown, Add and
// Spend buttons, and a small ✎ for setting exact amounts.
interface GemSummary {
  count: number;     // gems held (qty-aware)
  countedGp: number; // total gp worth of gems that count toward the purse
  asideCount: number; // gems marked "set aside" (not counted)
}

function PursePanel({
  name,
  gp,
  pp,
  gems,
  onAdd,
  onSpend,
  onSetExact,
}: {
  name: string;
  gp: number;
  pp: number;
  gems: GemSummary;
  onAdd: (amount: number, unit: 'gp' | 'pp') => void;
  onSpend: (amount: number, unit: 'gp' | 'pp') => void;
  onSetExact: (gp: number, pp: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'add' | 'spend' | 'exact' | null>(null);
  const fmt = (n: number) => n.toLocaleString();
  const coinsWorth = gp + pp * PP_IN_GP;
  const totalWorth = coinsWorth + gems.countedGp;

  if (!open) {
    return (
      <button type="button" className="purse-line muted" title={`${name}’s purse — tap for the breakdown`} onClick={() => setOpen(true)}>
        🟡 {fmt(coinsWorth)} gp
        {gems.count > 0 && <span> · 💎 {gems.count}</span>}
        <span className="purse-edit-hint">▾</span>
      </button>
    );
  }

  return (
    <div className="purse-panel">
      <button type="button" className="purse-line muted" title="Fold the purse back up" onClick={() => { setOpen(false); setMode(null); }}>
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
          <button type="button" onClick={() => setMode('add')}>＋ Add coins</button>
          <button type="button" disabled={coinsWorth <= 0} onClick={() => setMode('spend')}>− Spend coins</button>
          <button type="button" className="link-button" title="Set exact amounts" onClick={() => setMode('exact')}>✎</button>
        </div>
      ) : mode === 'exact' ? (
        <ExactPurseForm gp={gp} pp={pp} onSave={(g, p) => { onSetExact(g, p); setMode(null); }} onCancel={() => setMode(null)} />
      ) : (
        <CoinDelta
          verb={mode === 'add' ? '＋ Add' : '− Spend'}
          onDone={(n, unit) => {
            (mode === 'add' ? onAdd : onSpend)(n, unit);
            setMode(null);
          }}
          onCancel={() => setMode(null)}
        />
      )}
    </div>
  );
}

// Amount + gp/pp — shared by Add and Spend.
function CoinDelta({ verb, onDone, onCancel }: { verb: string; onDone: (n: number, unit: 'gp' | 'pp') => void; onCancel: () => void }) {
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<'gp' | 'pp'>('gp');
  return (
    <form
      className="purse-line purse-editing"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Math.floor(Number(amount) || 0);
        if (n > 0) onDone(n, unit);
        else onCancel();
      }}
    >
      <input
        autoFocus
        type="number"
        min={1}
        placeholder="amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <select value={unit} onChange={(e) => setUnit(e.target.value as 'gp' | 'pp')}>
        <option value="gp">gp</option>
        <option value="pp">pp</option>
      </select>
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

type Phase = 'checking' | 'ready';

export function App() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [state, setState] = useState<AppState>({ items: [], log: [], gold: {} as AppState['gold'], platinum: {} as AppState['gold'], icons: {}, portraits: {}, custom: [] });
  const [scope, setScope] = useState<Scope>('home');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [actor, setActor] = useState<string>(() => localStorage.getItem('pim_actor') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [allMode, setAllMode] = useState<'holder' | 'category'>(
    () => (localStorage.getItem('pim-all-mode') === 'category' ? 'category' : 'holder')
  );
  const [pickingIcon, setPickingIcon] = useState(false);

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
          onAddMoney={(amount, unit, location) => run(() => api.addMoney(location, amount, unit, actor))}
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
                  {holderIcon(state.icons, scopeHolder!)}
                  <span className="heading-icon-edit">✎</span>
                </button>
                {scopeHolder!.name}’s inventory
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
              onGive={(holder, amount, unit) => run(() => api.addMoney(holder, amount, unit, actor))}
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
                  onRecharge={(id) => run(() => api.rechargeItem(id, actor))}
                  onCast={(id, spell, cost) => run(() => api.castSpell(id, spell, cost, actor))}
                  onUpdate={(id, fields) => run(() => api.updateItem(id, fields, actor))}
                  onDelete={(id) => run(() => api.deleteItem(id, actor))}
                  onAddEntry={(id, fields) => run(() => api.addEntry(id, fields, actor))}
                  onUpdateEntry={(id, entryId, fields) => run(() => api.updateEntry(id, entryId, fields, actor))}
                  onDeleteEntry={(id, entryId) => run(() => api.deleteEntry(id, entryId, actor))}
                />
              </div>
            )}
          </div>
        ) : scope === 'log' ? (
          <LogPanel log={state.log} />
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
                name={scopeHolder.name}
                gp={state.gold[scopeHolder.id] ?? 0}
                pp={state.platinum[scopeHolder.id] ?? 0}
                gems={gemSummary}
                onAdd={(n, unit) => run(() => api.addMoney(scopeHolder.id, n, unit, actor))}
                onSpend={(n, unit) => run(() => api.spendMoney(scopeHolder.id, n, unit, actor))}
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
              onRecharge={(id) => run(() => api.rechargeItem(id, actor))}
              onCast={(id, spell, cost) => run(() => api.castSpell(id, spell, cost, actor))}
              onUpdate={(id, fields) => run(() => api.updateItem(id, fields, actor))}
              onDelete={(id) => run(() => api.deleteItem(id, actor))}
              onAddEntry={(id, fields) => run(() => api.addEntry(id, fields, actor))}
              onUpdateEntry={(id, entryId, fields) => run(() => api.updateEntry(id, entryId, fields, actor))}
              onDeleteEntry={(id, entryId) => run(() => api.deleteEntry(id, entryId, actor))}
            />
          </>
        )}
        {addModal}
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
