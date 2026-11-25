import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';
import { SensitiveAction } from './CareDisclosure';
import AdmissionAssessment from './AdmissionAssessment';
import { useCareAction } from './useCareAction';
import { useCareRead } from './useCareRead';
import { useVisibleCareRefresh } from './useVisibleCareRefresh';

export const primaryButton = 'rounded-lg bg-indigo-700 px-4 py-2.5 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50';
export const secondaryButton = 'rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-50';
const area = 'block w-full rounded-lg border border-slate-300 p-2';
const draftMessage = {
  clean: 'Borrador guardado en privado.',
  dirty: 'Cambios por guardar.',
  saving: 'Guardando en privado…',
};
const differs = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return Array.from(keys).some(key => (a[key] ?? '') !== (b[key] ?? ''));
};
const complete = (template, answers) => template.questions.every(q => answers[q.id]?.trim());

function operationIdFor(receipt, operation, payload) {
  const key = JSON.stringify([operation, payload]);
  if (receipt.current?.key !== key) receipt.current = { key, id: crypto.randomUUID() };
  return receipt.current.id;
}

function InterviewTerms({ text }) {
  const sentences = Array.from(new Intl.Segmenter('es', { granularity: 'sentence' }).segment(text), entry => entry.segment);
  const paragraphs = [];
  for (let index = 0; index < sentences.length; index += 3) {
    paragraphs.push(sentences.slice(index, index + 3).join('').trim());
  }
  return <div className="space-y-3 rounded-lg border border-teal-100 bg-white p-3 text-sm leading-relaxed">
    {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
  </div>;
}

function Answers({ template, values, onChange, disabled }) {
  return template.questions.map(q => <label className="block space-y-1" key={q.id}>
    <span>{q.label}</span>
    <textarea className={area} maxLength={q.maxLength} value={values[q.id] ?? ''}
      disabled={disabled} onChange={event => onChange({ ...values, [q.id]: event.target.value })} />
  </label>);
}

function DocumentAnswers({ template, answers }) {
  return <dl className="space-y-3">{template.questions.map(q => <div key={q.id}>
    <dt className="font-semibold">{q.label}</dt>
    <dd className="whitespace-pre-wrap break-words">{answers[q.id]}</dd>
  </div>)}</dl>;
}

function SelfDraft({ detail, draft, onChange, onDenied }) {
  const [answers, setAnswers] = useState(draft.answers);
  const [snapshot, setSnapshot] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [serverCopy, setServerCopy] = useState(null);
  const lifecycle = useRef(null);
  const write = useRef(null);
  const submitLock = useRef(false);
  const receipt = useRef(null);
  const base = '/admissions/' + detail.id;
  const request = useCallback((path, options) => apiRequest(base + path, options), [base]);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => controller.abort();
  }, []);

  const save = useCallback(async (values, source) => {
    if (write.current || submitLock.current || lifecycle.current?.signal.aborted) return;
    const { signal } = lifecycle.current;
    setSaving(true);
    const payload = { expectedVersion: detail.version, expectedRevision: source.revision, answers: values };
    const attempt = async () => {
      const operationId = operationIdFor(receipt, 'save', payload);
      try {
        const { data } = await request('/save', {
          method: 'POST', signal, body: JSON.stringify({ ...payload, confirmed: true, operationId }),
        });
        if (signal.aborted) return null;
        const latest = { revision: data.revision, answers: values };
        setSnapshot(latest);
        receipt.current = null;
        return latest;
      } catch (failure) {
        if (signal.aborted) return null;
        if ([401, 403, 404].includes(failure.status)) onDenied();
        setError(failure.status === 409 ? 'El borrador cambió en otra sesión. Revisa lo que se guardó.' : failure.message);
        return null;
      }
    };
    write.current = attempt();
    try { return await write.current; }
    finally {
      write.current = null;
      if (!signal.aborted) setSaving(false);
    }
  }, [detail.version, onDenied, request]);

  useEffect(() => {
    if (!sending && !saving && !error && differs(answers, snapshot.answers)) {
      const timer = window.setTimeout(() => void save(answers, snapshot), 450);
      return () => window.clearTimeout(timer);
    }
  }, [answers, snapshot, sending, saving, error, save]);

  async function reloadDraft() {
    const { signal } = lifecycle.current;
    setSaving(true);
    try {
      const { data } = await request('/draft', { signal });
      if (signal.aborted) return;
      if (!differs(data.answers, answers)) {
        setSnapshot(data);
        setError('');
        setServerCopy(null);
      } else {
        setServerCopy(data);
      }
    } catch (failure) {
      if (!signal.aborted) {
        if ([401, 403, 404].includes(failure.status)) onDenied();
        setError(failure.message);
      }
    } finally {
      if (!signal.aborted) setSaving(false);
    }
  }

  async function send() {
    if (submitLock.current || !complete(detail.template, answers) || error) return;
    const { signal } = lifecycle.current;
    const values = answers;
    submitLock.current = true;
    setSending(true);
    try {
      const latest = write.current ? await write.current : snapshot;
      if (signal.aborted || !latest) return;
      const payload = { expectedVersion: detail.version, expectedRevision: latest.revision, answers: values };
      const operationId = operationIdFor(receipt, 'send', payload);
      await request('/care-send', {
        method: 'POST', signal, body: JSON.stringify({ ...payload, confirmed: true, operationId }),
      });
      if (signal.aborted) return;
      await onChange();
    } catch (failure) {
      if (signal.aborted) return;
      if ([401, 403, 404].includes(failure.status)) onDenied();
      setError(failure.status === 409 ? 'El borrador cambió en otra sesión. Revisa lo que se guardó.' : failure.message);
      await onChange();
    } finally {
      submitLock.current = false;
      if (!signal.aborted) setSending(false);
    }
  }

  function reconcile(keepLocal) {
    setSnapshot(serverCopy);
    if (!keepLocal) setAnswers(serverCopy.answers);
    setServerCopy(null);
    setError('');
    receipt.current = null;
  }

  const unsaved = differs(answers, snapshot.answers);
  useEffect(() => {
    if (!unsaved) return;
    const beforeLeaving = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeLeaving);
    return () => window.removeEventListener('beforeunload', beforeLeaving);
  }, [unsaved]);

  const stage = saving ? 'saving' : unsaved ? 'dirty' : 'clean';
  return <form className="space-y-3" autoComplete="off" onSubmit={event => { event.preventDefault(); void send(); }}>
    <p>Tu borrador es privado. El profesional solo verá las respuestas que envíes.</p>
    <Answers template={detail.template} values={answers} onChange={setAnswers} disabled={sending || Boolean(serverCopy)} />
    {!error && <p role="status">{sending ? 'Enviando tus respuestas…' : draftMessage[stage]}</p>}
    {error && <p role="alert">{error}</p>}
    {error && !serverCopy && <button type="button" className={secondaryButton} disabled={saving || sending} onClick={reloadDraft}>Revisar borrador guardado</button>}
    {serverCopy && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-label="Borrador guardado en otra sesión">
      <p>Revisa lo que está guardado antes de elegir qué respuestas conservar.</p>
      <DocumentAnswers template={detail.template} answers={serverCopy.answers} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} onClick={() => reconcile(false)}>Usar el borrador guardado</button>
        <button type="button" className={secondaryButton} onClick={() => reconcile(true)}>Conservar mis cambios</button>
      </div>
    </section>}
    <button className={primaryButton} disabled={sending || Boolean(error) || !complete(detail.template, answers)}>
      Enviar mis respuestas a {detail.professionalName}
    </button>
  </form>;
}

