import { useLayoutEffect, useRef } from 'react';

// A textarea that grows with its content — phones have no resize handle.
export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const t = ref.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight + 2}px`;
  };
  useLayoutEffect(fit, [props.value]);
  return <textarea {...props} ref={ref} rows={props.rows ?? 2} />;
}
