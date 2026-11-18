import { useEffect,useRef,useState } from 'react';
import { apiRequest } from '../api/client';
const risks={unevaluated:'NO EVALUADO',none:'Sin riesgo identificado',low:'Bajo',medium:'Medio',high:'Alto'};
const button='rounded-lg bg-indigo-700 px-4 py-2 text-white disabled:opacity-50';
export default function AdmissionAssessment({id,version,submission,reviewState,professionalName,onUnavailable,onDetail}) {
  const [record,setRecord]=useState(null),[context,setContext]=useState(''),[risk,setRisk]=useState('unevaluated');
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(false);
  const alive=useRef(false),generation=useRef(0),operation=useRef(null),initialized=useRef(false);
  // A generation belongs to this episode and request; late results cannot replace newer data.
  useEffect(()=>{
    const sequence=generation;let active=true;alive.current=true;const request=++sequence.current;
    const load=async()=>{try{const response=await apiRequest('/admissions/'+id+'/record');if(!active||request!==generation.current)return;
      setConfirmed(false);
      if(response.data.version!==version||response.data.submission!==submission){setConflict(true);setError('El envío cambió. Actualiza las referencias y revisa sus respuestas; tu texto se conserva.');}
      setRecord(response.data);if(!initialized.current){initialized.current=true;setContext(response.data.current?.context||'');setRisk(response.data.current?.riskLevel||'unevaluated');}
    }catch(e){if(active&&request===generation.current){setError(e.message);if([401,403,404].includes(e.status)){setRecord(null);setContext('');onUnavailable();}}}};
    void load();return()=>{active=false;alive.current=false;++sequence.current;};
  },[id,version,submission,reviewState,onUnavailable]);
  const refresh=async()=>{
    const request=++generation.current;setBusy(true);
    try{const detail=await apiRequest('/admissions/'+id);const response=await apiRequest('/admissions/'+id+'/record');if(!alive.current||request!==generation.current)return;
      if(detail.data.version!==response.data.version||detail.data.latestSubmission!==response.data.submission){setConflict(true);setConfirmed(false);throw Object.assign(new Error('El envío volvió a cambiar. Actualiza nuevamente; tu texto se conserva.'),{status:409});}
      setRecord(response.data);setConflict(false);setConfirmed(false);operation.current=null;setError('');setBusy(false);onDetail?.(detail.data);
    }catch(e){if(alive.current&&request===generation.current){setError(e.message);if([401,403,404].includes(e.status)){setRecord(null);setContext('');onUnavailable();}}}
    finally{if(alive.current&&request===generation.current)setBusy(false);}
  };
  const save=async()=>{
    if(busy||conflict||!record?.canAssess)return;
    const payload={expectedVersion:record.version,expectedRevision:record.expectedRevision,episodeId:record.episodeId,submission:record.submission,riskLevel:risk,context,confirmed:true};
    const key=JSON.stringify(payload);if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};
    const request=++generation.current;setBusy(true);setError('');
    try{
      await apiRequest('/admissions/'+id+'/assess',{method:'POST',body:JSON.stringify({...payload,operationId:operation.current.id})});
      if(!alive.current||request!==generation.current)return;
      operation.current=null;setConfirmed(false);await refresh();
    }catch(e){if(!alive.current||request!==generation.current)return;setError(e.message);
      if(e.status===409){setConflict(true);setConfirmed(false);operation.current=null;}
      if([401,403,404].includes(e.status)){setRecord(null);setContext('');onUnavailable();}
    }finally{if(alive.current&&request===generation.current)setBusy(false);}
  };
  return <section aria-label="Valoración profesional privada" className="space-y-3 rounded-lg border border-indigo-200 p-4">
    <h3 className="font-bold">Valoración profesional privada</h3>
    <p>Solo para esta admisión. Registrar una valoración y validar la entrevista son actos independientes; ninguno activa tratamiento.</p>
    {error&&<p role="alert">{error}</p>}
    {record&&<><p>Envío actual: {record.submission||'ninguno'}. Riesgo: <strong>{risks[record.current?.riskLevel]||'NO EVALUADO'}</strong></p>
      {record.current&&<p className="whitespace-pre-wrap">Contexto vigente: {record.current.context}</p>}
      {!record.canAssess&&<p>La valoración requiere un envío elegible. Durante una corrección se conserva únicamente el historial.</p>}
      <form autoComplete="off" className="space-y-3" onSubmit={e=>{e.preventDefault();void save();}}>
        <label className="block" htmlFor={'assessment-risk-'+id}>Riesgo profesional</label><select id={'assessment-risk-'+id} className="block w-full rounded-lg border p-2" value={risk} disabled={busy||!record.canAssess} onChange={e=>{setRisk(e.target.value);setConfirmed(false);}}>{Object.entries(risks).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select>
        <label className="block" htmlFor={'assessment-context-'+id}>Contexto profesional privado</label><textarea id={'assessment-context-'+id} className="block w-full rounded-lg border p-2" maxLength={10000} value={context} disabled={busy||!record.canAssess} onChange={e=>{setContext(e.target.value);setConfirmed(false);}}/>
        <label className="block"><input type="checkbox" checked={confirmed} disabled={busy||conflict||!record.canAssess} onChange={e=>setConfirmed(e.target.checked)}/> Registro expresamente esta valoración para el envío {record.submission} del episodio {record.episodeId}.</label>
        <button className={button} disabled={busy||conflict||!confirmed||!record.canAssess}>Registrar valoración privada</button>
      </form>
      {conflict&&<p>El estado cambió. Tu texto local se conserva. Actualiza las referencias y revisa el envío antes de confirmar otra vez.</p>}
      <button type="button" className={button} disabled={busy} onClick={()=>void refresh()}>Actualizar referencias y conservar texto</button>
      <details><summary>Historial de valoraciones privadas ({record.history.length})</summary>{record.history.map(v=><article key={v.revision} className="border-t py-2"><p>Revisión {v.revision} · Envío {v.submission} · Autor {professionalName||v.authorId} · {new Date(v.recordedAt).toLocaleString()}</p><p>{risks[v.riskLevel]||'NO EVALUADO'}</p><p className="whitespace-pre-wrap">{v.context}</p></article>)}</details>
    </>}
  </section>;
}
