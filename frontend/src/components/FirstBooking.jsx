import { useCareRead } from './useCareRead';
import { useVisibleCareRefresh } from './useVisibleCareRefresh';
import { getDayAvailability, getOpenHourOptions, normalizeDraftEntries, normalizeBlocks } from '../screens/appointmentsScreen.helpers';
import { primaryButton, secondaryButton } from './CareInterview';

const input = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2';

export default function FirstBooking({ date, time, setDate, setTime, busy, onBook, onOpenAgenda }) {
  const weekly = useCareRead('/availability/me');
  const exceptions = useCareRead('/availability/me/exceptions');
  const query = date ? '?date=' + encodeURIComponent(date) : '';
  const appointments = useCareRead(date ? '/appointments' + query : null);
  const waitlist = useCareRead(date ? '/appointments/waitlist' + query : null);
  const reads = [weekly, exceptions, appointments, waitlist];
  const ready = Boolean(date) && reads.every(read => Array.isArray(read.data));
  const error = reads.some(read => read.error);
  const refresh = () => Promise.all(reads.map(read => read.reload()));
  useVisibleCareRefresh(() => Promise.all(reads.filter(read => !read.loading).map(read => read.reload(true))));

  const day = getDayAvailability(date,
    new Map(normalizeDraftEntries(weekly.data).map(entry => [entry.weekday, entry.blocks])),
    new Map((exceptions.data ?? []).map(entry => [entry.date, { ...entry, blocks: normalizeBlocks(entry.blocks, entry.date) }])));
  const occupied = new Set((appointments.data ?? []).filter(item => ['pending', 'completed'].includes(item.status))
    .map(item => item.scheduledTime.slice(0, 5)));
  const options = ready ? getOpenHourOptions(day, occupied) : [];
  const countWaiting = hour => (waitlist.data ?? []).filter(item =>
    item.scheduledTime.slice(0, 5) === hour && item.status === 'active').length;
  const selected = options.some(option => option.value === time) ? time : '';
  const waiting = selected ? countWaiting(selected) : 0;
  const canSubmit = ready && selected && !busy;

  return <form className="space-y-3" onSubmit={event => {
    event.preventDefault();
    if (canSubmit) onBook({ date, time: selected });
  }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label>Fecha de la primera cita
        <input className={input} type="date" value={date} required onChange={event => { setDate(event.target.value); setTime(''); }} />
      </label>
      <label>Hora de inicio
        <select className={input} value={selected} required disabled={!options.length || busy} onChange={event => setTime(event.target.value)}>
          <option value="">Seleccionar hora</option>
          {options.map(({ value, label }) => <option key={value} value={value}>
            {label}{countWaiting(value) > 0 ? ` · ${countWaiting(value)} en espera` : ''}
          </option>)}
        </select>
      </label>
    </div>
    {error ? <div role="alert">
      <p>No pudimos confirmar los horarios de Agenda. Actualiza antes de reservar.</p>
      <button type="button" className={secondaryButton} onClick={refresh}>Actualizar horarios</button>
    </div> : date && !ready ? <p role="status">Consultando horarios de Agenda…</p>
      : ready && !options.length ? <p role="status">{day.isUnavailable ? 'La fecha está bloqueada en Agenda.' : 'No hay horas libres para una cita de 60 minutos en esa fecha.'}</p>
        : <p className="text-sm text-slate-600">{day.source === 'exception' && ready ? 'Horario especial para esta fecha.' : 'La consulta dura 60 minutos.'}</p>}
    {waiting > 0 && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
      {waiting === 1 ? 'Hay una persona en espera' : `Hay ${waiting} personas en espera`} para esta hora. Consulta la prioridad en Agenda antes de decidir.
    </p>}
    <div className="flex flex-wrap items-center gap-2">
      <button className={primaryButton} disabled={!canSubmit}>Reservar primera cita</button>
      {onOpenAgenda && <button type="button" className={secondaryButton} onClick={() => onOpenAgenda(date)}>Consultar Agenda</button>}
    </div>
  </form>;
}
