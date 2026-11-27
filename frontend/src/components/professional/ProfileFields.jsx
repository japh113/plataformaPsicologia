import {useId} from 'react';
import {control, modalityLabels} from './fields';

const alphabetical = (a, b) => a.localeCompare(b, 'es-MX');

export function LocationFields({locations, state, city, setState, setCity, filter = false, required = false}) {
  const stateId=useId(), cityId=useId();
  const cities = state ? locations[state] || [] : filter ? [...new Set(Object.values(locations).flat())] : [];
  return <>
    <div className="min-w-0">
      <label htmlFor={stateId} className="text-sm font-medium text-slate-800">Estado</label>
      <select id={stateId} name="state" className={control} value={state} required={required}
        onChange={event => {setState(event.target.value);setCity('');}}>
        <option value="">{filter ? 'Todos los estados' : 'Selecciona un estado'}</option>
        {Object.keys(locations).sort(alphabetical).map(item => <option key={item}>{item}</option>)}
      </select>
    </div>
    <div className="min-w-0">
      <label htmlFor={cityId} className="text-sm font-medium text-slate-800">Ciudad</label>
      <select id={cityId} name="city" className={control} value={city} required={required} onChange={event => setCity(event.target.value)}
        disabled={!filter && !state}>
        <option value="">{filter ? 'Todas las ciudades' : 'Selecciona una ciudad'}</option>
        {cities.slice().sort(alphabetical).map(item => <option key={item}>{item}</option>)}
      </select>
    </div>
  </>;
}

export function ModalityField({filter = false, ...props}) {
  const id=useId();
  return <div className="min-w-0">
    <label htmlFor={id} className="text-sm font-medium text-slate-800">Modalidad</label>
    <select id={id} name="modality" className={control} {...props}>
      <option value="">{filter ? 'Todas' : 'Selecciona una modalidad'}</option>
      {Object.entries(modalityLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  </div>;
}
