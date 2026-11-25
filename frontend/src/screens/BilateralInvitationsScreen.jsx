import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Check, ChevronRight, ClipboardList, Copy, FilePenLine,
  Plus, RefreshCw, Search, Trash2, UserRound, UserRoundPlus,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { CareDisclosure, SensitiveAction } from '../components/CareDisclosure';
import IndividualCare from '../components/IndividualCare';
import { TreatmentWithdrawals } from '../components/FirstConsultation';
import { useCareRead } from '../components/useCareRead';
import { useVisibleCareRefresh } from '../components/useVisibleCareRefresh';
import { firstConsultationEnabled, unifiedCareEnabled } from '../components/individualCareState';

const base = '/bilateral-invitations';
const formatDate = value => new Date(value).toLocaleString('es-MX', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});
const statusLabels = {
  received: 'Solicitud registrada', pending: 'Pendiente', accepted: 'Aceptada',
  declined: 'Rechazada', withdrawn: 'Retirada', expired: 'Vencida', invalidated: 'No disponible',
  completed: 'Acuerdo completado', unlinked: 'Acuerdo terminado',
};
const neutralReceipt = 'Este acuse confirma la recepción de tu solicitud. Por sí solo no confirma que exista una cuenta, que la persona cumpla los requisitos ni que se haya emitido o entregado una invitación.';
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';
const primary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-600 ${focus}`;
const secondary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 hover:bg-indigo-50 disabled:text-slate-500 ${focus}`;
const link = `inline-flex min-h-11 items-center gap-2 rounded-md px-2 py-2 font-semibold text-indigo-700 hover:bg-indigo-50 disabled:text-slate-500 ${focus}`;
const input = `mt-1.5 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 ${focus}`;
const card = 'min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6';
const content = 'space-y-5';
const title = 'break-words text-2xl font-black tracking-tight text-gray-900 md:text-3xl';
const heading = 'break-words text-xl font-bold text-slate-950';

function Avatar({ name }) {
  const initials = name.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase('es-MX');
  return <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-900">{initials}</span>;
}

function CheckField({ checked, onChange, disabled, children }) {
  return <label className="flex items-start gap-3 leading-relaxed">
    <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}
      className={`mt-1 h-5 w-5 shrink-0 accent-indigo-700 ${focus}`} />
    <span>{children}</span>
  </label>;
}

function Terms({ value }) {
  return <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 leading-relaxed">
    <h3 className="font-bold text-slate-950">Condiciones de vinculación</h3>
    <p>{value.conditionsText}</p>
    <p className="text-sm text-slate-600">Versión {value.conditionsVersion}</p>
  </div>;
}

function useBilateralAction() {
  const active = useRef(null);
  const retry = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => {
    active.current?.abort();
    active.current = null;
    retry.current = null;
  }, []);

  async function send(path, payload, onSuccess, onFailure) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    const key = JSON.stringify([path, payload]);
    const needsId = path !== '/preflight';
    try {
      if (needsId && retry.current?.key !== key) retry.current = { key, id: crypto.randomUUID() };
      const response = await apiRequest(base + path, {
        method: 'POST', signal: controller.signal,
        body: JSON.stringify(needsId ? { ...payload, operationId: retry.current.id } : payload),
      });
      if (controller.signal.aborted) return;
      retry.current = null;
      onSuccess(response.data);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure.status && failure.status < 500) retry.current = null;
      setError(failure.message);
      onFailure?.(failure);
    } finally {
      if (!controller.signal.aborted) {
        active.current = null;
        setBusy(false);
      }
    }
  }

  return { busy, error, send };
}

function ErrorMessage({ error }) {
  return error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">{error}</p>;
}

function CodeCard({ reference, directed = false }) {
  const [visible, setVisible] = useState(false);
  const [notice, setNotice] = useState('');
  const headingRef = useRef(null);
  useEffect(() => { if (directed) headingRef.current?.focus(); }, [directed]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(reference.reference);
      setNotice('Referencia copiada.');
    } catch {
      setVisible(true);
      setNotice('Selecciona la referencia para copiarla manualmente.');
    }
  }

  return <section className={card}>
    <div className="flex items-center gap-3">
      <span className="rounded-xl bg-indigo-100 p-3 text-indigo-700"><Copy size={22} aria-hidden="true" /></span>
      <div>
        <h2 ref={headingRef} tabIndex={-1} className={`${heading} ${focus}`}>{reference.reference ? 'Tu referencia está lista' : 'Referencia generada'}</h2>
        {directed && <p className="break-words text-slate-600">Para {reference.professionalName}</p>}
      </div>
    </div>
    {reference.reference ? <>
      <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
        {visible ? <label className="block text-sm font-semibold">
          {directed ? 'Mi referencia dirigida' : 'Mi referencia profesional'}
          <textarea autoComplete="off" spellCheck={false} readOnly rows={3} value={reference.reference} className={`${input} break-all font-mono text-sm`} />
        </label> : <span aria-hidden="true" className="tracking-widest">••••••••••••</span>}
        <button type="button" className={link} aria-expanded={visible} onClick={() => setVisible(!visible)}>
          {visible ? 'Ocultar referencia' : 'Mostrar referencia'}
        </button>
      </div>
      <button type="button" className={primary} onClick={copy}><Copy size={18} aria-hidden="true" /> Copiar mi referencia</button>
      {notice && <p role="status" className="text-sm text-slate-700">{notice}</p>}
    </> : <p>La referencia ya se generó. Genera una nueva si ya no tienes el código.</p>}
    <p className="text-sm text-slate-600">Vence el {formatDate(reference.expiresAt)}{directed ? ' · Un solo uso' : ''}.</p>
    <p>{directed
      ? 'Compártela solo con este profesional por un canal de confianza distinto del correo de la invitación. Una nueva referencia para este profesional reemplaza la anterior.'
      : 'Compártela solo con la persona que deseas invitar, por un canal de confianza. Le permite consultarte desde su cuenta durante 24 horas. Una nueva referencia profesional reemplaza la anterior.'}</p>
  </section>;
}

