import { useEffect, useEffectEvent, useRef } from 'react';

export function useVisibleCareRefresh(refresh, enabled = true, interval = 12000) {
  const lastTrigger = useRef(0);
  const refreshVisible = useEffectEvent(() => {
    const now = Date.now();
    if (document.visibilityState !== 'visible' || now - lastTrigger.current < 250) return;
    lastTrigger.current = now;
    void refresh();
  });
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(refreshVisible, interval);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [enabled, interval]);
}
