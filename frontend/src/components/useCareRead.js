import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';

export function useCareRead(path, agreementId) {
  const scope = JSON.stringify([path, agreementId]);
  const [read, setRead] = useState({ scope, data: null, error: '', loading: Boolean(path) });
  const request = useRef(null);
  const reload = useCallback(async (retain = false) => {
    if (!path) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    setRead(previous => ({ scope, data: retain && previous.scope === scope ? previous.data : null, error: '', loading: true }));
    const options = agreementId ? { method: 'POST', body: JSON.stringify({ agreementId }), signal } : { signal };
    try {
      const result = await apiRequest(path, options).catch(async failure => {
        // The shared work-slot limiter requests a one-second retry. Account
        // and durable quotas use their normal explicit retry feedback.
        if (signal.aborted || failure.status !== 429 || failure.retryAfter !== 1) throw failure;
        await new Promise(resolve => setTimeout(resolve, 1000));
        signal.throwIfAborted();
        return apiRequest(path, options);
      });
      if (!signal.aborted) setRead({ scope, data: result.data, error: '', loading: false });
    } catch (failure) {
      if (!signal.aborted) setRead({ scope, data: null, error: failure.message, loading: false, status: failure.status });
    }
  }, [path, agreementId, scope]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void reload(); });
    return () => { active = false; request.current?.abort(); };
  }, [reload]);

  return { ...(read.scope === scope ? read : { data: null, error: '', loading: Boolean(path) }), reload };
}
