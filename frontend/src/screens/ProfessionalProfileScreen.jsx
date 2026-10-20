import {useEffect,useState} from 'react';
import * as api from '../api/professional';
const fields=[['professionalName','Nombre profesional'],['professionalTitle','Título profesional'],['licenseNumber','Cédula profesional'],['academicTraining','Formación académica'],['formalSpecialties','Especialidades formales'],['certifications','Certificaciones'],['credentialedApproaches','Enfoques acreditativos']];
const empty=Object.fromEntries(fields.map(([key])=>[key,'']));
const button='rounded-lg bg-indigo-700 px-4 py-2 text-white disabled:opacity-40';
const Credential=({value})=>value?<dl>{fields.map(([key,label])=><div className="my-2" key={key}><dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap">{Array.isArray(value[key])?value[key].join('\n'):value[key]||'Sin dato'}</dd></div>)}</dl>:<p>No hay una versión nueva aprobada. La aprobación histórica de la cuenta no acredita estas credenciales.</p>;
export {Credential};
export default function ProfessionalProfileScreen(){
  const [data,setData]=useState(null),[credentials,setCredentials]=useState(null),[draft,setDraft]=useState(empty),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[file,setFile]=useState(null),[photo,setPhoto]=useState('');
  const refresh=async()=>{const next=await api.getProfile();setData(next);if(next.profile)setCredentials(await api.getCredentials());};
  useEffect(()=>{let live=true;api.getProfile().then(async next=>{if(live)setData(next);if(next.profile){const result=await api.getCredentials();if(live)setCredentials(result);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
  const photoId=data?.profile?.currentPhotoId;
  useEffect(()=>{let live=true,url;setPhoto('');if(photoId)api.loadPhoto().then(blob=>{url=URL.createObjectURL(blob);if(live)setPhoto(url);else URL.revokeObjectURL(url);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;if(url)URL.revokeObjectURL(url);};},[photoId]);
  const run=async(operation,message)=>{setBusy(true);setError('');setNotice('');try{await operation();await refresh();setNotice(message);}catch(e){setError(e.message);}finally{setBusy(false);}};
  const profile=data?.profile;
  return <section aria-label="Perfil profesional privado" className="space-y-5 rounded-2xl bg-white p-6 shadow">
    <h1 className="text-2xl font-bold">Mi perfil profesional privado</h1><p>Estos datos permanecen privados. Publicación y recepción de nuevos pacientes están deshabilitadas en esta entrega.</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {!data?<p>Cargando perfil…</p>:!profile?<button className={button} disabled={busy} onClick={()=>run(api.createProfile,'Perfil privado creado.')}>Crear perfil privado</button>:<>
      <form className="space-y-3" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);run(()=>api.updateProfile({rowVersion:profile.rowVersion,description:form.get('description'),modality:form.get('modality')||null,city:form.get('city'),state:form.get('state'),approachCodes:[]}), 'Información privada guardada.');}} key={profile.rowVersion}>
        <label className="block">Descripción profesional<textarea className="block w-full rounded border p-2" name="description" maxLength={2000} defaultValue={profile.description}/></label>
        <p>Texto privado. Su contenido no constituye una credencial aprobada ni una autorización de publicación futura.</p>
        <label className="block">Modalidad<select name="modality" defaultValue={profile.modality||''} className="ml-3 rounded border p-2"><option value="">Sin especificar</option><option value="in_person">Presencial</option><option value="online">En línea</option><option value="both">Ambas</option></select></label>
        <label className="block">Ciudad<input className="ml-3 rounded border p-2" name="city" maxLength={100} defaultValue={profile.city}/></label>
        <label className="block">Estado<input className="ml-3 rounded border p-2" name="state" maxLength={100} defaultValue={profile.state}/></label>
        <label className="block">Enfoques generales<select disabled className="ml-3 rounded border p-2"><option>Catálogo pendiente de aprobación</option></select></label>
        <button className={button} disabled={busy}>Guardar información privada</button>
      </form>
      <section aria-label="Fotografía privada"><h2 className="text-xl font-semibold">Fotografía privada opcional</h2>{photo&&<img src={photo} alt="Tu fotografía profesional privada" className="my-3 h-40 w-40 rounded-xl object-cover"/>}
        <p>JPEG, PNG o WebP estático, hasta 5 MiB. Las versiones anteriores se conservan; no se publican.</p>
        <label className="block my-3">Seleccionar fotografía<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files[0]||null)}/></label>
        <button className={button} disabled={busy||!file||!data.capabilities.photographsConfigured} onClick={()=>run(()=>api.uploadPhoto(file,profile.rowVersion),'Fotografía privada guardada.')}>Guardar fotografía privada</button>
        <button className="ml-3 rounded border p-2" disabled={busy} onClick={()=>run(()=>api.recoverUploads(profile.rowVersion),'Cargas incompletas retiradas. Archivos y metadatos conservados.')}>Descartar cargas incompletas</button>
        {photoId&&<button className="ml-3 rounded border p-2" disabled={busy} onClick={()=>run(()=>api.retirePhoto(profile.rowVersion),'Fotografía retirada del perfil; historial conservado.')}>Retirar fotografía</button>}
      </section>
      <section><h2 className="text-xl font-semibold">Última versión aprobada</h2><Credential value={credentials?.approved}/></section>
      <section><h2 className="text-xl font-semibold">Propuesta pendiente</h2>{credentials?.pending?<><p>Versión {credentials.pending.version}. La propuesta permanece separada de lo aprobado.</p><Credential value={credentials.pending}/></>:<form className="space-y-3" onSubmit={event=>{event.preventDefault();const payload={rowVersion:profile.rowVersion,...draft};for(const [key]of fields.slice(3))payload[key]=draft[key].split('\n').map(v=>v.trim()).filter(Boolean);run(()=>api.submitProposal(payload),'Propuesta presentada para revisión.');}}>
        {fields.map(([key,label],index)=><label key={key} className="block">{label}{index>=3?' (una entrada por línea)':''}<textarea className="block w-full rounded border p-2" aria-label={label} required={key==='professionalName'} maxLength={index>=3?4000:200} value={draft[key]} onChange={event=>setDraft({...draft,[key]:event.target.value})}/></label>)}
        <p>La aprobación permanece deshabilitada hasta contar con criterios de evidencia autorizados. Se pueden presentar y revisar propuestas privadas.</p><button className={button} disabled={busy}>Presentar credenciales</button>
      </form>}</section>
      <section><h2 className="text-xl font-semibold">Decisiones comunicadas</h2>{credentials?.decisions.map(item=><p key={item.version} className="my-2 whitespace-pre-wrap">Versión {item.version}: {item.outcome==='approved'?'Aprobada':'Rechazada'}. {item.ownerMessage}</p>)}</section>
    </>}
  </section>;
}
