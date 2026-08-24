import { useState } from 'react';

export const HOLDER_ICON_PRESETS = [
  '🗡️', '🛡️', '🏹', '✨', '🪓', '🎒', '🧙', '🧝', '🐉', '🦊', '🐺', '🐸',
  '🦉', '🐴', '🔥', '❄️', '🌙', '⭐', '☠️', '🍄', '🗿', '🪶', '🎲', '🔮',
  '⚗️', '🏺', '📯', '🃏', '🌿', '🪙',
];

export const ITEM_ICON_PRESETS = [
  '🗡️', '⚔️', '🪓', '🔨', '🏹', '🔱', '🛡️', '🥾', '🧥', '💍', '📿', '🧤',
  '🎩', '👑', '🪖', '🧪', '⚗️', '📜', '🍖', '🍺', '🪄', '🔮', '📕', '📖',
  '🗺️', '📝', '💎', '🏺', '🎒', '🛠️', '🪢', '🕯️', '🪕', '🗝️', '🃏', '📦',
];

interface Props {
  title: string;
  current: string;
  presets: string[];
  onPick: (icon: string) => void;
  onClose: () => void;
}

export function IconPicker({ title, current, presets, onPick, onClose }: Props) {
  const [custom, setCustom] = useState('');
  // an icon, not a caption: strip letters/digits and keep it emoji-sized
  const sanitize = (v: string) => v.replace(/[A-Za-z0-9\s]/g, '').slice(0, 6);
  const useCustom = () => {
    if (custom.trim()) onPick(custom.trim());
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal icon-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{current} {title}</h2>
          <button type="button" className="link-button" onClick={onClose}>✕</button>
        </div>
        <div className="icon-grid">
          {presets.map((e) => (
            <button
              key={e}
              type="button"
              className={`icon-cell ${e === current ? 'on' : ''}`}
              onClick={() => onPick(e)}
            >
              {e}
            </button>
          ))}
        </div>
        {/* deliberately NOT a <form>: the picker can render inside the item
            editor's form, and nested forms submit the outer one instead */}
        <div className="icon-custom">
          <input
            placeholder="…or any emoji"
            value={custom}
            maxLength={6}
            onChange={(e) => setCustom(sanitize(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                useCustom();
              }
            }}
          />
          <button type="button" className="primary" disabled={!custom.trim()} onClick={useCustom}>Use it</button>
        </div>
      </div>
    </div>
  );
}
