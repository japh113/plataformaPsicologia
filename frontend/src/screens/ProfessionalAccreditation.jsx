import {useEffect, useRef, useState} from 'react';
import {Check, ChevronRight, ClipboardCheck, ShieldCheck} from 'lucide-react';
import AccreditationDetails from './AccreditationDetails';
import {accreditationFields as fields} from './accreditationFields';
import {getAccreditation, submitAccreditation} from '../api/professional';

const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 font-semibold text-white hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-60';
const secondary = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-700';
const eventLabels = {approved:'Acreditación aprobada', inconclusive:'Comprobación pendiente', returned:'Se solicitó una corrección',
  rejected:'Solicitud rechazada', revalidation_requested:'Revalidación requerida', revalidated:'Acreditación revalidada'};

function describeStatus(data) {
  if (data.pending) {
    return data.events[0]?.version === data.pending.version && data.events[0]?.outcome === 'inconclusive'
      ? ['Comprobación pendiente', 'El equipo necesita completar la revisión. Aquí recibirás cualquier indicación.']
      : ['En revisión', 'El equipo revisará los datos que presentaste y te comunicará el resultado aquí.'];
  }
  if (data.validity?.current && data.accountStatus === 'pending_review') {
    return ['Acreditación aprobada', 'Falta la aprobación de tu cuenta. Vuelve a iniciar sesión cuando el equipo te confirme la activación.'];
  }
  if (data.validity?.requiresReview) return ['Revalidación requerida','Consulta el mensaje del equipo. Si cambió un dato, presenta una versión nueva.'];
  if (data.approved && !data.validity?.current) return ['Vigencia vencida','El equipo debe revisar la acreditación. Presenta una versión nueva si cambió tu credencial.'];
  if (data.events[0]?.outcome === 'returned') return ['Corrige tu solicitud','Consulta el mensaje y presenta los datos corregidos.'];
  if (data.events[0]?.outcome === 'rejected') return ['Solicitud rechazada','Consulta el motivo antes de presentar una nueva solicitud.'];
  if (data.validity?.current) return ['Acreditación vigente','Puedes presentar una versión nueva si cambian tus credenciales.'];
  return ['Prepara tu solicitud','Ten a mano tu cédula y los datos de tu licenciatura. El equipo cotejará tu identidad fuera de la plataforma.'];
}

