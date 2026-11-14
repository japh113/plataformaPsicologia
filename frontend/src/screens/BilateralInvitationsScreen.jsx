import React, { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../api/client';

const base='/bilateral-invitations';
const date=value=>new Date(value).toLocaleString('es-MX',{timeZoneName:'short'});
const labels={received:'Acuse recibido',pending:'Pendiente',accepted:'Aceptada',declined:'Rechazada',withdrawn:'Retirada',expired:'Vencida',invalidated:'No disponible',completed:'Acuerdo completado',unlinked:'Acuerdo terminado'};
const inputStyle='w-full border border-gray-300 rounded-lg p-2';
const buttonStyle='rounded-lg bg-indigo-700 text-white px-4 py-2 disabled:opacity-50';

export default function BilateralInvitationsScreen({currentUser}) {
  const professional=currentUser.role==='psychologist';
  const [data,setData]=useState({items:[],agreements:[],blocks:[],notices:[]});
  const [terms,setTerms]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false),[reference,setReference]=useState(null),[privateReference,setPrivateReference]=useState('');
  const [email,setEmail]=useState(''),[recipientReference,setRecipientReference]=useState(''),[declared,setDeclared]=useState(false),[proposed,setProposed]=useState(false);
  const [professionalReference,setProfessionalReference]=useState(''),[preflight,setPreflight]=useState(null),[directed,setDirected]=useState(false);
  const [accepted,setAccepted]=useState({});
  const alive=useRef(false),operations=useRef(new Map());
  const load=async()=>{
    const names=[professional?'sent':'received','agreements',...(professional?[]:['blocks','notices'])];
    const values=await Promise.all(names.map(name=>apiRequest(base+'/'+name)));
    if(alive.current)setData({items:values[0].data,agreements:values[1].data,blocks:professional?[]:values[2].data,notices:professional?[]:values[3].data});
  };
  useEffect(()=>{
    alive.current=true;
    const start=async()=>{
      try {
        const response=await apiRequest(base+'/terms');if(alive.current)setTerms(response.data);
        const names=[professional?'sent':'received','agreements',...(professional?[]:['blocks','notices'])];
        const values=await Promise.all(names.map(name=>apiRequest(base+'/'+name)));
        if(alive.current)setData({items:values[0].data,agreements:values[1].data,blocks:professional?[]:values[2].data,notices:professional?[]:values[3].data});
      }catch(e){if(alive.current)setError(e.message);}
    };
    void start();return()=>{alive.current=false;};
  },[professional]);
  const act=async(path,payload,success)=>{
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    const key=JSON.stringify([path,payload]);
    if(!operations.current.has(key))operations.current.set(key,crypto.randomUUID());
    try {
      const response=await apiRequest(base+path,{method:'POST',body:JSON.stringify({...payload,...(path==='/preflight'?{}:{operationId:operations.current.get(key)})})});
      operations.current.delete(key);
      if(!alive.current)return;
      success?.(response.data);await load();
    }catch(e){if(e.status && e.status<500)operations.current.delete(key);if(alive.current)setError(e.message);}
    finally{if(alive.current)setBusy(false);}
  };
  const terminal=(item,action)=>act('/'+item.id+'/'+action,{expectedVersion:item.version,confirmed:true},()=>{setAccepted({});setNotice('Acción registrada. Recarga la bandeja para consultar su estado actual.');});
  const simple=(id,action)=>act('/'+id+'/'+action,{confirmed:true},()=>setNotice('Acción registrada.'));
  return <section className="space-y-5 max-w-4xl mx-auto" aria-label="Vinculación bilateral">
    <h1 className="text-2xl font-bold">Vinculación bilateral</h1>
    <p>Al aceptar: acuerdo bilateral completado; admisión pendiente; tratamiento sin activar. Esta vinculación no concede acceso a entrevista ni expediente.</p>
    <p className="text-sm text-gray-600">Ensayo con datos ficticios y entrega simulada. Los textos iniciales no son documentación jurídica definitiva. Las verificaciones de contacto y la declaración humana no garantizan identidad civil ni detectan una declaración falsa.</p>
    {error&&<p role="alert" className="p-3 bg-red-50 text-red-800">{error}</p>}
    {notice&&<p role="status" className="p-3 bg-green-50 text-green-800">{notice}</p>}
    <button className={buttonStyle} disabled={busy} onClick={async()=>{setBusy(true);try{await load();setError('');}catch(e){setError(e.message);}finally{setBusy(false);}}}>Actualizar bandeja</button>
    {professional?<>
      <div className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-bold">Referencia privada profesional</h2>
        <p>Comparte esta referencia con la persona conocida. Desde su cuenta autenticada podrá generar una referencia dirigida a ti. No es un directorio público.</p>
        <button disabled={busy} className={buttonStyle} onClick={()=>act('/professional-reference',{},r=>{setPrivateReference(r.reference||'');if(!r.reference)setNotice('La referencia ya se generó. Genera otra si perdiste la respuesta.');})}>Generar referencia profesional</button>
        {privateReference&&<label className="block">Referencia profesional (24 horas)<textarea aria-label="Referencia profesional (24 horas)" readOnly value={privateReference} className={inputStyle} autoComplete="off"/></label>}
      </div>
      <form autoComplete="off" className="bg-white border rounded-xl p-5 space-y-3" onSubmit={e=>{e.preventDefault();act('',{email,recipientReference,conditionsVersion:terms.conditionsVersion,conditionsHash:terms.conditionsHash,declarationVersion:terms.declarationVersion,declared,proposed},()=>{setEmail('');setRecipientReference('');setDeclared(false);setProposed(false);setNotice('Acuse recibido. La bandeja no confirma existencia de cuenta, elegibilidad ni entrega.');});}}>
        <h2 className="text-lg font-bold">Proponer vinculación individual</h2>
        <label className="block">Correo conocido de la persona<input className={inputStyle} type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <label className="block">Referencia dirigida recibida por canal independiente<textarea className={inputStyle} required maxLength={128} value={recipientReference} onChange={e=>setRecipientReference(e.target.value)}/></label>
        <p>Propósito: vinculación preclínica individual. Vigencia: 14 días desde la emisión, sin ampliación por reenvío.</p>
        <p>{terms?.conditionsText}</p><p>Versión: {terms?.conditionsVersion}</p>
        <label className="block"><input type="checkbox" checked={declared} onChange={e=>setDeclared(e.target.checked)}/> {terms?.declarationText} ({terms?.declarationVersion})</label>
        <label className="block"><input type="checkbox" checked={proposed} onChange={e=>setProposed(e.target.checked)}/> Propongo expresamente esta vinculación con las condiciones y versión mostradas.</label>
        <button className={buttonStyle} disabled={busy||!terms||!declared||!proposed}>Emitir propuesta</button>
      </form>
    </>:<div className="bg-white border rounded-xl p-5 space-y-3">
      <h2 className="text-lg font-bold">Preparar referencia dirigida</h2>
      <p>Introduce la referencia privada que te dio el profesional. Se requiere ser adulto y tener correo y teléfono vigentes verificados.</p>
      <label className="block">Referencia profesional<textarea className={inputStyle} value={professionalReference} autoComplete="off" maxLength={128} onChange={e=>{setProfessionalReference(e.target.value);setPreflight(null);setDirected(false);setReference(null);}}/></label>
      <button disabled={busy||!professionalReference} className={buttonStyle} onClick={()=>act('/preflight',{professionalReference},r=>setPreflight(r))}>Consultar profesional</button>
      {preflight&&<>
        <p>Profesional: <strong>{preflight.professionalName}</strong>. Propósito: vinculación preclínica individual.</p>
        <label className="block"><input type="checkbox" checked={directed} onChange={e=>setDirected(e.target.checked)}/> Confirmo el profesional destinatario. Generar esta referencia no acepta una invitación.</label>
        <button className={buttonStyle} disabled={busy||!directed} onClick={()=>act('/recipient-reference',{professionalReference,confirmed:directed},r=>setReference(r))}>Generar mi referencia dirigida</button>
      </>}
      {reference&&<div role="status"><p>Comparte esta referencia con {reference.professionalName} mediante un canal de confianza independiente del correo de invitación. Es privada, de un uso, y vence el {date(reference.expiresAt)}. Una nueva referencia sustituye la anterior.</p>
        {reference.reference?<textarea aria-label="Mi referencia dirigida" className={inputStyle} readOnly value={reference.reference}/>:<p>La referencia ya se generó. Si perdiste la respuesta, genera otra con una operación nueva.</p>}</div>}
    </div>}
    <h2 className="text-lg font-bold">{professional?'Acuses de mis propuestas':'Mis invitaciones'}</h2>
    {!data.items.length&&<p>La bandeja está vacía.</p>}
    {data.items.map(item=><article className="bg-white border rounded-xl p-5 space-y-3" key={item.id}>
      <h3 className="font-bold">{professional?'Propuesta '+item.id.slice(0,8):item.professionalName} · {labels[item.status]}</h3>
      <p>Vencimiento: {date(item.expiresAt)}</p>
      {professional?<div className="flex gap-3">
        <button disabled={busy||!['received'].includes(item.status)} className={buttonStyle} onClick={()=>simple(item.id,'resend')}>Solicitar reenvío</button>
        <button disabled={busy||item.status!=='received'} className={buttonStyle} onClick={()=>terminal(item,'withdraw')}>Retirar propuesta</button>
      </div>:<>
        <p>Propósito: vinculación preclínica individual.</p><p>{item.conditionsText}</p><p>Versión: {item.conditionsVersion}</p>
        {item.status==='pending'&&<>
          <label className="block"><input type="checkbox" checked={!!accepted[item.id]} onChange={e=>setAccepted({...accepted,[item.id]:e.target.checked})}/> Acepto expresamente las condiciones y versión mostradas.</label>
          <div className="flex flex-wrap gap-3">
            <button className={buttonStyle} disabled={busy||!accepted[item.id]||!item.acceptanceAvailable} onClick={()=>act('/'+item.id+'/accept',{expectedVersion:item.version,conditionsVersion:item.conditionsVersion,conditionsHash:item.conditionsHash,confirmed:!!accepted[item.id]},()=>{setAccepted({});setNotice('Acuerdo bilateral completado; admisión pendiente; tratamiento sin activar.');})}>Aceptar invitación</button>
            <button disabled={busy} className={buttonStyle} onClick={()=>terminal(item,'decline')}>Rechazar invitación</button>
          </div>
          {!item.acceptanceAvailable&&<p>La aceptación no está disponible actualmente. El vencimiento original se conserva.</p>}
        </>}
        <button disabled={busy} className={buttonStyle} onClick={()=>simple(item.id,'block')}>Bloquear invitaciones de este profesional</button>
      </>}
    </article>)}
    {!professional&&<><h2 className="text-lg font-bold">Bloqueos específicos</h2>{data.blocks.map(b=><div key={b.id} className="flex gap-3 items-center"><span>{b.professionalName}</span><button className={buttonStyle} disabled={busy} onClick={()=>simple(b.id,'unblock')}>Desbloquear</button></div>)}<p>Desbloquear no restaura invitaciones anteriores ni cambia tratamientos.</p></>}
    <h2 className="text-lg font-bold">Mis acuerdos</h2>
    {data.agreements.map(g=><article className="bg-white border rounded-xl p-5 space-y-3" key={g.id}>
      <h3 className="font-bold">{g.professionalName} · {labels[g.status]}</h3><p>{g.conditionsText}</p><p>Versión: {g.conditionsVersion}. Completado: {date(g.completedAt)}</p>
      <p>{g.status==='unlinked'?'Acuerdo terminado. La admisión dependiente no puede avanzar.':'Admisión pendiente; autorización de admisión no concedida; tratamiento sin activar.'}</p>
      {g.status==='completed'&&<button disabled={busy} className={buttonStyle} onClick={()=>{if(window.confirm('¿Terminar este acuerdo preclínico de inmediato? No termina un tratamiento activo o pausado.'))terminal(g,'unlink');}}>Terminar acuerdo unilateralmente</button>}
    </article>)}
    {!professional&&data.notices.length>0&&<p role="status">Hay una acción disponible en tu cuenta. Consulta la bandeja autenticada.</p>}
  </section>;
}
