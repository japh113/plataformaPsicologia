import {ArrowLeft, Search, SlidersHorizontal} from 'lucide-react';
import {useEffect,useState} from 'react';
import {getDirectory, getDirectoryFilters, getDirectoryProfile} from '../api/directory';
import PsicoPanelBrand from '../components/layout/PsicoPanelBrand';
import PublicProfile, {ProfessionalCard} from '../components/professional/PublicProfile';
import {LocationFields, ModalityField} from '../components/professional/ProfileFields';
import {control, primary, secondary} from '../components/professional/fields';

const defaultFilters = {name:'', state:'', city:'', modality:'', accepting:'', page:1};
const errorBox = 'space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-950';

function DirectoryResults() {
  const [draft,setDraft] = useState(defaultFilters);
  const [filters,setFilters] = useState(defaultFilters);
  const [locations,setLocations] = useState(null);
  const [result,setResult] = useState(null);
  const [error,setError] = useState('');
  const [filtersError,setFiltersError] = useState('');
  const [reload,setReload] = useState(0);
  const [reloadFilters,setReloadFilters] = useState(0);
  useEffect(()=>{
    const controller = new AbortController();
    getDirectoryFilters(controller.signal).then(data=>{
      if (!controller.signal.aborted) setLocations(data.locations);
    }).catch(e=>{if (!controller.signal.aborted) setFiltersError(e.message);});
    return ()=>controller.abort();
  },[reloadFilters]);
  useEffect(()=>{
    const controller = new AbortController();
    getDirectory(filters,controller.signal).then(data=>{
      if (!controller.signal.aborted) setResult(data);
    }).catch(e=>{if (!controller.signal.aborted) setError(e.message);});
    return ()=>controller.abort();
  },[filters,reload]);

  const change = (key,value) => setDraft(previous=>({...previous,[key]:value}));
  const apply = (next) => {setResult(null);setError('');setFilters({...next});};
  const clear = () => {setDraft(defaultFilters);apply(defaultFilters);};
  return <>
    <header className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-100 via-indigo-50 to-white px-5 py-7 sm:px-9 sm:py-10">
      <h1 className="max-w-2xl text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Directorio profesional</h1>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-700 sm:text-base">
        Consulta perfiles por ubicación, modalidad y recepción de nuevos pacientes.
      </p>
      <p className="mt-2 text-xs font-semibold text-indigo-900">Entorno de ensayo con perfiles ficticios</p>
    </header>
    <form aria-label="Buscar en el directorio" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      onSubmit={event=>{event.preventDefault();apply({...draft,page:1});}}>
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
        <SlidersHorizontal size={18} className="text-indigo-700" aria-hidden="true"/> Buscar y filtrar
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <label className="col-span-2 block text-sm font-medium text-slate-800 lg:col-span-1">Nombre profesional
          <input type="search" name="name" className={control} maxLength={100} placeholder="Ej. Elena Robles"
            value={draft.name} onChange={event=>change('name',event.target.value)}/>
        </label>
        <LocationFields locations={locations || {}} filter state={draft.state} city={draft.city}
          setState={value=>change('state',value)} setCity={value=>change('city',value)}/>
        <ModalityField filter value={draft.modality} onChange={event=>change('modality',event.target.value)}/>
        <div className="min-w-0">
          <label htmlFor="directory-reception" className="text-sm font-medium text-slate-800">Recepción</label>
          <select id="directory-reception" name="accepting" className={control} value={draft.accepting} onChange={event=>change('accepting',event.target.value)}>
            <option value="">Cualquier estado</option><option value="true">Sí recibe</option><option value="false">No recibe</option>
          </select>
        </div>
      </div>
      {filtersError && <div className="flex flex-wrap items-center gap-2 text-sm text-rose-900">
        <span role="alert">No pudimos cargar los filtros de ubicación.</span>
        <button className={secondary} type="button" onClick={()=>{setFiltersError('');setReloadFilters(value=>value+1);}}>Actualizar ubicaciones</button>
      </div>}
      <div className="flex flex-wrap gap-2">
        <button className={primary}><Search size={17} aria-hidden="true"/> Buscar</button>
        <button type="button" className={secondary} onClick={clear}>Limpiar filtros</button>
      </div>
    </form>
    {error ? <div className={errorBox}><p role="alert">{error}</p>
      <button className={secondary} onClick={()=>{setError('');setReload(value=>value+1);}}>Reintentar</button>
    </div> : !result ? <p role="status" className="py-4 text-sm font-medium text-slate-700">Buscando perfiles…</p> :
      result.profiles.length ? <section aria-label="Resultados del directorio" className="space-y-4">
        <p role="status" className="text-sm font-semibold text-slate-700">{result.profiles.length} {result.profiles.length === 1 ? 'perfil' : 'perfiles'} en esta página</p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{result.profiles.map(profile=>
          <li className="min-w-0" key={profile.publicId}><ProfessionalCard profile={profile}/></li>)}</ul>
      </section> : <div className="space-y-2 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-slate-700">
        <p role="status" className="font-semibold">{Object.keys(defaultFilters).some(key=>key!=='page' && filters[key])
          ? 'No encontramos perfiles con esos filtros.' : 'No hay perfiles disponibles en esta página.'}</p>
        <p className="text-sm">Puedes ampliar la búsqueda o restablecer los filtros.</p>
        <button type="button" className={secondary} onClick={clear}>Restablecer búsqueda</button>
      </div>}
    {result && (result.page > 1 || result.hasMore) && <nav aria-label="Páginas del directorio" className="flex flex-wrap items-center gap-2">
      <button className={secondary} disabled={result.page===1} onClick={()=>apply({...filters,page:result.page-1})}>Anterior</button>
      <span className="px-2 text-sm font-medium text-slate-700">Página {result.page}</span>
      <button className={secondary} disabled={!result.hasMore} onClick={()=>apply({...filters,page:result.page+1})}>Siguiente</button>
    </nav>}
  </>;
}

