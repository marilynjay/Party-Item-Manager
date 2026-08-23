import type { LogEntry } from '../types';

const fmt = (ts: number) =>
  new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export function LogPanel({ log }: { log: LogEntry[] }) {
  if (log.length === 0) return <div className="empty muted">No changes recorded yet.</div>;
  return (
    <ul className="log-list">
      {log.map((e) => (
        <li key={e.id} className="log-entry">
          <span className="log-time muted">{fmt(e.ts)}</span>
          <span>
            <strong>{e.actor}</strong> {e.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
