import { useCallback, useEffect, useRef } from 'react';
import { useCareRead } from '../components/useCareRead';
import { useVisibleCareRefresh } from '../components/useVisibleCareRefresh';
import { agreementCare, firstConsultationEnabled } from '../components/individualCareState';

export function useCareOverview(scope, professional) {
  const links = useCareRead(scope ? '/bilateral-invitations/' + (professional ? 'linked-patients' : 'agreements') : null, null, scope, false);
  const admissions = useCareRead(scope ? '/admissions' : null, null, scope, false);
  const consultations = useCareRead(scope && firstConsultationEnabled ? '/admissions/consultations' : null, null, scope, false);
  const { reload: reloadLinks } = links;
  const { reload: reloadAdmissions } = admissions;
  const { reload: reloadConsultations } = consultations;
  const flight = useRef(null);
  const lastReadAt = useRef(0);
  const reload = useCallback(async (retain = false, refreshAfter = false, appointmentsOnly = false) => {
    if (!scope) return;
    const pending = flight.current;
    if (pending?.scope === scope) {
      if (!refreshAfter) return pending.promise;
      await pending.promise;
      if (flight.current) return flight.current.scope === scope ? flight.current.promise : undefined;
    }
    if (!appointmentsOnly) lastReadAt.current = Date.now();
    const request = { scope, promise: null };
    flight.current = request;
    request.promise = (async () => {
      // Both admission lists share a server work budget. Request them in
      // sequence so an overview does not consume both slots by itself.
      if (!appointmentsOnly) {
        await reloadLinks(retain);
        await reloadAdmissions(retain);
      }
      await reloadConsultations(retain);
    })().finally(() => {
      if (flight.current === request) flight.current = null;
    });
    return request.promise;
  }, [reloadLinks, reloadAdmissions, reloadConsultations, scope]);
  useEffect(() => {
    if (scope) queueMicrotask(() => void reload());
  }, [scope, reload]);
  const refreshIfStale = useCallback(() => {
    if (Date.now() - lastReadAt.current >= 9000) return reload(true);
  }, [reload]);
  const refreshAppointments = useCallback(() => reload(true, false, true), [reload]);
  useVisibleCareRefresh(refreshIfStale, Boolean(scope), 12000);

  const incomplete = Boolean(admissions.incomplete || consultations.incomplete);
  const forAgreement = id => incomplete && !admissions.data?.some(assignment => assignment.agreementId === id)
    ? null : agreementCare(id, admissions.data, consultations.data, professional);
  const agreements = professional ? links.data : links.data?.filter(link => link.status === 'completed');
  const audience = professional ? 'professional' : 'patient';
  const count = agreements?.reduce((total, link) => total
    + (forAgreement(professional ? link.agreementId : link.id)?.filter(stage => stage.owner === audience).length ?? 0), 0) ?? 0;
  return { links, admissions, consultations, forAgreement, reload, refreshIfStale, refreshAppointments, count, incomplete };
}
