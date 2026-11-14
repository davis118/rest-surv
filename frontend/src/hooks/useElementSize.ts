import { useEffect, useState } from 'react';

/** The element's size in CSS pixels, kept current as the layout changes. */
export function useElementSize(el: Element | null) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  return size;
}
