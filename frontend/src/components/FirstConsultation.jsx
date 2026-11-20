import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';

const button = 'rounded-lg bg-indigo-700 px-4 py-2 text-white disabled:opacity-50';
const field = 'rounded-lg border border-slate-300 p-2';
const statusLabels = { prepared: 'Preparado', active: 'Activo', withdrawn: 'Acceso clínico retirado' };
const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0') + ':00');

function ConsultationDetail({ assignmentId, professional, onRefresh }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const generation = useRef(0);
  const path = '/admissions/consultations/' + assignmentId;
  const invalidate = useCallback(() => { generation.current++; }, []);

  const load = useCallback(async current => {
    const response = await apiRequest(path);
    if (current === generation.current) setDetail(response.data);
  }, [path]);

  const report = useCallback((failure, current) => {
    if (current !== generation.current) return;
    setError(failure.message);
    if ([401, 403, 404, 503].includes(failure.status)) {
      setDetail(null);
      setNote('');
    }
  }, []);

  useEffect(() => {
    const current = ++generation.current;
    load(current).catch(failure => report(failure, current)).finally(() => {
      if (current === generation.current) setBusy(false);
    });
    return invalidate;
  }, [load, report, invalidate]);

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
      setConfirmed(false);
      if (operation === 'note' || operation === 'withdraw' || operation === 'revoke-admission') setNote('');
      await load(current);
      if (current === generation.current) await onRefresh();
    } catch (failure) {
      report(failure, current);
    } finally {
      if (current === generation.current) setBusy(false);
    }
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

  return <section className="space-y-4" aria-label="Estado de la primera consulta">
    {error && <p role="alert">{error}</p>}
    {!detail && busy && <p role="status">Cargando episodio…</p>}
    <button type="button" className={field} disabled={busy} onClick={reload}>Actualizar episodio</button>
    {detail && <>
      <p>Episodio {detail.episodeId} · {detail.professionalName} · {statusLabels[detail.status]}</p>
      {detail.status === 'prepared' && <>
        {!detail.documentVersion && <p>Falta validar la versión vigente de la admisión.</p>}
        {detail.documentVersion && !detail.sufficiencyId && (professional ? <>
          <label className="block"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> Declaro suficiente para este ensayo la admisión validada, versión {detail.documentVersion}, del episodio {detail.episodeId}.</label>
          <button type="button" className={button} disabled={busy || !confirmed} onClick={() => submit('sufficiency', {
            assignmentVersion: detail.admissionVersion,
            documentVersion: detail.documentVersion,
            criteriaVersion: detail.criteriaVersion,
          })}>Declarar suficiencia</button>
        </> : <p>El profesional debe declarar la suficiencia de la admisión.</p>)}
        {detail.sufficiencyId && !detail.consentAccepted && !detail.consentId && (professional
          ? <p>El paciente debe aceptar el consentimiento de tratamiento.</p>
          : <>
            <p>{detail.consentTerms}</p>
            <label className="block"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> He leído y acepto el consentimiento de tratamiento de este episodio.</label>
            <button type="button" className={button} disabled={busy || !confirmed} onClick={() => submit('consent', {
              sufficiencyId: detail.sufficiencyId,
              consentVersion: detail.consentVersion,
              consentHash: detail.consentHash,
            })}>Aceptar tratamiento ficticio</button>
          </>)}
        {detail.consentId && !detail.consentAccepted && <p>Consentimiento de tratamiento retirado.</p>}
        {detail.consentAccepted && (professional
          ? <button type="button" className={button} disabled={busy} onClick={() => submit('activate', { consentId: detail.consentId })}>Activar episodio ficticio</button>
          : <p>El profesional puede activar el episodio.</p>)}
      </>}
      {detail.status === 'active' && !detail.appointment && (professional
        ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); void submit('book', { date, time }); }}>
          <label className="block">Fecha de la primera cita <input className={field} type="date" value={date} required onChange={event => setDate(event.target.value)} /></label>
          <label className="block">Hora de inicio <select className={field} value={time} required onChange={event => setTime(event.target.value)}>
            <option value="">Seleccionar hora</option>
            {hours.map(hour => <option key={hour}>{hour}</option>)}
          </select></label>
          <button className={button} disabled={busy || !date || !time}>Reservar cita de 60 minutos</button>
        </form>
        : <p>Todavía no hay una cita reservada.</p>)}
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
      {!professional && detail.consentAccepted && (
        <button type="button" className={field} disabled={busy} onClick={() => submit('withdraw', { consentId: detail.consentId })}>Retirar consentimiento de tratamiento</button>
      )}
      {detail.status === 'active' && (
        <button type="button" className={field} disabled={busy} onClick={() => submit('revoke-admission', { assignmentVersion: detail.admissionVersion })}>Revocar admisión</button>
      )}
    </>}
  </section>;
}

export default function FirstConsultation({ professional }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState('');
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
    {selected && items.some(item => item.id === selected) && <ConsultationDetail key={selected} assignmentId={selected} professional={professional} onRefresh={refresh} />}
  </section>;
}
