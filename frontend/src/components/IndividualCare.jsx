import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { apiRequest } from '../api/client';
import { useCareRead } from './useCareRead';
import { AdmissionDetail } from '../screens/AdmissionsScreen';
import DirectedAdmission from './DirectedAdmission';
import { ConsultationDetail, TreatmentWithdrawals } from './FirstConsultation';
import { careProgress, episodeTitle, firstConsultationEnabled } from './individualCareState';

const primary = 'rounded-lg bg-indigo-700 px-4 py-2.5 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50';
const secondary = 'rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';
const section = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5';
const post = (path, payload, signal) => apiRequest(path, {
  method: 'POST', body: JSON.stringify(payload), signal,
});

function ReadMessage({ read, loadingText }) {
  if (read.error) return <p role="alert">{read.error}</p>;
  return read.loading ? <p role="status">{loadingText}</p> : null;
}

function AssignInterview({ preparation, agreementId, onChange }) {
  const catalog = useCareRead('/admissions/templates');
  const fieldId = useId();
  const [templateId, setTemplateId] = useState('');
  const [mode, setMode] = useState('self');
  const template = catalog.data?.find(item => item.id === templateId);
  const { act, error, busy } = useCareMutation(onChange);
  return <section className={section} aria-label="Elegir entrevista">
    <h3 className="font-bold">Elegir entrevista</h3>
    <ReadMessage read={catalog} loadingText="Consultando plantillas…" />
    {catalog.error && <button type="button" className={secondary} onClick={() => catalog.reload()}>Actualizar plantillas</button>}
    {catalog.data && <form className="space-y-3" onSubmit={event => {
      event.preventDefault();
      if (template) void act(mode === 'directed' ? 'assign-directed' : 'assign', {
        agreementId, episodeId: preparation.episodeId, templateId: template.id,
      });
    }}>
      <div>
        <label htmlFor={fieldId + '-mode'} className="mr-2">Modalidad</label>
        <select id={fieldId + '-mode'} className={secondary} value={mode} disabled={busy} onChange={event => setMode(event.target.value)}>
          <option value="self">Autoadministrada</option>
          <option value="directed">Dirigida por el profesional</option>
        </select>
      </div>
      <div>
        <label htmlFor={fieldId + '-template'}>Plantilla</label>
        <select id={fieldId + '-template'} className={secondary + ' block w-full'} value={templateId} required disabled={busy} onChange={event => setTemplateId(event.target.value)}>
          <option value="">Selecciona una plantilla</option>
          {catalog.data.map(option => <option key={option.id} value={option.id}>{option.title} · Versión {option.version}</option>)}
        </select>
      </div>
      {template && <div className="space-y-2">
        <p><strong>{template.title}</strong> · Versión {template.version} · {mode === 'self' ? 'Autoadministrada' : 'Dirigida'}</p>
        <p>{template.description}</p>
        <p>{template.notice}</p>
        <ul className="list-disc space-y-1 pl-5">{template.questions.map(question => <li key={question.id}>{question.label}</li>)}</ul>
        <p>Al asignar, el paciente podrá revisar el consentimiento específico de esta entrevista.</p>
      </div>}
      {error && <p role="alert">{error}</p>}
      <button className={primary} disabled={busy || !template}>Asignar entrevista</button>
    </form>}
  </section>;
}

function useCareMutation(onChange) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(null);
  const operation = useRef(null);
  useEffect(() => () => request.current?.abort(), []);

  async function act(action, payload) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    setBusy(true);
    setError('');
    const key = JSON.stringify([action, payload]);
    if (operation.current?.key !== key) operation.current = { key, id: crypto.randomUUID() };
    try {
      await post('/admissions/' + action, { ...payload, confirmed: true, operationId: operation.current.id }, signal);
      operation.current = null;
      if (!signal.aborted) await onChange();
    } catch (failure) {
      if (signal.aborted) return;
      setError(failure.message);
      if (failure.status && failure.status < 500 && failure.status !== 429) operation.current = null;
      // A write may have reached PostgreSQL even if its receipt was lost.
      await onChange();
    } finally {
      if (!signal.aborted) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  return { act, error, busy };
}

function PrepareEpisode({ agreementId, onChange, additional = false }) {
  const { act, busy, error } = useCareMutation(onChange);
  return <section className={section}>
    <h3 className="font-bold">{additional ? 'Otro episodio individual' : 'Vinculación completada'}</h3>
    <p>Prepara el episodio individual para poder elegir y asignar la entrevista.</p>
    {error && <p role="alert">{error}</p>}
    <button type="button" className={primary} disabled={busy} onClick={() => act('prepare-current', { agreementId })}>Preparar episodio individual</button>
  </section>;
}

