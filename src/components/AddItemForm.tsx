import { useEffect, useRef, useState } from 'react';
import type { HolderId, Item } from '../types';
import { HOLDERS, ITEM_TYPES, RARITIES, holderById } from '../types';
import type { CatalogItem } from '../catalog';
import { searchCatalog } from '../catalog';
import { CatalogBrowser } from './CatalogBrowser';

interface Props {
  defaultLocation: HolderId;
  onAdd: (fields: Partial<Item> & { name: string }) => Promise<unknown> | void;
  onAddMoney: (amount: number, unit: 'gp' | 'pp', location: HolderId) => Promise<unknown> | void;
}

// "50 gp", "50 gold", "3 pp", "3 platinum" — money typed into the item box.
function parseMoney(s: string): { amount: number; unit: 'gp' | 'pp' } | null {
  const m = s.trim().toLowerCase().replace(/,/g, '').match(/^(\d+)\s*(gp|gold|pp|plat|platinum)$/);
  if (!m) return null;
  const amount = parseInt(m[1], 10);
  if (!amount) return null;
  return { amount, unit: m[2].startsWith('g') ? 'gp' : 'pp' };
}

type Suggestion =
  | { kind: 'coins'; amount: number; unit: 'gp' | 'pp' }
  | { kind: 'coin-dialog' }
  | { kind: 'item'; item: CatalogItem };

const COIN_WORDS = ['gold', 'platinum', 'coins', 'coin', 'money'];

function suggestFor(name: string): Suggestion[] {
  const money = parseMoney(name);
  if (money) return [{ kind: 'coins', ...money }];
  const t = name.trim().toLowerCase();
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    if (n > 0) return [{ kind: 'coins', amount: n, unit: 'gp' }, { kind: 'coins', amount: n, unit: 'pp' }];
  }
  const rows: Suggestion[] = searchCatalog(name).map((item) => ({ kind: 'item', item }));
  if (t === 'gp' || t === 'pp' || (t.length >= 2 && COIN_WORDS.some((w) => w.startsWith(t)))) {
    rows.unshift({ kind: 'coin-dialog' });
  }
  return rows;
}

const blankAdvanced = {
  type: '',
  rarity: '',
  weight: '' as string,
  value: '',
  magic: false,
  requiresAttunement: false,
  notes: '',
};

