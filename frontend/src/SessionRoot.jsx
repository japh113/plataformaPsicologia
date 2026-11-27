import {useEffect,useState} from 'react';
import App from './App';
import {restrictedStatus} from './api/professional';
import ProfessionalAccreditation from './screens/ProfessionalAccreditation';
import DirectoryScreen from './screens/DirectoryScreen';
import {directoryEnabled} from './api/directory';
const labels={pending_review:'Pendiente de revisión',rejected:'Solicitud rechazada',suspended:'Cuenta suspendida'};
function RestrictedStatus({token,onLogout}){
  const [data,setData]=useState(null),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();restrictedStatus(token,controller.signal).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[token]);
  if(data?.manualOnboarding)return <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-8 sm:py-10">
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-4">
        <span className="font-bold tracking-tight text-slate-900">PsicoPanel</span>
        <button className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 focus-visible:outline-indigo-700" onClick={onLogout}>Cerrar sesión</button>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <ProfessionalAccreditation token={token}/>
        {data.messages.length>0&&<section className="mt-5 space-y-2 border-t border-slate-200 pt-5" aria-label="Mensajes de tu cuenta">
          <h2 className="font-bold text-slate-900">Mensajes de tu cuenta</h2>
          {data.messages.map(item=><p className="whitespace-pre-wrap break-words text-sm text-slate-700" key={item.id}>{item.message}</p>)}
        </section>}
      </div>
    </div>
  </main>;
  return <main className="min-h-screen bg-slate-50 p-8"><section className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow" aria-label="Estado profesional restringido">
    <h1 className="text-2xl font-bold">Estado de tu cuenta profesional</h1>
    <p className="my-4">Este acceso permite consultar tu estado y los mensajes dirigidos a ti. Las funciones clínicas y la edición de perfil requieren una cuenta profesional activa.</p>
    {error?<p role="alert">{error}</p>:data?<><h2 className="font-semibold">{labels[data.status]}</h2>{data.messages.map(item=><p className="my-3 whitespace-pre-wrap" key={item.id}>{item.message}</p>)}</>:<p>Consultando estado…</p>}
    <button className="mt-6 rounded-lg bg-slate-900 px-4 py-2 text-white" onClick={onLogout}>Cerrar sesión</button>
  </section></main>;
}
export default function SessionRoot(){
  const [restricted,setRestricted]=useState(null),[generation,setGeneration]=useState(0);
  const directoryRoute=/^\/directorio(?:\/(.*))?$/.exec(window.location.pathname);
  if(directoryEnabled && directoryRoute) return <DirectoryScreen id={directoryRoute[1]}/>;
  if(restricted)return <RestrictedStatus token={restricted} onLogout={()=>{setRestricted(null);setGeneration(value=>value+1);}}/>;
  return <App key={generation} onRestrictedSession={setRestricted}/>;
}
