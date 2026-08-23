import { useEffect, useRef, useState } from 'react';
import type { Gold, HolderId, Icons } from '../types';
import { HOLDERS, holderIcon } from '../types';

interface Props {
  gold: Gold;
  icons: Icons;
  onSet: (holder: HolderId, amount: number) => void;
}

const fmt = (n: number) => n.toLocaleString();

export function GoldTracker({ gold, icons, onSet }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HolderId | null>(null);
  const [giveTo, setGiveTo] = useState<HolderId | ''>('');
  const total = HOLDERS.reduce((s, h) => s + (gold[h.id] ?? 0), 0);
  const holdersWithGold = HOLDERS.filter((h) => (gold[h.id] ?? 0) > 0);

  return (
    <div className="gold-tracker">
      <button type="button" className="gold-line" onClick={() => setOpen(!open)} title="Party gold — tap for the breakdown">
        <span className="gold-amount">{fmt(total)} gp</span>
      </button>
      {open && (
        <div className="gold-breakdown">
          {holdersWithGold.map((h) =>
            editing === h.id ? (
              <LedgerEdit
                key={h.id}
                label={`${holderIcon(icons, h)} ${h.name}`}
                initial={gold[h.id] ?? 0}
                onSave={(v) => {
                  onSet(h.id, v);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <button
                key={h.id}
                type="button"
                className="ledger-row"
                title={`Tap to edit ${h.name}’s gold`}
                onClick={() => setEditing(h.id)}
              >
                <span className="ledger-name">{holderIcon(icons, h)} {h.name}</span>
                <span className="ledger-amount">{fmt(gold[h.id] ?? 0)}</span>
              </button>
            )
          )}
          {holdersWithGold.length === 0 && (
            <div className="ledger-row ledger-empty muted">Nobody's holding any gold yet.</div>
          )}
          <div className="ledger-row ledger-total">
            <span className="ledger-name">Total</span>
            <span className="ledger-amount">{fmt(total)} gp</span>
          </div>
          {giveTo === '' ? (
            <select
              className="give-gold-select"
              value=""
              onChange={(e) => e.target.value && setGiveTo(e.target.value as HolderId)}
            >
              <option value="">＋ Give gold to…</option>
              {HOLDERS.map((h) => (
                <option key={h.id} value={h.id}>
                  {holderIcon(icons, h)} {h.name} ({fmt(gold[h.id] ?? 0)} gp)
                </option>
              ))}
            </select>
          ) : (
            <LedgerEdit
              label={`${holderIcon(icons, holderOf(giveTo))} ${holderOf(giveTo).name} +`}
              initial={0}
              placeholder="amount"
              onSave={(v) => {
                if (v > 0) onSet(giveTo, (gold[giveTo] ?? 0) + v);
                setGiveTo('');
              }}
              onCancel={() => setGiveTo('')}
            />
          )}
        </div>
      )}
    </div>
  );
}

const holderOf = (id: HolderId) => HOLDERS.find((h) => h.id === id)!;

function LedgerEdit({
  label,
  initial,
  placeholder,
  onSave,
  onCancel,
}: {
  label: string;
  initial: number;
  placeholder?: string;
  onSave: (v: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial > 0 ? String(initial) : '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);

  return (
    <form
      className="ledger-row ledger-editing"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(Math.max(0, Math.floor(Number(value) || 0)));
      }}
    >
      <span className="ledger-name">{label}</span>
      <span className="ledger-edit-controls">
        <input
          ref={ref}
          type="number"
          min={0}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        />
        <button type="submit" title="Save">✓</button>
        <button type="button" className="link-button" title="Cancel" onClick={onCancel}>✕</button>
      </span>
    </form>
  );
}