function DraftEditor({ detail, onChange, onDenied }) {
  const draft = useCareRead('/admissions/' + detail.id + '/draft');
  if (draft.loading && !draft.data) return <p role="status">Recuperando tu borrador…</p>;
  return draft.data
    ? <SelfDraft detail={detail} draft={draft.data} onChange={onChange} onDenied={onDenied} />
    : <><p role="alert">{draft.error}</p><button type="button" className={secondaryButton} onClick={() => draft.reload()}>Reintentar lectura del borrador</button></>;
}

function SavedDraft({ detail }) {
  const read = useCareRead('/admissions/' + detail.id + '/draft');
  if (!read.data) return <p role={read.error ? 'alert' : 'status'}>{read.error || 'Consultando borrador privado…'}</p>;
  return read.data.revision > 0
    ? <DocumentAnswers template={detail.template} answers={read.data.answers} />
    : <p>No hay respuestas guardadas en el borrador.</p>;
}

function InterviewHistory({ document, history, template, professionalName, directed }) {
  if (!document) return null;
  const formatDate = value => new Date(value).toLocaleString('es-MX');
  const date = item => formatDate(directed ? item.recordedAt : item.submittedAt);
  const body = item => directed ? item.declarations : item.answers;
  const attribution = directed ? 'Registrada por ' + professionalName : 'Respuestas del paciente';
  return <><p>{attribution} · {date(document)}</p>
    <DocumentAnswers template={template} answers={body(document)} />
    {history.length > 1 && <details className="space-y-2">
      <summary className="cursor-pointer font-semibold">Ver versiones anteriores</summary>
      {history.filter(item => item !== document).map(item => <details className="space-y-2" key={item.revision ?? item.number}>
        <summary className="cursor-pointer">{date(item)} · {attribution}</summary>
        <DocumentAnswers template={template} answers={body(item)} />
      </details>)}
    </details>}</>;
}

