import {useEffect,useRef,useState} from 'react';
import * as api from '../api/professional';
import {Credential} from './ProfessionalProfileScreen';
export default function ProfessionalReviewScreen(){
  const [list,setList]=useState([]),[selected,setSelected]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const selectionRequest=useRef(0),deciding=useRef(false);
  const reload=async()=>setList(await api.listReviews());
  useEffect(()=>{let live=true;api.listReviews().then(value=>{if(live)setList(value);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;selectionRequest.current+=1;};},[]);
  const open=async item=>{
    if(deciding.current)return;
    const request=++selectionRequest.current;setSelected(null);setError('');setNotice('');
    try{const review=await api.getReview(item.ownerId,item.version);if(request===selectionRequest.current)setSelected(review);}
    catch(e){if(request===selectionRequest.current)setError(e.message);}
  };
  const reset=()=>{if(deciding.current)return;selectionRequest.current+=1;setSelected(null);setError('');setNotice('');reload().catch(e=>setError(e.message));};
  const decide=async event=>{
    event.preventDefault();if(deciding.current||!selected)return;
    const review=selected,form=new FormData(event.currentTarget);deciding.current=true;setBusy(true);setError('');
    try{
      await api.decideReview(review.ownerId,review.pending.version,{rowVersion:review.rowVersion,outcome:'rejected',ownerMessage:form.get('ownerMessage'),internalNote:form.get('internalNote')});
      setSelected(null);await reload();setNotice('Rechazo registrado. Se conserva la última versión aprobada.');
    }catch(e){setSelected(null);setError(e.message+' Recarga la propuesta antes de decidir de nuevo.');}
    finally{deciding.current=false;setBusy(false);}
  };
  return <section aria-label="Revisión privada de credenciales" className="rounded-2xl bg-white p-6 space-y-4"><h1 className="text-2xl font-bold">Revisión privada de credenciales</h1>
    <p>Este flujo revisa versiones de credenciales. No cambia la aprobación de cuenta ni concede acceso clínico.</p>{error&&<p role="alert" className="text-red-700">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <button disabled={busy} className="rounded border p-2" onClick={reset}>Recargar propuestas</button>
    <ul>{list.map(item=><li key={`${item.ownerId}:${item.version}`}><button disabled={busy} className="my-2 rounded border p-2" onClick={()=>open(item)}>Revisar {item.professionalName}, versión {item.version}</button></li>)}</ul>
    {selected&&<><h2 className="font-semibold">Versión exacta {selected.pending.version}</h2><div className="grid gap-4 md:grid-cols-2"><section><h3>Aprobada</h3><Credential value={selected.approved}/></section><section><h3>Propuesta</h3><Credential value={selected.pending}/></section></div>
      <button disabled className="rounded border p-2 opacity-50">Aprobar credenciales</button><p>Aprobación deshabilitada: faltan criterios de evidencia y vigencia autorizados.</p>
      <form key={`${selected.ownerId}:${selected.pending.version}`} className="space-y-3" onSubmit={decide}>
        <label className="block">Razón destinada al profesional<textarea disabled={busy} name="ownerMessage" required maxLength={2000} className="block w-full rounded border p-2"/></label>
        <label className="block">Observaciones internas reservadas<textarea disabled={busy} name="internalNote" maxLength={4000} className="block w-full rounded border p-2"/></label>
        <button disabled={busy} className="rounded bg-rose-700 px-4 py-2 text-white">Rechazar versión</button>
      </form>
    </>}
  </section>;
}
