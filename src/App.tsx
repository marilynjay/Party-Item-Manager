import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './api';
import type { AppState, HolderId } from './types';
import { ATTUNEMENT_SLOTS, HOLDERS, MEMBERS, isMagic } from './types';
import { Sidebar, type Scope } from './components/Sidebar';
import { FilterBar, type Filters, emptyFilters, applyFilters } from './components/FilterBar';
import { AddItemForm } from './components/AddItemForm';
import { ItemList } from './components/ItemList';
import { LogPanel } from './components/LogPanel';
import { GoldTracker } from './components/GoldTracker';

type Phase = 'checking' | 'ready';

export function App() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [state, setState] = useState<AppState>({ items: [], log: [], gold: {} as AppState['gold'] });
  const [scope, setScope] = useState<Scope>('all');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [actor, setActor] = useState<string>(() => localStorage.getItem('pim_actor') ?? '');
  const [error, setError] = useState<string | null>(null);

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

  const scopedItems =
    scope === 'all' || scope === 'log' ? state.items : state.items.filter((i) => i.location === scope);
  const visible = applyFilters(scopedItems, filters);
  const filtering = filters.search !== '' || filters.type !== '' || filters.rarity !== '' || filters.magicOnly;

  return (
    <div className="app">
      <Sidebar scope={scope} onSelect={setScope} items={state.items} attunedCounts={attunedCounts} />
      <main className="main">
        <header className="topbar">
          <h1>
            {scope === 'all'
              ? 'Party inventory'
              : scope === 'log'
                ? 'Change log'
                : `${HOLDERS.find((h) => h.id === scope)!.name}’s inventory`}
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

        {scope === 'log' ? (
          <LogPanel log={state.log} />
        ) : (
          <>
            <GoldTracker gold={state.gold} onSet={(holder, amount) => run(() => api.setGold(holder, amount, actor))} />
            <AddItemForm
              defaultLocation={scope === 'all' ? 'senchez' : scope}
              onAdd={(fields) => run(() => api.createItem(fields, actor))}
            />
            <FilterBar filters={filters} onChange={setFilters} />
            <ItemList
              items={visible}
              groupByHolder={scope === 'all'}
              highlightMagic={filters.magicOnly}
              attunedCounts={attunedCounts}
              attunementSlots={ATTUNEMENT_SLOTS}
              isMagic={isMagic}
              emptyMessage={
                filtering ? 'Nothing matches those filters.' : 'Nothing here yet — add something above.'
              }
              onMove={(id, to, qty) => run(() => api.moveItem(id, to, qty, actor))}
              onUpdate={(id, fields) => run(() => api.updateItem(id, fields, actor))}
              onDelete={(id) => run(() => api.deleteItem(id, actor))}
            />
          </>
        )}
      </main>
    </div>
  );
}
