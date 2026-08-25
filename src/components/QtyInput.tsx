import { useEffect, useRef, useState } from 'react';

// A quantity box you can actually empty.
//
// The obvious `onChange={(e) => setQty(Number(e.target.value) || 1)}` looks
// harmless and isn't: clearing the field gives '', Number('') is 0, and the
// `|| 1` puts a 1 straight back under your fingers — so backspacing the 1 to
// type 5 is impossible and you're left fighting the spinner. This keeps
// whatever is typed, empty included, and only clamps when it reports a
// number outward. The ＋/− buttons still drive it from outside: a value the
// parent changes on its own is copied back into the field.
export function QtyInput({
  value,
  max,
  min = 1,
  onChange,
  className,
  title,
}: {
  value: number;
  max?: number;
  min?: number;
  onChange: (n: number) => void;
  className?: string;
  title?: string;
}) {
  const [text, setText] = useState(String(value));
  const reported = useRef(value);
  useEffect(() => {
    // only resync when the change came from somewhere else (a stepper
    // button, "all N") — otherwise this would stamp on what's being typed
    if (value !== reported.current) {
      reported.current = value;
      setText(String(value));
    }
  }, [value]);

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min, Math.floor(n)));

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      className={className}
      title={title}
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = t.trim() === '' ? min : clamp(Number(t) || min);
        reported.current = n;
        onChange(n);
      }}
      onBlur={() => {
        // tidy up on the way out: an empty box settles back to a real number
        const n = text.trim() === '' ? min : clamp(Number(text) || min);
        setText(String(n));
        reported.current = n;
        onChange(n);
      }}
    />
  );
}
