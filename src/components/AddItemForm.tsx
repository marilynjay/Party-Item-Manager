import { useRef, useState } from 'react';
import type { CategoryKey, HolderId, Item } from '../types';
import { HOLDERS, RARITIES, categoryLabel, defaultIcon, hidesAttunement, hidesWeight, holderById } from '../types';
import { CategoryPicker } from './CategoryPicker';
import type { CatalogItem } from '../catalog';
import { searchCatalog } from '../catalog';
import { CatalogBrowser } from './CatalogBrowser';

interface Props {
  defaultLocation: HolderId;
  custom: CatalogItem[];
  onAdd: (fields: Partial<Item> & { name: string }) => Promise<unknown> | void;
  onAddMoney: (amount: number, unit: 'gp' | 'pp', location: HolderId) => Promise<unknown> | void;
  onSaveCustom: (entry: CatalogItem) => Promise<unknown> | void;
  onDeleteCustom: (name: string) => Promise<unknown> | void;
  onClose: () => void;
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
  | { kind: 'custom-item' }
  | { kind: 'item'; item: CatalogItem; custom?: boolean };

const COIN_WORDS = ['gold', 'platinum', 'coins', 'coin', 'money'];

function suggestFor(name: string, custom: CatalogItem[]): Suggestion[] {
  const money = parseMoney(name);
  if (money) return [{ kind: 'coins', ...money }];
  const t = name.trim().toLowerCase();
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    if (n > 0) return [{ kind: 'coins', amount: n, unit: 'gp' }, { kind: 'coins', amount: n, unit: 'pp' }];
  }
  const rows: Suggestion[] = [];
  if (t.length >= 2) {
    // the party's own creations outrank the SRD
    for (const it of custom) {
      if (it.name.toLowerCase().includes(t)) rows.push({ kind: 'item', item: it, custom: true });
      if (rows.length >= 4) break;
    }
  }
  for (const item of searchCatalog(name, 8 - rows.length)) rows.push({ kind: 'item', item });
  if (t === 'gp' || t === 'pp' || (t.length >= 2 && COIN_WORDS.some((w) => w.startsWith(t)))) {
    rows.unshift({ kind: 'coin-dialog' });
  }
  // the escape hatch is always last: make this a full custom item
  if (t.length > 0) rows.push({ kind: 'custom-item' });
  return rows;
}

const blankAdvanced = {
  category: '' as CategoryKey,
  subtype: '',
  rarity: '',
  weight: '' as string,
  value: '',
  magic: false,
  requiresAttunement: false,
  attuned: false,
  notes: '',
};