function DirectoryDetail({id}) {
  const [profile,setProfile] = useState(null);
  const [error,setError] = useState(null);
  const [reload,setReload] = useState(0);
  useEffect(()=>{
    const controller = new AbortController();
    getDirectoryProfile(id,controller.signal).then(data=>{
      if (!controller.signal.aborted) setProfile(data);
    }).catch(e=>{if (!controller.signal.aborted) setError(e);});
    return ()=>controller.abort();
  },[id,reload]);

  return <>
    <a href="/directorio" className={secondary}><ArrowLeft size={17} aria-hidden="true"/> Volver al directorio</a>
    {error ? <div className={errorBox}><h1 className="font-bold" aria-live="polite">{error.message}</h1>
      {error.status!==404 && <button className={secondary} onClick={()=>{setError(null);setReload(value=>value+1);}}>Reintentar</button>}
    </div> : !profile ? <p role="status" className="text-sm text-slate-700">Consultando perfil…</p> : <PublicProfile profile={profile}/>}
  </>;
}

export default function DirectoryScreen({id}) {
  useEffect(()=>{
    const refreshRestoredPage=event=>{if(event.persisted)window.location.reload();};
    window.addEventListener('pageshow',refreshRestoredPage);
    return ()=>window.removeEventListener('pageshow',refreshRestoredPage);
  },[]);
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <title>{id ? 'Perfil profesional · PsicoPanel' : 'Directorio profesional · PsicoPanel'}</title>
    <meta name="robots" content="noindex, nofollow"/>
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6" aria-label="Navegación principal">
        <a href="/directorio" aria-label="PsicoPanel, directorio profesional" className="rounded focus-visible:outline-indigo-700"><PsicoPanelBrand/></a>
        <a href="/" className={secondary}>Acceder a PsicoPanel</a>
      </nav>
    </header>
    <main className="mx-auto max-w-6xl space-y-5 px-4 pb-12 pt-5 sm:px-6 sm:pt-8">
      {id ? <DirectoryDetail id={id}/> : <DirectoryResults/>}
    </main>
  </div>;
}
