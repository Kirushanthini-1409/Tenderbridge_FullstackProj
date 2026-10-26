import { useEffect, useRef } from 'react';

/** Refresh page data when a user returns to this browser tab without reloading React. */
export function useRefreshOnVisibility(refresh) {
  const refreshRef = useRef(refresh);

  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshRef.current?.();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);
}
