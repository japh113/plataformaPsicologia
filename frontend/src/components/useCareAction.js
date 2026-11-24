import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';

export function useCareAction(refresh) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const receipt = useRef(null);
  const request = useRef(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);

  async function act(path, input, { needsReceipt = true } = {}) {
    if (request.current) return false;
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    const key = JSON.stringify([path, input]);
    if (receipt.current?.key !== key) receipt.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setError('');
    try {
      await apiRequest(path, {
        method: 'POST', signal,
        body: JSON.stringify({ ...input, confirmed: true, ...(needsReceipt && { operationId: receipt.current.id }) }),
      });
      if (signal.aborted) return false;
      receipt.current = null;
      await refresh();
      return !signal.aborted;
    } catch (failure) {
      if (signal.aborted) return false;
      if (failure.status >= 400 && failure.status < 500 && failure.status !== 429) receipt.current = null;
      setError(failure.message);
      await refresh();
      return false;
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  return { act, busy, error };
}