export function AddItemForm({ defaultLocation, onAdd, onAddMoney }: Props) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [location, setLocation] = useState<HolderId | 'auto'>('auto');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [adv, setAdv] = useState(blankAdvanced);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sugIx, setSugIx] = useState(0);
  const [picked, setPicked] = useState<CatalogItem | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [coining, setCoining] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const target = location === 'auto' ? defaultLocation : location;
  const money = parseMoney(name);

  const applyCatalog = (it: CatalogItem) => {
    setName(it.name);
    setAdv({
      type: it.type,
      rarity: it.rarity,
      weight: it.weight === null ? '' : String(it.weight),
      value: '',
      magic: it.magic,
      requiresAttunement: it.requiresAttunement,
      notes: it.rules,
    });
    setPicked(it);
    setSuggestions([]);
    setBrowsing(false);
    nameRef.current?.focus();
  };

  const applySuggestion = (s: Suggestion) => {
    if (s.kind === 'item') {
      applyCatalog(s.item);
    } else if (s.kind === 'coins') {
      void onAddMoney(s.amount, s.unit, target);
      setName('');
      setSuggestions([]);
    } else {
      setCoining(true);
      setSuggestions([]);
    }
  };

  const onNameChange = (v: string) => {
    setName(v);
    setPicked(null);
    setSuggestions(suggestFor(v));
    setSugIx(0);
  };

  const onNameKey = (e: React.KeyboardEvent) => {
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSugIx((sugIx + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSugIx((sugIx + suggestions.length - 1) % suggestions.length); }
    else if (e.key === 'Enter') { e.preventDefault(); applySuggestion(suggestions[sugIx]); }
    else if (e.key === 'Escape') setSuggestions([]);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (money) {
      void onAddMoney(money.amount, money.unit, target);
      setName('');
      setSuggestions([]);
      return;
    }
    void onAdd({
      name: name.trim(),
      qty,
      location: target,
      type: adv.type,
      rarity: adv.rarity,
      weight: adv.weight === '' ? null : Number(adv.weight),
      value: adv.value,
      magic: adv.magic,
      requiresAttunement: adv.requiresAttunement,
      notes: adv.notes,
    });
    setName('');
    setQty(1);
    setAdv(blankAdvanced);
    setShowAdvanced(false);
    setPicked(null);
    setSuggestions([]);
  };

  const setA = (patch: Partial<typeof blankAdvanced>) => setAdv({ ...adv, ...patch });
  const holderName = (id: HolderId) => holderById(id).name;

  const suggestionRow = (s: Suggestion, i: number) => {
    const active = i === sugIx ? 'active' : '';
    if (s.kind === 'coins') {
      return (
        <button key={`coin-${s.unit}`} type="button" className={`suggest-row suggest-coin ${active}`}
          onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}>
          <span>{s.unit === 'gp' ? '🟡' : '⚪'} Add {s.amount.toLocaleString()} {s.unit} to {holderName(target)}’s purse</span>
        </button>
      );
    }
    if (s.kind === 'coin-dialog') {
      return (
        <button key="coin-dialog" type="button" className={`suggest-row suggest-coin ${active}`}
          onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}>
          <span>🪙 Add coins… <span className="muted">gold or platinum</span></span>
        </button>
      );
    }
    const it = s.item;
    return (
      <button key={it.name} type="button" className={`suggest-row ${active}`}
        onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}>
        <span>{it.name}</span>
        <span className="item-tags">
          {it.rarity && <span className={`tag rarity-${it.rarity.replace(/\s+/g, '-')}`}>{it.rarity}</span>}
          <span className="tag">{it.type}</span>
          {it.requiresAttunement && <span className="tag attune-tag">◇</span>}
        </span>
      </button>
    );
  };

  return (
    <form className="add-form" onSubmit={submit}>
      <div className="add-row">
        <div className="suggest-wrap">
          <input
            ref={nameRef}
            className="add-name"
            placeholder="Add an item…"
            value={name}
            autoComplete="off"
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={onNameKey}
            onBlur={() => setTimeout(() => setSuggestions([]), 150)}
          />
          {suggestions.length > 0 && <div className="suggest">{suggestions.map(suggestionRow)}</div>}
        </div>
        <input
          className="add-qty"
          type="number"
          min={1}
          value={qty}
          title="Quantity"
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
        />
        <select
          className="add-location"
          value={location}
          title="Who gets it"
          onChange={(e) => setLocation(e.target.value as HolderId | 'auto')}
        >
          <option value="auto">→ {holderName(defaultLocation)}</option>
          {HOLDERS.map((h) => (
            <option key={h.id} value={h.id}>
              → {h.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!name.trim()}>
          Add
        </button>
        <button type="button" className="link-button" onClick={() => setCoining(true)}>
          🪙 Coins
        </button>
        <button type="button" className="link-button" onClick={() => setBrowsing(true)}>
          📖 Browse
        </button>
        <button type="button" className="link-button" onClick={() => setShowAdvanced(!showAdvanced)}>
          Advanced {showAdvanced ? '▴' : '▾'}
        </button>
      </div>
      {money && (
        <div className="picked-note money-note">
          🪙 Adding {money.amount.toLocaleString()} {money.unit} to {holderName(target)}’s purse
        </div>
      )}
      {picked && !money && (
        <div className="picked-note muted">
          ✓ From the catalogue: {picked.rarity || 'mundane'} {picked.type}
          {picked.requiresAttunement ? ', requires attunement' : ''}
          {picked.weight !== null ? `, ${picked.weight} lb` : ''} — details filled in for you.
        </div>
      )}
      {showAdvanced && (
        <div className="add-advanced">
          <label>
            Type
            <select value={adv.type} onChange={(e) => setA({ type: e.target.value })}>
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
            <select value={adv.rarity} onChange={(e) => setA({ rarity: e.target.value })}>
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
            <input
              type="number"
              min={0}
              step="0.1"
              value={adv.weight}
              onChange={(e) => setA({ weight: e.target.value })}
            />
          </label>
          <label>
            Value
            <input placeholder="e.g. 50 gp" value={adv.value} onChange={(e) => setA({ value: e.target.value })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={adv.magic} onChange={(e) => setA({ magic: e.target.checked })} />
            Magic item
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={adv.requiresAttunement}
              onChange={(e) => setA({ requiresAttunement: e.target.checked })}
            />
            Requires attunement
          </label>
          <label className="wide">
            Notes
            <input value={adv.notes} onChange={(e) => setA({ notes: e.target.value })} />
          </label>
        </div>
      )}
      {browsing && <CatalogBrowser onPick={applyCatalog} onClose={() => setBrowsing(false)} />}
      {coining && (
        <CoinDialog
          defaultTo={target}
          onAdd={(amount, unit, to) => {
            void onAddMoney(amount, unit, to);
            setCoining(false);
            setName('');
          }}
          onClose={() => setCoining(false)}
        />
      )}
    </form>
  );
}

function CoinDialog({
  defaultTo,
  onAdd,
  onClose,
}: {
  defaultTo: HolderId;
  onAdd: (amount: number, unit: 'gp' | 'pp', to: HolderId) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<'gp' | 'pp'>('gp');
  const [to, setTo] = useState<HolderId>(defaultTo);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const n = Math.max(0, Math.floor(Number(amount) || 0));

  // Not a <form>: this dialog renders inside the add form, and nested forms
  // would make its submit fall through to the outer one.
  const commit = () => {
    if (n > 0) onAdd(n, unit, to);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal coin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🪙 Add coins</h2>
          <button type="button" className="link-button" onClick={onClose}>✕</button>
        </div>
        <div className="coin-fields">
          <input
            ref={ref}
            type="number"
            min={1}
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') onClose();
            }}
          />
          <div className="coin-units">
            <button type="button" className={`chip ${unit === 'gp' ? 'chip-on' : ''}`} onClick={() => setUnit('gp')}>
              🟡 Gold
            </button>
            <button type="button" className={`chip ${unit === 'pp' ? 'chip-on' : ''}`} onClick={() => setUnit('pp')}>
              ⚪ Platinum
            </button>
          </div>
          <select value={to} onChange={(e) => setTo(e.target.value as HolderId)}>
            {HOLDERS.map((h) => (
              <option key={h.id} value={h.id}>
                → {h.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="coin-add" disabled={n <= 0} onClick={commit}>
          Add {n > 0 ? `${n.toLocaleString()} ${unit}` : 'coins'}
        </button>
      </div>
    </div>
  );
}
