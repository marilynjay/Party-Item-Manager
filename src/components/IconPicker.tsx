import { useState } from 'react';
import type { Holder } from '../types';

const PRESETS = [
  '🗡️', '🛡️', '🏹', '✨', '🪓', '🎒', '🧙', '🧝', '🐉', '🦊', '🐺', '🐸',
  '🦉', '🐴', '🔥', '❄️', '🌙', '⭐', '☠️', '🍄', '🗿', '🪶', '🎲', '🔮',
  '⚗️', '🏺', '📯', '🃏', '🌿', '🪙',
];

interface Props {
  holder: Holder;
  current: string;
  onPick: (icon: string) => void;
  onClose: () => void;
}

export function IconPicker({ holder, current, onPick, onClose }: Props) {
  const [custom, setCustom] = useState('');
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal icon-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{current} {holder.name}’s icon</h2>
          <button type="button" className="link-button" onClick={onClose}>✕</button>
        </div>
        <div className="icon-grid">
          {PRESETS.map((e) => (
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
        <form
          className="icon-custom"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) onPick(custom.trim());
          }}
        >
          <input
            placeholder="…or any emoji"
            value={custom}
            maxLength={8}
            onChange={(e) => setCustom(e.target.value)}
          />
          <button type="submit" className="primary" disabled={!custom.trim()}>Use it</button>
        </form>
      </div>
    </div>
  );
}
