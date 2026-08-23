// The dice — ported from the DM-Screen project: SVG polyhedra with facet
// lines, a tumble spin, and faces that flicker through fake values before
// settling on the real roll.
import { useEffect, useState } from 'react';

const DIE_SHAPES: Record<number, { pts?: string; rect?: boolean; ty: number; facets?: Array<[string, string]> }> = {
  4: { pts: '12,2.5 22,20.5 2,20.5', ty: 16.5, facets: [['12,2.5', '12,12'], ['2,20.5', '9,14'], ['22,20.5', '15,14']] },
  6: { rect: true, ty: 15 },
  8: { pts: '12,1 22,12 12,23 2,12', ty: 15, facets: [['2,12', '22,12']] },
  10: { pts: '12,1 21.5,9.5 12,23 2.5,9.5', ty: 15.5, facets: [['2.5,9.5', '21.5,9.5']] },
  12: { pts: '12,1.5 22,9.3 18.2,21.5 5.8,21.5 2,9.3', ty: 15, facets: [['12,1.5', '12,6.5'], ['2,9.3', '7,10.8'], ['22,9.3', '17,10.8']] },
  20: {
    pts: '12,1 21.5,6.5 21.5,17.5 12,23 2.5,17.5 2.5,6.5', ty: 14.8,
    facets: [['12,4.6', '18.6,15.6'], ['18.6,15.6', '5.4,15.6'], ['5.4,15.6', '12,4.6'],
      ['12,1', '12,4.6'], ['21.5,6.5', '18.6,15.6'], ['2.5,6.5', '5.4,15.6'],
      ['21.5,17.5', '18.6,15.6'], ['2.5,17.5', '5.4,15.6'], ['12,23', '12,19.5']],
  },
};

function DieFace({ sides, val, flick, size, rolling }: { sides: number; val: number; flick: number | null; size: number; rolling: boolean }) {
  const sh = DIE_SHAPES[sides] || DIE_SHAPES[6];
  const shown = flick != null ? ((val * 7 + flick * 13) % sides) + 1 : val;
  return (
    <svg className={`die ${rolling ? 'rolling' : ''}`} viewBox="0 0 24 24" width={size} height={size * 0.95} aria-hidden="true">
      {sh.rect
        ? <rect className="shell" x="3.5" y="3.5" width="17" height="17" rx="2.5" strokeWidth="1.3" />
        : <polygon className="shell" points={sh.pts} strokeWidth="1.3" />}
      {(sh.facets || []).map(([a, b], i) => {
        const [x1, y1] = a.split(',');
        const [x2, y2] = b.split(',');
        return <line key={i} className="facet" x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      <text x="12" y={sh.ty} textAnchor="middle" fontSize={String(shown).length > 1 ? 8.5 : 10}>{shown}</text>
    </svg>
  );
}

// One synchronized flicker + tumble for the whole roll; the real faces land
// as the spin settles, and `onSettled` fires once the dice stop lying.
export function DiceGroup({ sides, rolls, size = 34, onSettled }: { sides: number; rolls: number[]; size?: number; onSettled?: () => void }) {
  const [flick, setFlick] = useState<number | null>(0);
  const [rolling, setRolling] = useState(true);
  useEffect(() => {
    const ts = [
      setTimeout(() => setFlick(1), 150),
      setTimeout(() => setFlick(2), 330),
      setTimeout(() => setFlick(3), 520),
      setTimeout(() => setFlick(null), 720),
      setTimeout(() => {
        setRolling(false);
        onSettled?.();
      }, 1000),
    ];
    return () => ts.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className="dice-group">
      {rolls.map((v, i) => (
        <DieFace key={i} sides={sides} val={v} flick={flick} size={size} rolling={rolling} />
      ))}
    </span>
  );
}
