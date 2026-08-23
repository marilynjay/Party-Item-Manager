import { useState } from 'react';
import type { HolderId, Item } from '../types';
import { HOLDERS, ITEM_TYPES, RARITIES } from '../types';

interface Props {
  defaultLocation: HolderId;
  onAdd: (fields: Partial<Item> & { name: string }) => Promise<unknown> | void;
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

export function AddItemForm({ defaultLocation, onAdd }: Props) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [location, setLocation] = useState<HolderId | 'auto'>('auto');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [adv, setAdv] = useState(blankAdvanced);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
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
  };

  const setA = (patch: Partial<typeof blankAdvanced>) => setAdv({ ...adv, ...patch });

  return (
    <form className="add-form" onSubmit={submit}>
      <div className="add-row">
        <input
          className="add-name"
          placeholder="Add an item… (e.g. Potion of Healing)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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
        <button type="button" className="link-button" onClick={() => setShowAdvanced(!showAdvanced)}>
          Advanced {showAdvanced ? '▴' : '▾'}
        </button>
      </div>
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
    </form>
  );
}
