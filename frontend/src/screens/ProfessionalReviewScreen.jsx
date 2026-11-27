import {useEffect,useRef,useState} from 'react';
import * as api from '../api/professional';
import {Credential} from './ProfessionalProfileScreen';
import ManualAccreditationReview from './ManualAccreditationReview';
const manualEnabled=import.meta.env.VITE_MANUAL_ACCREDITATION_ENABLED==='true';
async function fetchQueue(){
  const [pending,revalidations]=await Promise.all([api.listReviews(),manualEnabled?api.listRevalidations():[]]);
  return {pending,revalidations};
}
export default function ProfessionalReviewScreen(){
  const [queue,setQueue]=useState(null),[selected,setSelected]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [opening,setOpening]=useState(false);
  const selectionRequest=useRef(0),deciding=useRef(false);
  const reload=async()=>setQueue(await fetchQueue());
  useEffect(()=>{let live=true;fetchQueue().then(value=>{if(live)setQueue(value);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;selectionRequest.current+=1;};},[]);
  const open=async(item,revalidation=false)=>{
    if(deciding.current)return;
    const request=++selectionRequest.current;setSelected(null);setError('');setNotice('');setOpening(true);
    try{const review=await (revalidation?api.getRevalidation:api.getReview)(item.ownerId,item.version);if(request===selectionRequest.current)setSelected(review);}
    catch(e){if(request===selectionRequest.current)setError(e.message);}
    finally{if(request===selectionRequest.current)setOpening(false);}
  };
  const reset=()=>{if(deciding.current)return;selectionRequest.current+=1;setOpening(false);setSelected(null);setError('');setNotice('');reload().catch(e=>setError(e.message));};
  const resolveManual=async body=>{
    if(deciding.current||!selected)return;
    deciding.current=true;setBusy(true);setError('');
    try{
      const result=await api.decideManualReview(selected,body);
      setSelected(null);
      setNotice(result.accountApprovalNeeded
        ? 'Acreditación registrada. Abre Usuarios, localiza esta cuenta y resuelve su aprobación por separado.'
        : 'Resolución registrada. El mensaje ya está disponible para el profesional.');
      await reload();
    }catch(e){
      setError(e.message);
      if(e.status===409){setSelected(null);await reload().catch(()=>{});}
    }finally{deciding.current=false;setBusy(false);}
  };
  const decide=async event=>{
    event.preventDefault();if(deciding.current||!selected)return;
    const review=selected,form=new FormData(event.currentTarget);deciding.current=true;setBusy(true);setError('');
    try{
      await api.decideReview(review.ownerId,review.pending.version,{rowVersion:review.rowVersion,outcome:'rejected',ownerMessage:form.get('ownerMessage'),internalNote:form.get('internalNote')});
      setSelected(null);await reload();setNotice('Rechazo registrado. Se conserva la última versión aprobada.');
    }catch(e){setSelected(null);setError(e.message+' Recarga la propuesta antes de decidir de nuevo.');}
    finally{deciding.current=false;setBusy(false);}
  };
  return <section aria-label="Revisión privada de credenciales" className="rounded-2xl bg-white p-4 sm:p-6 space-y-4"><h1 className="text-2xl font-bold">Revisión privada de credenciales</h1>
    <p>Este flujo revisa versiones de credenciales. No cambia la aprobación de cuenta ni concede acceso clínico.</p>{error&&<p role="alert" className="text-red-700">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <button disabled={busy} className="rounded border p-2" onClick={reset}>Recargar propuestas</button>
    {!queue&&!error&&<p role="status">Cargando solicitudes…</p>}
    {queue&&!queue.pending.length&&<p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">No hay solicitudes pendientes.</p>}
    <ul className="grid gap-2 sm:grid-cols-2">{queue?.pending.map(item=><li key={`${item.ownerId}:${item.version}`}>
      <button disabled={busy} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-left font-medium text-slate-800 hover:bg-indigo-50 focus-visible:outline-indigo-700" onClick={()=>open(item)}>Revisar {item.professionalName}, versión {item.version}</button>
    </li>)}</ul>
    {opening&&<p role="status">Abriendo ficha de revisión…</p>}
    {selected?.manual&&<ManualAccreditationReview key={`${selected.ownerId}:${selected.mode}:${selected.pending.version}`} review={selected} busy={busy} onResolve={resolveManual}/>}
    {selected&&!selected.manual&&<><h2 className="font-semibold">Versión exacta {selected.pending.version}</h2><div className="grid gap-4 md:grid-cols-2"><section><h3>Aprobada</h3><Credential value={selected.approved}/></section><section><h3>Propuesta</h3><Credential value={selected.pending}/></section></div>
      <button disabled className="rounded border p-2 opacity-50">Aprobar credenciales</button><p>Aprobación deshabilitada: faltan criterios de evidencia y vigencia autorizados.</p>
      <form key={`${selected.ownerId}:${selected.pending.version}`} className="space-y-3" onSubmit={decide}>
        <label className="block">Razón destinada al profesional<textarea disabled={busy} name="ownerMessage" required maxLength={2000} className="block w-full rounded border p-2"/></label>
        <label className="block">Observaciones internas reservadas<textarea disabled={busy} name="internalNote" maxLength={4000} className="block w-full rounded border p-2"/></label>
        <button disabled={busy} className="rounded bg-rose-700 px-4 py-2 text-white">Rechazar versión</button>
      </form>
    </>}
    {queue?.revalidations.length>0&&<details className="rounded-xl border border-slate-200 p-3">
      <summary className="cursor-pointer font-semibold text-slate-800">Acreditaciones aprobadas y revalidación</summary>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">{queue.revalidations.map(item=><li key={item.ownerId}>
        <button disabled={busy} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-sm focus-visible:outline-indigo-700" onClick={()=>open(item,true)}>
          <strong>{item.professionalName}</strong>
          <span className="block">{item.accountApprovalNeeded?'Cuenta pendiente de aprobación':item.requiresReview?'Revalidación requerida':`Revalidar a partir del ${item.validUntil}`}</span>
        </button>
      </li>)}</ul>
    </details>}
  </section>;
}