export default function ProfessionalAccreditation({token,onChange}) {
  const [data,setData]=useState(null),[draft,setDraft]=useState(null),[confirm,setConfirm]=useState(false);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const [load,setLoad]=useState(0);
  const title=useRef(null);
  const formTitle=useRef(null);
  const focusAfterLoad=useRef(false);
  const editing=Boolean(draft);
  useEffect(()=>{
    const controller=new AbortController();
    getAccreditation(token,controller.signal).then(value=>{
      if(!controller.signal.aborted) setData(value);
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[token,load]);
  useEffect(()=>{
    if(data && focusAfterLoad.current){title.current?.focus();focusAfterLoad.current=false;}
  },[data,confirm]);
  useEffect(()=>{
    if (editing) formTitle.current?.focus();
  },[editing,confirm]);
  const reload=()=>{setError('');setLoad(value=>value+1);};
  const submit=async()=>{
    setBusy(true);setError('');
    try{
      await submitAccreditation(token,{rowVersion:data.rowVersion,...draft});
      onChange?.();
      setNotice('Solicitud enviada para revisión.');setDraft(null);setConfirm(false);
      focusAfterLoad.current=true;
      reload();
    }catch(e){
      setError(e.message);
      if(e.status===409){setConfirm(false);setLoad(value=>value+1);}
    }finally{setBusy(false);}
  };
  const [status,explanation]=data?describeStatus(data):[];
  const Heading=token?'h1':'h2';
  const Subheading=token?'h2':'h3';
  return <section aria-labelledby="accreditation-heading" className="space-y-5">
    <header className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-indigo-800"><ShieldCheck aria-hidden="true" size={18}/> Perfil profesional</p>
      <Heading id="accreditation-heading" className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Mi acreditación</Heading>
      <p className="text-sm text-slate-600">Este recorrido usa datos y comprobaciones ficticios.</p>
    </header>
    {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">{notice}</p>}
    {error&&<div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-4">
      <p role="alert" className="text-rose-900">{error}</p>
      <button type="button" className={secondary} onClick={reload}>Actualizar estado</button>
    </div>}
    {!data&&!error&&<p role="status" className="text-slate-600">Consultando tu acreditación…</p>}
    {data&&<>
      <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 sm:p-5">
        <Subheading tabIndex={-1} ref={title} className="text-lg font-bold text-indigo-950">{status}</Subheading>
        <p className="text-sm text-indigo-950">{explanation}</p>
        {token&&<ol className="grid gap-2 text-sm font-medium text-indigo-950 sm:grid-cols-3">
          <li className="flex items-center gap-2"><Check size={16} aria-hidden="true"/> Registro completado</li>
          <li aria-current={!data.approved?'step':undefined} className="flex items-center gap-2">
            {data.approved?<Check size={16} aria-hidden="true"/>:<ChevronRight size={16} aria-hidden="true"/>} Acreditación {data.approved?'resuelta':'en trámite'}
          </li>
          <li aria-current={data.approved?'step':undefined} className="flex items-center gap-2"><ChevronRight size={16} aria-hidden="true"/> Aprobación de cuenta pendiente</li>
        </ol>}
      </div>
      {data.pending&&<section className="space-y-3 rounded-2xl border border-slate-200 p-4 sm:p-5">
        <Subheading className="font-bold text-slate-900">Datos enviados · versión {data.pending.version}</Subheading>
        <AccreditationDetails value={data.pending}/>
      </section>}
      {data.approved&&<section className="space-y-3 rounded-2xl border border-slate-200 p-4 sm:p-5">
        <Subheading className="font-bold text-slate-900">Credencial aprobada · versión {data.approved.version}</Subheading>
        {data.validity?.validUntil&&<p className="text-sm text-slate-700">Revalidar a partir del <time dateTime={data.validity.validUntil}>{new Intl.DateTimeFormat('es-MX',{dateStyle:'long',timeZone:'UTC'}).format(new Date(data.validity.validUntil))}</time>. Esta fecha corresponde a la acreditación de PsicoPanel.</p>}
        <AccreditationDetails value={data.approved}/>
      </section>}
      {data.events.length>0&&<section className="space-y-3">
        <Subheading className="font-bold text-slate-900">Mensajes de revisión</Subheading>
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4">
          {data.events.map(event=><li key={event.id} className="space-y-1 py-3">
            <p className="text-sm font-semibold text-slate-800">{eventLabels[event.outcome]} · versión {event.version}</p>
            <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{event.message}</p>
          </li>)}
        </ul>
      </section>}
      {!data.pending&&!draft&&!(token&&data.validity?.current)&&<button type="button" className={primary}
        onClick={()=>setDraft(Object.fromEntries(fields.map(([key])=>[key,(data.suggested?.version?data.suggested:(data.approved??data.suggested))?.[key]||''])))}>
        <ClipboardCheck size={18} aria-hidden="true"/>{data.approved?'Presentar credenciales actualizadas':data.events.length?'Corregir y volver a presentar':'Preparar solicitud'}
      </button>}
      {draft&&!data.pending&&<section className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
        <Subheading tabIndex={-1} ref={formTitle} className="font-bold text-slate-900">{confirm?'Confirma los datos que se enviarán':'Credenciales para revisión'}</Subheading>
        {confirm?<><AccreditationDetails value={draft}/>
          <p className="text-sm text-slate-700">La versión enviada quedará guardada. Si el equipo pide un cambio, podrás presentar una versión corregida.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={primary} onClick={submit}>{busy?'Enviando…':'Enviar para revisión'}</button>
            <button type="button" disabled={busy} className={secondary} onClick={()=>setConfirm(false)}>Volver a editar</button>
          </div></>:<form className="space-y-4" onSubmit={event=>{event.preventDefault();setConfirm(true);}}>
          <p className="text-sm text-slate-700">Introduce los datos tal como aparecen en tus credenciales. El cotejo de identidad se realiza por separado.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map(([key,label])=><label className="block text-sm font-medium text-slate-800" key={key}>{label}
              <input required value={draft[key]} onChange={event=>setDraft({...draft,[key]:event.target.value})}
                maxLength={key==='licenseNumber'?20:200} inputMode={key==='licenseNumber'?'numeric':undefined}
                pattern={key==='licenseNumber'?'[0-9]+':undefined}
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-400 px-3 py-2 focus-visible:outline-indigo-700"/>
            </label>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={primary}>Revisar antes de enviar</button>
            <button type="button" className={secondary} onClick={()=>setDraft(null)}>Cancelar</button>
          </div>
        </form>}
      </section>}
    </>}
  </section>;
}
