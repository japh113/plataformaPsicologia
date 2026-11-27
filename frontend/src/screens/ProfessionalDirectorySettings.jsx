import {Camera, Eye, Globe2, LockKeyhole, Pencil, ShieldCheck} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import * as api from '../api/professional';
import PublicProfile, {ProfessionalAvatar} from '../components/professional/PublicProfile';
import {LocationFields, ModalityField} from '../components/professional/ProfileFields';
import {control, modalityLabels, primary, secondary} from '../components/professional/fields';
import {LegacyCredentials} from './ProfessionalProfileScreen';
import ProfessionalAccreditation from './ProfessionalAccreditation';

const panel = 'space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6';
const heading = 'text-lg font-bold text-slate-950';

async function loadProfile() {
  // A concurrent owner edit or decision can land between the independent reads.
  // Read once more so the preview never describes a different version than the controls.
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await api.getProfile();
    if (!data.profile) return {data};
    const publication = await api.getPublication();
    if (publication.rowVersion === data.profile.rowVersion) {
      const credentials = data.manualAccreditation ? null : await api.getCredentials();
      return {data,publication,credentials};
    }
  }
  throw new Error('El perfil cambió mientras lo consultabas. Actualiza para continuar.');
}

function ProfessionalDetails({data,publication,busy,onSave,onCancel}) {
  const {profile} = data;
  const [state,setState] = useState(Object.hasOwn(publication.locations,profile.state) ? profile.state : '');
  const [city,setCity] = useState(publication.locations[state]?.includes(profile.city) ? profile.city : '');
  const [locationEdited,setLocationEdited] = useState(false);
  return <form className="space-y-4" onSubmit={event=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    onSave({
      rowVersion:profile.rowVersion, description:form.get('description'), modality:form.get('modality') || null,
      ...(locationEdited ? {state,city} : {}), ...(data.manualAccreditation ? {approachCodes:form.getAll('approachCodes')} : {}),
    });
  }}>
    <div>
      <label htmlFor="professional-description" className="text-sm font-medium text-slate-800">Descripción privada</label>
      <textarea id="professional-description" name="description" className={control} rows={4} maxLength={2000} defaultValue={profile.description}/>
    </div>
    <p className="text-sm text-slate-700">La presentación del directorio se genera con tu modalidad y ubicación.</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <ModalityField defaultValue={profile.modality || ''} required={profile.isPublic}/>
      <LocationFields locations={publication.locations} state={state} city={city}
        setState={value=>{setLocationEdited(true);setState(value);}} setCity={value=>{setLocationEdited(true);setCity(value);}}
        required={profile.isPublic}/>
    </div>
    {locationEdited && state && !city && <p className="text-sm text-slate-700">Elige una ciudad para guardar la ubicación.</p>}
    {data.manualAccreditation && data.catalog.length > 0 && <fieldset className="space-y-2 rounded-xl border border-slate-200 px-3 pb-3">
      <legend className="px-1 text-sm font-semibold text-slate-800">Enfoques declarados (opcional)</legend>
      <p className="text-sm text-slate-700">Estas opciones del ensayo reflejan tu práctica declarada.</p>
      <div className="flex flex-wrap gap-x-5">
        {data.catalog.map(({code,label})=><label key={code} className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="approachCodes" className="h-4 w-4 accent-indigo-700" value={code}
            defaultChecked={data.approaches.includes(code)}/>{label}
        </label>)}
      </div>
    </fieldset>}
    <div className="flex flex-wrap gap-2">
      <button className={primary} disabled={busy || Boolean(locationEdited && state && !city)}>Guardar información</button>
      <button type="button" className={secondary} disabled={busy} onClick={onCancel}>Cancelar</button>
    </div>
  </form>;
}

