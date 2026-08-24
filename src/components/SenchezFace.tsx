import { useEffect, useState } from 'react';

// Senchez himself: an original hand-drawn SVG satchel with a face on the
// flap. Every 10–20 seconds he does something small — usually a blink,
// sometimes a wiggle, occasionally a proper yawn — and when the party
// feeds him (busy = 'gulp' | 'oof') his mouth opens for the swallow while
// the parent span's squash-and-stretch plays.
type Idle = 'idle' | 'blink' | 'yawn' | 'wiggle';

const IDLE_MS: Record<Idle, number> = { idle: 0, blink: 380, yawn: 1600, wiggle: 1000 };

export function SenchezFace({ busy, size = 32 }: { busy: 'gulp' | 'oof' | null; size?: number }) {
  const [idle, setIdle] = useState<Idle>('idle');

  useEffect(() => {
    let alive = true;
    let timer: number;
    let reset: number;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!alive) return;
        const roll = Math.random();
        const act: Idle = roll < 0.55 ? 'blink' : roll < 0.82 ? 'wiggle' : 'yawn';
        setIdle(act);
        reset = window.setTimeout(() => {
          if (!alive) return;
          setIdle('idle');
          schedule();
        }, IDLE_MS[act]);
      }, 10_000 + Math.random() * 10_000);
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
      clearTimeout(reset);
    };
  }, []);

  const mood = busy ? `sf-${busy}` : idle !== 'idle' ? `sf-${idle}` : '';

  return (
    <svg className={`sf ${mood}`} viewBox="0 0 64 68" width={size} height={Math.round((size * 68) / 64)} aria-hidden>
      {/* handle, meeting the bag */}
      <path d="M16 18 Q32 4 48 18" fill="none" stroke="#6b5236" strokeWidth="5" strokeLinecap="round" />
      {/* body */}
      <path d="M6 24 Q3 56 32 61 Q61 56 58 24 Q46 15 32 15 Q18 15 6 24 Z" fill="#755a3c" stroke="#4c3a26" strokeWidth="1.6" />
      {/* side lacing */}
      <path d="M54 31 L58 34 M53 38 L58 41 M52 45 L57 48" stroke="#c07a3a" strokeWidth="1.8" strokeLinecap="round" />
      {/* flap */}
      <path d="M8 22 Q32 11 56 22 L51 46 Q32 55 13 46 Z" fill="#97764e" stroke="#4c3a26" strokeWidth="1.6" />
      {/* stitched trim + triangles */}
      <path d="M10.6 23.8 Q32 14 53.4 23.8 L49.2 44.4 Q32 52 14.8 44.4 Z" fill="none" stroke="#d9cbb2" strokeWidth="1.5" strokeDasharray="2.8 2" />
      <polygon points="16,45.6 21,47.3 16.8,49.4" fill="#6fb8ab" />
      <polygon points="25,48.6 30,49.5 25.8,51.4" fill="#c65b45" />
      <polygon points="34,49.5 39,48.6 34.9,51.3" fill="#6fb8ab" />
      <polygon points="43,47.2 47.4,45.5 43.9,49.2" fill="#c65b45" />
      {/* brows */}
      <path className="sf-brows" d="M18 27 Q24 23.5 29 26.5 M35 26.5 Q40 23.5 46 27" fill="none" stroke="#4c3a26" strokeWidth="2.4" strokeLinecap="round" />
      {/* open eyes */}
      <g className="sf-eye-open">
        <ellipse cx="23.5" cy="33" rx="4.4" ry="4.8" fill="#ead9bd" stroke="#4c3a26" strokeWidth="1.1" />
        <ellipse cx="40.5" cy="33" rx="4.4" ry="4.8" fill="#ead9bd" stroke="#4c3a26" strokeWidth="1.1" />
        <circle cx="24" cy="33.8" r="2" fill="#33261a" />
        <circle cx="41" cy="33.8" r="2" fill="#33261a" />
        <circle cx="22.9" cy="32.3" r="0.8" fill="#f7f1e3" />
        <circle cx="39.9" cy="32.3" r="0.8" fill="#f7f1e3" />
      </g>
      {/* closed lids */}
      <g className="sf-lid">
        <path d="M19.4 32.6 Q23.5 36.6 27.6 32.6" fill="none" stroke="#4c3a26" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M36.4 32.6 Q40.5 36.6 44.6 32.6" fill="none" stroke="#4c3a26" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      {/* nose */}
      <path d="M30.4 37 Q32 39.8 33.6 37" fill="none" stroke="#4c3a26" strokeWidth="1.6" strokeLinecap="round" />
      {/* smiling mouth */}
      <path className="sf-mouth-smile" d="M22.5 43.5 Q32 49.5 41.5 43.5" fill="none" stroke="#a34632" strokeWidth="2.4" strokeLinecap="round" />
      {/* open mouth — a little void where items go */}
      <g className="sf-mouth-open">
        <ellipse cx="32" cy="45" rx="6.5" ry="5" fill="#241a30" stroke="#a34632" strokeWidth="1.8" />
        <circle cx="34.2" cy="43.4" r="0.8" fill="#b48cf2" opacity="0.85" />
      </g>
      {/* tassel */}
      <path d="M32 61 L32 63" stroke="#6b5236" strokeWidth="1.8" />
      <polygon points="29.2,63 34.8,63 32,68" fill="#c07a3a" />
    </svg>
  );
}
