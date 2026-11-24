import { useCallback, useId, useState } from 'react';
import CareInterview, { ActiveInterview, primaryButton as primary, secondaryButton as secondary } from './CareInterview';
import { useCareAction } from './useCareAction';
import { useCareRead } from './useCareRead';
import { useVisibleCareRefresh } from './useVisibleCareRefresh';
import { ConsultationDetail, TreatmentWithdrawals } from './FirstConsultation';
import { careChecklist, careProgress, episodeTitle, firstConsultationEnabled } from './individualCareState';

const section = 'space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5';
const defaultTemplate = 'fictional-initial-interview-v1';

function ReadMessage({ read, loadingText }) {
  if (read.error) return <p role="alert">{read.error}</p>;
  return read.loading && !read.data ? <p role="status">{loadingText}</p> : null;
}

function CareProgress({ item, consultation, professional, consultationRead }) {
  const progress = careChecklist(item, consultation, professional, consultationRead);
  const labels = { professional: 'Psicólogo', patient: 'Paciente' };
  const unavailable = consultationRead === 'error' || consultationRead === 'loading';
  return <section aria-label="Progreso de atención" className="rounded-2xl bg-slate-50 p-4 sm:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-lg font-bold text-slate-950">Progreso de atención</h3>
      <span className="text-sm text-slate-600">{unavailable ? 'Estado por actualizar' : `${progress.completed} de ${progress.steps.length} completados`}</span>
    </div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
      <div className="h-full rounded-full bg-teal-700 transition-[width]" style={{ width: unavailable ? '0%' : `${progress.completed / progress.steps.length * 100}%` }} />
    </div>
    <ol className="mt-3 divide-y divide-slate-200">
      {progress.steps.map(step => <li key={step.label} className="flex items-center gap-3 py-2.5">
        <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${step.complete
          ? 'bg-emerald-100 text-emerald-800' : step.current ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-600'}`}>
          {unavailable ? '·' : step.complete ? '✓' : step.current ? '•' : ''}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">{step.label}</span>
          <span className="block text-sm text-slate-600">{unavailable ? 'Consultando estado' : step.complete ? 'Completado' : step.current
            ? progress.closed ? 'Cerrado' : `En proceso${step.owner ? ` · Actúa ${labels[step.owner]}` : ''}` : 'Pendiente'}</span>
        </span>
      </li>)}
    </ol>
  </section>;
}

function StartInterview({ preparation, agreementId, catalog, onChange, blocked }) {
  const fieldId = useId();
  const [templateId, setTemplateId] = useState(defaultTemplate);
  const [mode, setMode] = useState('self');
  const template = catalog.find(item => item.id === templateId);
  const { act, error, busy } = useCareAction(onChange);
  return <section className={section} aria-label="Enviar entrevista inicial">
    <h3 className="text-lg font-semibold">Entrevista inicial</h3>
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault();
      if (template && !blocked) void act('/admissions/care-start', {
        agreementId, mode, templateId: template.id, ...(preparation && { episodeId: preparation.episodeId }),
      });
    }}>
      {template && <>
        <p><strong>{template.title}</strong> · {mode === 'self' ? 'El paciente responde desde su cuenta' : 'Entrevista con el profesional'}</p>
        <p>{mode === 'self'
          ? 'El paciente podrá aceptar la entrevista y decidir cuándo enviarte sus respuestas.'
          : 'El paciente recibirá las condiciones. Después de conversar, podrás registrar lo que te contó.'}</p>
      </>}
      <div>
          <label htmlFor={fieldId + '-mode'} className="mr-2">Modalidad</label>
          <select id={fieldId + '-mode'} className={secondary} value={mode} disabled={busy} onChange={event => setMode(event.target.value)}>
            <option value="self">El paciente responde en su cuenta</option>
            <option value="directed">Entrevista con el profesional</option>
          </select>
      </div>
      <details className="space-y-3">
        <summary className="cursor-pointer font-semibold text-indigo-800">Cambiar plantilla y ver preguntas</summary>
        <div>
          <label htmlFor={fieldId + '-template'}>Plantilla</label>
          <select id={fieldId + '-template'} className={secondary + ' block w-full'} value={templateId} disabled={busy} onChange={event => setTemplateId(event.target.value)}>
            {catalog.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}
          </select>
        </div>
        {template && <>
          <p>{template.description}</p>
          <ul className="list-disc space-y-1 pl-5">{template.questions.map(question => <li key={question.id}>{question.label}</li>)}</ul>
        </>}
      </details>
      {error && <p role="alert">{error}</p>}
      <button className={primary} disabled={busy || blocked || !template}>Enviar entrevista inicial</button>
    </form>
  </section>;
}

