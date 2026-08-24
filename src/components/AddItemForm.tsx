import { AutoTextarea } from './AutoTextarea';
import { useRef, useState } from 'react';
import type { CategoryKey, HolderId, Item } from '../types';
import type { FormField, ItemStats } from '../types';
import { HOLDERS, RARITIES, categoryLabel, defaultIcon, formPlan, notesLabel, planHas, statPlan, holderById } from '../types';
import { StatFieldControl, cleanStats } from './StatFields';
import { compressImage } from '../image';
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
  catDone: false,
  rarity: '',
  weight: '' as string,
  value: '',
  fungible: true,
  freshness: '' as string,
  magic: false,
  requiresAttunement: false,
  attuned: false,
  notes: '',
  content: '',
  image: undefined as string | undefined,
  stats: {} as ItemStats,
};

export function AddItemForm({ defaultLocation, custom, onAdd, onAddMoney, onSaveCustom, onDeleteCustom, onClose }: Props) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [location, setLocation] = useState<HolderId | 'auto'>('auto');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [adv, setAdv] = useState(blankAdvanced);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [sugIx, setSugIx] = useState(0);
  const [picked, setPicked] = useState<CatalogItem | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [coining, setCoining] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | undefined>(undefined);

  const target = location === 'auto' ? defaultLocation : location;
  const money = parseMoney(name);
  // no catalogue matches for what's typed: the two options are Quick Add or a custom item
  const nothingMatches =
    name.trim() !== '' && !money && !picked && !suggestFor(name, custom).some((r) => r.kind === 'item');
  // rarity above common already counts as magic in every filter
  const impliedMagic = adv.rarity !== '' && adv.rarity !== 'common';
  const plan = formPlan(adv.category, adv.subtype);
  const sPlan = statPlan(adv.category, adv.subtype);
  const setStats = (patch: Partial<ItemStats>) => setAdv((prev) => ({ ...prev, stats: { ...prev.stats, ...patch } }));
  const statEl = (f: Parameters<typeof StatFieldControl>[0]['field']) => (
    <StatFieldControl key={f} field={f} stats={adv.stats} onChange={setStats} />
  );

  const onPhotoFile = (file: File | undefined) => {
    if (!file) return;
    setPhotoError('');
    compressImage(file)
      .then((dataUrl) => setAdv((prev) => ({ ...prev, image: dataUrl })))
      .catch((e: Error) => setPhotoError(e.message));
  };

  const fieldEl = (f: FormField) => {
    switch (f) {
      case 'rarity':
        return (
          <label key={f}>
            Rarity
            <select value={adv.rarity} onChange={(e) => setA({ rarity: e.target.value })}>
              <option value="">—</option>
              {RARITIES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
        );
      case 'weight':
        return (
          <label key={f}>
            Weight (lb each)
            <input type="number" min={0} step="0.1" value={adv.weight} onChange={(e) => setA({ weight: e.target.value })} />
          </label>
        );
      case 'value':
        return (
          <label key={f}>
            Value
            <input placeholder="e.g. 50 gp" value={adv.value} onChange={(e) => setA({ value: e.target.value })} />
          </label>
        );
      case 'magic':
        return (
          <label key={f} className="check" title={impliedMagic ? 'Anything above common counts as magic already' : undefined}>
            <input
              type="checkbox"
              checked={adv.magic || impliedMagic}
              disabled={impliedMagic}
              onChange={(e) => setA({ magic: e.target.checked })}
            />
            Magic item{impliedMagic && <span className="muted"> (implied by rarity)</span>}
          </label>
        );
      case 'attunement':
        return (
          <span key={f} className="attune-pair">
            <label className="check">
              <input
                type="checkbox"
                checked={adv.requiresAttunement}
                onChange={(e) => setA({ requiresAttunement: e.target.checked, attuned: e.target.checked ? adv.attuned : false })}
              />
              Requires attunement
            </label>
            {adv.requiresAttunement && target !== 'senchez' && (
              <label className="check">
                <input type="checkbox" checked={adv.attuned} onChange={(e) => setA({ attuned: e.target.checked })} />
                Already attuned to {holderName(target)}
              </label>
            )}
          </span>
        );
      case 'content':
        return (
          <label key={f} className="wide">
            Contents — what's written on it
            <AutoTextarea rows={3} value={adv.content} onChange={(e) => setA({ content: e.target.value })} />
          </label>
        );
      case 'fungible':
        return (
          <label key={f} className="check" title="Unchecked = set aside (a diamond saved for a spell) — the value won't count toward the purse">
            <input type="checkbox" checked={adv.fungible} onChange={(e) => setA({ fungible: e.target.checked })} />
            💰 Counts toward gold total
          </label>
        );
      case 'freshness':
        return (
          <label key={f} title="Long rests tick this down; at 0 it spoils or expires. Leave blank for anything that keeps — jerky, hardtack, most gear.">
            Keeps for (rests)
            <input type="number" min={1} placeholder="forever" value={adv.freshness} onChange={(e) => setA({ freshness: e.target.value })} />
          </label>
        );
    }
  };

  const applyCatalog = (it: CatalogItem) => {
    setName(it.name);
    setAdv({
      category: it.category as CategoryKey,
      subtype: it.subtype,
      catDone: true,
      rarity: it.rarity,
      weight: it.weight === null ? '' : String(it.weight),
      value: it.value ?? '',
      fungible: true,
      freshness: '',
      magic: it.magic,
      requiresAttunement: it.requiresAttunement,
      attuned: false,
      notes: it.rules,
      content: '',
      image: undefined,
      stats: it.stats ? { ...it.stats } : {},
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
    window.clearTimeout(blurTimer.current);
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
    const noWeight = !planHas(adv.category, adv.subtype, 'weight');
    const noAttune = !planHas(adv.category, adv.subtype, 'attunement');
    const weight = noWeight || adv.weight === '' ? null : Number(adv.weight);
    const content = planHas(adv.category, adv.subtype, 'content') ? adv.content : '';
    const stats = cleanStats(adv.stats, [...sPlan.primary, ...sPlan.advanced]);
    void onAdd({
      name: name.trim(),
      qty,
      location: target,
      category: adv.category,
      subtype: adv.subtype,
      rarity: adv.rarity,
      weight,
      value: adv.value,
      fungible: planHas(adv.category, adv.subtype, 'fungible') ? adv.fungible : undefined,
      freshness:
        planHas(adv.category, adv.subtype, 'freshness') && adv.freshness !== ''
          ? Math.max(1, Math.floor(Number(adv.freshness) || 0))
          : undefined,
      magic: adv.magic || impliedMagic,
      requiresAttunement: !noAttune && adv.requiresAttunement,
      attuned: !noAttune && adv.attuned,
      notes: adv.notes,
      content,
      image: adv.image,
      stats,
    });
    // anything built through the custom-item panel joins the party catalogue
    if (!picked && adv.catDone) {
      void onSaveCustom({
        name: name.trim(),
        category: adv.category,
        subtype: adv.subtype,
        rarity: adv.rarity,
        magic: adv.magic || impliedMagic,
        requiresAttunement: !noAttune && adv.requiresAttunement,
        weight,
        stats,
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
            onFocus={() => window.clearTimeout(blurTimer.current)}
            onBlur={() => {
              blurTimer.current = window.setTimeout(() => setSuggestions([]), 150);
            }}
          />
          {name.trim() !== '' && (
            <button
              type="button"
              className="name-clear"
              title="Clear"
              onClick={() => {
                setName('');
                setPicked(null);
                setAdv({ ...blankAdvanced, stats: {} });
                setDetailsOpen(false);
                setSuggestions([]);
                nameRef.current?.focus();
              }}
            >
              ✕
            </button>
          )}
          {suggestions.length > 0 && <div className="suggest">{suggestions.map(suggestionRow)}</div>}
        </div>
        {!detailsOpen && (
          <button type="submit" disabled={!name.trim()}>
            {nothingMatches ? 'Quick Add' : 'Add'}
          </button>
        )}
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
        {!detailsOpen && (adv.category !== '' || adv.catDone) && (
          <button type="button" className="link-button" onClick={() => setDetailsOpen(true)}>
            Custom item ▾
          </button>
        )}
      </div>
      {money && (
        <div className="picked-note money-note">
          🟡 Adding {money.amount.toLocaleString()} {money.unit} to {holderName(target)}’s purse
        </div>
      )}
      {picked && !money && (
        <div className="picked-card">
          <div className="picked-card-head">
            <span className="picked-card-name">
              {defaultIcon(picked.category as CategoryKey, picked.subtype, picked.name)} <strong>{picked.name}</strong>
            </span>
            <span className="item-tags">
              {picked.rarity && <span className={`tag rarity-${picked.rarity.replace(/\s+/g, '-')}`}>{picked.rarity}</span>}
              {categoryLabel(picked.category as CategoryKey, picked.subtype) && (
                <span className="tag">{categoryLabel(picked.category as CategoryKey, picked.subtype)}</span>
              )}
              {picked.requiresAttunement && <span className="tag attune-tag">◇ attunement</span>}
              {picked.stats?.dmg && <span className="tag">{picked.stats.dmg}{picked.stats.dtype ? ` ${picked.stats.dtype}` : ''}{picked.stats.bonus ? ` +${picked.stats.bonus}` : ''}</span>}
              {picked.stats?.ac && <span className="tag">AC {picked.stats.ac}</span>}
              {picked.stats?.chargesMax !== undefined && <span className="tag charges-tag">⚡ {picked.stats.chargesMax}</span>}
              {picked.stats?.heal && <span className="tag">heals {picked.stats.heal}</span>}
              {picked.weight !== null && <span className="tag muted-tag">{picked.weight} lb</span>}
              {picked.value && <span className="tag muted-tag">{picked.value}</span>}
            </span>
          </div>
          {picked.rules && <div className="picked-card-rules muted">{picked.rules}</div>}
          {!detailsOpen && (
            <button type="button" className="link-button picked-tweak" onClick={() => setDetailsOpen(true)}>
              ✎ adjust details
            </button>
          )}
        </div>
      )}
      {detailsOpen && (
        <div className="add-advanced">
          <div className="details-head wide">
            <span className="item-menu-heading muted">Custom item</span>
            <button type="button" className="link-button" onClick={() => setDetailsOpen(false)}>▴ hide</button>
          </div>
          <div className="wide">
            <CategoryPicker
              category={adv.category}
              subtype={adv.subtype}
              complete={adv.catDone}
              onChange={(category, subtype, catDone) => setA({ category, subtype, catDone })}
            />
          </div>
          {!adv.catDone && (
            <div className="wide muted panel-hint">
              Pick a category{adv.category ? ' and subtype' : ''} — the rest of the form appears once you have.
            </div>
          )}
          {adv.catDone && (<>
          {plan.primary.map(fieldEl)}
          {sPlan.primary.map(statEl)}
          <label className="wide">
            {notesLabel(adv.category, adv.subtype)}
            <AutoTextarea rows={2} value={adv.notes} onChange={(e) => setA({ notes: e.target.value })} />
          </label>
          <div className="wide photo-field">
            {adv.image ? (
              <span className="photo-controls">
                <img className="item-photo-mini" src={adv.image} alt="" />
                <label className="link-button photo-pick">
                  Replace picture
                  <input type="file" accept="image/*" hidden onChange={(e) => onPhotoFile(e.target.files?.[0])} />
                </label>
                <button type="button" className="link-button danger-link" onClick={() => setA({ image: undefined })}>
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
          {plan.advanced.length + sPlan.advanced.length > 0 && (
            <div className="wide">
              <button type="button" className="link-button" onClick={() => setMoreOpen(!moreOpen)}>
                More options {moreOpen ? '▴' : '▾'}
              </button>
            </div>
          )}
          {moreOpen && (<>
            {plan.advanced.map(fieldEl)}
            {sPlan.advanced.map(statEl)}
          </>)}
          {!picked && (
            <div className="wide muted panel-hint">✦ Saved to the party catalogue automatically.</div>
          )}
          </>)}
          <button type="submit" className="wide add-bottom" disabled={!name.trim()}>
            Add{name.trim() ? ` ${name.trim()}` : ''}
          </button>
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