function Corrections({ detail, professional, document, directed, act, busy }) {
  const [message, setMessage] = useState('');
  const [changes, setChanges] = useState({});
  const [target, setTarget] = useState('');
  const itemId = document.revision ?? document.number;
  const pending = detail.requests?.find(item => !item.resolution);
  const path = '/admissions/' + detail.id;
  const write = (operation, input) => act(path + '/' + operation, { ...input, expectedVersion: detail.version });
  if (!directed && !professional) return null;
  if (!directed && !['submitted', 'validated'].includes(detail.reviewState)) return null;
  if (directed && ((professional && !pending) || (!professional && pending))) return null;
  const label = directed ? professional ? 'Responder a la rectificación' : 'Solicitar rectificación' : 'Pedir una aclaración';

  return <details className="space-y-2" open={professional && Boolean(pending)}>
    <summary className="cursor-pointer font-semibold">{label}</summary>
    {pending && <p className="whitespace-pre-wrap">Solicitud del paciente · {pending.reason}</p>}
    {directed && !professional && detail.documents.length > 1 && <label className="block">Documento que quieres corregir
      <select className={secondaryButton} value={target || itemId} onChange={event => setTarget(event.target.value)}>
        {detail.documents.map(entry => <option key={entry.revision} value={entry.revision}>{new Date(entry.recordedAt).toLocaleString('es-MX')}</option>)}
      </select>
    </label>}
    <label className="block">{professional && pending ? 'Explicación para el paciente' : 'Qué necesita aclararse'}
      <textarea className={area} maxLength={1000} value={message} onChange={event => setMessage(event.target.value)} />
    </label>
    {professional && pending ? <>
      <details className="space-y-2"><summary className="cursor-pointer">Incorporar las declaraciones corregidas</summary>
        <Answers template={detail.template} values={changes} onChange={setChanges} disabled={busy} />
        <button className={secondaryButton} disabled={busy || !message.trim() || !complete(detail.template, changes)}
          onClick={() => write('directed/resolve', { expectedDocumentRevision: itemId, requestId: pending.id, decision: 'accept', explanation: message, declarations: changes })}>Aceptar e incorporar la corrección</button>
      </details>
      <button className={secondaryButton} disabled={busy || !message.trim()}
        onClick={() => write('directed/resolve', { expectedDocumentRevision: itemId, requestId: pending.id, decision: 'reject', explanation: message })}>Rechazar la rectificación con explicación</button>
    </> : <button className={secondaryButton} disabled={busy || !message.trim()} onClick={() => directed
      ? write('directed/request', { documentRevision: Number(target || itemId), reason: message })
      : write('correct', { submission: itemId, episodeId: detail.episodeId, message })}>{label}</button>}
  </details>;
}