function ProposalForm({ onRegistered }) {
  const [attempt, setAttempt] = useState(0);
  const [terms, setTerms] = useState(null);
  const [termsError, setTermsError] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [declared, setDeclared] = useState(false);
  const [proposed, setProposed] = useState(false);
  const { busy, error, send } = useBilateralAction();

  useEffect(() => {
    const controller = new AbortController();
    apiRequest(base + '/terms', { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setTerms(data);
    }).catch(failure => {
      if (!controller.signal.aborted) setTermsError(failure.message);
    });
    return () => controller.abort();
  }, [attempt]);

  function clearConfirmations() {
    setDeclared(false);
    setProposed(false);
  }

  function reloadTerms() {
    clearConfirmations();
    setTerms(null);
    setTermsError('');
    setAttempt(value => value + 1);
  }

  function submit(event) {
    event.preventDefault();
    if (!terms || !declared || !proposed || !code.trim()) return;
    const { conditionsVersion, conditionsHash, declarationVersion } = terms;
    void send('', { email: email.trim(), recipientReference: code.trim(), conditionsVersion, conditionsHash, declarationVersion, declared, proposed },
      onRegistered, failure => { if (failure.status === 409) reloadTerms(); });
  }

  return <form autoComplete="off" className={card} onSubmit={submit}>
    <h2 className={heading}>Registra la solicitud</h2>
    <label className="block font-semibold">Código del paciente
      <input value={code} onChange={e => { setCode(e.target.value); clearConfirmations(); }} maxLength={128}
        autoCapitalize="none" spellCheck={false} required disabled={busy} className={input} />
    </label>
    <label className="block font-semibold">Correo conocido de la persona
      <input value={email} onChange={e => { setEmail(e.target.value); clearConfirmations(); }} type="email" maxLength={254}
        required disabled={busy} className={input} />
    </label>
    <p className="text-sm text-slate-600">La invitación, si se emite, vence a los 14 días. Un reenvío conserva el vencimiento original.</p>
    {terms ? <>
      <Terms value={terms} />
      <CheckField checked={declared} onChange={setDeclared} disabled={busy}>{terms.declarationText}</CheckField>
      <CheckField checked={proposed} onChange={setProposed} disabled={busy}>Propongo expresamente la vinculación con las condiciones y la versión mostradas.</CheckField>
    </> : termsError ? <>
      <ErrorMessage error={termsError} />
      <button type="button" className={secondary} onClick={reloadTerms}>Volver a consultar las condiciones</button>
    </> : <p role="status">Consultando las condiciones…</p>}
    <ErrorMessage error={error} />
    <button type="submit" className={primary} disabled={busy || !terms || !declared || !proposed || !code.trim()}>
      {busy ? 'Registrando…' : 'Registrar solicitud'}
    </button>
  </form>;
}

function ProfessionalInvite({ onRegistered }) {
  const [reference, setReference] = useState(null);
  const [registering, setRegistering] = useState(false);
  const { busy, error, send } = useBilateralAction();
  const formHeading = useRef(null);

  useEffect(() => { if (registering) formHeading.current?.focus(); }, [registering]);

  return <div className={content}>
    <p className="text-slate-600">Para personas adultas con cuenta, correo y teléfono verificados.</p>
    <div className={registering ? 'grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' : content}>
      <div className={content}>
        <section className={card}>
          <div className="flex items-start gap-4">
            <UserRoundPlus className="mt-0.5 shrink-0 text-indigo-700" size={26} aria-hidden="true" />
            <div>
              <h2 className={heading}>Comparte tu referencia privada</h2>
              <p className="mt-1 text-slate-600">La persona la usa para consultarte en «Mi atención». Si ya tiene tu código, puedes regresar cuando recibas el suyo.</p>
            </div>
          </div>
          <ErrorMessage error={error} />
          <button type="button" className={primary} disabled={busy}
            onClick={() => void send('/professional-reference', {}, setReference)}>
            {busy ? 'Generando…' : reference ? 'Generar una nueva referencia' : 'Generar mi referencia'}
          </button>
        </section>
        {reference && <CodeCard key={reference.reference || reference.expiresAt} reference={reference} />}
      </div>
      {registering ? <div ref={formHeading} tabIndex={-1} className={`rounded-xl ${focus}`}>
        <ProposalForm onRegistered={onRegistered} />
      </div> : <section className={card}>
        <div className="flex items-start gap-4">
          <FilePenLine className="mt-0.5 shrink-0 text-indigo-700" size={26} aria-hidden="true" />
          <div>
            <h2 className={heading}>Registra la solicitud</h2>
            <p className="mt-1 text-slate-600">Ten a mano el código dirigido y el correo conocido de la persona. La vinculación se completa cuando la persona acepta.</p>
          </div>
        </div>
        <button type="button" className={secondary} onClick={() => setRegistering(true)}>Ya recibí el código del paciente</button>
      </section>}
    </div>
  </div>;
}

