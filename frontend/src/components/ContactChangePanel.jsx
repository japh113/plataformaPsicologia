import { useEffect,useState } from 'react';
import { apiRequest,clearAuthToken } from '../api/client';
import { formatRetryAfter } from '../utils/identityFeedback';
const freshDraft=()=>({channel:'email',contact:'',password:'',operationId:crypto.randomUUID()});
export default function ContactChangePanel() {
  const [request,setRequest]=useState(null),[draft,setDraft]=useState(freshDraft);
  const [editing,setEditing]=useState(false),[password,setPassword]=useState(''),[secret,setSecret]=useState('');
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[wait,setWait]=useState(0),[now,setNow]=useState(Date.now());
  const [resendId,setResendId]=useState(()=>crypto.randomUUID());
  const pending=request?.status==='pending',expired=pending && Date.parse(request.expiresAt)<=now;
  const seconds=Math.max(0,Math.ceil((Date.parse(request?.reauthenticationExpiresAt||'')-now)/1000))||0;
  const load=async()=>{const result=await apiRequest('/auth/contact-changes');setRequest(result.data.request);};
  useEffect(()=>{
    let live=true;
    apiRequest('/auth/contact-changes').then(r=>{if(live)setRequest(r.data.request);}).catch(e=>{if(live)setNotice(e.message);});
    const readLink=()=>{
      const params=new URLSearchParams(window.location.hash.slice(1)),value=params.get('changeEmail');
      if(!value)return;
      const index=value.indexOf('.');
      if(index>0)setSecret(value.slice(index+1));
      params.delete('changeEmail');
      window.history.replaceState({},'',window.location.pathname+window.location.search+(params.size?'#'+params.toString():''));
    };
    readLink();window.addEventListener('hashchange',readLink);
    const timer=setInterval(()=>{setNow(Date.now());setWait(v=>Math.max(0,v-1));},1000);
    return()=>{live=false;clearInterval(timer);window.removeEventListener('hashchange',readLink);};
  },[]);
  const act=async(operation,body={})=>{
    if(busy)return;
    setBusy(true);setNotice('');
    try {
      const path=operation==='start'?'/auth/contact-changes':'/auth/contact-changes/'+request.id+'/'+operation;
      const result=await apiRequest(path,{method:'POST',body:JSON.stringify(body)});
      setPassword('');setDraft(v=>({...v,password:''}));
      if(result.data.confirmed){
        clearAuthToken();window.dispatchEvent(new Event('psicopanel-session-ended'));return;
      }
      if(result.data.sent){setWait(result.data.retryAfter);setResendId(crypto.randomUUID());setNotice('Verificación solicitada al nuevo contacto. Abre el enlace o escribe el código y verifica aquí.');}
      else {
        setRequest(result.data.request);setEditing(false);setSecret('');
        setNotice(operation==='verify'?'Nuevo contacto verificado. Falta confirmar el cambio.':operation==='cancel'?'Solicitud cancelada. Conservas tu contacto vigente.':'Solicitud actualizada. Tu contacto vigente todavía no cambia.');
      }
    } catch(error){
      if(operation==='resend' && [409,503].includes(error.status))setResendId(crypto.randomUUID());
      if(error.retryAfter && operation==='resend')setWait(error.retryAfter);
      setNotice(error.message+(error.retryAfter?' Reintenta en '+formatRetryAfter(error.retryAfter)+'.':''));
      if(error.status===409)await load().catch(()=>{});
    } finally{setBusy(false);}
  };
  const begin=channel=>{setDraft({...freshDraft(),channel});setEditing(true);setSecret('');setNotice('');};
  const button='rounded-xl border px-3 py-2 text-sm disabled:opacity-50';
  return <div className="mt-5 border-t border-slate-200 pt-4" aria-label="Cambio seguro de contactos">
    <h3 className="font-semibold text-slate-900">Cambiar correo o teléfono</h3>
    <p className="mt-1 text-sm text-slate-600">El contacto vigente se conserva hasta verificar el nuevo y confirmar. Al completar, se cerrarán todas tus sesiones.</p>
    <p role="status" className="my-2 text-sm text-indigo-700">{notice}</p>
    {!editing && <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} className={button} onClick={()=>begin('email')}>{pending&&!expired?'Sustituir solicitud por correo':'Cambiar correo'}</button>
      <button type="button" disabled={busy} className={button} onClick={()=>begin('sms')}>{pending&&!expired?'Sustituir solicitud por teléfono':'Cambiar teléfono'}</button>
      <button type="button" disabled={busy} className={button} onClick={()=>load().catch(e=>setNotice(e.message))}>Reanudar / consultar estado</button>
    </div>}
    {editing && <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();act('start',{...draft,...(pending&&!expired?{replaceRequestId:request.id}:{})});}}>
      <label className="min-w-0 text-sm">{draft.channel==='email'?'Nuevo correo':'Nuevo teléfono internacional'}
        <input aria-label={draft.channel==='email'?'Nuevo correo':'Nuevo teléfono internacional'} type={draft.channel==='email'?'email':'tel'} required maxLength={draft.channel==='email'?254:26} className="mt-1 w-full rounded-xl border p-2" value={draft.contact} onChange={e=>setDraft(v=>({...v,contact:e.target.value}))}/>
      </label>
      <label className="min-w-0 text-sm">Contraseña actual
        <input aria-label="Contraseña para iniciar cambio" type="password" autoComplete="current-password" required className="mt-1 w-full rounded-xl border p-2" value={draft.password} onChange={e=>setDraft(v=>({...v,password:e.target.value}))}/>
      </label>
      {pending&&!expired&&<p className="text-sm text-amber-700 sm:col-span-2">Sustituir invalida la solicitud y los códigos anteriores. Las cuotas se conservan.</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2"><button disabled={busy} className={button}>{pending&&!expired?'Sustituir expresamente':'Iniciar cambio seguro'}</button><button type="button" className={button} onClick={()=>{setEditing(false);setDraft(freshDraft());}}>Volver</button></div>
    </form>}
    {request && !editing && <div className="mt-4 min-w-0 rounded-xl bg-slate-50 p-4">
      <p className="text-sm">Estado: <strong>{expired?'Vencido':({pending:'Pendiente',completed:'Completado',cancelled:'Cancelado',replaced:'Sustituido',expired:'Vencido',invalidated:'Invalidado'})[request.status]}</strong></p>
      {pending&&!expired&&<>
        <p className="mt-2 break-all text-sm">Candidato: <strong>{request.candidate}</strong></p>
        <p className="text-sm">{request.verified?'Candidato verificado':'Candidato sin verificar'}. Solicitud válida hasta {new Date(request.expiresAt).toLocaleString('es-MX')}.</p>
        <p className="mt-2 text-sm">{seconds?'Contraseña validada: quedan '+formatRetryAfter(seconds)+'.':'Reautenticación requerida antes de confirmar.'}</p>
        {wait>0&&!request.verified&&<p className="text-sm text-amber-700">Nuevo envío disponible en {formatRetryAfter(wait)}.</p>}
        {!request.verified&&<>
          <button disabled={busy||wait>0} type="button" className={button+' mt-3'} onClick={()=>act('resend',{operationId:resendId})}>Enviar verificación al nuevo contacto</button>
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();act('verify',{secret});}}>
            <input aria-label="Secreto del nuevo contacto" autoComplete="one-time-code" type="password" required maxLength={request.channel==='sms'?6:43} inputMode={request.channel==='sms'?'numeric':'text'} className="min-w-0 flex-1 rounded-xl border p-2" value={secret} onChange={e=>setSecret(e.target.value)}/>
            <button disabled={busy} className={button}>Verificar candidato</button>
          </form>
        </>}
        {!seconds&&<form className="mt-3 flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();act('reauthenticate',{password});}}>
          <input aria-label="Contraseña para reautenticar" type="password" required autoComplete="current-password" className="min-w-0 flex-1 rounded-xl border p-2" value={password} onChange={e=>setPassword(e.target.value)}/>
          <button disabled={busy} className={button}>Validar contraseña de nuevo</button>
        </form>}
        <p className="mt-3 text-sm text-amber-800">Confirmar sustituye tu contacto y cierra todas las sesiones, incluida esta. Si cambias el correo, úsalo para volver a entrar.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy||!request.verified||!seconds} className="rounded-xl bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50" onClick={()=>act('confirm')}>Confirmar cambio y cerrar sesiones</button>
          <button type="button" disabled={busy} className={button} onClick={()=>act('cancel')}>Cancelar solicitud</button>
        </div>
      </>}
    </div>}
  </div>;
}
