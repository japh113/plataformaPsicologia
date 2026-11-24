import { useEffect, useEffectEvent } from 'react';

export function useVisibleCareRefresh(refresh, enabled = true) {
  const refreshVisible = useEffectEvent(() => {
    if (document.visibilityState === 'visible') void refresh();
  });
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(refreshVisible, 12000);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [enabled]);
}