function PatientReference() {
  const [code, setCode] = useState('');
  const [preflight, setPreflight] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reference, setReference] = useState(null);
  const { busy, error, send } = useBilateralAction();

  function consult(event) {
    event.preventDefault();
    if (!code.trim()) return;
    setConfirmed(false);
    setPreflight(null);
    void send('/preflight', { professionalReference: code.trim() }, setPreflight);
  }

  return <div className="max-w-2xl space-y-4">
    {reference ? <>
      <CodeCard reference={reference} directed />
      <p className="text-slate-600">Cuando recibas una invitación, vuelve a «Mi atención» para revisarla.</p>
      <button type="button" className={secondary} onClick={() => setReference(null)}>Preparar una nueva referencia</button>
    </> : <>
      <form className={card} autoComplete="off" onSubmit={consult}>
        <p>Usa el código privado que te compartió el profesional. Para continuar, necesitas tener tu correo y teléfono vigentes verificados.</p>
        <label className="block font-semibold">Referencia profesional recibida
          <input required maxLength={128} disabled={busy} autoCapitalize="none" spellCheck={false}
            className={input} value={code} onChange={e => { setCode(e.target.value); setPreflight(null); setConfirmed(false); }} />
        </label>
        <button className={secondary} type="submit" disabled={busy || !code.trim()}>Consultar profesional</button>
      </form>
      {preflight && <section className={card}>
        <div className="flex items-center gap-3 rounded-xl bg-indigo-50 p-4">
          <Avatar name={preflight.professionalName} />
          <div className="min-w-0">
            <p className="text-sm text-slate-600">Profesional destinatario</p>
            <h2 className={heading}>{preflight.professionalName}</h2>
          </div>
        </div>
        <CheckField checked={confirmed} onChange={setConfirmed} disabled={busy}>
          Confirmo que quiero generar mi referencia para {preflight.professionalName}.
        </CheckField>
        <p className="text-sm text-slate-600">Generar tu referencia no acepta una invitación.</p>
        <button type="button" className={primary} disabled={busy || !confirmed} onClick={() => void send('/recipient-reference',
          { professionalReference: code.trim(), confirmed }, result => { setReference(result); setCode(''); setPreflight(null); setConfirmed(false); })}>
          {busy ? 'Generando…' : 'Generar mi referencia dirigida'}
        </button>
      </section>}
    </>}
    <ErrorMessage error={error} />
  </div>;
}

const normalizeName = name => name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es-MX');

function pendingFirst(episodes, audience) {
  return episodes?.find(episode => episode.owner === audience)
    ?? episodes?.find(episode => episode.unavailable)
    ?? episodes?.find(episode => !episode.closed)
    ?? episodes?.[0];
}

function PatientCareCard({ name, stage, audience, children, linkStatus = 'Vinculación completada' }) {
  const waiting = stage?.owner === audience;
  const other = stage?.owner && !waiting;
  return <article className={`h-full rounded-2xl border p-4 sm:p-5 ${waiting ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-white'}`}>
    <div className="flex items-start gap-3">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-lg font-bold leading-tight text-slate-950">{name}</h3>
        <p className="mt-1 text-sm font-medium text-slate-700">{stage?.stage ?? linkStatus}</p>
        {other && <p className="mt-1 text-xs font-medium text-slate-600">{audience === 'professional' ? 'En espera del paciente' : 'En espera de tu profesional'}</p>}
        {waiting && <p className="mt-2 inline-block rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950">Te toca actuar</p>}
      </div>
    </div>
    {audience && <p className="mt-3 text-sm leading-relaxed text-slate-600">
      {!stage || stage.unavailable ? 'Próxima acción por confirmar.' : stage.next}
    </p>}
    {stage?.steps && !stage.closed && !stage.unavailable && <div className="mt-4 flex items-center gap-3">
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {stage.steps.map(step => <span key={step.label} className={`h-1.5 flex-1 rounded-full ${step.complete ? 'bg-teal-700' : step.current ? 'bg-amber-400' : 'bg-slate-200'}`} />)}
      </div>
      <span className="whitespace-nowrap text-xs text-slate-600">{stage.completed} de {stage.steps.length} etapas</span>
    </div>}
    <div className="mt-3 border-t border-slate-200 pt-2">{children}</div>
  </article>;
}

