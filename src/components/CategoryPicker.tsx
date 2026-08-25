import type { CategoryKey } from '../types';
import { CATEGORIES, categoryOf } from '../types';

// Subtypes people look for in the "wrong" category: shown there as a
// pointer chip that files the item under its real home.
const CROSS_LINKS: Partial<Record<CategoryKey, Array<[CategoryKey, string]>>> = {
  supplies: [['consumable', 'food & drink']],
  papers: [['consumable', 'scroll'], ['arcana', 'spellbook']],
  gear: [['arcana', 'wand'], ['arcana', 'staff'], ['consumable', 'alchemical']],
  // scrolls and potions are magic, so people look for them here first
  arcana: [['consumable', 'scroll'], ['consumable', 'potion']],
};

interface Props {
  category: CategoryKey;
  subtype: string;
  complete: boolean;
  onChange: (category: CategoryKey, subtype: string, complete: boolean) => void;
}

// Progressive: pick a category and the rest vanish; pick a subtype and the
// rest vanish. Chosen chips stay tappable to step back.
export function CategoryPicker({ category, subtype, complete, onChange }: Props) {
  const active = categoryOf(category);

  if (!category) {
    return (
      <div className="cat-picker">
        <div className="cat-picker-row">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className="chip"
              onClick={() => onChange(c.key, '', c.subtypes.length === 0)}
            >
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!complete && active) {
    return (
      <div className="cat-picker">
        <div className="cat-picker-row">
          <button type="button" className="chip chip-on" title="Change category" onClick={() => onChange('', '', false)}>
            {active.emoji} {active.name} ✕
          </button>
        </div>
        <div className="cat-picker-row cat-picker-subs">
          {active.subtypes.map((s) => (
            <button key={s} type="button" className="chip chip-sub" onClick={() => onChange(category, s, true)}>
              {s}
            </button>
          ))}
          {(CROSS_LINKS[category] ?? []).map(([toCat, toSub]) => (
            <button
              key={`${toCat}:${toSub}`}
              type="button"
              className="chip chip-sub chip-cross"
              title={`Files under ${categoryOf(toCat)?.name}`}
              onClick={() => onChange(toCat, toSub, true)}
            >
              {toSub} ↪
            </button>
          ))}
          <button type="button" className="chip chip-sub chip-skip" onClick={() => onChange(category, '', true)}>
            other
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cat-picker">
      <div className="cat-picker-row">
        <button type="button" className="chip chip-on" title="Change category" onClick={() => onChange('', '', false)}>
          {active ? `${active.emoji} ${active.name}` : 'category'} ✕
        </button>
        {active && active.subtypes.length > 0 && (
          <button
            type="button"
            className="chip chip-sub chip-on"
            title="Change subtype"
            onClick={() => onChange(category, '', false)}
          >
            {subtype || 'other'} ✕
          </button>
        )}
      </div>
    </div>
  );
}
