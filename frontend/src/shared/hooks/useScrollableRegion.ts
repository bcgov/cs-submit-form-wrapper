'use client';

import { useEffect, useRef } from 'react';

/**
 * Makes an overflowing element keyboard reachable.
 *
 * A region that scrolls has to be focusable or its overflow cannot be reached without a mouse, but
 * a region that fits should not be a tab stop. Set from a ref rather than in JSX so it tracks what
 * the element is actually doing.
 */
export function useScrollableRegion<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const region = ref.current;
    if (!region) return;
    const sync = () => {
      if (region.scrollWidth > region.clientWidth) {
        region.setAttribute('tabindex', '0');
      } else {
        region.removeAttribute('tabindex');
      }
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(region);
    return () => observer.disconnect();
  }, []);

  return ref;
}
