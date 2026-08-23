import { useState } from 'react';

export function Login({ onSubmit }: { onSubmit: (password: string) => Promise<unknown> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="centered">
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          onSubmit(password)
            .catch((err: Error) => setError(err.message))
            .finally(() => setBusy(false));
        }}
      >
        <div className="login-emoji">🎒</div>
        <h1>Party Item Manager</h1>
        <p className="muted">Senchez would like a password before opening.</p>
        <input
          type="password"
          value={password}
          placeholder="Party password"
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="login-error">{error}</div>}
        <button type="submit" disabled={busy || password === ''}>
          {busy ? 'Unfastening straps…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}
