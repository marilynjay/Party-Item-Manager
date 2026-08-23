import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api';
import type { AppState, HolderId } from './types';
import { ATTUNEMENT_SLOTS, MEMBERS, holderById, holderIcon, isMagic } from './types';
import { Sidebar, type Scope } from './components/Sidebar';
import { FilterBar, type Filters, emptyFilters, applyFilters } from './components/FilterBar';
import { AddItemForm } from './components/AddItemForm';
import { ItemList } from './components/ItemList';
import { LogPanel } from './components/LogPanel';
import { GoldTracker } from './components/GoldTracker';
import { HOLDER_ICON_PRESETS, IconPicker } from './components/IconPicker';
import { PP_IN_GP } from './types';

// A holder's coin line, shown on their own tab when they carry anything;
// tapping it opens an inline gp/pp editor.
function PurseLine({ name, gp, pp, onSave }: { name: string; gp: number; pp: number; onSave: (gp: number, pp: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [gpVal, setGpVal] = useState('');
  const [ppVal, setPpVal] = useState('');
  if (gp <= 0 && pp <= 0 && !editing) return null;

  if (!editing) {
    return (
      <button
        type="button"
        className="purse-line muted"
        title={`Change ${name}’s coins`}
        onClick={() => {
          setGpVal(String(gp));
          setPpVal(String(pp));
          setEditing(true);
        }}
      >
        🟡 {gp.toLocaleString()} gp
        {pp > 0 && (
          <>
            {' '}+ ⚪ {pp.toLocaleString()} pp <span className="purse-worth">(= {(gp + pp * PP_IN_GP).toLocaleString()} gp)</span>
          </>
        )}
        <span className="purse-edit-hint">✎</span>
      </button>
    );
  }

  const parse = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
  return (
    <form
      className="purse-line purse-editing"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(parse(gpVal), parse(ppVal));
        setEditing(false);
      }}
    >
      <label className="coin-field">
        <input autoFocus type="number" min={0} value={gpVal} onChange={(e) => setGpVal(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)} />
        gp
      </label>
      <label className="coin-field">
        <input type="number" min={0} value={ppVal} onChange={(e) => setPpVal(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)} />
        pp
      </label>
      <button type="submit" title="Save">✓</button>
      <button type="button" className="link-button" title="Cancel" onClick={() => setEditing(false)}>✕</button>
    </form>
  );
}

type Phase = 'checking' | 'ready';

export function App() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [state, setState] = useState<AppState>({ items: [], log: [], gold: {} as AppState['gold'], platinum: {} as AppState['gold'], icons: {}, custom: [] });
  const [scope, setScope] = useState<Scope>('home');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [actor, setActor] = useState<string>(() => localStorage.getItem('pim_actor') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
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

  if (phase === 'checking') return <div className="centered muted">Opening the bag…</div>;

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
                  onUpdate={(id, fields) => run(() => api.updateItem(id, fields, actor))}
                  onDelete={(id) => run(() => api.deleteItem(id, actor))}
                />
              </div>
            )}
          </div>
        ) : scope === 'log' ? (
          <LogPanel log={state.log} />
        ) : (
          <>
            {scopeHolder && (
              <PurseLine
                name={scopeHolder.name}
                gp={state.gold[scopeHolder.id] ?? 0}
                pp={state.platinum[scopeHolder.id] ?? 0}
                onSave={(gp, pp) => run(() => api.setPurse(scopeHolder.id, gp, pp, actor))}
              />
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
              groupByHolder={scope === 'all'}
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
              onUpdate={(id, fields) => run(() => api.updateItem(id, fields, actor))}
              onDelete={(id) => run(() => api.deleteItem(id, actor))}
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
