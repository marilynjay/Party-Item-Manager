import { useEffect, useRef, useState } from 'react';
import type { Gold, HolderId, Icons } from '../types';
import { HOLDERS, MEMBERS, PP_IN_GP, holderIcon } from '../types';

interface Props {
  gold: Gold;
  platinum: Gold;
  icons: Icons;
  onSetPurse: (holder: HolderId, gp: number, pp: number) => void;
  onGive: (holder: HolderId, gp: number, pp: number) => void;
  onSpend: (holder: HolderId, gp: number, pp: number) => void;
  onTransfer: (from: HolderId, to: HolderId, gp: number, pp: number) => void;
  onSplit: (from: HolderId, gp: number, pp: number) => void;
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

export function GoldTracker({ gold, platinum, icons, onSetPurse, onGive, onSpend, onTransfer, onSplit }: Props) {
  const [open, setOpen] = useState(false);
  // tapping a row opens its ＋ Add / − Spend / ➤ Send / ✎ tools, purse-panel style
  const [active, setActive] = useState<HolderId | null>(null);
  const [mode, setMode] = useState<'add' | 'spend' | 'send' | 'exact' | null>(null);
  const [sendTo, setSendTo] = useState<HolderId | 'split' | ''>('');
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
          {holdersWithMoney.map((h) => (
            <div key={h.id} className="ledger-entry">
              <button
                type="button"
                className={`ledger-row ${active === h.id ? 'ledger-open' : ''}`}
                title={`${h.name}’s purse — tap for add/spend${ppOf(h.id) > 0 ? ` (${fmt(gpOf(h.id))} gp + ${fmt(ppOf(h.id))} pp)` : ''}`}
                onClick={() => {
                  setActive(active === h.id ? null : h.id);
                  setMode(null);
                  setSendTo('');
                }}
              >
                <span className="ledger-name">
                  {holderIcon(icons, h)} {h.name}
                  {ppOf(h.id) > 0 && <span className="ledger-pp muted"> · {fmt(ppOf(h.id))} pp</span>}
                </span>
                <span className="ledger-amount">{fmt(worth(h.id))}</span>
              </button>
              {active === h.id && mode === null && (
                <div className="ledger-tools">
                  <button type="button" onClick={() => setMode('add')}>＋ Add</button>
                  <button type="button" disabled={worth(h.id) <= 0} onClick={() => setMode('spend')}>− Spend</button>
                  <button type="button" disabled={worth(h.id) <= 0} onClick={() => { setMode('send'); setSendTo(''); }}>➤ Send</button>
                  <button type="button" className="link-button" title="Set exact amounts" onClick={() => setMode('exact')}>✎</button>
                </div>
              )}
              {active === h.id && (mode === 'add' || mode === 'spend') && (
                <GiveForm
                  label={mode === 'add' ? '＋ Add' : '− Spend'}
                  onGive={(gp, pp) => {
                    (mode === 'add' ? onGive : onSpend)(h.id, gp, pp);
                    setActive(null);
                    setMode(null);
                  }}
                  onCancel={() => setMode(null)}
                />
              )}
              {active === h.id && mode === 'send' && (
                sendTo === '' ? (
                  <div className="ledger-send">
                    <div className="send-holders">
                      {HOLDERS.filter((o) => o.id !== h.id).map((o) => (
                        <button key={o.id} type="button" className="send-holder" onClick={() => setSendTo(o.id)}>
                          <span className="send-holder-emoji">{holderIcon(icons, o)}</span> {o.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="send-holder send-split"
                        title={`Even shares to all ${MEMBERS.length} party members — anything left over goes to ${holderOf('senchez').name}`}
                        onClick={() => setSendTo('split')}
                      >
                        <span className="send-holder-emoji">🤝</span> Split among party
                      </button>
                    </div>
                    <button type="button" className="link-button" onClick={() => setMode(null)}>✕ Cancel</button>
                  </div>
                ) : (
                  <GiveForm
                    label={sendTo === 'split' ? '🤝 Split' : `➤ ${holderOf(sendTo).name}`}
                    note={
                      sendTo === 'split'
                        ? `Even shares to all ${MEMBERS.length} party members — each coin split on its own, remainder to ${holderOf('senchez').name}.`
                        : undefined
                    }
                    onGive={(gp, pp) => {
                      if (sendTo === 'split') onSplit(h.id, gp, pp);
                      else onTransfer(h.id, sendTo, gp, pp);
                      setActive(null);
                      setMode(null);
                      setSendTo('');
                    }}
                    onCancel={() => setSendTo('')}
                  />
                )
              )}
              {active === h.id && mode === 'exact' && (
                <PurseEdit
                  label={`${holderIcon(icons, h)} ${h.name}`}
                  gp={gpOf(h.id)}
                  pp={ppOf(h.id)}
                  onSave={(gp, pp) => {
                    onSetPurse(h.id, gp, pp);
                    setActive(null);
                    setMode(null);
                  }}
                  onCancel={() => setMode(null)}
                />
              )}
            </div>
          ))}
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
              label={`＋ ${holderIcon(icons, holderOf(giveTo))} ${holderOf(giveTo).name}`}
              onGive={(gp, pp) => {
                onGive(giveTo, gp, pp);
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
  note,
  onGive,
  onCancel,
}: {
  label: string;
  note?: string;
  onGive: (gp: number, pp: number) => void;
  onCancel: () => void;
}) {
  const [gpVal, setGpVal] = useState('');
  const [ppVal, setPpVal] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const parse = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

  return (
    <>
    {note && <p className="split-note muted">{note}</p>}
    <form
      className="ledger-row ledger-editing"
      onSubmit={(e) => {
        e.preventDefault();
        const g = parse(gpVal);
        const p = parse(ppVal);
        if (g + p > 0) onGive(g, p);
        else onCancel();
      }}
    >
      <span className="ledger-name">{label}</span>
      <span className="ledger-edit-controls">
        <label className="coin-field">
          <input ref={ref} type="number" min={0} placeholder="0" value={gpVal} onChange={(e) => setGpVal(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
          gp
        </label>
        <label className="coin-field">
          <input type="number" min={0} placeholder="0" value={ppVal} onChange={(e) => setPpVal(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
          pp
        </label>
        <button type="submit" title="Give">✓</button>
        <button type="button" className="link-button" title="Cancel" onClick={onCancel}>✕</button>
      </span>
    </form>
    </>
  );
}
