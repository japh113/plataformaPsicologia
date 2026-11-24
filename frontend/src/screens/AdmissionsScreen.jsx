import FirstConsultation from '../components/FirstConsultation';
import DirectedAdmission from '../components/DirectedAdmission';
import AdmissionAssessment from '../components/AdmissionAssessment';
import { useCallback,useEffect,useRef,useState } from 'react';
import { apiRequest } from '../api/client';
const style='rounded-lg border border-slate-300 p-2';
const button='rounded-lg bg-indigo-700 px-4 py-2 text-white disabled:opacity-50';
const labels={awaiting_document:'Esperando documentación',documented:'Documentada para revisión',revoked:'Revocada: consulta propia',proposed:'Pendiente de aceptación',accepted:'Aceptada',awaiting_submission:'Esperando envío',submitted:'Enviada para revisión',correction_requested:'Corrección solicitada',validated:'Validación registrada'};
const get=async path=>(await apiRequest('/admissions'+path)).data;
export function AdmissionDetail({id,professional,onRefresh,onRevoked,contextual=false,historyOnly=false}){
  const [data,setData]=useState(null),[draft,setDraft]=useState(null),[answers,setAnswers]=useState({}),[confirmed,setConfirmed]=useState(false),[revokeConfirmed,setRevokeConfirmed]=useState(false),[send,setSend]=useState(false);
  const [stale,setStale]=useState(false);
  const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const operations=useRef(new Map()),alive=useRef(false),generation=useRef(0),denied=useRef(false);
  const unavailable=useCallback(()=>{
    if(!alive.current||denied.current)return;
    denied.current=true;
    ++generation.current;
    operations.current.clear();
    setData(null);setDraft(null);setAnswers({});setMessage('');
    setConfirmed(false);setRevokeConfirmed(false);setSend(false);setBusy(false);
  },[]);
  const loadDetail=useCallback(async (isCurrent,preserve=false)=>{
    const detail=await get('/'+id);
    if(!isCurrent())return;
    setData(detail);setStale(false);
    if(!professional&&(detail.state==='accepted'||detail.readOnly)){
      const own=await get('/'+id+'/draft');
      if(isCurrent()){setDraft(own);if(!preserve)setAnswers(own.answers);}
    }
  },[id,professional]);
  useEffect(()=>{
    const sequence=generation,request=++sequence.current;
    alive.current=true;denied.current=false;
    const isCurrent=()=>alive.current&&request===sequence.current;
    void loadDetail(isCurrent).catch(e=>{
      if(!isCurrent())return;
      setError(e.message);
      setConfirmed(false);setSend(false);setRevokeConfirmed(false);setStale(true);
      if([401,403,404].includes(e.status))unavailable();
    });
    return()=>{alive.current=false;++sequence.current;};
  },[loadDetail,unavailable]);
  const act=async(op,payload)=>{
    if(busy||stale||historyOnly||denied.current||!data)return;
    let request=generation.current;
    const isCurrent=()=>alive.current&&request===generation.current;
    setBusy(true);setError('');
    const key=JSON.stringify([op,data.version,payload]);if(!operations.current.has(key))operations.current.set(key,crypto.randomUUID());
    try{
      await apiRequest('/admissions/'+id+'/'+op,{method:'POST',body:JSON.stringify({...payload,confirmed:true,operationId:operations.current.get(key),expectedVersion:data.version})});
      if(!isCurrent())return;
      operations.current.delete(key);setConfirmed(false);setSend(false);
      if(op==='revoke'){
        unavailable();
        request=generation.current;
        await onRefresh();
        if(isCurrent())onRevoked();
        return;
      }
      await loadDetail(isCurrent);
      if(isCurrent())await onRefresh();
    }catch(e){
      if(!isCurrent())return;
      if(e.status&&e.status<500)operations.current.delete(key);
      setError(e.message);
      if([401,403,404].includes(e.status))unavailable();
    }finally{if(isCurrent())setBusy(false);}
  };
  const reload = async () => {
    const request = ++generation.current;
    const isCurrent = () => alive.current && request === generation.current;
    setBusy(true);
    setError('');
    try {
      await loadDetail(isCurrent, true);
    } catch (failure) {
      if (!isCurrent()) return;
      setError(failure.message);
      if ([401, 403, 404].includes(failure.status)) unavailable();
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const receiveDetail=useCallback(detail=>{if(alive.current&&!denied.current)setData(detail);},[]);
  const editable=data&&!historyOnly&&!stale&&!data.readOnly&&['awaiting_submission','correction_requested'].includes(data.reviewState);
  const saved=draft&&JSON.stringify(answers)===JSON.stringify(draft.answers);
  return <article aria-label="Detalle de admisión" className="rounded-xl border bg-white p-5 space-y-4">
    {error&&<p role="alert">{error}</p>}
    {!data&&!error&&<p role="status">Consultando entrevista…</p>}
    {stale&&<><p role="status">Revisa la versión actual antes de confirmar de nuevo.</p>
      <button type="button" className={style} disabled={busy} onClick={reload}>Actualizar entrevista y conservar texto</button></>}
    {data&&<><h2 className="text-xl font-bold">{data.template.title}</h2><p>{data.template.notice}</p>
      <p>Profesional destinatario: {data.professionalName} · Autoadministrada · Versión {data.template.version}{!contextual && '. Episodio preparado: ' + data.episodeId}</p>
      <p>{labels[data.state]} · {labels[data.reviewState]}</p>
      {data.readOnly&&<p>Consulta propia de respuestas conservadas. Esta admisión está revocada y no permite nuevas operaciones.</p>}
      {!professional&&!historyOnly&&data.state==='proposed'&&<><p>{data.consentText}</p><p>Versión de consentimiento: {data.consentVersion}</p>
        <label className="block"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Acepto específicamente esta asignación, plantilla, destinatario y episodio.</label>
        <button className={button} disabled={busy||stale||!confirmed} onClick={()=>act('accept',{consentVersion:data.consentVersion,consentHash:data.consentHash})}>Aceptar asignación</button></>}
      {!professional&&draft&&<form className="space-y-3" autoComplete="off" onSubmit={e=>{e.preventDefault();act('save',{expectedRevision:draft.revision,answers});}}>
        <h3 className="font-bold">Borrador privado</h3><p>Guardar conserva tu borrador. El profesional recibe únicamente las versiones que envíes expresamente.</p>
        {data.template.questions.map(q=><div key={q.id}><label className="block" htmlFor={'admission-'+id+'-'+q.id}>{q.label}</label><textarea id={'admission-'+id+'-'+q.id} className={style+' block w-full'} maxLength={q.maxLength} value={answers[q.id]||''} disabled={busy||!editable} onChange={e=>{setAnswers({...answers,[q.id]:e.target.value});setSend(false);}}/></div>)}
        {editable&&<><button className={button} disabled={busy||saved}>Guardar borrador privado</button>
          <label className="block"><input type="checkbox" checked={send} disabled={!saved||draft.revision===0} onChange={e=>setSend(e.target.checked)}/> Confirmo enviar esta versión guardada a {data.professionalName} para esta admisión.</label>
          <button type="button" className={button} disabled={busy||!send||!saved||!data.template.questions.every(q=>(answers[q.id]||'').trim())} onClick={()=>act('submit',{expectedRevision:draft.revision})}>Enviar versión inmutable</button></>}
      </form>}
      <h3 className="font-bold">Versiones enviadas</h3>
      {data.submissions.length===0&&<p>Todavía no hay envíos.</p>}
      {data.submissions.map(s=><details key={s.number} open={s.number===data.latestSubmission}><summary>Envío {s.number}</summary>{data.template.questions.map(q=><p key={q.id} className="whitespace-pre-wrap"><strong>{q.label}: </strong>{s.answers[q.id]}</p>)}</details>)}
      {data.corrections.map(c=><p className="whitespace-pre-wrap" key={c.submission}>Corrección del envío {c.submission}: {c.message}</p>)}
      {data.validations.map(v=><p key={v.submission}>Validación del envío {v.submission} · {new Date(v.validatedAt).toLocaleString('es-MX')}. Solo la versión vigente puede estar validada.</p>)}
      {professional&&!historyOnly&&['submitted','validated'].includes(data.reviewState)&&<><label className="block" htmlFor={'correction-'+id}>Mensaje destinado al paciente para corregir</label><textarea id={'correction-'+id} className={style+' block w-full'} maxLength={1000} value={message} onChange={e=>setMessage(e.target.value)}/>
        <button className={button} disabled={busy||stale||!message.trim()} onClick={()=>act('correct',{submission:data.latestSubmission,episodeId:data.episodeId,message})}>Solicitar corrección</button>
        {data.reviewState==='submitted'&&<><label className="block"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Registro expresamente la validación profesional del envío {data.latestSubmission} para este participante y episodio, solo en este ensayo ficticio.</label>
          <button className={button} disabled={busy||stale||!confirmed} onClick={()=>act('validate',{submission:data.latestSubmission,episodeId:data.episodeId})}>Registrar validación exacta</button></>}
      </>}
      {professional&&data.state==='accepted'&&data.consentVersion==='fictional-admission-v2'&&data.latestSubmission===0&&<p>Valoración profesional: NO EVALUADO. Se requiere un envío para consultar y registrar valoraciones.</p>}
      {professional&&data.state==='accepted'&&data.consentVersion==='fictional-admission-v2'&&data.latestSubmission>0&&<AdmissionAssessment key={id} id={id} version={data.version} submission={data.latestSubmission} reviewState={data.reviewState} professionalName={data.professionalName} onUnavailable={unavailable} onDetail={receiveDetail}/>}
      {!data.readOnly&&!historyOnly&&<><label className="block"><input type="checkbox" checked={revokeConfirmed} onChange={e=>setRevokeConfirmed(e.target.checked)}/> Confirmo cancelar esta admisión{professional?'':' y retirar mi consentimiento'}.</label>
      <button className={button} disabled={busy||stale||!revokeConfirmed} onClick={()=>act('revoke',{})}>{professional?'Cancelar admisión':'Retirar consentimiento'}</button></>}
    </>}
  </article>;
}
export default function AdmissionsScreen({currentUser}){
  const professional=currentUser.role==='psychologist';
  const [consultation,setConsultation]=useState(false);
  const [items,setItems]=useState(null),[agreements,setAgreements]=useState([]),[agreement,setAgreement]=useState(''),[episode,setEpisode]=useState(''),[selected,setSelected]=useState(''),[selectedMode,setSelectedMode]=useState(''),[mode,setMode]=useState('self');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[prepareConfirmed,setPrepareConfirmed]=useState(false),[assignConfirmed,setAssignConfirmed]=useState(false);
  const operations=useRef(new Map());
  const refresh=async()=>setItems(await get(''));
  useEffect(()=>{let alive=true;const start=async()=>{try{const rows=await get('');if(alive)setItems(rows);if(professional){const response=await apiRequest('/bilateral-invitations/agreements');if(alive)setAgreements(response.data.filter(g=>g.status==='completed'));}}catch(e){if(alive)setError(e.message);}};void start();return()=>{alive=false;};},[professional]);
  const create=async op=>{
    if(op==='assign'&&mode==='directed')op='assign-directed';
    if(busy)return;setBusy(true);setError('');
    const payload={agreementId:agreement,...(['assign','assign-directed'].includes(op)?{episodeId:episode,templateId:'fictional-adult-v1'}:{})};
    const key=JSON.stringify([op,payload]);if(!operations.current.has(key))operations.current.set(key,crypto.randomUUID());
    try{const response=await apiRequest('/admissions/'+op,{method:'POST',body:JSON.stringify({...payload,confirmed:true,operationId:operations.current.get(key)})});operations.current.delete(key);if(op==='prepare'){setEpisode(response.data.episodeId);setPrepareConfirmed(false);}else{setSelectedMode(op==='assign-directed'?'directed':'');setSelected(response.data.id);setEpisode('');setAssignConfirmed(false);}await refresh();}
    catch(e){if(e.status&&e.status<500)operations.current.delete(key);setError(e.message);}finally{setBusy(false);}
  };
  return <section className="mx-auto max-w-4xl space-y-5" aria-label="Admisiones individuales">
    <h1 className="text-2xl font-bold">Admisiones individuales</h1>
    {import.meta.env?.VITE_FIRST_CONSULTATION_ENABLED==='true' && (
      <button className={style} type="button" onClick={() => setConsultation(value => !value)}>
        {consultation ? 'Volver a admisiones' : 'Abrir primera consulta ficticia'}
      </button>
    )}
    {consultation ? <FirstConsultation professional={professional}/> : <>
    <p>Ensayo ficticio aislado. Plantilla sin validación clínica de mínimos. Aceptar, enviar o validar no activa tratamiento.</p>
    {error&&<p role="alert">{error}</p>}
    <button className={button} disabled={busy} onClick={()=>{setSelected('');setError('');refresh().catch(e=>setError(e.message));}}>Actualizar admisiones</button>
    {professional&&<div className="rounded-xl border bg-white p-5 space-y-3"><h2 className="font-bold">Asignar plantilla predefinida</h2>
      <label className="block" htmlFor="admission-mode">Modalidad de entrevista</label><select id="admission-mode" className={style} value={mode} disabled={busy||Boolean(episode)} onChange={e=>{setMode(e.target.value);setAssignConfirmed(false);}}><option value="self">Autoadministrada</option><option value="directed">Dirigida por el profesional</option></select>
      <label className="block" htmlFor="admission-agreement">Acuerdo bilateral vigente</label><select id="admission-agreement" className={style+' block w-full'} value={agreement} disabled={busy} onChange={e=>{setAgreement(e.target.value);setEpisode('');setPrepareConfirmed(false);setAssignConfirmed(false);}}><option value="">Seleccionar acuerdo</option>{agreements.map(g=><option key={g.id} value={g.id}>Acuerdo {g.id}</option>)}</select>
      <label className="block"><input type="checkbox" checked={prepareConfirmed} onChange={e=>setPrepareConfirmed(e.target.checked)}/> Preparar explícitamente un episodio individual para este acuerdo.</label>
      <button className={button} disabled={busy||!agreement||!prepareConfirmed} onClick={()=>create('prepare')}>Preparar episodio</button>
      {episode&&<><p>Episodio preparado {episode}. Plantilla: Admisión individual ficticia, versión 1.</p><label className="block"><input type="checkbox" checked={assignConfirmed} onChange={e=>setAssignConfirmed(e.target.checked)}/> Asignar esta plantilla a este episodio y al titular del acuerdo.</label>
        <button className={button} disabled={busy||!assignConfirmed} onClick={()=>create('assign')}>Asignar plantilla</button></>}
    </div>}
    {items?.length===0&&<p role="status">No tienes admisiones asignadas.</p>}
    {items?.length>0&&<ul className="space-y-2">{items.map(item=><li key={item.id}><button className={style+' w-full text-left'} onClick={()=>{setSelectedMode(item.mode);setSelected(item.id);}}>Episodio {item.episodeId} · {item.professionalName} · {item.mode==='directed'?'Dirigida':'Autoadministrada'} · {labels[item.state]}{labels[item.reviewState]&&' · '+labels[item.reviewState]}</button></li>)}</ul>}
    {selected&&selectedMode==='directed'&&<DirectedAdmission key={selected} id={selected} professional={professional}/>}
    {selected&&selectedMode!=='directed'&&<AdmissionDetail key={selected} id={selected} professional={professional} onRefresh={refresh} onRevoked={()=>setSelected('')}/>}
    </>}
  </section>;
}
