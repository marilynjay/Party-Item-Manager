import { useState } from 'react';
import { AutoTextarea } from './AutoTextarea';
import type { CategoryKey, FormField, Item, ItemStats } from '../types';
import { RARITIES, formPlan, holderById, itemIcon, notesLabel, planHas, statPlan } from '../types';
import { CategoryPicker } from './CategoryPicker';
import { StatFieldControl, cleanStats } from './StatFields';
import { ITEM_ICON_PRESETS, IconPicker } from './IconPicker';
import { compressImage } from '../image';

export function ItemEditor({
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
      (sPlan.advanced.includes('charges') && (item.stats?.charges !== undefined || item.stats?.chargesMax !== undefined)) ||
      (sPlan.advanced.includes('ac') && item.stats?.ac) ||
      (sPlan.advanced.includes('dmg') && item.stats?.dmg)
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
