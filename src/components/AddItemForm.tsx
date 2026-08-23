import { useRef, useState } from 'react';
import type { HolderId, Item } from '../types';
import { HOLDERS, ITEM_TYPES, RARITIES } from '../types';
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
  const [suggestions, setSuggestions] = useState<CatalogItem[]>([]);
  const [sugIx, setSugIx] = useState(0);
  const [picked, setPicked] = useState<CatalogItem | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

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

  const money = parseMoney(name);

  const onNameChange = (v: string) => {
    setName(v);
    setPicked(null);
    setSuggestions(parseMoney(v) ? [] : searchCatalog(v));
    setSugIx(0);
  };

  const onNameKey = (e: React.KeyboardEvent) => {
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSugIx((sugIx + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSugIx((sugIx + suggestions.length - 1) % suggestions.length); }
    else if (e.key === 'Enter') { e.preventDefault(); applyCatalog(suggestions[sugIx]); }
    else if (e.key === 'Escape') setSuggestions([]);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (money) {
      void onAddMoney(money.amount, money.unit, location === 'auto' ? defaultLocation : location);
      setName('');
      setSuggestions([]);
      return;
    }
    void onAdd({
      name: name.trim(),
      qty,
      location: location === 'auto' ? defaultLocation : location,
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

  return (
    <form className="add-form" onSubmit={submit}>
      <div className="add-row">
        <div className="suggest-wrap">
          <input
            ref={nameRef}
            className="add-name"
            placeholder="Add an item… or gold: 25 gp"
            value={name}
            autoComplete="off"
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={onNameKey}
            onBlur={() => setTimeout(() => setSuggestions([]), 150)}
          />
          {suggestions.length > 0 && (
            <div className="suggest">
              {suggestions.map((it, i) => (
                <button
                  key={it.name}
                  type="button"
                  className={`suggest-row ${i === sugIx ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); applyCatalog(it); }}
                >
                  <span>{it.name}</span>
                  <span className="item-tags">
                    {it.rarity && <span className={`tag rarity-${it.rarity.replace(/\s+/g, '-')}`}>{it.rarity}</span>}
                    <span className="tag">{it.type}</span>
                    {it.requiresAttunement && <span className="tag attune-tag">◇</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
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
          <option value="auto">→ {HOLDERS.find((h) => h.id === defaultLocation)!.name}</option>
          {HOLDERS.map((h) => (
            <option key={h.id} value={h.id}>
              → {h.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!name.trim()}>
          Add
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
          🪙 Adding {money.amount.toLocaleString()} {money.unit} to{' '}
          {HOLDERS.find((h) => h.id === (location === 'auto' ? defaultLocation : location))!.name}’s purse
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
    </form>
  );
}
