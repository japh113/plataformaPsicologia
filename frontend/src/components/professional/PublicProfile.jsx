import {GraduationCap, MapPin, UserRound, Video} from 'lucide-react';
import {useState} from 'react';
import {directoryPhoto} from '../../api/directory';
import {modalityLabels, secondary} from './fields';

export function ProfessionalAvatar({name, src, large = false}) {
  const [failed,setFailed] = useState('');
  const initials = name?.trim().split(/\s+/u).slice(0,2).map(part=>Array.from(part)[0]).join('').toUpperCase();
  const size = large ? 'h-24 w-24 rounded-3xl text-3xl sm:h-28 sm:w-28' : 'h-14 w-14 rounded-2xl text-lg';
  return <span aria-hidden="true" className={size + ' inline-flex shrink-0 items-center justify-center overflow-hidden bg-indigo-100 font-bold text-indigo-900'}>
    {src && failed !== src
      ? <img alt="" src={src} referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={()=>setFailed(src)}/>
      : initials || <UserRound size={large ? 36 : 22}/>}
  </span>;
}

export function ReceivingBadge({accepts}) {
  return <span className={'inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ' +
    (accepts ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-100 text-slate-700')}>
    <span aria-hidden="true" className={'h-2 w-2 shrink-0 rounded-full ' + (accepts ? 'bg-emerald-600' : 'bg-slate-500')}/>
    {accepts ? 'Recibe nuevos pacientes' : 'Sin recepción de nuevos pacientes'}
  </span>;
}

function Location({city, state}) {
  if (!city) return null;
  return <span className="flex min-w-0 items-start gap-2"><MapPin aria-hidden="true" className="mt-0.5 shrink-0 text-indigo-700" size={16}/>
    {city === state ? city : city + ', ' + state}
  </span>;
}

function ApproachChips({approaches}) {
  return <ul className="flex flex-wrap gap-2">{approaches.map(item => <li key={item}
    className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-900">{item}</li>)}</ul>;
}

export function ProfessionalCard({profile}) {
  return <article className="flex h-full min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start gap-3">
      <ProfessionalAvatar name={profile.professionalName} src={directoryPhoto(profile.photoUrl)}/>
      <div className="min-w-0">
        <h2 className="break-words text-lg font-bold leading-tight text-slate-950">{profile.professionalName}</h2>
        <p className="mt-1 break-words text-sm text-slate-700">{profile.professionalTitle}</p>
      </div>
    </div>
    <div className="space-y-2 text-sm text-slate-700">
      <Location city={profile.city} state={profile.state}/>
      <span className="flex items-center gap-2"><Video size={16} aria-hidden="true" className="shrink-0 text-indigo-700"/>
        {modalityLabels[profile.modality]}
      </span>
    </div>
    {profile.approaches.length > 0 && <div className="space-y-1.5">
      <h3 className="text-xs font-semibold text-slate-700">Enfoques declarados</h3>
      <ApproachChips approaches={profile.approaches}/>
    </div>}
    <div><ReceivingBadge accepts={profile.acceptsNewPatients}/></div>
    <a href={'/directorio/' + profile.publicId} aria-label={'Ver perfil de ' + profile.professionalName}
      className={secondary + ' mt-auto self-start'}>Ver perfil</a>
  </article>;
}

export default function PublicProfile({profile, previewPhoto, preview = false}) {
  const Heading = preview ? 'h3' : 'h1';
  const Subheading = preview ? 'h4' : 'h2';
  return <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <header className="border-b border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white p-5 sm:p-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
        <ProfessionalAvatar name={profile.professionalName} src={preview ? previewPhoto : directoryPhoto(profile.photoUrl)} large/>
        <div className="min-w-0 space-y-2">
          <Heading className="break-words text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{profile.professionalName}</Heading>
          <p className="break-words font-medium text-slate-700">{profile.professionalTitle}</p>
          <ReceivingBadge accepts={profile.acceptsNewPatients}/>
        </div>
      </div>
    </header>
    <div className="grid gap-5 p-5 sm:p-8 md:grid-cols-[1.25fr_1fr]">
      <section className="space-y-3">
        <Subheading className="text-lg font-bold text-slate-900">Presentación profesional</Subheading>
        {profile.description && <p className="text-sm leading-6 text-slate-700">{profile.description}</p>}
        {profile.approaches.length > 0 && <>
          <Subheading className="pt-2 text-sm font-bold text-slate-900">Enfoques declarados</Subheading>
          <ApproachChips approaches={profile.approaches}/>
          <p className="text-xs text-slate-600">Los enfoques los declara el profesional.</p>
        </>}
      </section>
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <Subheading className="flex items-center gap-2 text-base font-bold text-slate-900">
          <GraduationCap size={20} className="shrink-0 text-indigo-700" aria-hidden="true"/> Formación y acreditación
        </Subheading>
        <dl className="mt-3 space-y-2 break-words text-sm text-slate-800">
          <div><dt className="font-semibold">Licenciatura</dt><dd>{profile.professionalTitle}</dd></div>
          <div><dt className="font-semibold">Institución</dt><dd>{profile.educationalInstitution}</dd></div>
          <div><dt className="font-semibold">Cédula</dt><dd>{profile.licenseNumber}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-slate-600">Comprobación simulada para este ensayo ficticio.</p>
      </section>
    </div>
  </article>;
}
