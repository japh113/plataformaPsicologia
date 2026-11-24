import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';
import { useVisibleCareRefresh } from './useVisibleCareRefresh';
import { episodeTitle } from './individualCareState';

const button = 'rounded-lg bg-indigo-700 px-4 py-2 text-white disabled:opacity-50';
const field = 'rounded-lg border border-slate-300 p-2';
const statusLabels = { prepared: 'Preparado', active: 'Activo', withdrawn: 'Acceso clínico retirado' };
const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0') + ':00');

function confirmationFor(detail, professional) {
  if (detail?.status !== 'prepared' || !detail.documentVersion) return null;
  let operation, payload;
  if (professional && !detail.sufficiencyId) {
    operation = 'sufficiency';
    payload = { assignmentVersion: detail.admissionVersion, documentVersion: detail.documentVersion, criteriaVersion: detail.criteriaVersion };
  } else if (!professional && detail.sufficiencyId && !detail.consentAccepted && !detail.consentId) {
    operation = 'consent';
    payload = { sufficiencyId: detail.sufficiencyId, consentVersion: detail.consentVersion, consentHash: detail.consentHash };
  } else {
    return null;
  }
  const key = JSON.stringify([operation, detail.id, detail.episodeId, detail.professionalName, detail.admissionVersion,
    detail.documentVersion, detail.criteriaVersion, detail.consentTerms, payload]);
  return { key, operation, payload };
}

function waitingForPatient(detail, professional) {
  return professional && !detail.consentAccepted && !detail.consentId;
}