function LinkedPatients({ onAgreement, onLegacy, overview }) {
  const [query, setQuery] = useState('');
  const legacyLinks = useCareRead(overview ? null : base + '/linked-patients');
  useVisibleCareRefresh(() => {
    if (!legacyLinks.loading) return legacyLinks.reload(true);
  }, !overview);
  const { links: linked = legacyLinks, admissions, consultations } = overview ?? {};
  const refresh = () => overview ? overview.reload(false, true) : legacyLinks.reload();
  const patients = linked.data;
  const visible = (patients ?? []).filter(patient => normalizeName(patient.displayName).includes(normalizeName(query.trim())))
    .map(patient => ({
      ...patient, stage: overview && pendingFirst(overview.forAgreement(patient.agreementId), 'professional'),
    })).sort((left, right) => Number(right.stage?.owner === 'professional') - Number(left.stage?.owner === 'professional'));
  return <section aria-label="Pacientes vinculados" className={content}>
    <div className="flex items-end gap-2 sm:gap-3">
      <label className="min-w-0 flex-1 text-sm font-semibold">
        Buscar por nombre
        <span className="relative block">
          <Search size={19} aria-hidden="true" className="pointer-events-none absolute bottom-3.5 left-3 text-slate-500" />
          <input className={`${input} h-11 pl-10`} type="search" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} />
        </span>
      </label>
      <button type="button" className={`${secondary} h-11 shrink-0 px-3 text-sm`} aria-label="Actualizar pacientes"
        title="Actualizar pacientes" onClick={() => void refresh()}>
        <RefreshCw size={17} aria-hidden="true" /> <span className="hidden sm:inline">Actualizar pacientes</span>
      </button>
    </div>
    <ErrorMessage error={linked.error || admissions?.error || consultations?.error} />
    {linked.loading && !patients && <p role="status">Consultando pacientes vinculados…</p>}
    {patients && (visible.length ? <ul className="grid gap-3 sm:grid-cols-2">
      {visible.map(patient => <li key={patient.agreementId}>
        <PatientCareCard name={patient.displayName} stage={patient.stage} audience={overview ? 'professional' : null}>
          <button type="button" className={link} aria-label={`Abrir atención de ${patient.displayName}`}
            onClick={() => onAgreement(patient)}>Abrir ficha <ChevronRight size={16} aria-hidden="true" /></button>
        </PatientCareCard>
      </li>)}
    </ul> : <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-700" role="status">
      {patients.length ? 'No hay coincidencias para ese nombre.' : 'Todavía no hay pacientes vinculados disponibles.'}
    </p>)}
    <button type="button" className={link} onClick={onLegacy}>Expedientes existentes <ChevronRight size={16} aria-hidden="true" /></button>
  </section>;
}

