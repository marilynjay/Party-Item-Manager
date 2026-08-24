import { useEffect, useRef, useState } from 'react';
import type { Gold, HolderId, Icons } from '../types';
import { HOLDERS, PP_IN_GP, holderIcon } from '../types';

interface Props {
  gold: Gold;
  platinum: Gold;
  icons: Icons;
  onSetPurse: (holder: HolderId, gp: number, pp: number) => void;
  onGive: (holder: HolderId, amount: number, unit: 'gp' | 'pp') => void;
}

const fmt = (n: number) => n.toLocaleString();

// Rolls the displayed number toward its real value — money should feel good.
function useCountUp(value: number, ms = 600): number {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = requestAnimationFrame(function step(t: number) {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export function GoldTracker({ gold, platinum, icons, onSetPurse, onGive }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HolderId | null>(null);
  const [giveTo, setGiveTo] = useState<HolderId | ''>('');
  const gpOf = (id: HolderId) => gold[id] ?? 0;
  const ppOf = (id: HolderId) => platinum[id] ?? 0;
  // Everything displayed is the gp equivalent; platinum shows up in the row editor.
  const worth = (id: HolderId) => gpOf(id) + ppOf(id) * PP_IN_GP;
  const total = HOLDERS.reduce((s, h) => s + worth(h.id), 0);
  const shownTotal = useCountUp(total);
  const holdersWithMoney = HOLDERS.filter((h) => worth(h.id) > 0);

  return (
    <div className="gold-tracker">
      <button type="button" className="gold-line" onClick={() => setOpen(!open)} title="Party gold — tap for the breakdown">
        <span className="gold-amount">{fmt(shownTotal)} gp</span>
      </button>
      {open && (
        <div className="gold-breakdown">
          {holdersWithMoney.map((h) =>
            editing === h.id ? (
              <PurseEdit
                key={h.id}
                label={`${holderIcon(icons, h)} ${h.name}`}
                gp={gpOf(h.id)}
                pp={ppOf(h.id)}
                onSave={(gp, pp) => {
                  onSetPurse(h.id, gp, pp);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <button
                key={h.id}
                type="button"
                className="ledger-row"
                title={`Tap to edit ${h.name}’s purse${ppOf(h.id) > 0 ? ` (${fmt(gpOf(h.id))} gp + ${fmt(ppOf(h.id))} pp)` : ''}`}
                onClick={() => setEditing(h.id)}
              >
                <span className="ledger-name">
                  {holderIcon(icons, h)} {h.name}
                  {ppOf(h.id) > 0 && <span className="ledger-pp muted"> · {fmt(ppOf(h.id))} pp</span>}
                </span>
                <span className="ledger-amount">{fmt(worth(h.id))}</span>
              </button>
            )
          )}
          {holdersWithMoney.length === 0 && (
            <div className="ledger-row ledger-empty muted">Nobody's holding any gold yet.</div>
          )}
          <div className="ledger-row ledger-total">
            <span className="ledger-name">Total</span>
            <span className="ledger-amount">{fmt(shownTotal)} gp</span>
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
                  {holderIcon(icons, h)} {h.name} ({fmt(worth(h.id))} gp)
                </option>
              ))}
            </select>
          ) : (
            <GiveForm
              label={`${holderIcon(icons, holderOf(giveTo))} ${holderOf(giveTo).name}`}
              onGive={(amount, unit) => {
                onGive(giveTo, amount, unit);
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

function PurseEdit({
  label,
  gp,
  pp,
  onSave,
  onCancel,
}: {
  label: string;
  gp: number;
  pp: number;
  onSave: (gp: number, pp: number) => void;
  onCancel: () => void;
}) {
  const [gpVal, setGpVal] = useState(String(gp));
  const [ppVal, setPpVal] = useState(String(pp));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  const parse = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

  return (
    <form
      className="ledger-row ledger-editing"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(parse(gpVal), parse(ppVal));
      }}
    >
      <span className="ledger-name">{label}</span>
      <span className="ledger-edit-controls">
        <label className="coin-field">
          <input ref={ref} type="number" min={0} value={gpVal} onChange={(e) => setGpVal(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
          gp
        </label>
        <label className="coin-field">
          <input type="number" min={0} value={ppVal} onChange={(e) => setPpVal(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
          pp
        </label>
        <button type="submit" title="Save">✓</button>
        <button type="button" className="link-button" title="Cancel" onClick={onCancel}>✕</button>
      </span>
    </form>
  );
}

function GiveForm({
  label,
  onGive,
  onCancel,
}: {
  label: string;
  onGive: (amount: number, unit: 'gp' | 'pp') => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<'gp' | 'pp'>('gp');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  return (
    <form
      className="ledger-row ledger-editing"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Math.max(0, Math.floor(Number(amount) || 0));
        if (n > 0) onGive(n, unit);
        else onCancel();
      }}
    >
      <span className="ledger-name">{label} +</span>
      <span className="ledger-edit-controls">
        <input ref={ref} type="number" min={1} placeholder="amount" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
        <select value={unit} onChange={(e) => setUnit(e.target.value as 'gp' | 'pp')}>
          <option value="gp">gp</option>
          <option value="pp">pp</option>
        </select>
        <button type="submit" title="Give">✓</button>
        <button type="button" className="link-button" title="Cancel" onClick={onCancel}>✕</button>
      </span>
    </form>
  );
}