export function ConsultationDetail({ assignmentId, professional, onRefresh, revision, onDetail, onUnavailable, contextual = false }) {
  const [read, setRead] = useState(null);
  const detail = read?.revision === revision ? read?.data : null;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [confirmation, setConfirmation] = useState(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const generation = useRef(0);
  const path = '/admissions/consultations/' + assignmentId;
  const displayed = confirmationFor(detail, professional);
  const confirmed = Boolean(confirmation && confirmation.key === displayed?.key);
  const invalidate = useCallback(() => { generation.current++; }, []);

  const load = useCallback(async current => {
    const response = await apiRequest(path);
    if (current !== generation.current) return;
    const next = confirmationFor(response.data, professional);
    setConfirmation(previous => previous?.key === next?.key ? previous : null);
    setRead({ revision, data: response.data });
    onDetail?.(response.data);
  }, [path, professional, onDetail, revision]);

  const report = useCallback((failure, current) => {
    if (current !== generation.current) return;
    setError(failure.message);
    setConfirmation(null);
    setRead(null);
    onUnavailable?.();
    if ([401, 403, 404].includes(failure.status)) setNote('');
  }, [onUnavailable]);

  useEffect(() => {
    const current = ++generation.current;
    load(current).catch(failure => report(failure, current)).finally(() => {
      if (current === generation.current) setBusy(false);
    });
    return invalidate;
  }, [load, report, invalidate, revision]);

  const submit = async (operation, payload) => {
    if (busy || !detail) return;
    const current = ++generation.current;
    setBusy(true);
    setError('');
    try {
      await apiRequest(path + '/' + operation, {
        method: 'POST',
        body: JSON.stringify({ ...payload, confirmed: true }),
      });
      if (current !== generation.current) return;
      setConfirmation(null);
      if (operation === 'note' || operation === 'withdraw' || operation === 'revoke-admission') setNote('');
      await load(current);
      if (current === generation.current) await onRefresh?.();
    } catch (failure) {
      report(failure, current);
      if (contextual && failure.status === 409 && current === generation.current) {
        try { await load(current); } catch (refreshFailure) { report(refreshFailure, current); }
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };

  const confirmDisplayed = event => {
    setConfirmation(event.target.checked ? displayed : null);
  };

  const submitConfirmation = () => {
    if (confirmed) void submit(confirmation.operation, confirmation.payload);
  };

  const reload = async () => {
    const current = ++generation.current;
    setBusy(true);
    setError('');
    try {
      await load(current);
    } catch (failure) {
      report(failure, current);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };

  useVisibleCareRefresh(() => { if (!busy) return reload(); }, contextual);

  if (contextual && detail?.status === 'prepared' && (!detail.sufficiencyId
    || waitingForPatient(detail, professional))) return null;

  return <section className="space-y-4" aria-label="Estado de la primera consulta">
    {error && <p role="alert">{error}</p>}
    {!detail && !error && <p role="status">Consultando el estado de la atención…</p>}
    {(!contextual || error) && <button type="button" className={field} disabled={busy} onClick={reload}>{contextual ? 'Reintentar consulta de atención' : 'Actualizar episodio'}</button>}
    {detail && <>
      {!contextual && <p>Episodio {detail.episodeId} · {detail.professionalName} · {statusLabels[detail.status]}</p>}
      {detail.status === 'prepared' && <>
        {!contextual && !detail.documentVersion && <p>Falta validar la versión vigente de la admisión.</p>}
        {!contextual && detail.documentVersion && !detail.sufficiencyId && (professional ? <>
          <label className="block"><input type="checkbox" checked={confirmed} onChange={confirmDisplayed} /> Declaro suficiente para este ensayo la admisión validada, versión {detail.documentVersion}, del episodio{contextual ? ' seleccionado' : ' ' + detail.episodeId}.</label>
          <button type="button" className={button} disabled={busy || !confirmed} onClick={submitConfirmation}>Declarar suficiencia</button>
        </> : <p>El profesional debe declarar la suficiencia de la admisión.</p>)}
        {detail.sufficiencyId && !detail.consentAccepted && !detail.consentId && (professional
          ? <p>El paciente debe aceptar el consentimiento de tratamiento.</p>
          : <>
            {contextual && <h3 className="font-bold">Consentimiento de tratamiento</h3>}
            <p>{detail.consentTerms}</p>
            {!contextual && <label className="block"><input type="checkbox" checked={confirmed} onChange={confirmDisplayed} /> He leído y acepto el consentimiento de tratamiento de este episodio.</label>}
            <button type="button" className={button} disabled={busy || (contextual ? !displayed : !confirmed)}
              onClick={contextual ? () => void submit(displayed.operation, displayed.payload) : submitConfirmation}>
              {contextual ? 'Aceptar tratamiento' : 'Aceptar tratamiento ficticio'}
            </button>
          </>)}
        {detail.consentId && !detail.consentAccepted && <p>Consentimiento de tratamiento retirado.</p>}
        {detail.consentAccepted && (professional
          ? <button type="button" className={button} disabled={busy} onClick={() => submit('activate', { consentId: detail.consentId })}>{contextual ? 'Iniciar tratamiento' : 'Activar episodio ficticio'}</button>
          : !contextual && <p>El profesional puede activar el episodio.</p>)}
      </>}
      {detail.status === 'active' && !detail.appointment && (professional
        ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); void submit('book', { date, time }); }}>
          {contextual && <p>Elige una fecha y una hora cerrada. La consulta dura 60 minutos.</p>}
          <label className="block">Fecha de la primera cita <input className={field} type="date" value={date} required onChange={event => setDate(event.target.value)} /></label>
          <label className="block">Hora de inicio <select className={field} value={time} required onChange={event => setTime(event.target.value)}>
            <option value="">Seleccionar hora</option>
            {hours.map(hour => <option key={hour}>{hour}</option>)}
          </select></label>
          <button className={button} disabled={busy || !date || !time}>{contextual ? 'Reservar primera cita' : 'Reservar cita de 60 minutos'}</button>
        </form>
        : !contextual && <p>Todavía no hay una cita reservada.</p>)}
      {detail.appointment && <>
        <p>Cita del {detail.appointment.date} a las {detail.appointment.time} · {detail.appointment.durationMinutes} minutos · {detail.appointment.status === 'completed' ? 'Completada' : 'Pendiente'}</p>
        {professional && detail.appointment.canComplete && (
          <button type="button" className={button} disabled={busy} onClick={() => submit('complete', { appointmentId: detail.appointment.id })}>Completar cita</button>
        )}
        {professional && detail.appointment.status === 'completed' && (detail.note
          ? <section className="space-y-2"><h3 className="font-bold">Nota profesional privada</h3><p className="whitespace-pre-wrap">{detail.note.content}</p></section>
          : <form className="space-y-3" autoComplete="off" onSubmit={event => {
            event.preventDefault();
            void submit('note', { appointmentId: detail.appointment.id, content: note });
          }}>
            <label className="block">Nota profesional privada <textarea className={field + ' block w-full'} required maxLength={10000} value={note} onChange={event => setNote(event.target.value)} /></label>
            <button className={button} disabled={busy || !note.trim()}>Registrar nota privada</button>
          </form>)}
      </>}
      {!professional && detail.consentAccepted && (contextual
        ? <details className="space-y-2"><summary className="cursor-pointer font-semibold">Condiciones de tratamiento</summary>
          <p>{detail.consentTerms}</p>
          <button type="button" className={field} disabled={busy} onClick={() => {
            if (window.confirm('¿Retirar el consentimiento de tratamiento? Dejarás de tener acceso a la primera consulta.')) void submit('withdraw', { consentId: detail.consentId });
          }}>Retirar consentimiento de tratamiento</button>
        </details>
        : <button type="button" className={field} disabled={busy} onClick={() => submit('withdraw', { consentId: detail.consentId })}>Retirar consentimiento de tratamiento</button>)}
      {detail.status === 'active' && (!contextual
        ? <button type="button" className={field} disabled={busy} onClick={() => submit('revoke-admission', { assignmentVersion: detail.admissionVersion })}>Revocar admisión</button>
        : <details className="space-y-2"><summary className="cursor-pointer font-semibold">Opciones de entrevista</summary>
          <p>Si se retira la autorización de entrevista, se cierran las acciones que dependen de ella. Se conserva la documentación.</p>
          <button type="button" className={field} disabled={busy} onClick={() => {
            if (window.confirm('¿Retirar la autorización de entrevista para esta atención?')) void submit('revoke-admission', { assignmentVersion: detail.admissionVersion });
          }}>Retirar autorización de entrevista</button>
        </details>)}
    </>}
  </section>;
}

export function TreatmentWithdrawals({ revision, onWithdraw, assignment, contextual = false }) {
  const [references, setReferences] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);

  useEffect(() => {
    const current = ++generation.current;
    apiRequest('/admissions/consultations/withdrawals').then(response => {
      if (current !== generation.current) return;
      setReferences(response.data);
      setError('');
    }).catch(failure => {
      if (current !== generation.current) return;
      setReferences([]);
      setError(failure.message);
    });
    return invalidate;
  }, [revision, invalidate]);

  const withdraw = async reference => {
    if (busy || ((contextual || assignment) && !window.confirm('¿Retirar el consentimiento de tratamiento de este episodio?'))) return;
    const current = generation.current;
    setBusy(reference.consentId);
    try {
      await apiRequest('/admissions/consultations/' + reference.assignmentId + '/withdraw', {
        method: 'POST',
        body: JSON.stringify({ confirmed: true, consentId: reference.consentId }),
      });
      if (current !== generation.current) return;
      setReferences(values => values.filter(value => value.consentId !== reference.consentId));
      setBusy(null);
      await onWithdraw();
    } catch (failure) {
      if (current === generation.current) setError(failure.message);
    } finally {
      if (current === generation.current) setBusy(null);
    }
  };

  const visible = (references ?? []).filter(reference => !assignment || reference.assignmentId === assignment.id);
  if (references === null) return contextual ? <p role="status">Consultando consentimientos vigentes…</p> : null;
  if (!visible.length && !error) return contextual ? <p>No hay consentimientos disponibles para retirar.</p> : null;
  return <section className="space-y-2" aria-label="Consentimientos de tratamiento">
    <h3 className="font-bold">Consentimientos de tratamiento</h3>
    {error && <p role="alert">{error}</p>}
    {visible.map(reference => (
      <button key={reference.consentId} type="button" className={field} disabled={Boolean(busy)}
        onClick={() => withdraw(reference)}>{assignment ? 'Retirar consentimiento de tratamiento' : contextual
          ? 'Retirar consentimiento · ' + reference.professionalName + ' · ' + episodeTitle(reference)
          : 'Retirar consentimiento del episodio ' + reference.episodeId}</button>
    ))}
  </section>;
}

