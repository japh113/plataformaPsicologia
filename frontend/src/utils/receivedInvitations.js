import { useCallback, useEffect, useRef, useState } from 'react';

function pendingExpiry(invitation) {
  return invitation.status === 'pending' ? Date.parse(invitation.expiresAt) : NaN;
}

export function isActionableInvitation(invitation, now) {
  return invitation.acceptanceAvailable === true && pendingExpiry(invitation) > now;
}

export function useReceivedInvitations(scope, apiRequest) {
  const ownerRef = useRef(null);
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    if (!scope) return;
    const owner = { scope, controller: null };
    ownerRef.current = owner;

    async function load(force = false) {
      if (ownerRef.current !== owner || (!force && owner.controller)) return;
      owner.controller?.abort();
      const controller = new AbortController();
      owner.controller = controller;
      try {
        const { data } = await apiRequest('/bilateral-invitations/received', { signal: controller.signal });
        if (!Array.isArray(data)) throw new Error('No pudimos consultar las invitaciones.');
        if (ownerRef.current === owner && !controller.signal.aborted) {
          setSnapshot({ scope, items: data, error: '', checkedAt: Date.now() });
        }
      } catch (error) {
        if (ownerRef.current === owner && !controller.signal.aborted) {
          setSnapshot({ scope, items: null, error: error.message, checkedAt: Date.now() });
        }
      } finally {
        if (owner.controller === controller) owner.controller = null;
      }
    }

    const onFocus = () => { void load(); };
    owner.load = load;
    window.addEventListener('focus', onFocus);
    void load();
    return () => {
      window.removeEventListener('focus', onFocus);
      owner.controller?.abort();
      if (ownerRef.current === owner) ownerRef.current = null;
    };
  }, [scope, apiRequest]);

  function clear() {
    const owner = ownerRef.current;
    ownerRef.current = null;
    owner?.controller?.abort();
    setSnapshot(null);
  }

  const refresh = useCallback(() => {
    const owner = ownerRef.current;
    if (owner?.scope === scope) void owner.load(true);
  }, [scope]);

  function afterAction(id, status) {
    const owner = ownerRef.current;
    if (!owner || owner.scope !== scope) return;
    // Hide availability after a decision or conflict until an authoritative read completes.
    setSnapshot(previous => {
      if (previous?.scope !== scope || !previous.items) return previous;
      if (!id) return null;
      return {
        ...previous,
        items: previous.items.map(item => item.id === id
          ? { ...item, status: status ?? item.status, acceptanceAvailable: false }
          : item),
      };
    });
    void owner.load(true);
  }

  const current = scope && snapshot?.scope === scope ? snapshot : null;
  const actionable = current?.items?.filter(item => isActionableInvitation(item, current.checkedAt)) ?? [];
  // Pending invitations that cannot be accepted can still expire while their detail is open.
  const nextExpiry = Math.min(...(current?.items ?? []).map(pendingExpiry).filter(expiry => expiry > current.checkedAt));
  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return;
    const timeout = window.setTimeout(() => {
      const checkedAt = Date.now();
      setSnapshot(previous => previous?.scope === scope ? { ...previous, checkedAt } : previous);
    }, Math.max(0, nextExpiry - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [scope, nextExpiry]);

  function displayStatus(invitation) {
    return pendingExpiry(invitation) <= current?.checkedAt ? 'expired' : invitation.status;
  }

  return { items: current?.items ?? null, error: current?.error ?? '', actionable, displayStatus, refresh, afterAction, clear };
}
