import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';

export function useCareRead(path, agreementId, audience, immediate = true) {
  const scope = JSON.stringify([path, agreementId, audience]);
  const [read, setRead] = useState({ scope, data: null, error: '', loading: Boolean(path) });
  const request = useRef(null);
  const lifetime = useRef(null);
  const reload = useCallback(async (retain = false) => {
    if (!path || lifetime.current?.scope !== scope) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    setRead(previous => ({
      scope, data: retain && previous.scope === scope ? previous.data : null,
      incomplete: retain && previous.scope === scope && previous.incomplete, error: '', loading: true,
    }));
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
      if (!signal.aborted) setRead({ scope, data: result.data, incomplete: result.incomplete === true, error: '', loading: false });
    } catch (failure) {
      if (!signal.aborted) setRead({ scope, data: null, error: failure.message, loading: false, status: failure.status });
    }
  }, [path, agreementId, scope]);

  useEffect(() => {
    const owner = { scope };
    lifetime.current = owner;
    if (immediate) queueMicrotask(() => { if (lifetime.current === owner) void reload(); });
    return () => {
      if (lifetime.current !== owner) return;
      lifetime.current = null;
      request.current?.abort();
    };
  }, [immediate, reload, scope]);

  return { ...(read.scope === scope ? read : { data: null, error: '', loading: Boolean(path) }), reload };
}
