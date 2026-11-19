import { useCallback,useEffect,useRef,useState } from 'react';
import { apiRequest } from '../api/client';
import AdmissionAssessment from './AdmissionAssessment';
const button='rounded-lg bg-indigo-700 px-4 py-2 text-white disabled:opacity-50';
const states={proposed:'Pendiente de consentimiento',accepted:'Aceptada',revoked:'Revocada',awaiting_document:'Esperando documentación',documented:'Documentada',correction_requested:'Corrección pendiente',validated:'Validación registrada'};
const field='block w-full rounded-lg border border-slate-300 p-2';
export default function DirectedAdmission({id,professional}) {
  const [data,setData]=useState(null),[declarations,setDeclarations]=useState({reason:'',context:''});
  const [reason,setReason]=useState(''),[explanation,setExplanation]=useState(''),[target,setTarget]=useState('');
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[stale,setStale]=useState(true),[error,setError]=useState('');
  const [authorizationEpoch,setAuthorizationEpoch]=useState(0);
  const alive=useRef(false),generation=useRef(0),owner=useRef(null),operation=useRef(null),authorization=useRef({epoch:0,denied:false});
  // A denial invalidates pending parent reads and callbacks from the former child.
  const unavailable=useCallback(()=>{++generation.current;authorization.current={epoch:authorization.current.epoch+1,denied:true};setAuthorizationEpoch(authorization.current.epoch);setData(null);setDeclarations({reason:'',context:''});setReason('');setExplanation('');setConfirmed(false);setStale(true);},[]);
  const receive=useCallback(detail=>{if(!alive.current||authorization.current.denied||authorization.current.epoch!==authorizationEpoch)return;setData(detail);setConfirmed(false);setStale(false);},[authorizationEpoch]);
  const childUnavailable=useCallback(()=>{if(alive.current&&authorization.current.epoch===authorizationEpoch)unavailable();},[authorizationEpoch,unavailable]);
  const refresh=useCallback(async()=>{
    const request=++generation.current;setStale(true);setConfirmed(false);
    try{const response=await apiRequest('/admissions/'+id);if(!alive.current||request!==generation.current)return;
      if(response.data.mode!=='directed')throw Object.assign(new Error('Recurso no disponible.'),{status:404});
      authorization.current.denied=false;setData(response.data);setStale(false);setError('');operation.current=null;
    }catch(e){if(alive.current&&request===generation.current){setError(e.message);if([401,403,404].includes(e.status))unavailable();}}
  },[id,unavailable]);
  useEffect(()=>{const sequence=generation;alive.current=true;void refresh();return()=>{alive.current=false;++sequence.current;};},[refresh]);
  const act=async(op,extra={})=>{
    if(owner.current||busy||stale||!data||!confirmed)return;
    const payload={expectedVersion:data.version,confirmed:true,...extra};
    const key=JSON.stringify([id,op,payload]);if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};
    const own={},request=++generation.current;owner.current=own;setBusy(true);setError('');
    try{
      await apiRequest('/admissions/'+id+'/'+op,{method:'POST',body:JSON.stringify({...payload,operationId:operation.current.id})});
      if(!alive.current||request!==generation.current)return;
      operation.current=null;setConfirmed(false);await refresh();
    }catch(e){if(alive.current&&request===generation.current){setError(e.message);setConfirmed(false);setStale(true);
      if(e.status===409)operation.current=null;if([401,403,404].includes(e.status))unavailable();}}
    finally{if(alive.current&&owner.current===own){owner.current=null;setBusy(false);}}
  };
  const pending=data?.requests.find(r=>!r.resolution),active=data?.state==='accepted'&&!data.readOnly;
  const enabled=!busy&&!stale&&confirmed,complete=Boolean(declarations.reason.trim()&&declarations.context.trim());
  return <article aria-label="Entrevista dirigida" className="space-y-4 rounded-xl border bg-white p-5">
    <h2 className="text-xl font-bold">Entrevista individual dirigida ficticia</h2>
    <p>Declaraciones documentadas por el psicólogo. No son respuestas escritas, enviadas ni ratificadas por el paciente. No inicia tratamiento.</p>
    {error&&<p role="alert">{error}</p>}
    {stale&&<p role="status">Actualiza las referencias y revisa la versión antes de confirmar nuevamente. El texto local se conserva.</p>}
    <button className={button} disabled={busy} onClick={()=>void refresh()}>Actualizar entrevista y conservar texto</button>
    {data&&<><p>Responsable: {data.professionalName}. Episodio preparado: {data.episodeId}. Estado: {states[data.state]} · {states[data.reviewState]}.</p>
      {data.readOnly&&<p>Consulta propia conservada. La admisión está revocada y no permite nuevas operaciones.</p>}
      {!professional&&data.state==='proposed'&&<><p>{data.consentText}</p><p>Consentimiento: {data.consentVersion}</p>
        <button className={button} disabled={!enabled} onClick={()=>void act('accept',{consentVersion:data.consentVersion,consentHash:data.consentHash})}>Aceptar entrevista dirigida</button></>}
      {data.attestation&&<p>Realización declarada por {data.professionalName}. Registro del servidor: {new Date(data.attestation.recordedAt).toLocaleString()}. Esta constancia no es una cita ni una nota ordinaria.</p>}
      {professional&&active&&!data.attestation&&<button className={button} disabled={!enabled} onClick={()=>void act('directed/attest')}>Declaro que realicé la entrevista</button>}
      <h3 className="font-bold">Versiones incorporadas</h3>
      {data.documents.length===0&&<p>Todavía no hay versiones incorporadas. Los borradores profesionales no son visibles.</p>}
      {data.documents.map(v=><details key={v.revision} open={v.revision===data.latestDocument}><summary>Documento {v.revision} · Documentado por {data.professionalName}</summary>
        <p>Autor: {v.authorId}. Sujeto: {v.subjectId}. Registro: {new Date(v.recordedAt).toLocaleString()}.</p>
        {data.template.questions.map(q=><p key={q.id} className="whitespace-pre-wrap"><strong>{q.label}: </strong>{v.declarations[q.id]}</p>)}
      </details>)}
      {data.requests.map(r=><section key={r.id} aria-label="Solicitud de corrección" className="space-y-2 rounded-lg border p-3">
        <p className="whitespace-pre-wrap">Solicitud del paciente sobre documento {r.documentRevision}: {r.reason}</p>
        <p>Autor: {r.authorId} · {new Date(r.recordedAt).toLocaleString()}</p>
        {r.resolution?<><p>{r.resolution.decision==='accept'?'Aceptada':'Rechazada'} · Documento {r.resolution.documentRevision}</p><p className="whitespace-pre-wrap">Explicación destinada al paciente: {r.resolution.explanation}</p><p>Decisión de {r.resolution.authorId} · {new Date(r.resolution.recordedAt).toLocaleString()}</p></>:<p>Corrección pendiente: bloquea nuevas validaciones y elegibilidad futura.</p>}
      </section>)}
      {professional&&active&&data.attestation&&(data.latestDocument===0||pending)&&<section aria-label="Documentación profesional" className="space-y-3">
        <h3 className="font-bold">Declaraciones para incorporar</h3><p>Al incorporar, el titular podrá consultar esta versión. Incluye solo declaraciones destinadas al paciente; registra tu valoración en el bloque privado separado.</p>
        {data.template.questions.map(q=><label className="block" key={q.id}>{q.label}<textarea className={field} maxLength={q.maxLength} value={declarations[q.id]} disabled={busy} onChange={e=>{setDeclarations({...declarations,[q.id]:e.target.value});setConfirmed(false);}}/></label>)}
        {!pending&&<button className={button} disabled={!enabled||!complete} onClick={()=>void act('directed/document',{expectedDocumentRevision:data.latestDocument,declarations})}>Incorporar versión dirigida</button>}
      </section>}
      {professional&&active&&pending&&<section className="space-y-3"><label className="block">Explicación de la decisión para el paciente<textarea className={field} maxLength={1000} value={explanation} disabled={busy} onChange={e=>{setExplanation(e.target.value);setConfirmed(false);}}/></label>
        <button className={button} disabled={!enabled||!complete||!explanation.trim()} onClick={()=>void act('directed/resolve',{expectedDocumentRevision:data.latestDocument,requestId:pending.id,decision:'accept',explanation,declarations})}>Aceptar corrección e incorporar nueva versión</button>
        <button className={button} disabled={!enabled||!explanation.trim()} onClick={()=>void act('directed/resolve',{expectedDocumentRevision:data.latestDocument,requestId:pending.id,decision:'reject',explanation})}>Rechazar corrección con explicación</button>
      </section>}
      {!professional&&active&&data.latestDocument>0&&!pending&&<section className="space-y-3"><label>Versión que solicito corregir<select className={field} value={target||data.latestDocument} disabled={busy} onChange={e=>{setTarget(e.target.value);setConfirmed(false);}}>{data.documents.map(v=><option key={v.revision} value={v.revision}>Documento {v.revision}</option>)}</select></label>
        <label>Motivo de la solicitud<textarea className={field} maxLength={1000} value={reason} disabled={busy} onChange={e=>{setReason(e.target.value);setConfirmed(false);}}/></label>
        <button className={button} disabled={!enabled||!reason.trim()} onClick={()=>void act('directed/request',{documentRevision:Number(target||data.latestDocument),reason})}>Solicitar corrección de esta versión</button>
      </section>}
      {data.validations.map((v,i)=><p key={i}>Validación profesional del documento {v.documentRevision}, por {v.authorId} · {new Date(v.recordedAt).toLocaleString()}. Constancia histórica; no activa tratamiento.</p>)}
      {professional&&active&&data.latestDocument>0&&<AdmissionAssessment key={id} id={id} mode="directed" version={data.version} documentRevision={data.latestDocument} reviewState={data.reviewState} professionalName={data.professionalName} onDetail={receive} onUnavailable={childUnavailable}/>}
      {professional&&active&&data.latestDocument>0&&!pending&&data.reviewState==='documented'&&<><p>La validación declara expresamente completitud y suficiencia de esta versión para este participante y episodio, solo en el ensayo ficticio. No acredita mínimos clínicos reales.</p><button className={button} disabled={!enabled} onClick={()=>void act('directed/validate',{documentRevision:data.latestDocument,episodeId:data.episodeId})}>Validar expresamente esta versión ficticia</button></>}
      {!data.readOnly&&<><label className="block"><input type="checkbox" checked={confirmed} disabled={busy||stale} onChange={e=>setConfirmed(e.target.checked)}/> Confirmo expresamente la acción y la versión de esta entrevista dirigida.</label>
        <button className={button} disabled={!enabled} onClick={()=>void act('revoke')}>{professional?'Cancelar entrevista dirigida':'Retirar consentimiento dirigido'}</button></>}
    </>}
  </article>;
}
