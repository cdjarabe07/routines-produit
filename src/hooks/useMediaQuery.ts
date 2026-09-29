import { useSyncExternalStore } from 'react';

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsCompact = () => useMediaQuery('(max-width: 720px)');
/** Tablette et mobile : les tableaux passent en vue carte. */
export const useIsTabletOrSmaller = () => useMediaQuery('(max-width: 900px)');
