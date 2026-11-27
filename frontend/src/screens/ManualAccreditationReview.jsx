import {useEffect,useRef,useState} from 'react';
import {ClipboardCheck, ExternalLink} from 'lucide-react';
import AccreditationDetails from './AccreditationDetails';

const checks = [
  ['license','Existencia de la cédula'],
  ['holder','Correspondencia con la persona titular'],
  ['title','Licenciatura en Psicología'],
  ['institution','Institución que expidió el título'],
  ['identity','Identidad cotejada con la cuenta'],
];
const results = [['pending','Sin comprobar'],['matches','Coincide'],['discrepancy','Discrepancia comprobada'],['unavailable','No se pudo comprobar']];
const outcomes = {
  approved:'Aprobar acreditación', inconclusive:'Dejar inconclusa', returned:'Devolver para corrección',
  rejected:'Rechazar solicitud', revalidation_requested:'Solicitar revalidación', revalidated:'Confirmar revalidación',
};
const effects = {
  approved:'Esta versión quedará acreditada por 12 meses desde la fecha de comprobación. La aprobación de cuenta se gestiona por separado.',
  inconclusive:'La misma versión seguirá en revisión. La persona recibirá tu mensaje.',
  returned:'Esta revisión se cerrará. La persona podrá enviar una nueva versión corregida.',
  rejected:'Esta revisión se cerrará con el motivo indicado. Una acreditación anterior vigente se conserva.',
  revalidation_requested:'La acreditación quedará pendiente de revalidación. La decisión y la versión anteriores seguirán en el historial.',
  revalidated:'Se renovará la vigencia de la misma versión con la evidencia registrada aquí.',
};
const input = 'mt-1 block min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-indigo-700';
const secondary = 'min-h-11 rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-indigo-700 disabled:opacity-60';