function Episode({ item, professional, onChange }) {
  const [admissionRevision, setAdmissionRevision] = useState(0);
  const [consultationState, setConsultationState] = useState(null);
  const [consultationFailed, setConsultationFailed] = useState(false);
  const onConsultation = useCallback(data => { setConsultationFailed(false); setConsultationState(data); }, []);
  const onConsultationError = useCallback(() => { setConsultationFailed(true); setConsultationState(null); }, []);
  const consultation = firstConsultationEnabled && item.state !== 'revoked';
  const completed = item.episodeStatus === 'active' || ['active', 'withdrawn'].includes(consultationState?.status);
  const progress = careProgress(item, consultationState, professional, consultationFailed ? 'error' : consultation ? 'loading' : 'unavailable');
  const restoreState = useCallback(async () => {
    setAdmissionRevision(value => value + 1);
    await onChange();
  }, [onChange]);

  return <div className="space-y-4">
    <header className="rounded-2xl bg-teal-50 p-4 sm:p-5" aria-label="Siguiente paso">
      <p className="text-xs font-bold uppercase tracking-wide text-teal-900">Siguiente paso</p>
      <h3 className="mt-1 text-xl font-bold text-slate-950">{progress.stage}</h3>
      <p role="status" className="mt-1 text-slate-700">{progress.next}</p>
    </header>
    <CareProgress item={item} consultation={consultationState} professional={professional}
      consultationRead={consultationFailed ? 'error' : consultation ? 'loaded' : 'loading'} />
    {(!professional || !completed) && <CareInterview item={item} professional={professional} completed={completed}
      consultation={consultationState} onChange={restoreState} />}
    {consultation && <ConsultationDetail assignmentId={item.id} professional={professional} onRefresh={onChange}
      revision={admissionRevision} onDetail={onConsultation} onUnavailable={onConsultationError} contextual />}
    {professional && consultationState?.status === 'active' && item.state !== 'revoked' && <ActiveInterview id={item.id} />}
    {!professional && firstConsultationEnabled && (item.state === 'revoked' || consultationFailed) &&
      <TreatmentWithdrawals revision={admissionRevision + item.version} onWithdraw={restoreState} assignment={item} />}
  </div>;
}

export default function IndividualCare({ agreement, professional }) {
  const admissions = useCareRead(
    professional && agreement.status !== 'completed' ? null : '/admissions/care-context', agreement.id
  );
  const [selection, setSelection] = useState('');
  const episodeLabel = useId();
  const reload = admissions.reload;
  const onChange = useCallback(() => reload(true), [reload]);
  useVisibleCareRefresh(() => { if (!admissions.loading) return onChange(); });
  const assigned = admissions.data?.assignments;
  const assignedIds = new Set(assigned?.map(item => item.episodeId));
  const unassigned = admissions.data?.preparations?.filter(item => !assignedIds.has(item.episodeId)) ?? [];
  const episodes = [...unassigned, ...(assigned ?? [])].sort((a, b) => Date.parse(b.preparedAt) - Date.parse(a.preparedAt));
  const current = episodes.filter(item => item.state !== 'revoked');
  const invalid = !assigned;
  const pending = assigned?.some(item => item.state !== 'revoked' && item.episodeStatus === 'prepared');
  const selected = !invalid && (episodes.find(item => item.episodeId === selection)
    ?? (current.length === 1 ? current[0] : episodes.length === 1 ? episodes[0] : undefined));
  const canStart = professional && agreement.status === 'completed' && !pending;
  const start = preparation => <StartInterview key={preparation?.episodeId ?? agreement.id} preparation={preparation}
    agreementId={agreement.id} onChange={onChange} catalog={admissions.data.templates} blocked={admissions.loading} />;

  return <section aria-label="Atención individual" className="space-y-3">
    <ReadMessage read={admissions} loadingText="Consultando la atención…" />
    {admissions.error && <button type="button" className={secondary} onClick={onChange}>Reintentar consulta de atención</button>}
    {!invalid && episodes.length > 1 && <div>
      <label htmlFor={episodeLabel} className="block font-semibold">Selecciona la atención que quieres abrir</label>
      <select id={episodeLabel} className={secondary + ' block w-full'} value={selected?.episodeId ?? ''} onChange={event => setSelection(event.target.value)}>
        <option value="">Elige una atención</option>
        {episodes.map(item => <option key={item.episodeId} value={item.episodeId}>
          {episodeTitle(item)} · {item.professionalName ? item.professionalName + ' · ' : ''}{careProgress(item, null, professional).stage}
        </option>)}
      </select>
    </div>}
    {!invalid && !episodes.length && agreement.status === 'completed' && (canStart
      ? start()
      : <p role="status">Tu profesional te enviará la entrevista inicial desde esta ficha.</p>)}
    {selected?.id && <Episode key={selected.episodeId} item={selected} professional={professional} onChange={onChange} />}
    {selected && !selected.id && canStart && start(selected)}
    {!invalid && selected?.id && canStart && !unassigned.length && <details className={section}>
      <summary className="cursor-pointer font-semibold">Iniciar otra atención</summary>
      {start()}
    </details>}
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