export default function FirstConsultation({ professional }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState('');
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const response = await apiRequest('/admissions/consultations');
      if (current === generation.current) { setItems(response.data); setError(''); }
    } catch (failure) {
      if (current === generation.current) {
        setItems([]);
        setSelected('');
        setError(failure.message);
      }
    }
  }, []);
  const refreshAfterWrite = async () => {
    setRevision(value => value + 1);
    await refresh();
  };
  const refreshAfterWithdrawal = async () => {
    setSelected('');
    await refresh();
  };
  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) void refresh();
    });
    return () => {
      mounted = false;
      invalidate();
    };
  }, [refresh, invalidate]);

  return <section className="space-y-4" aria-label="Primera consulta ficticia">
    <h2 className="text-xl font-bold">Primera consulta ficticia</h2>
    {error && <p role="alert">{error}</p>}
    <label className="block">Seleccionar episodio <select className={field} value={selected} onChange={event => setSelected(event.target.value)}>
      <option value="">Seleccionar</option>
      {items.map(item => <option key={item.id} value={item.id}>Episodio {item.episodeId} · {item.professionalName} · {statusLabels[item.status]}</option>)}
    </select></label>
    {selected && items.some(item => item.id === selected) && <ConsultationDetail key={selected} assignmentId={selected} professional={professional} onRefresh={refreshAfterWrite} />}
    {!professional && <TreatmentWithdrawals revision={revision} onWithdraw={refreshAfterWithdrawal} />}
  </section>;
}