export default function ManualAccreditationReview({review,onResolve,busy}) {
  const revalidation=review.mode==='revalidation';
  const available = Object.keys(outcomes).filter(key => revalidation === key.startsWith('revalidat'));
  const [outcome,setOutcome]=useState('');
  const [affectsPrior,setAffectsPrior]=useState(false);
  const showPrior=outcome==='rejected'&&review.approved;
  const [confirmation,setConfirmation]=useState(null);
  const confirmTitle=useRef(null);
  const confirming=Boolean(confirmation?.outcome);
  useEffect(()=>{if(confirming)confirmTitle.current?.focus();},[confirming]);
  const matches=outcome=>outcome==='approved'||outcome==='revalidated';
  const handleSubmit=event=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const outcome=form.get('outcome');
    const evidence=Object.fromEntries(['checkedOn','reference','identityMethod',...checks.map(([key])=>key)].map(key=>[key,form.get(key)]));
    if(matches(outcome)&&(evidence.identityMethod!=='simulated_official_id'||checks.some(([key])=>evidence[key]!=='matches'))){
      setConfirmation({error:'Marca cada comprobación que coincida y registra el método de cotejo antes de aprobar.'});
      return;
    }
    const check=form.get('priorCheck');
    const priorImpact=showPrior&&affectsPrior ? {
      version:review.approved.version,
      message:form.get('priorReason'),
      evidence:{
        ...Object.fromEntries(checks.map(([key])=>[key,key===check?'discrepancy':'pending'])),
        checkedOn:form.get('priorDate'), reference:form.get('priorReference'),
        identityMethod:check==='identity'?'simulated_official_id':'pending',
      },
    } : undefined;
    setConfirmation({priorImpact,rowVersion:review.rowVersion,outcome,message:form.get('message'),internalNote:form.get('internalNote'),evidence});
  };
  return <article className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <header className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-indigo-800"><ClipboardCheck size={18} aria-hidden="true"/>{revalidation?'Revalidación':'Solicitud de acreditación'}</p>
      <h2 className="break-words text-xl font-bold text-slate-900">{review.pending.professionalName}</h2>
      <p className="text-sm text-slate-700">Nombre de la cuenta <strong>{review.registeredName}</strong> · Versión {review.pending.version}</p>
      <p className="text-sm text-slate-700">Cuenta {review.accountStatus==='active'?'activa':'pendiente de aprobación'}</p>
    </header>
    <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-bold text-slate-900">Datos presentados</h3>
      <AccreditationDetails value={review.pending}/>
      {review.validity?.validUntil&&<p className="text-sm text-slate-700">Revalidación a partir del {review.validity.validUntil}.</p>}
    </section>
    <form onSubmit={handleSubmit} className="space-y-5">
      <fieldset disabled={busy||Boolean(confirmation?.outcome)} className="space-y-5">
        <div className="space-y-2">
          <h3 className="font-bold text-slate-900">Comprobaciones manuales</h3>
          <p className="text-sm text-slate-700">Usa exclusivamente datos ficticios. Simula la consulta del registro y el cotejo externo de una identificación oficial. Registra únicamente resultados y referencias de prueba.</p>
          <a className="inline-flex min-h-10 items-center gap-2 rounded text-sm font-semibold text-indigo-800 underline focus-visible:outline-indigo-700"
            href="https://apiaccess.gob.mx/informacion/consultar-cedula-profesional" target="_blank" rel="noreferrer">
            Consulta oficial de cédulas (abre otra pestaña) <ExternalLink size={14} aria-hidden="true"/>
          </a>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-800">Fecha de comprobación<input name="checkedOn" type="date" required className={input} defaultValue={new Intl.DateTimeFormat('sv-SE').format(new Date())}/></label>
          <label className="text-sm font-medium text-slate-800">Referencia ficticia (opcional)<input name="reference" className={input} maxLength={160}/></label>
          {checks.map(([key,label])=><div key={key}>
            <label htmlFor={`manual-check-${key}`} className="text-sm font-medium text-slate-800">{label}</label>
            <select id={`manual-check-${key}`} name={key} className={input}>{results.map(([value,name])=><option key={value} value={value}>{name}</option>)}</select>
          </div>)}
          <div><label htmlFor="manual-check-method" className="text-sm font-medium text-slate-800">Método de cotejo de identidad</label>
          <select id="manual-check-method" className={input} name="identityMethod">
            <option value="pending">Pendiente</option><option value="simulated_official_id">Identificación oficial (simulación)</option>
          </select></div>
        </div>
        <div className="space-y-3 border-t border-slate-200 pt-4">
          <h3 className="font-bold text-slate-900">Resolución</h3>
          <div><label htmlFor="manual-review-outcome" className="block text-sm font-medium text-slate-800">Resultado</label>
          <select id="manual-review-outcome" name="outcome" className={input} required value={outcome} onChange={event=>{setOutcome(event.target.value);setAffectsPrior(false);}}>
            <option value="" disabled>Selecciona el resultado</option>
            {available.map(value=><option key={value} value={value}>{outcomes[value]}</option>)}
          </select></div>
          <label className="block text-sm font-medium text-slate-800">Mensaje para el profesional
            <textarea name="message" required maxLength={2000} rows={3} className={input} aria-describedby="accreditation-message-help"/>
          </label>
          <p id="accreditation-message-help" className="text-sm text-slate-600">Explica el resultado y el siguiente paso. Evita datos de otras cuentas.</p>
          {showPrior&&<section className="space-y-3 rounded-xl border border-slate-200 p-4">
            <h4 className="font-semibold">Acreditación anterior · versión {review.approved.version}</h4>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={affectsPrior} onChange={event=>setAffectsPrior(event.target.checked)}/>
              La discrepancia comprobada también afecta a esta versión
            </label>
            {affectsPrior&&<>
              <AccreditationDetails value={review.approved}/>
              <label className="block text-sm">Comprobación contradictoria de la versión anterior
                <select name="priorCheck" className={input} required defaultValue="">
                  <option value="" disabled>Selecciona qué comprobaste</option>
                  {checks.map(([key,label])=><option key={key} value={key}>{label}{key==='identity'?' (identificación oficial simulada)':''}</option>)}
                </select>
              </label>
              <label className="block text-sm">Fecha del cotejo anterior<input type="date" name="priorDate" required className={input}/></label>
              <label className="block text-sm">Referencia ficticia del cotejo anterior<input name="priorReference" required maxLength={160} className={input}/></label>
              <label className="block text-sm">Motivo de revalidación para el profesional
                <textarea name="priorReason" required maxLength={2000} className={input} aria-describedby="prior-reason-help"/>
              </label>
              <p id="prior-reason-help" className="text-sm text-slate-600">Explica qué hallazgo afecta a la versión aprobada y qué debe hacer el profesional.</p>
            </>}
          </section>}
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold">Agregar observación interna</summary>
            <label className="mt-2 block text-sm font-medium">Observación reservada<textarea name="internalNote" maxLength={4000} className={input}/></label>
          </details>
          <button className="min-h-11 rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white hover:bg-indigo-800 focus-visible:outline-indigo-700 disabled:opacity-60">Revisar resolución</button>
        </div>
      </fieldset>
      {confirmation?.error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900">{confirmation.error}</p>}
      {confirmation?.outcome&&<div aria-live="polite" className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <h3 tabIndex={-1} ref={confirmTitle} className="font-bold text-indigo-950">{outcomes[confirmation.outcome]}</h3>
        <p className="text-sm text-indigo-950">{confirmation.priorImpact
          ? `La propuesta se rechazará y la versión ${confirmation.priorImpact.version} quedará pendiente de revalidación. Se retirarán las preferencias de publicación y de recepción de solicitudes. El profesional recibirá ambos mensajes.`
          : effects[confirmation.outcome]}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={()=>onResolve(confirmation)}
            className={'min-h-11 rounded-lg px-4 py-2 font-semibold text-white focus-visible:outline-indigo-700 disabled:opacity-60 '+(confirmation.outcome==='rejected'?'bg-rose-700':'bg-indigo-700')}>
            {busy?'Guardando…':'Confirmar resolución'}
          </button>
          <button type="button" disabled={busy} onClick={()=>setConfirmation(null)} className={secondary}>Volver a editar</button>
        </div>
      </div>}
    </form>
  </article>;
}
