import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { useCareRead } from './useCareRead';
import { useVisibleCareRefresh } from './useVisibleCareRefresh';
import AppointmentsScreen from '../screens/AppointmentsScreen';
import { compareWaitlistPriority, getDayAvailability, getOpenHourOptions, normalizeDraftEntries, normalizeBlocks } from '../screens/appointmentsScreen.helpers';
import { getFirstCalendarAppointments, mapBackendAppointmentToUiAppointment, mapBackendWaitlistToUiWaitlistEntry } from '../mappers/appointments';
import { primaryButton, secondaryButton } from './CareInterview';

const clinicClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
});
const professional = { role: 'psychologist' };
const empty = [];

function BookingAgenda({ initialDate, date, setDate, time, setTime, busy, onBook, error }) {
  const today = clinicClock.format(new Date());
  const weekly = useCareRead('/availability/me');
  const exceptions = useCareRead('/availability/me/exceptions');
  const agenda = useCareRead('/appointments');
  const consultations = useCareRead('/admissions/consultations');
  const query = date ? '?date=' + encodeURIComponent(date) : '';
  const waitlist = useCareRead(date ? '/appointments/waitlist' + query : null);
  const reads = [weekly, exceptions, agenda, consultations, waitlist];
  const ready = Boolean(date) && reads.every(read => Array.isArray(read.data) && !read.loading && !read.incomplete);
  const readError = reads.some(read => read.error || read.incomplete);
  const refresh = retain => Promise.all(reads.map(read => read.reload(retain)));
  useVisibleCareRefresh(() => {
    if (!reads.some(read => read.loading)) return refresh(true);
  });

  const appointments = useMemo(() => [
    ...(agenda.data ?? []).map(mapBackendAppointmentToUiAppointment),
    ...getFirstCalendarAppointments(consultations.data),
  ], [agenda.data, consultations.data]);
  const entries = useMemo(() => waitlist.data?.filter(item => item.status === 'active')
    .map(mapBackendWaitlistToUiWaitlistEntry) ?? empty, [waitlist.data]);
  const day = getDayAvailability(date,
    new Map(normalizeDraftEntries(weekly.data).map(entry => [entry.weekday, entry.blocks])),
    new Map((exceptions.data ?? []).map(entry => [entry.date, { ...entry, blocks: normalizeBlocks(entry.blocks, entry.date) }])));
  const occupied = new Set(appointments.filter(item => item.fecha === date && ['pendiente', 'completada'].includes(item.estado))
    .map(item => item.hora24));
  const options = ready ? getOpenHourOptions(day, occupied) : [];
  const selected = options.find(option => option.value === time);
  const waiting = hour => entries.filter(entry => entry.hora24 === hour && entry.fecha === date);
  const inWaitlist = selected ? waiting(time).sort(compareWaitlistPriority) : [];
  const name = useId();
  const slotPicker = <form className="space-y-3" onSubmit={event => {
    event.preventDefault();
    if (selected && !busy) onBook({ date, time: selected.value });
  }}>
    <fieldset disabled={busy || !options.length} className="space-y-2">
      <legend className="text-sm font-semibold text-slate-800">Horarios disponibles · 60 min</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(option => {
          const count = waiting(option.value).length;
          return <label key={option.value} className="cursor-pointer">
            <input type="radio" name={name} value={option.value} checked={selected?.value === option.value}
              onChange={() => setTime(option.value)} className="peer sr-only" />
            <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 peer-checked:border-indigo-600 peer-checked:bg-indigo-50 peer-checked:text-indigo-800 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-600">
              {option.label}{count > 0 && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800">{count} en espera</span>}
            </span>
          </label>;
        })}
      </div>
    </fieldset>
    {readError ? <div role="alert" className="space-y-2">
      <p>No pudimos confirmar los horarios de Agenda. Actualiza antes de reservar.</p>
      <button type="button" className={secondaryButton} onClick={() => void refresh(false)}>Actualizar horarios</button>
    </div> : date && !ready ? <p role="status">Consultando horarios de Agenda…</p>
      : ready && !options.length ? <p role="status">{day.isUnavailable
        ? 'La fecha está bloqueada en Agenda.' : 'No hay horas libres para una cita de 60 minutos en esa fecha.'}</p>
        : ready && day.source === 'exception' && <p className="text-sm text-slate-600">Horario especial para esta fecha.</p>}
    {inWaitlist.length > 0 && <div className="space-y-1 rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">
      <p className="font-semibold">Lista de espera para {selected.label}</p>
      <ol className="space-y-1">
        {inWaitlist.map(entry => <li key={entry.id} className="break-words">
          Prioridad {entry.prioridad} · {entry.pacienteNombre}
        </li>)}
      </ol>
      <p>La prioridad es manual. Tú decides a quién reservar.</p>
    </div>}
    {error && <div className="space-y-2">
      <p role="alert" className="text-sm font-medium text-rose-800">{error}</p>
      {!readError && <button type="button" className={secondaryButton} onClick={() => void refresh(false)}>Actualizar horarios</button>}
    </div>}
    <button className={primaryButton} disabled={!selected || busy}>{busy ? 'Verificando…' : 'Reservar primera cita'}</button>
  </form>;

  return <AppointmentsScreen currentUser={professional} todayDate={today} viewContext={{ date: initialDate }}
    appointments={appointments} availability={weekly.data ?? empty} availabilityExceptions={exceptions.data ?? empty} waitlistEntries={entries}
    booking={{ slotPicker, onDateChange: next => { if (next !== date) { setDate(next); setTime(''); } } }} />;
}

export default function FirstBooking({ date, setDate, busy, error, autoOpen, onAutoOpened, ...booking }) {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const title = useId();
  const [initialDate, setInitialDate] = useState(null);

  function open() {
    const today = clinicClock.format(new Date());
    const selectedDate = date || today;
    setDate(selectedDate);
    setInitialDate(selectedDate);
    dialog.current.showModal();
  }
  const openAfterActivation = useEffectEvent(() => {
    if (!dialog.current?.open) open();
    onAutoOpened();
  });
  useEffect(() => {
    if (autoOpen) openAfterActivation();
  }, [autoOpen]);

  return <>
    <button ref={trigger} type="button" className={primaryButton + ' inline-flex items-center gap-2'} disabled={busy} onClick={open}>
      <CalendarDays size={18} aria-hidden="true" /> Agendar primera cita
    </button>
    <dialog ref={dialog} aria-labelledby={title}
      className="max-h-[94dvh] w-[min(65rem,calc(100%-1rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 text-slate-900 shadow-xl backdrop:bg-slate-950/55"
      onClose={() => { setInitialDate(null); trigger.current?.focus(); }}>
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-4 sm:px-6">
        <h3 id={title} className="text-lg font-bold">Agendar primera cita</h3>
        <button type="button" autoFocus className={secondaryButton + ' inline-flex items-center gap-2'} onClick={() => dialog.current.close()}>
          <ArrowLeft size={18} aria-hidden="true" /> Volver a la ficha
        </button>
      </header>
      <div className="p-3 sm:p-5">
        {initialDate !== null && <BookingAgenda {...booking} initialDate={initialDate} date={date} setDate={setDate} busy={busy} error={error} />}
      </div>
    </dialog>
  </>;
}
