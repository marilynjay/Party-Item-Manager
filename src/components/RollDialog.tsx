import { useState } from 'react';
import { DiceGroup } from './Dice';
import { parseRoll, rollDice } from '../dice';
import type { RollResult } from '../dice';

// Drink-a-potion dialog: roll in the app (with the tumble) or roll real dice.
export function RollDialog({
  itemName,
  formula,
  onConsume,
  onCancel,
}: {
  itemName: string;
  formula: string;
  onConsume: (note?: string, total?: number) => void;
  onCancel: () => void;
}) {
  const [result, setResult] = useState<RollResult | null>(null);
  const [settled, setSettled] = useState(false);
  const parsed = parseRoll(formula)!;
  // the table cheers max rolls and groans at min rolls; so does the app
  const allMax = result !== null && result.rolls.every((r) => r === parsed.d);
  const allMin = result !== null && result.rolls.every((r) => r === 1);

  return (
    <div className="overlay" onClick={result ? undefined : onCancel}>
      <div className="modal roll-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🧪 {itemName}</h2>
          {!result && <button type="button" className="link-button" onClick={onCancel}>✕</button>}
        </div>
        {!result ? (
          <>
            <p className="muted roll-blurb">
              Heals {formula}. Who's rolling?
              <span className="bubbles"><span /><span /><span /></span>
            </p>
            <div className="roll-choices">
              <button type="button" className="coin-add" onClick={() => setResult(rollDice(parsed))}>
                🎲 Roll it here
              </button>
              <button type="button" onClick={() => onConsume(undefined)}>
                I'll roll my own dice
              </button>
            </div>
            <button type="button" className="link-button send-cancel" onClick={onCancel}>
              Cancel — don't use it
            </button>
          </>
        ) : (
          <div className="roll-stage">
            <DiceGroup sides={parsed.d} rolls={result.rolls} onSettled={() => setSettled(true)} />
            <div className={`roll-total ${settled ? 'shown' : ''} ${settled && allMax ? 'crit' : ''} ${settled && allMin ? 'fumble' : ''}`}>
              {settled && allMax && <span className="crit-spark" aria-hidden>✨</span>}
              {result.rolls.join(' + ')}
              {result.mod !== 0 && ` ${result.mod > 0 ? '+' : '−'} ${Math.abs(result.mod)}`} ={' '}
              <strong>{result.total} HP</strong>
              {settled && allMax && <span className="crit-spark late" aria-hidden>✨</span>}
              {settled && allMin && <span className="fumble-puff" aria-hidden>💨</span>}
            </div>
            <button
              type="button"
              className={`coin-add roll-done ${settled ? 'shown' : ''}`}
              onClick={() => onConsume(`rolled ${formula} = ${result.total} HP`, result.total)}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