function PhotoSettings({data,busy,run}) {
  const [file,setFile] = useState(null);
  const {profile} = data;
  return <details className="rounded-xl border border-slate-200 px-4">
    <summary className="cursor-pointer py-3 text-sm font-semibold text-slate-800">Gestionar fotografía</summary>
    <div className="space-y-3 pb-4">
      {data.capabilities.photographsConfigured ? <>
        <p className="text-sm text-slate-700">JPEG, PNG o WebP estático, hasta 5 MiB.
          {profile.isPublic && ' Al guardar otra fotografía, tu perfil quedará privado hasta que vuelvas a publicarlo.'}</p>
        <label className="block text-sm font-medium text-slate-800">Seleccionar fotografía
          <input type="file" className={control} accept="image/jpeg,image/png,image/webp" onChange={event=>setFile(event.target.files[0] || null)}/>
        </label>
        <div className="flex flex-wrap gap-2">
          <button className={primary} disabled={busy || !file} onClick={()=>
            run(()=>api.uploadPhoto(file,profile.rowVersion),'Fotografía guardada en privado.')}>Guardar fotografía</button>
          {profile.currentPhotoId && <button className={secondary} disabled={busy} onClick={()=>
            run(()=>api.retirePhoto(profile.rowVersion),'Fotografía retirada del perfil.')}>Retirar fotografía</button>}
          <button className={secondary} disabled={busy} onClick={()=>
            run(()=>api.recoverUploads(profile.rowVersion),'Cargas incompletas retiradas.')}>Descartar cargas incompletas</button>
        </div>
      </> : <p className="text-sm text-slate-700">El almacenamiento de fotografías está deshabilitado en este entorno.</p>}
    </div>
  </details>;
}

function PublicationConfirmation({publish,busy,onCancel,onConfirm}) {
  const dialog=useRef(null);
  useEffect(()=>{
    const element=dialog.current;
    element.showModal();
    return ()=>element.close();
  },[]);
  return <dialog ref={dialog} aria-labelledby="publication-confirmation-title"
    className="w-[calc(100%-2rem)] max-w-md space-y-4 rounded-2xl border border-slate-200 p-5 text-slate-900 shadow-xl backdrop:bg-slate-900/50 sm:p-6"
    onCancel={event=>{event.preventDefault();if(!busy)onCancel();}}>
    <h2 className={heading} id="publication-confirmation-title">{publish ? 'Publicar tu perfil' : 'Retirar tu perfil público'}</h2>
    <p className="text-sm leading-6 text-slate-700">{publish
      ? 'Cualquier visitante del ensayo podrá ver los datos de la vista previa. Las copias que otras personas descarguen pueden conservarse después del retiro.'
      : 'Los visitantes dejarán de ver tu perfil y fotografía. Tu preferencia de recepción se conservará.'}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={secondary} disabled={busy} onClick={onCancel}>Cancelar</button>
      <button type="button" className={publish ? primary : secondary + ' border-rose-300 text-rose-900'} disabled={busy} onClick={onConfirm}>
        {publish ? 'Confirmar publicación' : 'Confirmar retiro'}
      </button>
    </div>
  </dialog>;
}

