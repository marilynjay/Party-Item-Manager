import { useEffect, useState } from 'react';

// A hand-drawn tumbleweed rolls across the empty space every 5–10 seconds
// (re-rolled per pass). Three layers fake the physics: the outer span
// drifts right linearly, the middle one hops in decaying bounces, and the
// twig-ball SVG spins the whole way.
export function Tumbleweed() {
  const [pass, setPass] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!alive) return;
        setPass((p) => p + 1);
        schedule();
      }, 5000 + Math.random() * 5000);
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  if (pass === 0) return null;
  return (
    <span key={pass} className="tumbleweed" aria-hidden>
      <span className="tw-bounce">
        <svg className="tw-svg" viewBox="0 0 32 32" width="30" height="30">
          <g fill="none" stroke="#a5875a" strokeWidth="1.1" strokeLinecap="round">
            <circle cx="16" cy="16" r="13" opacity="0.4" />
            <path d="M16 3 C 8 8, 8 24, 16 29" opacity="0.8" />
            <path d="M16 3 C 24 8, 24 24, 16 29" opacity="0.7" />
            <path d="M3 16 C 8 8, 24 8, 29 16" opacity="0.8" />
            <path d="M3 16 C 8 24, 24 24, 29 16" opacity="0.7" />
            <path d="M6 7 C 14 12, 20 20, 26 25" opacity="0.6" />
            <path d="M26 7 C 18 12, 12 20, 6 25" opacity="0.6" />
            <path d="M16 6 C 12 14, 20 20, 15 26" opacity="0.55" />
            <path d="M8 20 C 14 16, 22 14, 25 10" opacity="0.55" />
            <path d="M10 5 C 16 10, 14 22, 22 27" opacity="0.5" />
          </g>
        </svg>
      </span>
    </span>
  );
}
