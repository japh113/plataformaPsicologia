import { useCallback, useId, useState } from 'react';
import CareInterview, { ActiveDocument, primaryButton as primary, secondaryButton as secondary } from './CareInterview';
import { ClipboardList, FileCheck2, Settings2, UsersRound } from 'lucide-react';
import { CareDisclosure } from './CareDisclosure';
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

function JourneyProgress({ progress }) {
  return <section aria-label="Progreso de atención" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-bold text-slate-950">Progreso de atención</h3>
      <span className="text-sm font-medium text-slate-600">{progress.closed ? 'Atención cerrada'
        : progress.unavailable ? 'Estado por confirmar' : `${progress.completed} de ${progress.steps.length} completados`}</span>
    </div>
    {!progress.closed && !progress.unavailable && <div role="progressbar" aria-label="Etapas completadas"
      aria-valuenow={progress.completed} aria-valuemax={progress.steps.length} aria-valuemin={0}
      className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
      <div className="h-full rounded-full bg-teal-700" style={{ width: `${100 * progress.completed / progress.steps.length}%` }} />
    </div>}
    <ol className="mt-3 divide-y divide-slate-100">
      {progress.steps.map(step => {
        const label = step.complete ? 'Completado' : step.current ? 'En proceso'
          : progress.closed ? 'Cerrado' : progress.unavailable ? 'Por confirmar' : 'Pendiente';
        return <li key={step.label} aria-current={step.current ? 'step' : undefined} className="flex items-center gap-3 py-2.5">
          <span aria-hidden="true" className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.complete
            ? 'bg-emerald-100 text-emerald-800' : step.current ? 'bg-amber-100 text-amber-950' : 'bg-slate-100 text-slate-600'}`}>
            {step.complete ? '✓' : step.current ? '●' : '·'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">{step.label}</span>
            <span className="block text-xs text-slate-600">{label}{step.owner && ` · ${step.owner === 'professional' ? 'Psicólogo' : 'Paciente'}`}</span>
          </span>
        </li>;
      })}
    </ol>
  </section>;
}

function NextStep({ progress, professional, children }) {
  const mine = progress.owner === (professional ? 'professional' : 'patient');
  const label = progress.closed ? 'Atención cerrada' : progress.unavailable ? 'Estado pendiente de confirmar'
    : progress.owner ? mine ? 'Te toca actuar' : professional ? 'En espera del paciente' : 'En espera de tu profesional' : 'Estado de atención';
  return <section aria-label="Siguiente paso" className="min-w-0 rounded-2xl border border-teal-200 bg-teal-50 p-4 sm:p-5">
    <p className="text-sm font-semibold text-teal-900">{label}</p>
    <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-950">{progress.stage}</h3>
    <p role="status" className="mt-1 text-sm leading-relaxed text-slate-700">{progress.next}</p>
    {children && <div className="mt-4 space-y-4">{children}</div>}
  </section>;
}

const journey = 'grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.68fr)]';

function StartInterview({ preparation, agreementId, catalog, onChange, blocked }) {
  const fieldId = useId();
  const [templateId, setTemplateId] = useState(defaultTemplate);
  const [mode, setMode] = useState('self');
  const template = catalog.find(item => item.id === templateId);
  const { act, error, busy } = useCareAction(onChange);
  return <section aria-label="Enviar entrevista inicial">
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault();
      if (template && !blocked) void act('/admissions/care-start', {
        agreementId, mode, templateId: template.id, ...(preparation && { episodeId: preparation.episodeId }),
      });
    }}>
      <div>
          <label htmlFor={fieldId + '-mode'} className="mb-1 block text-sm font-semibold">Modalidad</label>
          <select id={fieldId + '-mode'} className={secondary + ' w-full'} value={mode} disabled={busy} onChange={event => setMode(event.target.value)}>
            <option value="self">El paciente responde en su cuenta</option>
            <option value="directed">Entrevista con el profesional</option>
          </select>
      </div>
      <details className="space-y-3">
        <summary className="cursor-pointer font-semibold text-indigo-800">Plantilla · {template?.title ?? 'Seleccionar'}</summary>
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

function Episode({ item, professional, onChange, manageAgreement, agreementTerms, onOpenAgenda }) {
  const [admissionRevision, setAdmissionRevision] = useState(0);
  const [consultationState, setConsultationState] = useState(null);
  const [consultationFailed, setConsultationFailed] = useState(false);
  const [managementTarget, setManagementTarget] = useState(null);
  const [treatmentTermsTarget, setTreatmentTermsTarget] = useState(null);
  const onConsultation = useCallback(data => { setConsultationFailed(false); setConsultationState(data); }, []);
  const onConsultationError = useCallback(() => { setConsultationFailed(true); setConsultationState(null); }, []);
  const consultation = firstConsultationEnabled && item.state !== 'revoked';
  const status = consultationState?.admissionVersion === item.version ? consultationState : null;
  const active = status?.status === 'active';
  const completed = item.episodeStatus === 'active' || ['active', 'withdrawn'].includes(status?.status);
  const progress = careChecklist(item, status, professional, consultationFailed ? 'error' : consultation ? 'loading' : 'disabled');
  const currentStep = progress.steps.findIndex(step => step.current);
  const interviewAction = !completed && progress.owner === (professional ? 'professional' : 'patient')
    && (currentStep === 1 || currentStep === 2);
  const documentsAvailable = professional ? active || (!completed && item.state === 'accepted'
    && ['submitted', 'documented', 'validated', 'correction_requested'].includes(item.reviewState)) : item.state !== 'proposed';
  const restoreState = useCallback(async () => {
    setAdmissionRevision(value => value + 1);
    await onChange();
  }, [onChange]);

  return <div className="space-y-5">
    <div className={journey}>
      <NextStep progress={progress} professional={professional}>
        {interviewAction && <CareInterview item={item} professional={professional} completed={completed}
          consultation={status} onChange={restoreState} panel="action" />}
        {!interviewAction && !completed && item.state === 'accepted' && (item.reviewState === 'correction_requested' || (!professional && item.latestSubmission > 1))
          && <CareInterview item={item} professional={professional} completed={completed} consultation={status}
            onChange={restoreState} panel="clarification" />}
        {consultation && <ConsultationDetail assignmentId={item.id} professional={professional} onRefresh={onChange}
          revision={admissionRevision} assignmentVersion={item.version} onDetail={onConsultation} onUnavailable={onConsultationError} contextual
          managementTarget={managementTarget} treatmentTermsTarget={treatmentTermsTarget} onOpenAgenda={onOpenAgenda} />}
      </NextStep>
      <JourneyProgress progress={progress} />
    </div>
    <section aria-label="Documentos y atención" className="space-y-3">
      <h3 className="text-lg font-bold text-slate-950">Documentos y atención</h3>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        {documentsAvailable && <CareDisclosure label="Ver entrevista inicial" icon={ClipboardList} keepMounted>
          {professional && active ? <ActiveDocument id={item.id} /> : <CareInterview item={item}
            professional={professional} completed={completed} consultation={status} onChange={restoreState} panel="documents" />}
        </CareDisclosure>}
        <CareDisclosure label="Invitación y vinculación" icon={UsersRound}>{agreementTerms}</CareDisclosure>
        <CareDisclosure label="Consultar consentimientos" icon={FileCheck2}>
          {(!professional || !completed) && <CareInterview item={item} professional={professional} completed={completed}
            consultation={status} onChange={restoreState} panel="terms" />}
          <div ref={setTreatmentTermsTarget} className="space-y-2" />
        </CareDisclosure>
        <CareDisclosure label="Gestionar atención" caption="Retirar consentimientos o terminar la vinculación" icon={Settings2}>
          {!completed && item.state !== 'revoked' && <CareInterview item={item} professional={professional} completed={completed}
            consultation={status} onChange={restoreState} panel="management" />}
          <div ref={setManagementTarget} />
          {!professional && firstConsultationEnabled && <TreatmentWithdrawals revision={admissionRevision + item.version}
            onWithdraw={restoreState} assignment={item} contextual />}
          {manageAgreement}
        </CareDisclosure>
      </div>
    </section>
  </div>;
}

export default function IndividualCare({ agreement, professional, manageAgreement, agreementTerms, onOpenAgenda, onChange: onOverviewChange }) {
  const admissions = useCareRead(
    professional && agreement.status !== 'completed' ? null : '/admissions/care-context', agreement.id
  );
  const [selection, setSelection] = useState('');
  const episodeLabel = useId();
  const reload = admissions.reload;
  const onChange = useCallback(async () => {
    await reload(true);
    void onOverviewChange?.();
  }, [reload, onOverviewChange]);
  useVisibleCareRefresh(() => { if (!admissions.loading) return reload(true); });
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

  const readyToStart = !invalid && agreement.status === 'completed' && (!episodes.length || selected && !selected.id);
  const unassignedProgress = readyToStart && careChecklist({}, null, professional, 'disabled');

  return <section aria-label="Atención individual" className="space-y-4">
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
    {unassignedProgress && <div className={journey}>
      <NextStep progress={unassignedProgress} professional={professional}>{canStart && start(selected || undefined)}</NextStep>
      <JourneyProgress progress={unassignedProgress} />
    </div>}
    {selected?.id ? <Episode key={selected.episodeId} item={selected} professional={professional} onChange={onChange}
      manageAgreement={manageAgreement} agreementTerms={agreementTerms} onOpenAgenda={onOpenAgenda} /> : <div className="grid items-start gap-3 sm:grid-cols-2">
      <CareDisclosure label="Invitación y vinculación" icon={UsersRound}>{agreementTerms}</CareDisclosure>
      {manageAgreement && <CareDisclosure label="Gestionar atención" caption="Terminar la vinculación" icon={Settings2}>{manageAgreement}</CareDisclosure>}
    </div>}
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