export function AddItemForm({ defaultLocation, custom, onAdd, onAddMoney, onSaveCustom, onDeleteCustom, onClose }: Props) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [location, setLocation] = useState<HolderId | 'auto'>('auto');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [adv, setAdv] = useState(blankAdvanced);
  const [saveCustom, setSaveCustom] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sugIx, setSugIx] = useState(0);
  const [picked, setPicked] = useState<CatalogItem | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [coining, setCoining] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const target = location === 'auto' ? defaultLocation : location;
  const money = parseMoney(name);
  // no catalogue matches for what's typed: the two options are Quick Add or a custom item
  const nothingMatches =
    name.trim() !== '' && !money && !picked && !suggestFor(name, custom).some((r) => r.kind === 'item');
  // rarity above common already counts as magic in every filter
  const impliedMagic = adv.rarity !== '' && adv.rarity !== 'common';

  const applyCatalog = (it: CatalogItem) => {
    setName(it.name);
    setAdv({
      category: it.category as CategoryKey,
      subtype: it.subtype,
      rarity: it.rarity,
      weight: it.weight === null ? '' : String(it.weight),
      value: '',
      magic: it.magic,
      requiresAttunement: it.requiresAttunement,
      attuned: false,
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
      onClose();
    } else if (s.kind === 'custom-item') {
      setDetailsOpen(true);
      setSuggestions([]);
    } else {
      setCoining(true);
      setSuggestions([]);
    }
  };

  const onNameChange = (v: string) => {
    setName(v);
    setPicked(null);
    setSuggestions(suggestFor(v, custom));
    setSugIx(0);
  };

  const onNameKey = (e: React.KeyboardEvent) => {
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSugIx((sugIx + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSugIx((sugIx + suggestions.length - 1) % suggestions.length); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = suggestions[sugIx];
      // typing an unknown name and hitting Enter means Quick Add, not the details panel
      if (chosen.kind === 'custom-item' && nothingMatches) doAdd(false);
      else applySuggestion(chosen);
    }
    else if (e.key === 'Escape') setSuggestions([]);
  };

  const reset = () => {
    setName('');
    setQty(1);
    setAdv(blankAdvanced);
    setSaveCustom(false);
    setDetailsOpen(false);
    setPicked(null);
    setSuggestions([]);
  };

  const doAdd = (andAnother: boolean) => {
    if (!name.trim()) return;
    if (money) {
      void onAddMoney(money.amount, money.unit, target);
      onClose();
      return;
    }
    const noWeight = hidesWeight(adv.category);
    const noAttune = hidesAttunement(adv.category, adv.subtype);
    const weight = noWeight || adv.weight === '' ? null : Number(adv.weight);
    void onAdd({
      name: name.trim(),
      qty,
      location: target,
      category: adv.category,
      subtype: adv.subtype,
      rarity: adv.rarity,
      weight,
      value: adv.value,
      magic: adv.magic || impliedMagic,
      requiresAttunement: !noAttune && adv.requiresAttunement,
      attuned: !noAttune && adv.attuned,
      notes: adv.notes,
    });
    if (saveCustom) {
      void onSaveCustom({
        name: name.trim(),
        category: adv.category,
        subtype: adv.subtype,
        rarity: adv.rarity,
        magic: adv.magic || impliedMagic,
        requiresAttunement: !noAttune && adv.requiresAttunement,
        weight,
        rules: adv.notes,
      });
    }
    if (andAnother) {
      reset();
      nameRef.current?.focus();
    } else {
      onClose();
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    doAdd(false);
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
    if (s.kind === 'custom-item') {
      return (
        <button key="custom-item" type="button" className={`suggest-row suggest-new ${nothingMatches ? 'lit' : ''} ${active}`}
          onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}>
          <span>＋ Custom item <span className="muted">— add details</span></span>
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
      <button key={(s.custom ? '✦' : '') + it.name} type="button" className={`suggest-row ${active}`}
        onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}>
        <span>{s.custom && <span className="custom-mark">✦ </span>}{defaultIcon(it.category as CategoryKey, it.subtype, it.name)} {it.name}</span>
        <span className="item-tags">
          {it.rarity && <span className={`tag rarity-${it.rarity.replace(/\s+/g, '-')}`}>{it.rarity}</span>}
          {categoryLabel(it.category as CategoryKey, it.subtype) && (
            <span className="tag">{categoryLabel(it.category as CategoryKey, it.subtype)}</span>
          )}
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
        <button type="submit" disabled={!name.trim()}>
          {nothingMatches && !detailsOpen ? 'Quick Add' : 'Add'}
        </button>
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
        <button type="button" className="link-button" onClick={() => setCoining(true)}>
          🪙 Coins
        </button>
        <button type="button" className="link-button" onClick={() => setBrowsing(true)}>
          📖 Browse
        </button>
      </div>
      {money && (
        <div className="picked-note money-note">
          🟡 Adding {money.amount.toLocaleString()} {money.unit} to {holderName(target)}’s purse
        </div>
      )}
      {picked && !money && (
        <div className="picked-note muted">
          ✓ From the catalogue: {picked.rarity || 'mundane'} {categoryLabel(picked.category as CategoryKey, picked.subtype)}
          {picked.requiresAttunement ? ', requires attunement' : ''}
          {picked.weight !== null ? `, ${picked.weight} lb` : ''} — details filled in.{' '}
          {!detailsOpen && (
            <button type="button" className="link-button picked-tweak" onClick={() => setDetailsOpen(true)}>
              ✎ adjust
            </button>
          )}
        </div>
      )}
      {detailsOpen && (
        <div className="add-advanced">
          <div className="details-head wide">
            <span className="item-menu-heading muted">Item details</span>
            <button type="button" className="link-button" onClick={() => setDetailsOpen(false)}>▴ hide</button>
          </div>
          <div className="wide">
            <CategoryPicker
              category={adv.category}
              subtype={adv.subtype}
              onChange={(category, subtype) => setA({ category, subtype })}
            />
          </div>
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
          {!hidesWeight(adv.category) && (
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
          )}
          <label>
            Value
            <input placeholder="e.g. 50 gp" value={adv.value} onChange={(e) => setA({ value: e.target.value })} />
          </label>
          <label className="check" title={impliedMagic ? 'Anything above common counts as magic already' : undefined}>
            <input
              type="checkbox"
              checked={adv.magic || impliedMagic}
              disabled={impliedMagic}
              onChange={(e) => setA({ magic: e.target.checked })}
            />
            Magic item{impliedMagic && <span className="muted"> (implied by rarity)</span>}
          </label>
          {!hidesAttunement(adv.category, adv.subtype) && (
            <label className="check">
              <input
                type="checkbox"
                checked={adv.requiresAttunement}
                onChange={(e) => setA({ requiresAttunement: e.target.checked, attuned: e.target.checked ? adv.attuned : false })}
              />
              Requires attunement
            </label>
          )}
          {!hidesAttunement(adv.category, adv.subtype) && adv.requiresAttunement && target !== 'senchez' && (
            <label className="check">
              <input type="checkbox" checked={adv.attuned} onChange={(e) => setA({ attuned: e.target.checked })} />
              Already attuned to {holderName(target)}
            </label>
          )}
          <label className="wide">
            Notes
            <textarea rows={3} value={adv.notes} onChange={(e) => setA({ notes: e.target.value })} />
          </label>
          <label className="check wide" title="Saved items autocomplete and appear in Browse under ✦ Custom">
            <input type="checkbox" checked={saveCustom} onChange={(e) => setSaveCustom(e.target.checked)} />
            ✦ Save to our catalogue for next time
          </label>
        </div>
      )}
      {browsing && (
        <CatalogBrowser
          custom={custom}
          onPick={applyCatalog}
          onDeleteCustom={onDeleteCustom}
          onClose={() => setBrowsing(false)}
        />
      )}
      {coining && (
        <CoinDialog
          defaultTo={target}
          onAdd={(amount, unit, to) => {
            void onAddMoney(amount, unit, to);
            setCoining(false);
            onClose();
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
            ref={(el) => { ref.current = el; el?.focus(); }}
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