export default function ProfessionalDirectorySettings({name}) {
  const [record,setRecord] = useState(null);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const [load,setLoad] = useState(0);
  const [edit,setEdit] = useState(false);
  const [preview,setPreview] = useState(false);
  const [confirm,setConfirm] = useState(null);
  const [photo,setPhoto] = useState(null);
  const previewHeading = useRef(null);
  useEffect(()=>{
    let live=true;
    loadProfile().then(next=>{if(live)setRecord(next);}).catch(e=>{if(live)setError(e.message);});
    return ()=>{live=false;};
  },[load]);

  const photoId=record?.data.profile?.currentPhotoId;
  useEffect(()=>{
    if (!photoId) return;
    let live=true, url;
    api.loadPhoto(photoId).then(blob=>{
      url=URL.createObjectURL(blob);
      if (live) setPhoto({id:photoId,url});
      else URL.revokeObjectURL(url);
    }).catch(()=>{if(live)setPhoto({id:photoId,url:''});});
    return ()=>{live=false;if(url)URL.revokeObjectURL(url);};
  },[photoId,load]);
  const photoSource=photo?.id===photoId ? photo?.url || '' : '';
  const refresh=()=>{setError('');setLoad(value=>value+1);};
  const run=async(operation,message)=>{
    setBusy(true);setError('');setNotice('');
    try {
      await operation();
      setConfirm(null);setEdit(false);setNotice(message);
      try {setRecord(await loadProfile());} catch (e) {setRecord(null);throw e;}
    } catch (e) {
      setConfirm(null);setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const {data,publication,credentials}=record || {};
  const profile=data?.profile;
  const eligible=Boolean(publication?.profile);
  const isPublic=Boolean(profile?.isPublic && publication?.ready);
  const displayName=publication?.approvedName || name || 'Mi perfil profesional';
  const accreditation=eligible ? 'Acreditación vigente' : publication?.approvedName && data.manualAccreditation
    ? 'Acreditación por revalidar' : profile?.pendingCredentialVersion && data.manualAccreditation
      ? 'Acreditación en revisión' : 'Acreditación requerida';

  return <div className="mx-auto max-w-5xl space-y-5" aria-label="Perfil profesional privado">
    <header className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-100 via-indigo-50 to-white p-5 sm:p-8">
      <h1 className="text-sm font-semibold text-indigo-900">Mi perfil profesional</h1>
      <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
        <ProfessionalAvatar name={displayName} src={photoSource} large/>
        <div className="min-w-0 space-y-2">
          <p className="break-words text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{displayName}</p>
          {profile && <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-950">
              <ShieldCheck size={14} aria-hidden="true"/>{accreditation}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-800">
              {isPublic ? <Globe2 size={14} aria-hidden="true"/> : <LockKeyhole size={14} aria-hidden="true"/>}
              {isPublic ? 'Perfil público' : 'Perfil privado'}
            </span>
            {eligible && profile.pendingCredentialVersion && <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-800">
              Cambios en revisión
            </span>}
          </div>}
        </div>
      </div>
    </header>
    {error && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
      <p role="alert" className="text-sm text-rose-900">{error}</p>
      <button className={secondary} disabled={busy} onClick={refresh}>Actualizar perfil</button>
    </div>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-950">{notice}</p>}
    {!record ? !error && <p role="status" className="text-sm text-slate-700">Cargando tu perfil…</p> : !profile ?
      <div className={panel}><p>Prepara tu perfil privado antes de configurar la publicación.</p>
        <button className={primary} disabled={busy} onClick={()=>run(api.createProfile,'Perfil privado creado.')}>Crear perfil privado</button>
      </div> : <>
      <div className="grid items-start gap-5 xl:grid-cols-[1.3fr_1fr]">
        <section className={panel} aria-labelledby="professional-presentation">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={heading} id="professional-presentation">Presentación profesional</h2>
            {!edit && <button className={secondary} disabled={busy} onClick={()=>setEdit(true)}><Pencil size={16} aria-hidden="true"/> Editar información</button>}
          </div>
          {edit ? <ProfessionalDetails key={profile.rowVersion} data={data} publication={publication} busy={busy}
            onCancel={()=>setEdit(false)} onSave={changes=>run(()=>api.updateProfile(changes),'Información guardada.')}/> : <>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{profile.description || 'Agrega una descripción para tu perfil privado.'}</p>
            <dl className="grid gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold text-slate-900">Modalidad</dt><dd className="text-slate-700">{modalityLabels[profile.modality] || 'Por elegir'}</dd></div>
              <div><dt className="font-semibold text-slate-900">Ubicación</dt>
                <dd className="break-words text-slate-700">{[profile.city,profile.state].filter((value,i,all)=>value && all.indexOf(value)===i).join(', ') || 'Por elegir'}</dd></div>
              <div className="sm:col-span-2"><dt className="font-semibold text-slate-900">Enfoques declarados</dt>
                <dd className="text-slate-700">{data.catalog.filter(item=>data.approaches.includes(item.code)).map(item=>item.label).join(' · ') || 'Sin enfoques seleccionados'}</dd></div>
            </dl>
          </>}
          <PhotoSettings key={profile.currentPhotoId || 'no-photo'} data={data} busy={busy} run={run}/>
          {photoId && photo?.id===photoId && !photoSource && <p className="flex gap-2 text-sm text-slate-700"><Camera size={17} aria-hidden="true"/>
            No pudimos cargar tu fotografía. Actualiza el perfil antes de publicarla.</p>}
        </section>
        <section className={panel} aria-labelledby="profile-visibility">
          <h2 className={heading} id="profile-visibility">Visibilidad y recepción</h2>
          <div className="space-y-3 border-b border-slate-200 pb-4">
            <p className="text-sm leading-6 text-slate-700">{isPublic
              ? 'Tu perfil aparece en el directorio del ensayo.'
              : !eligible ? 'Para publicar necesitas una acreditación manual vigente.'
                : !publication.ready ? 'Elige la modalidad y ubicación antes de publicar.' : 'Revisa qué datos verán los visitantes antes de publicar.'}</p>
            <div className="flex flex-wrap gap-2">
              {eligible && <button className={isPublic ? secondary : primary} disabled={busy} aria-expanded={preview}
                aria-controls={preview ? 'publication-preview' : undefined} onClick={()=>{
                  if (!preview) requestAnimationFrame(()=>previewHeading.current?.focus());
                  setPreview(!preview);
                }}><Eye size={17} aria-hidden="true"/>{preview ? 'Ocultar vista previa' : 'Ver vista previa'}</button>}
              {profile.isPublic && <button className={secondary} disabled={busy} onClick={()=>setConfirm({publish:false,version:profile.rowVersion})}>Retirar del directorio</button>}
              {isPublic && <a className={secondary} href={'/directorio/'+profile.publicId}>Ver perfil publicado</a>}
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">Recepción de nuevos pacientes</h3>
            <p className="text-sm text-slate-700">La recepción solo cambia el indicador visible en tu perfil publicado.</p>
            <button type="button" aria-pressed={profile.acceptsNewPatients && eligible} className={secondary}
              disabled={busy || (!eligible && !profile.acceptsNewPatients)} onClick={()=>run(
                ()=>api.updatePublication({rowVersion:profile.rowVersion,acceptsNewPatients:!profile.acceptsNewPatients}),
                profile.acceptsNewPatients ? 'Recepción desactivada.' : 'Recepción activada.'
              )}>{profile.acceptsNewPatients ? 'Desactivar recepción' : 'Activar recepción'}</button>
          </div>
        </section>
      </div>
      {preview && publication.profile && <section id="publication-preview" aria-labelledby="preview-heading" className={panel}>
        <h2 id="preview-heading" ref={previewHeading} tabIndex={-1} className={heading}>Vista previa del perfil público</h2>
        <PublicProfile profile={publication.profile} preview previewPhoto={photoSource}/>
        {!isPublic && <button className={primary} disabled={busy || !publication.ready || Boolean(publication.profile.photoUrl && !photoSource)}
          onClick={()=>setConfirm({publish:true,version:publication.rowVersion})}>Publicar perfil</button>}
      </section>}
      <details className={panel}>
        <summary className="cursor-pointer font-bold text-slate-950">Formación y acreditación</summary>
        <div className="space-y-4 pt-2">
          {data.manualAccreditation ? <ProfessionalAccreditation onChange={refresh}/> :
            <LegacyCredentials credentials={credentials} rowVersion={profile.rowVersion} busy={busy} run={run}/>}
        </div>
      </details>
      {confirm && <PublicationConfirmation publish={confirm.publish} busy={busy} onCancel={()=>setConfirm(null)}
        onConfirm={()=>run(()=>api.updatePublication({rowVersion:confirm.version,isPublic:confirm.publish}),
          confirm.publish ? 'Perfil publicado en el directorio.' : 'Perfil retirado del directorio.')}/>}
    </>}
  </div>;
}
