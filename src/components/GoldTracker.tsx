import { useEffect, useState } from 'react';
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
  const total = HOLDERS.reduce((s, h) => s + (gold[h.id] ?? 0), 0);

  return (
    <div className="gold-tracker">
      <button type="button" className="gold-line" onClick={() => setOpen(!open)} title="Party gold — tap for the breakdown">
        <span className="gold-amount">{fmt(total)} gp</span>
      </button>
      {open && (
        <div className="gold-breakdown">
          {HOLDERS.map((h) => (
            <GoldRow key={h.id} emoji={holderIcon(icons, h)} name={h.name} amount={gold[h.id] ?? 0} onSet={(v) => onSet(h.id, v)} />
          ))}
          <div className="gold-row gold-total-row">
            <span className="gold-row-name">Total</span>
            <span className="gold-row-amount">{fmt(total)} gp</span>
          </div>
        </div>
      )}
    </div>
  );
}

function GoldRow({
  emoji,
  name,
  amount,
  onSet,
}: {
  emoji: string;
  name: string;
  amount: number;
  onSet: (v: number) => void;
}) {
  const [value, setValue] = useState(String(amount));
  // Re-sync when someone else's change arrives via polling.
  useEffect(() => setValue(String(amount)), [amount]);
  const parsed = Math.max(0, Math.floor(Number(value) || 0));
  const dirty = parsed !== amount;

  return (
    <form
      className="gold-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) onSet(parsed);
      }}
    >
      <span className="gold-row-name">
        {emoji} {name}
      </span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => !dirty && setValue(String(amount))}
      />
      <span className="muted">gp</span>
      <button type="submit" className={dirty ? '' : 'gold-save-hidden'} disabled={!dirty}>
        Save
      </button>
    </form>
  );
}