function Episode({ item, professional, onChange }) {
  const [admissionRevision, setAdmissionRevision] = useState(0);
  const [consultationState, setConsultationState] = useState(null);
  const [consultationFailed, setConsultationFailed] = useState(false);
  const onConsultation = useCallback(data => { setConsultationFailed(false); setConsultationState(data); }, []);
  const onConsultationError = useCallback(() => { setConsultationFailed(true); setConsultationState(null); }, []);
  const consultation = firstConsultationEnabled && item.state !== 'revoked';
  const completedAdmission = item.episodeStatus === 'active' || ['active', 'withdrawn'].includes(consultationState?.status);
  const progress = careProgress(item, consultationState, professional, consultationFailed ? 'error' : consultation ? 'loading' : 'unavailable');
  const restoreState = async () => {
    setAdmissionRevision(value => value + 1);
    await onChange();
  };
  return <div className="space-y-3">
    <section className={section} aria-label="Progreso de la atención">
      <h3 className="text-lg font-bold">{episodeTitle(item)}</h3>
      <p role="status"><strong>{progress.stage}</strong> · {progress.next}</p>
    </section>
    {(!professional || !completedAdmission) && <details className={section}
      open={item.reviewState !== 'validated' && item.state !== 'revoked'}>
      <summary className="cursor-pointer font-bold">Entrevista y versiones</summary>
      {item.mode === 'directed'
        ? <DirectedAdmission id={item.id} professional={professional} onRefresh={restoreState} contextual historyOnly={completedAdmission} />
        : <AdmissionDetail id={item.id} professional={professional} onRefresh={restoreState} onRevoked={onChange} contextual historyOnly={completedAdmission} />}
    </details>}
    {consultation && <section className={section} aria-label="Tratamiento y primera consulta">
      <h3 className="font-bold">Tratamiento y primera consulta</h3>
      <ConsultationDetail assignmentId={item.id} professional={professional} onRefresh={onChange}
        revision={admissionRevision} onDetail={onConsultation} onUnavailable={onConsultationError} contextual />
    </section>}
    {!professional && firstConsultationEnabled && (item.state === 'revoked' || consultationFailed) &&
      <TreatmentWithdrawals revision={admissionRevision + item.version} onWithdraw={restoreState} assignment={item} />}
  </div>;
}

export default function IndividualCare({ agreement, professional }) {
  const admissions = useCareRead('/admissions');
  const preparations = useCareRead(professional && agreement.status === 'completed' ? '/admissions/preparations' : null, agreement.id);
  const [selection, setSelection] = useState('');
  const episodeLabel = useId();
  const onChange = () => Promise.all([admissions.reload(true), preparations.reload(true)]);
  const assigned = admissions.data?.filter(item => item.agreementId === agreement.id);
  const assignedIds = new Set(assigned?.map(item => item.episodeId));
  const unassigned = preparations.data?.filter(item => !assignedIds.has(item.episodeId));
  const episodes = [...(unassigned ?? []), ...(assigned ?? [])].sort((a, b) => Date.parse(b.preparedAt) - Date.parse(a.preparedAt));
  const current = episodes.filter(item => item.state !== 'revoked');
  const invalid = !admissions.data || (professional && agreement.status === 'completed' && !preparations.data);
  const selected = !invalid && (episodes.find(item => item.episodeId === selection)
    ?? (current.length === 1 ? current[0] : episodes.length === 1 ? episodes[0] : undefined));

  return <section aria-label="Atención individual" className="space-y-3">
    <ReadMessage read={admissions} loadingText="Consultando episodios autorizados…" />
    <ReadMessage read={preparations} loadingText="Consultando preparaciones…" />
    {(admissions.error || preparations.error || episodes.length > 0) && <button type="button" className={secondary}
      disabled={admissions.loading || preparations.loading} onClick={() => {
        setSelection('');
        void admissions.reload();
        void preparations.reload();
      }}>Actualizar atención</button>}
    {!invalid && episodes.length > 1 && <div>
      <label htmlFor={episodeLabel} className="block font-semibold">Episodio de atención</label>
      <select id={episodeLabel} className={secondary + ' block w-full'} value={selected?.episodeId ?? ''} onChange={event => setSelection(event.target.value)}>
        <option value="">Selecciona un episodio</option>
        {episodes.map(item => <option key={item.episodeId} value={item.episodeId}>
          {episodeTitle(item)} · {careProgress(item, null, professional).stage}
        </option>)}
      </select>
    </div>}
    {!invalid && !episodes.length && agreement.status === 'completed' && (professional
      ? <PrepareEpisode agreementId={agreement.id} onChange={onChange} />
      : <p role="status">Tu profesional está preparando la admisión.</p>)}
    {!invalid && professional && agreement.status === 'completed' && assigned?.length > 0 && !unassigned.length && <details className={section}>
      <summary className="cursor-pointer font-semibold">Preparar otro episodio</summary>
      <PrepareEpisode agreementId={agreement.id} onChange={onChange} additional />
    </details>}
    {selected && (selected.id
      ? <Episode key={selected.episodeId} item={selected} professional={professional} onChange={onChange} />
      : <AssignInterview key={selected.episodeId} preparation={selected} agreementId={agreement.id} onChange={onChange} />)}
  </section>;
}

export function OwnFirstAppointments({ onOpen }) {
  const consultations = useCareRead('/admissions/consultations');
  const appointments = consultations.data?.filter(item => item.appointment)
    .sort((a, b) => (a.appointment.date + a.appointment.time).localeCompare(b.appointment.date + b.appointment.time));
  return <section className={section} aria-label="Primera consulta">
    <h2 className="text-lg font-bold">Primera consulta</h2>
    <ReadMessage read={consultations} loadingText="Consultando primeras citas…" />
    {consultations.error && <button type="button" className={secondary} onClick={() => consultations.reload()}>Actualizar primeras citas</button>}
    {appointments?.length === 0 && <p>No tienes primeras citas disponibles.</p>}
    {appointments?.map(item => <div className="flex flex-wrap items-center justify-between gap-3" key={item.id}>
      <p>{item.professionalName} · {item.appointment.date} a las {item.appointment.time} · {item.appointment.durationMinutes} min · {item.appointment.status === 'completed' ? 'Completada' : 'Pendiente'}</p>
      <button className={secondary} type="button" onClick={() => onOpen(item.id)}>Ver detalle de primera cita</button>
    </div>)}
  </section>;
}

export function OwnFirstAppointmentDetail({ assignmentId }) {
  return <section className={section} aria-label="Detalle de primera cita">
    <h2 className="text-xl font-bold">Detalle de primera cita</h2>
    <ConsultationDetail assignmentId={assignmentId} professional={false} contextual />
  </section>;
}
