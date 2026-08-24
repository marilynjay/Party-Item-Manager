import { useState } from 'react';
import type { Icons, LogEntry } from '../types';
import { HOLDERS, holderIcon } from '../types';

const fmt = (ts: number) =>
  new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

// The party's audit trail, filterable: free-text search plus one-tap holder
// chips ("what happened to Radish's stuff?"). A chip matches entries the
// holder acted in or is mentioned in; renamed holders keep their old name in
// old entries, so those match the era they were written in.
export function LogPanel({ log, icons }: { log: LogEntry[]; icons: Icons }) {
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  if (log.length === 0) return <div className="empty muted">No changes recorded yet.</div>;

  const needle = q.trim().toLowerCase();
  const shown = log.filter((e) => {
    if (who && e.actor !== who && !e.text.includes(who)) return false;
    if (needle && !e.text.toLowerCase().includes(needle) && !e.actor.toLowerCase().includes(needle)) return false;
    return true;
  });
  const filtering = needle !== '' || who !== '';

  return (
    <>
      <div className="log-tools">
        <input
          className="log-search"
          placeholder="Search the log…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="log-chips">
          {HOLDERS.map((h) => (
            <button
              key={h.id}
              type="button"
              className={`chip ${who === h.name ? 'chip-on' : ''}`}
              onClick={() => setWho(who === h.name ? '' : h.name)}
            >
              {holderIcon(icons, h)} {h.name}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="empty muted">Nothing in the log matches that.</div>
      ) : (
        <ul className="log-list">
          {shown.map((e) => (
            <li key={e.id} className="log-entry">
              <span className="log-time muted">{fmt(e.ts)}</span>
              <span>
                <strong>{e.actor}</strong> {e.text}
              </span>
            </li>
          ))}
        </ul>
      )}
      {filtering && shown.length > 0 && (
        <div className="log-count muted">
          {shown.length} of {log.length} entries
        </div>
      )}
    </>
  );
}
