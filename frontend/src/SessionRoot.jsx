import {useEffect,useState} from 'react';
import App from './App';
import {restrictedStatus} from './api/professional';
const labels={pending_review:'Pendiente de revisión',rejected:'Solicitud rechazada',suspended:'Cuenta suspendida'};
function RestrictedStatus({token,onLogout}){
  const [data,setData]=useState(null),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();restrictedStatus(token,controller.signal).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[token]);
  return <main className="min-h-screen bg-slate-50 p-8"><section className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow" aria-label="Estado profesional restringido">
    <h1 className="text-2xl font-bold">Estado de tu cuenta profesional</h1>
    <p className="my-4">Este acceso permite consultar tu estado y los mensajes dirigidos a ti. Las funciones clínicas y la edición de perfil requieren una cuenta profesional activa.</p>
    {error?<p role="alert">{error}</p>:data?<><h2 className="font-semibold">{labels[data.status]}</h2>{data.messages.map(item=><p className="my-3 whitespace-pre-wrap" key={item.id}>{item.message}</p>)}</>:<p>Consultando estado…</p>}
    <button className="mt-6 rounded-lg bg-slate-900 px-4 py-2 text-white" onClick={onLogout}>Cerrar sesión</button>
  </section></main>;
}
export default function SessionRoot(){
  const [restricted,setRestricted]=useState(null),[generation,setGeneration]=useState(0);
  if(restricted)return <RestrictedStatus token={restricted} onLogout={()=>{setRestricted(null);setGeneration(value=>value+1);}}/>;
  return <App key={generation} onRestrictedSession={setRestricted}/>;
}
