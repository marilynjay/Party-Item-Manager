import type { CategoryKey } from '../types';
import { CATEGORIES } from '../types';

interface Props {
  category: CategoryKey;
  subtype: string;
  onChange: (category: CategoryKey, subtype: string) => void;
}

// Category chips; picking one unfolds its subtype chips beneath.
// A category alone is always a valid choice.
export function CategoryPicker({ category, subtype, onChange }: Props) {
  const active = CATEGORIES.find((c) => c.key === category);
  return (
    <div className="cat-picker">
      <div className="cat-picker-row">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`chip ${category === c.key ? 'chip-on' : ''}`}
            onClick={() => onChange(category === c.key ? '' : c.key, '')}
          >
            {c.emoji} {c.name}
          </button>
        ))}
      </div>
      {active && active.subtypes.length > 0 && (
        <div className="cat-picker-row cat-picker-subs">
          {active.subtypes.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip chip-sub ${subtype === s ? 'chip-on' : ''}`}
              onClick={() => onChange(category, subtype === s ? '' : s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
