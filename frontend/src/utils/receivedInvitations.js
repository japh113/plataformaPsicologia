import { useEffect, useRef, useState } from 'react';

export function isActionableInvitation(invitation, now) {
  return invitation.status === 'pending' && invitation.acceptanceAvailable === true && Date.parse(invitation.expiresAt) > now;
}

export function useReceivedInvitations(scope, apiRequest) {
  const ownerRef = useRef(null);
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    if (!scope) return;
    const owner = { scope, controller: null };
    ownerRef.current = owner;

    async function load() {
      if (ownerRef.current !== owner || owner.controller) return;
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

    owner.load = load;
    window.addEventListener('focus', load);
    void load();
    return () => {
      window.removeEventListener('focus', load);
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

  function refresh() {
    const owner = ownerRef.current;
    if (owner?.scope === scope) void owner.load();
  }

  function afterAction(id, status) {
    const owner = ownerRef.current;
    if (!owner || owner.scope !== scope) return;
    // A GET begun before an acknowledged write cannot restore its previous state.
    owner.controller?.abort();
    owner.controller = null;
    setSnapshot(previous => {
      if (previous?.scope !== scope || !previous.items) return previous;
      if (!id) return null;
      return {
        ...previous,
        items: previous.items.map(item => item.id === id ? { ...item, status, acceptanceAvailable: false } : item),
      };
    });
    void owner.load();
  }

  const current = scope && snapshot?.scope === scope ? snapshot : null;
  const actionable = current?.items?.filter(item => isActionableInvitation(item, current.checkedAt)) ?? [];
  const nextExpiry = Math.min(...actionable.map(item => Date.parse(item.expiresAt)));
  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return;
    const timeout = window.setTimeout(() => {
      const checkedAt = Date.now();
      setSnapshot(previous => previous?.scope === scope ? { ...previous, checkedAt } : previous);
    }, Math.max(0, nextExpiry - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [scope, nextExpiry]);

  return { items: current?.items ?? null, error: current?.error ?? '', actionable, refresh, afterAction, clear };
}