function InvitationDetail({ item, status, acceptanceAvailable, action, terminal, onAccepted, onConflict }) {
  const [checked, setChecked] = useState(false);
  return <div className="max-w-2xl space-y-4">
    <section className={card}>
      <div className="flex items-center gap-3">
        <Avatar name={item.professionalName} />
        <div className="min-w-0">
          <h2 className={heading}>{item.professionalName}</h2>
          <p>Vinculación individual · {statusLabels[status]}</p>
          <p className="text-sm text-slate-600">Vence el {formatDate(item.expiresAt)}</p>
        </div>
      </div>
    </section>
    <section className={card}>
      <Terms value={item} />
      {status === 'pending' && <>
        <CheckField checked={checked} onChange={setChecked} disabled={action.busy || !acceptanceAvailable}>
          Acepto expresamente las condiciones y la versión mostradas.
        </CheckField>
        {!acceptanceAvailable && <p>La aceptación no está disponible en este momento. El vencimiento se conserva.</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" className={primary} disabled={action.busy || !checked || !acceptanceAvailable}
            onClick={() => void action.send('/' + item.id + '/accept', {
              expectedVersion: item.version, conditionsVersion: item.conditionsVersion, conditionsHash: item.conditionsHash, confirmed: checked,
            }, onAccepted, failure => {
              if (failure.status === 409) {
                setChecked(false);
                onConflict(item.id);
              }
            })}>Aceptar vinculación</button>
          <button type="button" className={secondary} disabled={action.busy} onClick={() => {
            if (window.confirm('¿Rechazar esta invitación? El rechazo cierra esta propuesta de forma definitiva.')) terminal(item, 'decline');
          }}>Rechazar invitación</button>
        </div>
      </>}
      <button type="button" className={link} disabled={action.busy} onClick={() => {
        if (window.confirm('¿Bloquear futuras invitaciones de este profesional?')) terminal(item, 'block');
      }}>Bloquear invitaciones de este profesional</button>
    </section>
  </div>;
}

function Invitations({
  professional, receivedInvitations, selectedAgreement, selectedInvitation, onInvitation, onAgreement, registered, showAdmission,
  overview, receiptsOnly = false, onOpenAgenda,
}) {
  const [data, setData] = useState(null);
  const [hasNotices, setHasNotices] = useState(false);
  const [readError, setReadError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const action = useBilateralAction();
  const patientOverview = !professional && !selectedAgreement && !selectedInvitation && showAdmission;
  const { admissions, consultations } = overview ?? {};
  const linked = useCareRead(professional && selectedAgreement ? base + '/linked-patients' : null);
  useVisibleCareRefresh(() => { if (!linked.loading) return linked.reload(true); }, Boolean(professional && selectedAgreement));

  function refreshLists() {
    setData(null);
    setHasNotices(false);
    setReadError('');
    setAttempt(value => value + 1);
  }

  function refresh() {
    refreshLists();
    receivedInvitations?.refresh();
    if (overview) void overview.reload(false, true);
    void linked.reload();
  }

  function revalidateDecision(id) {
    receivedInvitations.afterAction(id);
    refreshLists();
  }

  useEffect(() => {
    const controller = new AbortController();
    const names = professional ? receiptsOnly ? ['sent'] : ['sent', 'agreements']
      : patientOverview ? ['blocks'] : ['agreements', 'blocks'];
    Promise.all(names.map(name => apiRequest(base + '/' + name, { signal: controller.signal }))).then(
      ([first, second]) => {
        if (!controller.signal.aborted) setData(professional
          ? { items: first.data, agreements: second?.data ?? [] }
          : patientOverview ? { blocks: first.data } : { agreements: first.data, blocks: second.data });
      },
    ).catch(failure => {
      if (!controller.signal.aborted) setReadError(failure.message);
    });
    if (!professional) {
      apiRequest(base + '/notices', { signal: controller.signal }).then(({ data }) => {
        if (!controller.signal.aborted) setHasNotices(Array.isArray(data) && data.length > 0);
      }).catch(() => {
        if (!controller.signal.aborted) setHasNotices(false);
      });
    }
    return () => controller.abort();
  }, [professional, attempt, selectedAgreement, receiptsOnly, patientOverview]);

  function terminal(item, verb) {
    const version = ['withdraw', 'decline', 'unlink'].includes(verb) ? { expectedVersion: item.version } : {};
    setNotice('');
    void action.send('/' + item.id + '/' + verb, { ...version, confirmed: true }, () => {
      if (verb === 'decline') {
        receivedInvitations.afterAction(item.id, 'declined');
        setNotice('Invitación rechazada. Esta propuesta quedó cerrada.');
      } else if (verb === 'block') {
        receivedInvitations.afterAction();
        setNotice('Acción registrada.');
      } else {
        setNotice(verb === 'resend' ? 'Solicitud de reenvío registrada. El acuse no confirma que se haya emitido o entregado una invitación.' : 'Acción registrada.');
        refresh();
        return;
      }
      refreshLists();
    }, failure => {
      if (failure.status !== 409) return;
      if (verb === 'decline') revalidateDecision(item.id);
      else refresh();
    });
  }

  const items = professional ? data?.items : receivedInvitations.items;
  const actionable = receivedInvitations?.actionable ?? [];
  const pendingIds = new Set(actionable.map(item => item.id));
  const orderedItems = items && (professional ? items : [...actionable, ...items.filter(item => !pendingIds.has(item.id))]);
  const invitation = items?.find(item => item.id === selectedInvitation);
  const sourceAgreements = patientOverview ? overview?.links.data : data?.agreements;
  const agreements = sourceAgreements?.filter(item => !selectedAgreement || item.id === selectedAgreement.id);
  const currentAgreements = agreements?.filter(agreement => agreement.status === 'completed').map(agreement => {
    const episodes = overview?.forAgreement(agreement.id) ?? null;
    return { agreement, episodes, stage: pendingFirst(episodes, 'patient') };
  }).sort((left, right) => Number(right.stage?.owner === 'patient') - Number(left.stage?.owner === 'patient'));
  const taskCount = currentAgreements?.reduce((count, entry) =>
    count + (entry.episodes?.filter(episode => episode.owner === 'patient').length ?? 0), 0);
  const pendingKnown = showAdmission && Array.isArray(admissions?.data) && (!firstConsultationEnabled || Array.isArray(consultations?.data))
    && currentAgreements?.every(entry => entry.episodes?.every(episode => !episode.unavailable));
  const manageLink = agreement => agreement.status === 'completed' && <SensitiveAction label="Terminar acuerdo"
    description="La vinculación termina de inmediato. Los tratamientos activos o pausados conservan su procedimiento propio."
    disabled={action.busy} onConfirm={() => terminal(agreement, 'unlink')} />;
  const loadError = readError || linked.error || receivedInvitations?.error;
  const showOverview = !professional && !selectedAgreement && !selectedInvitation;
  const history = showOverview && orderedItems?.filter(item => !pendingIds.has(item.id));
  const visibleInvitations = showOverview ? items && actionable : orderedItems;
  const invitationGroups = professional
    ? [
        { label: 'Solicitudes vigentes', items: visibleInvitations?.filter(item => item.status === 'received') },
        { label: 'Historial de solicitudes', items: visibleInvitations?.filter(item => item.status !== 'received') },
      ]
    : [{ items: visibleInvitations }];
  return <div className={content}>
    {registered && <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
      <Check className="mt-0.5 shrink-0" aria-hidden="true" />
      <div><p className="font-bold">Solicitud registrada</p><p>{neutralReceipt}</p></div>
    </div>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-950">{notice}</p>}
    <ErrorMessage error={action.error || loadError} />
    {(!selectedAgreement || !showAdmission) && <button type="button" className={secondary} disabled={action.busy} onClick={refresh}>
      <RefreshCw size={17} aria-hidden="true" /> Actualizar bandeja
    </button>}
    {!selectedInvitation && !selectedAgreement && hasNotices && <p role="status" className="text-sm text-slate-600">Hay novedades en tu bandeja.</p>}
    {!items && !loadError && <p role="status">Consultando la bandeja…</p>}
    {selectedInvitation ? items && (invitation ? <InvitationDetail
      key={JSON.stringify([invitation.id, invitation.version, invitation.conditionsVersion, invitation.conditionsHash, pendingIds.has(invitation.id)])}
      item={invitation} status={receivedInvitations.displayStatus(invitation)} acceptanceAvailable={pendingIds.has(invitation.id)} action={action} terminal={terminal} onConflict={revalidateDecision} onAccepted={result => {
        receivedInvitations.afterAction(invitation.id, 'accepted');
        if (overview) void overview.reload(true, true);
        if (showAdmission && result.status === 'completed' && result.agreementId) {
          onAgreement({ id: result.agreementId });
          return;
        }
        setNotice(result.status === 'completed' ? 'Acuerdo bilateral completado.' : 'El acuerdo ya no está vigente.');
        refreshLists();
      }} /> : <p className={card}>La invitación ya no está disponible.</p>) : <>
      {showOverview && agreements && <section className={content} aria-label="Vinculaciones actuales">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={heading}>Tu atención</h2>
          {showAdmission && <span className={`rounded-full px-3 py-1 text-sm font-semibold ${taskCount ? 'bg-amber-100 text-amber-950' : 'bg-slate-100 text-slate-700'}`}>
            {taskCount ? `${taskCount} ${taskCount === 1 ? 'tarea pendiente' : 'tareas pendientes'}${pendingKnown ? '' : taskCount === 1 ? ' confirmada' : ' confirmadas'}`
              : pendingKnown ? 'Sin tareas pendientes' : 'Tareas por confirmar'}
          </span>}
        </div>
        {showAdmission && <ErrorMessage error={admissions?.error || consultations?.error} />}
        {!currentAgreements.length && <p className={card}>No tienes vinculaciones vigentes.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {currentAgreements.map(({ agreement, stage }) => <PatientCareCard key={agreement.id} name={agreement.professionalName}
            stage={stage} audience={showAdmission ? 'patient' : null} linkStatus={showAdmission ? 'Vinculación completada' : 'Acuerdo completado'}>
            <button type="button" className={link} onClick={() => onAgreement(agreement)}>Ver atención <ChevronRight size={16} aria-hidden="true" /></button>
          </PatientCareCard>)}
        </div>
      </section>}
      {!selectedAgreement && visibleInvitations && (professional || !showAdmission || visibleInvitations.length > 0) && <section aria-labelledby="bilateral-invitations-title" className={content}>
        <h2 id="bilateral-invitations-title" className={heading}>{professional ? 'Solicitudes de vinculación' : 'Invitaciones por responder'}</h2>
        {professional && <p className="text-sm text-slate-600">El reenvío solo aplica a una invitación existente y disponible. No crea una invitación ni revierte un rechazo. Para presentar una propuesta nueva deben cumplirse las condiciones y los plazos aplicables.</p>}
        {!visibleInvitations.length && <p className={card}>{professional ? 'Todavía no has registrado solicitudes.' : 'No tienes invitaciones disponibles.'}</p>}
        {invitationGroups.filter(group => group.items?.length).map(group => <div key={group.label || 'inbox'} className={content}>
          {group.label && <h3 className="font-semibold text-slate-700">{group.label}</h3>}
          {group.items.map(item => <article key={item.id} className={card}>
          <h3 className="break-words font-bold">{professional ? statusLabels[item.status] : item.professionalName}</h3>
          {professional ? <>
            <p className="text-slate-600">{neutralReceipt}</p>
            <dl className="grid gap-2 border-y border-slate-200 py-3 text-sm sm:grid-cols-[max-content_1fr]">
              <dt className="font-semibold">Registro</dt><dd>{formatDate(item.createdAt)}</dd>
              <dt className="font-semibold">Vigencia del acuse</dt><dd>Hasta el {formatDate(item.expiresAt)}</dd>
            </dl>
            {item.status === 'received' && <div className="flex flex-wrap gap-2">
              <button type="button" className={secondary} disabled={action.busy} onClick={() => terminal(item, 'resend')}>
                <RefreshCw size={16} aria-hidden="true" /> Solicitar reenvío
              </button>
              <button type="button" className={secondary} disabled={action.busy} onClick={() => {
                if (window.confirm('¿Retirar esta solicitud de vinculación?')) terminal(item, 'withdraw');
              }}><Trash2 size={17} aria-hidden="true" /> Retirar solicitud</button>
            </div>}
          </> : <div className="flex flex-wrap items-center justify-between gap-2">
            <p>{pendingIds.has(item.id) ? 'Pendiente de respuesta' : item.status === 'pending' ? 'No disponible para responder' : statusLabels[item.status]} · Vence el {formatDate(item.expiresAt)}</p>
            <button type="button" className={link} onClick={() => onInvitation(item.id)}>Ver invitación <ChevronRight size={16} aria-hidden="true" /></button>
          </div>}
          </article>)}
        </div>)}
      </section>}
      {showOverview && history?.some(item => item.status === 'accepted') && !agreements?.length && !readError &&
        <p role="status">Actualizando los acuerdos de las invitaciones aceptadas…</p>}
      {selectedAgreement && agreements && !agreements.length && <p role="status">El acuerdo ya no está disponible.</p>}
      {selectedAgreement && (!professional || !linked.loading || linked.data) && agreements?.map(agreement => {
        const name = professional ? linked.data?.find(item => item.agreementId === agreement.id)?.displayName : agreement.professionalName;
        const manageAgreement = manageLink(agreement);
        const terms = showAdmission
          ? <><p className="text-sm font-medium text-slate-700">Invitación aceptada el {formatDate(agreement.completedAt)}</p><Terms value={agreement} /></>
          : <details><summary className={`cursor-pointer font-semibold text-indigo-700 ${focus}`}>Consultar las condiciones acordadas</summary>
            <div className="mt-3"><Terms value={agreement} /></div>
          </details>;
        return <article key={agreement.id} className="space-y-5">
          <header className="flex min-w-0 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
            {name && <Avatar name={name} />}
            <div className="min-w-0">
              <p className="text-sm font-medium text-teal-800">{professional ? 'Ficha del paciente' : 'Mi atención'}</p>
              <h2 className={title}>{name || statusLabels[agreement.status]}</h2>
              <p className="mt-1 text-sm text-slate-600">{agreement.status === 'completed' ? 'Vinculación completada' : 'Vinculación terminada'} · {formatDate(agreement.completedAt)}</p>
            </div>
          </header>
          {showAdmission ? <IndividualCare key={agreement.id} agreement={agreement} professional={professional}
            manageAgreement={manageAgreement} agreementTerms={terms} onOpenAgenda={onOpenAgenda} onChange={overview?.refreshIfStale} /> : <>
            {terms}
            {manageAgreement && <CareDisclosure label="Gestionar vinculación">{manageAgreement}</CareDisclosure>}
          </>}
        </article>;
      })}
      {patientOverview && firstConsultationEnabled && <CareDisclosure label="Retirar un consentimiento de tratamiento">
        <TreatmentWithdrawals revision={attempt} onWithdraw={refresh} contextual />
      </CareDisclosure>}
      {showOverview && ((history?.length ?? 0) > 0 || agreements?.some(agreement => agreement.status !== 'completed')) &&
        <details className={card}>
          <summary className={`cursor-pointer font-bold ${focus}`}>Historial</summary>
          {agreements?.filter(agreement => agreement.status !== 'completed').map(agreement => <div key={agreement.id} className="flex flex-wrap items-center justify-between gap-2">
            <h3>{agreement.professionalName} · {statusLabels[agreement.status]} · {formatDate(agreement.unlinkedAt || agreement.completedAt)}</h3>
            <button type="button" className={link} onClick={() => onAgreement(agreement)}>Consultar vinculación</button>
          </div>)}
          {history?.length > 0 && <ul className="space-y-2">
            {history.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
              <p>{item.professionalName} · {statusLabels[receivedInvitations.displayStatus(item)]} · Vence el {formatDate(item.expiresAt)}</p>
              <button type="button" className={link} onClick={() => onInvitation(item.id)}>{item.status === 'accepted' ? 'Ver evidencia de invitación' : 'Ver invitación'}</button>
            </li>)}
          </ul>}
        </details>}
      {professional && !selectedAgreement && !receiptsOnly && agreements && <>
      <h2 className={heading}>{selectedAgreement ? 'Acuerdo de vinculación' : 'Acuerdos de vinculación'}</h2>
      {!agreements.length && <p className={card}>No hay acuerdos para mostrar.</p>}
      {agreements.map(agreement => <article key={agreement.id} className={card}>
        <h3 className="break-words font-bold">{professional ? statusLabels[agreement.status] : `${agreement.professionalName} · ${statusLabels[agreement.status]}`}</h3>
        <p>Completado el {formatDate(agreement.completedAt)}.</p>
        <details>
          <summary className={`cursor-pointer rounded-md font-semibold text-indigo-700 ${focus}`}>Consultar las condiciones acordadas</summary>
          <div className="mt-3"><Terms value={agreement} /></div>
        </details>
        {showAdmission && agreement.status === 'completed' &&
          <button type="button" className={link} onClick={() => onAgreement(agreement)}>Ver atención del acuerdo</button>}
        {agreement.status === 'unlinked' && <p>La admisión dependiente de este acuerdo ya no puede avanzar.</p>}
        {agreement.status === 'completed' && <CareDisclosure label="Gestionar vinculación">
          {manageLink(agreement)}
        </CareDisclosure>}
      </article>)}
      </>}
      {!professional && data?.blocks.length > 0 && <section className={card}>
        <h2 className={heading}>Profesionales bloqueados</h2>
        <p>Desbloquear permite nuevas invitaciones. Las anteriores conservan su estado.</p>
        {data.blocks.map(block => <div key={block.id} className="flex flex-wrap items-center justify-between gap-2">
          <span className="break-words">{block.professionalName}</span>
          <button type="button" className={secondary} disabled={action.busy} onClick={() => terminal(block, 'unblock')}>Desbloquear</button>
        </div>)}
      </section>}
    </>}
  </div>;
}

export default function BilateralInvitationsScreen({ currentUser, navigate, showAdmission, receivedInvitations, careOverview, onOpenAgenda }) {
  const professional = currentUser.role === 'psychologist';
  const [page, setPage] = useState(professional ? 'linked' : 'invitations');
  const [selection, setSelection] = useState(null);
  const [registered, setRegistered] = useState(false);
  const headingRef = useRef(null);
  const focusHeading = useRef(!professional);
  const refreshReceived = receivedInvitations?.refresh;

  function open(target, id = null) {
    setSelection(id);
    if (page !== target) focusHeading.current = true;
    setPage(target);
  }

  useEffect(() => {
    if (focusHeading.current) headingRef.current?.focus();
    focusHeading.current = false;
  }, [page]);

  useEffect(() => {
    if (page === 'invitations') refreshReceived?.();
  }, [page, refreshReceived]);

  const subpage = ['invite', 'reference', 'detail', 'agreement'].includes(page);
  const home = professional ? 'Mis pacientes' : 'Mi atención';
  const unified = showAdmission && unifiedCareEnabled;
  const pageTitle = {
    invite: 'Invitar paciente', reference: 'Generar mi referencia',
    detail: 'Invitación de vinculación', agreement: showAdmission && unifiedCareEnabled ? 'Ficha de atención' : 'Acuerdo de vinculación',
  }[page] || home;

  return <section aria-labelledby="bilateral-title" className={`space-y-5 text-slate-700 sm:space-y-6 ${subpage ? 'mx-auto max-w-5xl' : ''}`}>
    {subpage && <div>
      {pageTitle === 'Ficha de atención' && <h1 id="bilateral-title" ref={headingRef} tabIndex={-1} className="sr-only">{pageTitle}</h1>}
      <button type="button" className={link} onClick={() => open(professional ? 'linked' : 'invitations')}>
        <ArrowLeft size={18} aria-hidden="true" /> Volver a {home}
      </button>
    </div>}
    {pageTitle !== 'Ficha de atención' && <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 id="bilateral-title" ref={headingRef} tabIndex={-1} className={`${title} rounded-md ${focus}`}>{pageTitle}</h1>
      {!subpage && (professional
        ? <button type="button" className={primary} onClick={() => { setRegistered(false); open('invite'); }}><Plus size={20} aria-hidden="true" /> Invitar paciente</button>
        : <button type="button" className={primary} onClick={() => open('reference')}><UserRoundPlus size={20} aria-hidden="true" /> Generar mi referencia</button>)}
    </header>}
    {professional && !subpage && !unified && <nav aria-label="Secciones de Mis pacientes" className="flex flex-wrap gap-2 border-b border-slate-300">
      {[['linked', 'Pacientes vinculados'], ['invitations', 'Invitaciones']].map(([target, label]) =>
        <button key={target} type="button" aria-current={page === target ? 'page' : undefined}
          className={`min-h-11 rounded-t-md border-b-2 px-3 font-semibold ${focus} ${page === target ? 'border-indigo-700 text-indigo-700' : 'border-transparent text-slate-600 hover:text-indigo-700'}`}
          onClick={() => open(target)}>{label}</button>)}
    </nav>}
    {!professional && page === 'invitations' && <div className="flex flex-wrap gap-2">
      {showAdmission && !unifiedCareEnabled && <button type="button" className={secondary} onClick={() => navigate('admissions')}>
        <ClipboardList size={18} aria-hidden="true" /> Admisión
      </button>}
      <button type="button" className={secondary} onClick={() => navigate('legacy-patients')}><UserRound size={18} aria-hidden="true" /> Mi seguimiento</button>
    </div>}
    {page === 'linked' && <>
      <LinkedPatients overview={unified ? careOverview : null} onAgreement={agreement => open('agreement', { id: agreement.agreementId })} onLegacy={() => navigate('legacy-patients')} />
      {unified && <details open={registered} className={card}>
        <summary className={`cursor-pointer font-semibold ${focus}`}>Solicitudes y acuses de invitación</summary>
        <Invitations professional showAdmission={false} receiptsOnly registered={registered} />
      </details>}
    </>}
    {page === 'invite' && <ProfessionalInvite onRegistered={() => { setRegistered(true); open(unified ? 'linked' : 'invitations'); }} />}
    {page === 'reference' && <PatientReference />}
    {['invitations', 'detail', 'agreement'].includes(page) && <Invitations key={page + ':' + (selection?.id ?? selection ?? '')}
      professional={professional} showAdmission={unified} overview={unified ? careOverview : null} onOpenAgenda={onOpenAgenda} receivedInvitations={receivedInvitations} registered={registered && page === 'invitations'}
      selectedAgreement={page === 'agreement' ? selection : null} selectedInvitation={page === 'detail' ? selection : null}
      onInvitation={id => open('detail', id)} onAgreement={agreement => open('agreement', agreement)} />}
    <p className="text-sm text-slate-600">Entorno de ensayo con cuentas ficticias y entrega simulada.</p>
  </section>;
}
