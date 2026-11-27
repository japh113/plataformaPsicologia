import {accreditationFields as fields} from './accreditationFields';

export default function AccreditationDetails({value}) {
  return <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
    {fields.map(([key,label])=><div className="min-w-0" key={key}>
      <dt className="font-medium text-slate-600">{label}</dt>
      <dd className="break-words font-semibold text-slate-900">{value[key]}</dd>
    </div>)}
  </dl>;
}