export default function CareInterview({ item, professional, completed, onChange, consultation, panel }) {
  const read = useCareRead('/admissions/' + item.id);
  const reload = read.reload;
  const [declarations, setDeclarations] = useState({});
  const [released, setReleased] = useState(null);
  const [showSavedDraft, setShowSavedDraft] = useState(false);
  const refresh = useCallback(async () => {
    await reload(true);
    await onChange();
  }, [reload, onChange]);
  const { act, busy, error } = useCareAction(refresh);
  useEffect(() => {
    if (item.version > (read.data?.version ?? 0) && !read.loading && !read.error && !busy) void reload(true);
  }, [item.version, read.data?.version, read.loading, read.error, busy, reload]);
  useVisibleCareRefresh(() => { if (!read.loading && !busy) return reload(true); }, panel !== 'action');
  const onDenied = useCallback(() => { void refresh(); }, [refresh]);
  const detail = read.data;
  if (!detail) return <div><p role={read.error ? 'alert' : 'status'}>{read.error || 'Cargando entrevista…'}</p>{read.error && <button type="button" className={secondaryButton} onClick={() => reload()}>Reintentar consulta de entrevista</button>}</div>;

  const directed = item.mode === 'directed';
  const documents = directed ? detail.documents : detail.submissions;
  const current = documents.at(-1);
  const path = '/admissions/' + detail.id;
  const allowed = !completed && detail.version >= item.version && detail.state !== 'revoked' && !detail.readOnly;
  const accepted = allowed && detail.state === 'accepted';
  const reviewing = professional && accepted && current && ['submitted','documented','validated'].includes(detail.reviewState)
    && consultation?.status === 'prepared' && !consultation?.sufficiencyId;
  const editing = !professional && !directed && accepted && ['awaiting_submission','correction_requested'].includes(detail.reviewState);
  const recording = professional && directed && accepted && !current;
  const write = (op, input) => act(path + '/' + op, { ...input, expectedVersion: detail.version });
  const withdrawalLabel = professional ? 'Cancelar entrevista' : 'Retirar consentimiento de entrevista';
  const feedback = error || read.error;

  const action = panel === 'action';
  const documentsPanel = panel === 'documents';
  const management = panel === 'management';
  return <section className="min-w-0 space-y-3" aria-label="Entrevista inicial">
    {!management && <h3 className="text-base font-semibold">{detail.template.title}</h3>}
    {feedback && <p role="alert">{feedback}</p>}
    {action && !professional && allowed && detail.state === 'proposed' && <>
      <InterviewTerms text={detail.consentText} />
      <button type="button" className={primaryButton} disabled={busy || read.loading}
        onClick={() => write('accept', { consentVersion: detail.consentVersion, consentHash: detail.consentHash })}>
        {directed ? 'Aceptar entrevista con mi profesional' : 'Aceptar y empezar'}
      </button>
    </>}
    {documentsPanel && !professional && !directed && detail.state === 'revoked' && <details onToggle={event => setShowSavedDraft(event.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold">Ver borrador privado guardado</summary>
      {showSavedDraft && <SavedDraft detail={detail} />}
    </details>}
    {action && editing && <DraftEditor key={detail.version} detail={detail} onChange={refresh} onDenied={onDenied} />}
    {action && recording && <form className="space-y-3" onSubmit={event => {
      event.preventDefault();
      void write('care-register', { declarations });
    }}>
      <p>Registra lo que el paciente te contó durante la entrevista. Podrá consultar este documento desde su cuenta.</p>
      <Answers template={detail.template} values={declarations} onChange={setDeclarations} disabled={busy} />
      <button className={primaryButton} disabled={busy || read.loading || !complete(detail.template, declarations)}>Registrar entrevista realizada</button>
    </form>}
    {(documentsPanel || (action && reviewing)) && <InterviewHistory document={current} history={documents} template={detail.template} professionalName={detail.professionalName}
      directed={directed} />}
    {action && reviewing && <>
      <p>Al confirmar, declaras que la entrevista que acabas de revisar está completa y es suficiente para la atención propuesta.</p>
      <button type="button" className={primaryButton} disabled={busy || read.loading} onClick={() => act(
        '/admissions/consultations/' + detail.id + '/care-review', {
          assignmentVersion: detail.version,
          documentVersion: directed ? current.revision : current.number,
          criteriaVersion: 'fictional-sufficiency-v1',
        })}>Confirmar entrevista para iniciar la atención</button>
    </>}
    {(action || documentsPanel) && detail.corrections?.length > 0 && <p className="whitespace-pre-wrap">Aclaración solicitada · {detail.corrections.at(-1).message}</p>}
    {documentsPanel && detail.requests?.length > 0 && <details className="space-y-2">
      <summary className="cursor-pointer font-semibold">Consultar rectificaciones</summary>
      {detail.requests.map(request => <div key={request.id}>
        <p className="whitespace-pre-wrap">{request.reason}</p>
        <p>{request.resolution?.explanation ?? 'Pendiente de respuesta del profesional.'}</p>
      </div>)}
    </details>}
    {(documentsPanel || (action && professional && (reviewing || detail.reviewState === 'correction_requested'))) && accepted && current && <Corrections key={current.revision ?? current.number} detail={detail} professional={professional} document={current}
      directed={directed} act={act} busy={busy || read.loading} />}
    {documentsPanel && professional && accepted && current && <details className="space-y-2" onToggle={e => setReleased(e.currentTarget.open ? detail.version : null)}>
      <summary className="cursor-pointer font-semibold">Valoración profesional privada</summary>
      {released === detail.version && <AdmissionAssessment key={detail.version} id={detail.id} mode={directed ? 'directed' : undefined}
        version={detail.version} documentRevision={detail.latestDocument} submission={detail.latestSubmission}
        reviewState={detail.reviewState} professionalName={detail.professionalName} onUnavailable={onDenied} />}
    </details>}
    {(management || panel === 'terms') && <>
      <h4 className="font-semibold">Entrevista inicial</h4>
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-indigo-800">Condiciones de entrevista</summary>
        <p className="mt-2">{detail.consentText}</p>
      </details>
      {management && allowed && (professional || accepted) && <SensitiveAction label={withdrawalLabel} disabled={busy || read.loading}
        description="Se cerrarán las acciones que dependen de la entrevista. Se conservarán los documentos ya incorporados."
        onConfirm={() => void write('revoke', {})} />}
    </>}
  </section>;
}

export function ActiveDocument({ id }) {
  const read = useCareRead('/admissions/consultations/' + id + '/interview');
  useVisibleCareRefresh(() => read.reload());
  if (!read.data) return <p role={read.error ? 'alert' : 'status'}>{read.error || 'Cargando entrevista…'}</p>;
  return <>
    <p>{read.data.authorName} · {new Date(read.data.recordedAt).toLocaleString('es-MX')}</p>
    <DocumentAnswers template={read.data.template} answers={read.data.answers} />
  </>;
}
