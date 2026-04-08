import React, { useMemo, useState } from 'react';
import { Calendar, CalendarPlus, ChevronLeft, ChevronRight, Clock3, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { formatAppointmentDisplayHour, getAppointmentHourOptions, getMonthDates, getMonthLabel, getMonthWeekdayHeaders, getWeekDates, getWeekRangeLabel, shiftDateByDays, shiftDateByMonths } from '../mappers/appointments';

const emptyForm = { pacienteId: '', fecha: '', hora24: '', estado: 'pendiente', notas: '' };
const weekdayLabels = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const exceptionDateFormatter = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const getStatusBadge = (estado) => (estado === 'completada' ? 'bg-green-100 text-green-700 border-green-200' : estado === 'cancelada' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-indigo-100 text-indigo-700 border-indigo-200');
const getMiniAppointmentChip = (estado) => (estado === 'completada' ? 'bg-green-100 text-green-700 border-green-200' : estado === 'cancelada' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-indigo-100 text-indigo-700 border-indigo-200');
const getAppointmentAccent = (estado) => (estado === 'completada' ? 'border-l-green-500 bg-green-50/40' : estado === 'cancelada' ? 'border-l-red-500 bg-red-50/40' : 'border-l-indigo-500 bg-indigo-50/40');
const getDayNumberBadge = ({ isToday, isActive, isHovered, isCurrentMonth }) => (isActive ? 'bg-indigo-600 text-white shadow-sm' : isHovered ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-200' : isToday ? 'bg-indigo-100 text-indigo-700' : isCurrentMonth ? 'text-slate-900' : 'text-slate-400');
const getExceptionPillClasses = (isUnavailable) => (isUnavailable ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700');
const getExceptionDotClasses = (isUnavailable) => (isUnavailable ? 'bg-red-500 ring-red-100' : 'bg-amber-500 ring-amber-100');
const getExceptionCellAccent = (isUnavailable) => (isUnavailable ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/40');
const getWeekdayFromDateString = (value) => { const [y = '0', m = '1', d = '1'] = String(value).split('-'); return new Date(Number(y), Number(m) - 1, Number(d)).getDay(); };
const createTempId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const normalizeBlocks = (blocks, prefix) => (blocks || []).map((block, index) => ({ id: block.id || `${prefix}-${index}`, startTime: String(block.startTime || '').slice(0, 5), endTime: String(block.endTime || '').slice(0, 5) }));
const normalizeDraftEntries = (entries) => (entries || []).map((entry) => ({ weekday: entry.weekday, blocks: normalizeBlocks(entry.blocks, `tmp-${entry.weekday}`) }));
const createDefaultExceptionBlock = () => ({ id: createTempId('exception-block'), startTime: '09:00', endTime: '10:00' });
const createEmptyExceptionForm = (date = '') => ({ date, isUnavailable: false, blocks: [createDefaultExceptionBlock()] });
const normalizeExceptionForm = (exception) => ({
  date: exception?.date || '',
  isUnavailable: Boolean(exception?.isUnavailable),
  blocks: exception?.isUnavailable
    ? []
    : normalizeBlocks(exception?.blocks, `exception-${exception?.date || 'draft'}`).length > 0
      ? normalizeBlocks(exception?.blocks, `exception-${exception?.date || 'draft'}`)
      : [createDefaultExceptionBlock()],
});
const formatExceptionDate = (date) => {
  const [year = '0', month = '1', day = '1'] = String(date).split('-');
  return exceptionDateFormatter.format(new Date(Number(year), Number(month) - 1, Number(day)));
};
const getRangeDayCount = (startDate, endDate) => {
  if (!startDate || !endDate || endDate < startDate) {
    return 0;
  }

  const [startYear = '0', startMonth = '1', startDay = '1'] = String(startDate).split('-');
  const [endYear = '0', endMonth = '1', endDay = '1'] = String(endDate).split('-');
  const start = new Date(Number(startYear), Number(startMonth) - 1, Number(startDay));
  const end = new Date(Number(endYear), Number(endMonth) - 1, Number(endDay));
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
};

export default function AppointmentsScreen({
  currentUser, patients, appointments, availability, availabilityDraft, availabilityExceptions, todayDate, onOpenPatient, onCreateAppointment, onUpdateAppointment, onDeleteAppointment, onUpdateAvailability, onChangeAvailabilityDraft, onUpsertAvailabilityException, onCreateAvailabilityExceptionRange, onDeleteAvailabilityException,
  isSavingAppointment = false, processingAppointmentId = null, appointmentActionError = '', onDismissAppointmentError, isSavingAvailability = false, availabilityActionError = '', onDismissAvailabilityError, isSavingAvailabilityException = false, availabilityExceptionActionError = '', onDismissAvailabilityExceptionError,
}) {
  const isPsychologist = currentUser?.role === 'psychologist';
  const [selectedDate, setSelectedDate] = useState(isPsychologist ? '' : todayDate);
  const [statusFilter, setStatusFilter] = useState('todos');
  const [editingAppointmentId, setEditingAppointmentId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [calendarAnchorDate, setCalendarAnchorDate] = useState(todayDate);
  const [calendarView, setCalendarView] = useState('week');
  const [hoveredDate, setHoveredDate] = useState('');
  const [editingExceptionDate, setEditingExceptionDate] = useState('');
  const [exceptionForm, setExceptionForm] = useState(createEmptyExceptionForm());
  const [exceptionRangeForm, setExceptionRangeForm] = useState({ startDate: todayDate, endDate: todayDate });

  const normalizedAvailabilityDraft = useMemo(() => normalizeDraftEntries(availabilityDraft || availability), [availability, availabilityDraft]);
  const availabilityMap = useMemo(() => new Map(normalizedAvailabilityDraft.map((entry) => [entry.weekday, entry.blocks])), [normalizedAvailabilityDraft]);
  const availabilityExceptionsMap = useMemo(
    () => new Map((availabilityExceptions || []).map((exception) => [exception.date, { ...exception, blocks: normalizeBlocks(exception.blocks, `exception-${exception.date}`) }])),
    [availabilityExceptions],
  );
  const appointmentsForCalendar = useMemo(() => statusFilter === 'todos' ? appointments : appointments.filter((appointment) => appointment.estado === statusFilter), [appointments, statusFilter]);
  const weekDates = useMemo(() => getWeekDates(calendarAnchorDate), [calendarAnchorDate]);
  const weekRangeLabel = useMemo(() => getWeekRangeLabel(calendarAnchorDate), [calendarAnchorDate]);
  const monthDates = useMemo(() => getMonthDates(calendarAnchorDate), [calendarAnchorDate]);
  const monthLabel = useMemo(() => getMonthLabel(calendarAnchorDate), [calendarAnchorDate]);
  const monthWeekdayHeaders = useMemo(() => getMonthWeekdayHeaders(), []);
  const selectedFormDate = form.fecha || todayDate;

  const selectedDayAvailability = useMemo(() => {
    const exception = availabilityExceptionsMap.get(selectedFormDate);

    if (exception) {
      return {
        source: 'exception',
        isUnavailable: Boolean(exception.isUnavailable),
        blocks: exception.blocks || [],
      };
    }

    const weekday = getWeekdayFromDateString(selectedFormDate);

    return {
      source: 'weekly',
      isUnavailable: false,
      blocks: availabilityMap.get(weekday) || [],
    };
  }, [availabilityExceptionsMap, availabilityMap, selectedFormDate]);
  const selectedFormWeekday = getWeekdayFromDateString(selectedFormDate);
  const selectedDayBlocks = selectedDayAvailability.blocks;
  const occupiedHourValues = useMemo(
    () =>
      new Set(
        appointments
          .filter(
            (appointment) =>
              appointment.fecha === selectedFormDate &&
              appointment.estado !== 'cancelada' &&
              appointment.id !== editingAppointmentId,
          )
          .map((appointment) => appointment.hora24),
      ),
    [appointments, editingAppointmentId, selectedFormDate],
  );

  const hourOptions = useMemo(() => {
    const currentHour = form.hora24;
    const blockOptions = selectedDayBlocks
      .flatMap((block) => getAppointmentHourOptions(Number(block.startTime.slice(0, 2)), Number(block.endTime.slice(0, 2)) - 1))
      .filter((option) => !occupiedHourValues.has(option.value));

    if (!currentHour || blockOptions.some((option) => option.value === currentHour)) {
      return blockOptions;
    }

    return [{ value: currentHour, label: `${formatAppointmentDisplayHour(currentHour)} (actual)` }, ...blockOptions];
  }, [form.hora24, occupiedHourValues, selectedDayBlocks]);

  const weeklyAppointments = useMemo(() => {
    const grouped = Object.fromEntries(weekDates.map((weekDate) => [weekDate.isoDate, []]));
    appointmentsForCalendar.forEach((appointment) => { if (grouped[appointment.fecha]) grouped[appointment.fecha].push(appointment); });
    return grouped;
  }, [appointmentsForCalendar, weekDates]);

  const monthlyAppointments = useMemo(() => {
    const grouped = Object.fromEntries(monthDates.map((monthDate) => [monthDate.isoDate, []]));
    appointmentsForCalendar.forEach((appointment) => { if (grouped[appointment.fecha]) grouped[appointment.fecha].push(appointment); });
    return grouped;
  }, [appointmentsForCalendar, monthDates]);

  const filteredAppointments = useMemo(() => appointments.filter((appointment) => {
    const matchesDate = selectedDate ? appointment.fecha === selectedDate : true;
    const matchesStatus = statusFilter === 'todos' ? true : appointment.estado === statusFilter;
    return matchesDate && matchesStatus;
  }), [appointments, selectedDate, statusFilter]);

  const resetForm = () => { setEditingAppointmentId(null); setForm(emptyForm); onDismissAppointmentError?.(); };
  const resetExceptionForm = () => {
    setEditingExceptionDate('');
    setExceptionForm(createEmptyExceptionForm(selectedDate || todayDate));
    onDismissAvailabilityExceptionError?.();
  };
  const handleEditAppointment = (appointment) => {
    setEditingAppointmentId(appointment.id);
    setForm({ pacienteId: appointment.pacienteId, fecha: appointment.fecha, hora24: appointment.hora24, estado: appointment.estado, notas: appointment.notas || '' });
    setSelectedDate(appointment.fecha);
    setCalendarAnchorDate(appointment.fecha);
    onDismissAppointmentError?.();
  };
  const handleChange = (event) => { onDismissAppointmentError?.(); setForm((current) => ({ ...current, [event.target.name]: event.target.value })); };
  const handleSubmit = async (event) => {
    event.preventDefault();
    const resolvedPatientId = form.pacienteId || patients[0]?.id || '';
    const resolvedDate = form.fecha || todayDate;
    if (!resolvedPatientId || !resolvedDate || !form.hora24) return;
    const payload = { pacienteId: resolvedPatientId, fecha: resolvedDate, hora24: form.hora24, estado: form.estado, notas: form.notas };
    const wasSaved = editingAppointmentId ? await onUpdateAppointment(editingAppointmentId, payload) : await onCreateAppointment(payload);
    if (wasSaved) { setSelectedDate(resolvedDate); setCalendarAnchorDate(resolvedDate); resetForm(); }
  };
  const handleDelete = async (appointmentId) => { if (window.confirm('Se eliminara esta cita. Deseas continuar?')) await onDeleteAppointment(appointmentId); };
  const handleSelectDate = (date) => { setSelectedDate(date); if (!date) return; setCalendarAnchorDate(date); onDismissAppointmentError?.(); };
  const handleMoveCalendar = (direction) => setCalendarAnchorDate((currentDate) => calendarView === 'month' ? shiftDateByMonths(currentDate, direction) : shiftDateByDays(currentDate, direction * 7));
  const handleResetCalendar = () => { setCalendarAnchorDate(todayDate); if (selectedDate) setSelectedDate(todayDate); };

  const updateDraftEntries = (updater) => {
    onDismissAvailabilityError?.();
    onChangeAvailabilityDraft((current) => updater(normalizeDraftEntries(current)));
  };

  const handleAddAvailabilityBlock = (weekday) => {
    updateDraftEntries((entries) => entries.map((entry) => entry.weekday !== weekday ? entry : { ...entry, blocks: [...entry.blocks, { id: `tmp-${weekday}-${Date.now()}`, startTime: '09:00', endTime: '10:00' }] }));
  };
  const handleRemoveAvailabilityBlock = (weekday, blockId) => {
    updateDraftEntries((entries) => entries.map((entry) => entry.weekday !== weekday ? entry : { ...entry, blocks: entry.blocks.filter((block) => block.id !== blockId) }));
  };
  const handleAvailabilityBlockChange = (weekday, blockId, field, value) => {
    updateDraftEntries((entries) => entries.map((entry) => entry.weekday !== weekday ? entry : { ...entry, blocks: entry.blocks.map((block) => block.id !== blockId ? block : { ...block, [field]: value }) }));
  };
  const handleSaveAvailability = async () => {
    await onUpdateAvailability(normalizedAvailabilityDraft.map((entry) => ({
      weekday: entry.weekday,
      blocks: entry.blocks.map((block) => ({ startTime: block.startTime, endTime: block.endTime })),
    })));
  };

  const handleExceptionFieldChange = (field, value) => {
    onDismissAvailabilityExceptionError?.();
    setExceptionForm((current) => ({ ...current, [field]: value }));
  };
  const handleAddExceptionBlock = () => {
    onDismissAvailabilityExceptionError?.();
    setExceptionForm((current) => ({ ...current, blocks: [...current.blocks, createDefaultExceptionBlock()] }));
  };
  const handleRemoveExceptionBlock = (blockId) => {
    onDismissAvailabilityExceptionError?.();
    setExceptionForm((current) => ({ ...current, blocks: current.blocks.filter((block) => block.id !== blockId) }));
  };
  const handleExceptionBlockChange = (blockId, field, value) => {
    onDismissAvailabilityExceptionError?.();
    setExceptionForm((current) => ({ ...current, blocks: current.blocks.map((block) => block.id !== blockId ? block : { ...block, [field]: value }) }));
  };
  const handleEditException = (exception) => {
    setEditingExceptionDate(exception.date);
    setExceptionForm(normalizeExceptionForm(exception));
    onDismissAvailabilityExceptionError?.();
  };
  const handleSaveException = async (event) => {
    event.preventDefault();
    if (!exceptionForm.date) return;
    const wasSaved = await onUpsertAvailabilityException({
      date: exceptionForm.date,
      isUnavailable: Boolean(exceptionForm.isUnavailable),
      blocks: exceptionForm.isUnavailable ? [] : exceptionForm.blocks.map((block) => ({ startTime: block.startTime, endTime: block.endTime })),
    });
    if (wasSaved) {
      resetExceptionForm();
    }
  };
  const handleDeleteException = async (date) => {
    if (!window.confirm('Se eliminara esta excepcion y el dia volvera a usar la disponibilidad semanal. Deseas continuar?')) return;
    const wasDeleted = await onDeleteAvailabilityException(date);
    if (wasDeleted && editingExceptionDate === date) {
      resetExceptionForm();
    }
  };
  const handleExceptionRangeFieldChange = (field, value) => {
    onDismissAvailabilityExceptionError?.();
    setExceptionRangeForm((current) => ({ ...current, [field]: value }));
  };
  const handleSaveExceptionRange = async (event) => {
    event.preventDefault();
    if (!exceptionRangeForm.startDate || !exceptionRangeForm.endDate) return;
    const wasSaved = await onCreateAvailabilityExceptionRange({
      startDate: exceptionRangeForm.startDate,
      endDate: exceptionRangeForm.endDate,
    });
    if (wasSaved) {
      setExceptionRangeForm({ startDate: todayDate, endDate: todayDate });
    }
  };

  const calendarTitle = calendarView === 'month' ? 'Vista Mensual' : 'Vista Semanal';
  const calendarSubtitle = calendarView === 'month' ? 'Explora el mes completo con una cuadricula de calendario y toca un dia para enfocar el listado.' : 'Explora la semana y selecciona un dia para enfocar el listado.';
  const calendarRangeLabel = calendarView === 'month' ? monthLabel : weekRangeLabel;
  const blockSummary = selectedDayAvailability.isUnavailable
    ? 'Excepcion: dia no disponible'
    : selectedDayBlocks.length > 0
      ? `${selectedDayAvailability.source === 'exception' ? 'Excepcion' : 'Semana base'}: ${selectedDayBlocks.map((block) => `${block.startTime}-${block.endTime}`).join(' | ')}`
      : 'Sin disponibilidad';
  const availabilityStartOptions = getAppointmentHourOptions(6, 21);
  const availabilityEndOptions = getAppointmentHourOptions(7, 22);
  const availableSlotsMessage =
    selectedDayAvailability.isUnavailable
      ? 'Este dia esta marcado como no disponible por una excepcion.'
      : selectedDayBlocks.length === 0
        ? 'No hay disponibilidad configurada para este dia.'
      : hourOptions.length === 0
        ? 'No quedan cupos disponibles en este dia.'
        : `${hourOptions.length} horario${hourOptions.length === 1 ? '' : 's'} disponible${hourOptions.length === 1 ? '' : 's'} en este dia.`;
  const exceptionRangeDayCount = getRangeDayCount(exceptionRangeForm.startDate, exceptionRangeForm.endDate);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-800">{isPsychologist ? 'Agenda de Citas' : 'Mis Citas'}</h2>
          <p className="text-sm md:text-base text-gray-500">{isPsychologist ? 'Gestiona citas, reprograma sesiones y da seguimiento al calendario clinico.' : 'Consulta tus proximas sesiones y el estado de cada cita.'}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input type="date" value={selectedDate} onChange={(event) => handleSelectDate(event.target.value)} className="px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
          {isPsychologist && <button type="button" onClick={() => handleSelectDate('')} className="px-3 py-2.5 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Ver todas</button>}
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="completada">Completadas</option>
            <option value="cancelada">Canceladas</option>
          </select>
        </div>
      </div>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center"><Calendar className="mr-2 text-indigo-500" size={20} /> {calendarTitle}</h3>
            <p className="text-sm text-gray-500 mt-1">{calendarSubtitle}</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="inline-flex rounded-lg border border-gray-300 bg-gray-50 p-1">
              <button type="button" onClick={() => setCalendarView('week')} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${calendarView === 'week' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>Semanal</button>
              <button type="button" onClick={() => setCalendarView('month')} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${calendarView === 'month' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>Mensual</button>
            </div>
            <div className="flex items-center gap-2">
              <span className="min-w-32 text-center text-sm font-semibold capitalize text-gray-700">{calendarRangeLabel}</span>
              <button type="button" onClick={() => handleMoveCalendar(-1)} className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50 transition"><ChevronLeft size={18} /></button>
              <button type="button" onClick={handleResetCalendar} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">{calendarView === 'month' ? 'Este mes' : 'Esta semana'}</button>
              <button type="button" onClick={() => handleMoveCalendar(1)} className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50 transition"><ChevronRight size={18} /></button>
            </div>
          </div>
        </div>

        {isPsychologist && availabilityExceptions.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Excepciones</span>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getExceptionPillClasses(true)}`}>
              <span className={`mr-1.5 h-2 w-2 rounded-full ring-4 ${getExceptionDotClasses(true)}`} />
              Dia bloqueado
            </span>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getExceptionPillClasses(false)}`}>
              <span className={`mr-1.5 h-2 w-2 rounded-full ring-4 ${getExceptionDotClasses(false)}`} />
              Horario especial
            </span>
          </div>
        )}

        {calendarView === 'week' ? (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {weekDates.map((weekDate) => {
              const dayAppointments = weeklyAppointments[weekDate.isoDate] || [];
              const dayException = availabilityExceptionsMap.get(weekDate.isoDate);
              const isActive = selectedDate === weekDate.isoDate;
              const isHovered = hoveredDate === weekDate.isoDate;
              const isToday = weekDate.isoDate === todayDate;
              return (
                <button key={weekDate.isoDate} type="button" onClick={() => handleSelectDate(weekDate.isoDate)} className={`rounded-2xl border p-3 text-left transition ${isActive ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-2 ring-indigo-100' : dayException ? getExceptionCellAccent(dayException.isUnavailable) : isHovered ? 'border-indigo-300 bg-indigo-50/60' : isToday ? 'border-indigo-200 bg-white' : 'border-gray-200 bg-gray-50 hover:bg-white'}`}>
                  <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-gray-500">{weekDate.shortWeekday}</span><div className="flex items-center gap-1.5">{dayException && <span className={`inline-flex h-2.5 w-2.5 rounded-full ring-4 ${getExceptionDotClasses(dayException.isUnavailable)}`} />}{isToday && <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Hoy</span>}</div></div>
                  <p className="mt-2 text-sm font-bold text-gray-900">{weekDate.shortLabel}</p>
                  {dayException && <div className={`mt-2 inline-flex max-w-full items-center rounded-full border px-2 py-1 text-[10px] font-semibold leading-none ${getExceptionPillClasses(dayException.isUnavailable)}`}>{dayException.isUnavailable ? 'Dia bloqueado' : 'Horario especial'}</div>}
                  <div className="mt-3 space-y-2">
                    {dayAppointments.slice(0, 3).map((appointment) => <div key={appointment.id} className={`rounded-full border px-2.5 py-1.5 text-[11px] font-semibold leading-none ${getMiniAppointmentChip(appointment.estado)}`}><p className="truncate">{appointment.hora}</p></div>)}
                    {dayAppointments.length === 0 && <div className="rounded-xl border border-dashed border-gray-200 px-2.5 py-3 text-center text-[11px] text-gray-400">{dayException?.isUnavailable ? 'Dia bloqueado' : 'Sin citas'}</div>}
                    {dayAppointments.length > 3 && <p className="text-[11px] font-medium text-indigo-600">+{dayAppointments.length - 3} mas</p>}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100/80">{monthWeekdayHeaders.map((weekday) => <div key={weekday} className="px-2 py-3 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{weekday}</div>)}</div>
            <div className="grid grid-cols-7">
              {monthDates.map((monthDate) => {
                const dayAppointments = monthlyAppointments[monthDate.isoDate] || [];
                const dayException = availabilityExceptionsMap.get(monthDate.isoDate);
                const isActive = selectedDate === monthDate.isoDate;
                const isHovered = hoveredDate === monthDate.isoDate;
                const isToday = monthDate.isoDate === todayDate;
                return (
                  <button key={monthDate.isoDate} type="button" onClick={() => handleSelectDate(monthDate.isoDate)} className={`h-24 sm:h-28 border-b border-r p-2 text-left align-top transition ${isActive ? 'bg-indigo-50/80 ring-1 ring-inset ring-indigo-200' : dayException ? (dayException.isUnavailable ? 'bg-red-50/40' : 'bg-amber-50/40') : isHovered ? 'bg-indigo-50/50' : monthDate.isCurrentMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/70 hover:bg-slate-50'}`}>
                    <div className="flex h-full flex-col">
                      <div className="flex items-center justify-between"><span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition ${getDayNumberBadge({ isToday, isActive, isHovered, isCurrentMonth: monthDate.isCurrentMonth })}`}>{monthDate.dayNumber}</span>{dayException && <span className={`inline-flex h-2.5 w-2.5 rounded-full ring-4 ${getExceptionDotClasses(dayException.isUnavailable)}`} title={dayException.isUnavailable ? 'Dia bloqueado' : 'Horario especial'} />}</div>
                      {dayException && <div className={`mt-1 inline-flex w-fit rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${getExceptionPillClasses(dayException.isUnavailable)}`}>{dayException.isUnavailable ? 'Bloqueado' : 'Especial'}</div>}
                      <div className="mt-2 flex-1 space-y-1 overflow-hidden">{dayAppointments.slice(0, 2).map((appointment) => <div key={appointment.id} className={`rounded-full border px-2 py-1 text-[10px] font-semibold leading-none ${getMiniAppointmentChip(appointment.estado)}`}><div className="truncate">{appointment.hora}</div></div>)}</div>
                      {dayAppointments.length > 2 && <p className="mt-1 text-[10px] font-semibold leading-none text-indigo-700">+{dayAppointments.length - 2}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <div className={`grid gap-6 ${isPsychologist ? 'xl:grid-cols-[1.15fr_0.85fr]' : 'grid-cols-1'}`}>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
          <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-gray-800 flex items-center"><Calendar className="mr-2 text-indigo-500" size={20} /> Citas registradas</h3><span className="text-xs uppercase tracking-wider text-gray-400 font-semibold">{filteredAppointments.length} resultados</span></div>
          <div className="space-y-3">
            {filteredAppointments.map((appointment) => {
              const patient = patients.find((currentPatient) => currentPatient.id === appointment.pacienteId);
              const isLinkedToHoveredDate = hoveredDate === appointment.fecha;
              const isLinkedToSelectedDate = selectedDate === appointment.fecha;
              return (
                <div key={appointment.id} tabIndex={0} onMouseEnter={() => setHoveredDate(appointment.fecha)} onMouseLeave={() => setHoveredDate('')} onFocus={() => setHoveredDate(appointment.fecha)} onBlur={() => setHoveredDate('')} className={`rounded-xl border border-gray-200 border-l-4 p-4 transition outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 ${getAppointmentAccent(appointment.estado)} ${isLinkedToSelectedDate ? 'ring-2 ring-indigo-100 shadow-sm' : isLinkedToHoveredDate ? 'ring-2 ring-slate-200' : ''}`}>
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap"><h4 className="font-bold text-gray-900 truncate">{patient?.nombre || 'Paciente no disponible'}</h4><span className={`px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold border uppercase ${getStatusBadge(appointment.estado)}`}>{appointment.estado}</span></div>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-500"><span className="inline-flex items-center"><Calendar size={14} className="mr-1.5" /> {appointment.fecha}</span><span className="inline-flex items-center"><Clock3 size={14} className="mr-1.5" /> {appointment.hora}</span></div>
                      {appointment.notas && <p className="mt-3 text-sm text-gray-600">{appointment.notas}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {patient && <button onClick={() => onOpenPatient(patient)} className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition text-sm font-medium">Ver expediente</button>}
                      {isPsychologist && <>
                        <button onClick={() => handleEditAppointment(appointment)} className="px-3 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition text-sm font-medium inline-flex items-center"><Pencil size={14} className="mr-2" /> Editar</button>
                        <button onClick={() => handleDelete(appointment.id)} disabled={processingAppointmentId === appointment.id} className="px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition text-sm font-medium inline-flex items-center disabled:opacity-60 disabled:cursor-not-allowed"><Trash2 size={14} className="mr-2" /> Eliminar</button>
                      </>}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredAppointments.length === 0 && <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center"><p className="text-sm font-medium text-gray-600">No hay citas para los filtros seleccionados.</p></div>}
          </div>
        </div>

        {isPsychologist && <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-gray-800 flex items-center"><CalendarPlus className="mr-2 text-indigo-500" size={20} /> {editingAppointmentId ? 'Editar cita' : 'Nueva cita'}</h3>{editingAppointmentId && <button onClick={resetForm} className="text-sm font-medium text-gray-500 hover:text-gray-800 transition">Limpiar</button>}</div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {appointmentActionError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{appointmentActionError}</div>}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Paciente</label>
                <select name="pacienteId" value={form.pacienteId || patients[0]?.id || ''} onChange={handleChange} disabled={isSavingAppointment} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value="">Selecciona un paciente</option>
                  {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.nombre}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha</label>
                  <input type="date" name="fecha" value={form.fecha || todayDate} onChange={handleChange} disabled={isSavingAppointment} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                  <p className="mt-1 text-xs text-gray-500">{weekdayLabels[selectedFormWeekday]}: {blockSummary}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Hora</label>
                  <select name="hora24" value={form.hora24} onChange={handleChange} disabled={isSavingAppointment || ((selectedDayBlocks.length === 0 || selectedDayAvailability.isUnavailable) && !form.hora24)} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                    <option value="">{selectedDayAvailability.isUnavailable ? 'Dia no disponible' : selectedDayBlocks.length > 0 ? 'Selecciona un horario' : 'Dia sin disponibilidad'}</option>
                    {hourOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">{availableSlotsMessage}</p>
                  <p className="mt-1 text-xs text-gray-500">Las sesiones duran 60 minutos y se agendan por hora exacta.</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Estado</label>
                <select name="estado" value={form.estado} onChange={handleChange} disabled={isSavingAppointment} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value="pendiente">Pendiente</option><option value="completada">Completada</option><option value="cancelada">Cancelada</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notas</label>
                <textarea name="notas" value={form.notas} onChange={handleChange} disabled={isSavingAppointment} rows="4" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none" placeholder="Detalles logisticos, contexto o recordatorios de la sesion..." />
              </div>
              <button type="submit" disabled={isSavingAppointment || patients.length === 0} className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition font-medium disabled:opacity-60 disabled:cursor-not-allowed">{isSavingAppointment ? 'Guardando...' : editingAppointmentId ? 'Guardar cambios' : 'Crear cita'}</button>
            </form>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
            <div className="flex items-center justify-between mb-4">
              <div><h3 className="text-lg font-bold text-gray-800">Disponibilidad semanal</h3><p className="text-sm text-gray-500 mt-1">Agrega uno o varios bloques por dia para cubrir manana, tarde o turnos partidos.</p></div>
              <button type="button" onClick={handleSaveAvailability} disabled={isSavingAvailability} className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition disabled:opacity-60 disabled:cursor-not-allowed"><Save size={16} className="mr-2" /> {isSavingAvailability ? 'Guardando...' : 'Guardar'}</button>
            </div>
            {availabilityActionError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{availabilityActionError}</div>}
            <div className="space-y-3">
              {normalizedAvailabilityDraft.map((entry) => <div key={entry.weekday} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-800">{weekdayLabels[entry.weekday]}</p>
                      <p className="text-xs text-gray-500">{entry.blocks.length > 0 ? `${entry.blocks.length} bloque(s)` : 'Sin disponibilidad ese dia'}</p>
                    </div>
                    <button type="button" onClick={() => handleAddAvailabilityBlock(entry.weekday)} disabled={isSavingAvailability} className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition disabled:opacity-60"><Plus size={14} className="mr-2" /> Agregar bloque</button>
                  </div>
                  <div className="space-y-2">
                    {entry.blocks.map((block) => <div key={block.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-center">
                      <select value={block.startTime} onChange={(event) => handleAvailabilityBlockChange(entry.weekday, block.id, 'startTime', event.target.value)} disabled={isSavingAvailability} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                        {availabilityStartOptions.map((option) => <option key={option.value} value={option.value}>Desde {option.label}</option>)}
                      </select>
                      <select value={block.endTime} onChange={(event) => handleAvailabilityBlockChange(entry.weekday, block.id, 'endTime', event.target.value)} disabled={isSavingAvailability} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                        {availabilityEndOptions.map((option) => <option key={option.value} value={option.value}>Hasta {option.label}</option>)}
                      </select>
                      <button type="button" onClick={() => handleRemoveAvailabilityBlock(entry.weekday, block.id)} disabled={isSavingAvailability} className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-700 hover:bg-red-100 transition disabled:opacity-60"><Trash2 size={16} /></button>
                    </div>)}
                    {entry.blocks.length === 0 && <div className="rounded-lg border border-dashed border-gray-300 bg-white px-3 py-3 text-sm text-gray-500">No hay bloques configurados.</div>}
                  </div>
                </div>
              </div>)}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Excepciones por fecha</h3>
                <p className="text-sm text-gray-500 mt-1">Tienen prioridad sobre la semana base. Puedes bloquear un dia completo o definir horarios especiales.</p>
              </div>
              <button type="button" onClick={resetExceptionForm} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Nueva excepcion</button>
            </div>

            {availabilityExceptionActionError && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{availabilityExceptionActionError}</div>}

            <form onSubmit={handleSaveExceptionRange} className="mb-4 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <h4 className="font-semibold text-slate-800">Bloquear periodo</h4>
                <p className="mt-1 text-xs text-slate-500">Ideal para vacaciones, congresos o ausencias de varios dias. Creara dias no disponibles en todo el rango.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Inicio</label>
                  <input type="date" value={exceptionRangeForm.startDate} onChange={(event) => handleExceptionRangeFieldChange('startDate', event.target.value)} disabled={isSavingAvailabilityException} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-slate-700">Fin</label>
                  <input type="date" value={exceptionRangeForm.endDate} onChange={(event) => handleExceptionRangeFieldChange('endDate', event.target.value)} disabled={isSavingAvailabilityException} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  {exceptionRangeDayCount > 0
                    ? `Se bloquearan ${exceptionRangeDayCount} dia${exceptionRangeDayCount === 1 ? '' : 's'} completos.`
                    : 'Selecciona un rango valido para bloquear el periodo.'}
                </p>
                <button type="submit" disabled={isSavingAvailabilityException || exceptionRangeDayCount === 0} className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition disabled:opacity-60 disabled:cursor-not-allowed">
                  {isSavingAvailabilityException ? 'Guardando...' : 'Bloquear periodo'}
                </button>
              </div>
            </form>

            <form onSubmit={handleSaveException} className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-gray-800">{editingExceptionDate ? 'Editar excepcion' : 'Nueva excepcion'}</h4>
                  <p className="text-xs text-gray-500 mt-1">Usa esta configuracion para vacaciones, feriados o un horario especial en una fecha puntual.</p>
                </div>
                {editingExceptionDate && <button type="button" onClick={resetExceptionForm} className="text-sm font-medium text-gray-500 hover:text-gray-800 transition">Limpiar</button>}
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha</label>
                  <input type="date" value={exceptionForm.date} onChange={(event) => handleExceptionFieldChange('date', event.target.value)} disabled={isSavingAvailabilityException} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                </div>
                <label className="inline-flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700">
                  <input type="checkbox" checked={exceptionForm.isUnavailable} onChange={(event) => handleExceptionFieldChange('isUnavailable', event.target.checked)} disabled={isSavingAvailabilityException} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  Marcar este dia como no disponible
                </label>
              </div>

              {!exceptionForm.isUnavailable && <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Bloques para esta fecha</p>
                    <p className="text-xs text-gray-500">Estos horarios reemplazan la disponibilidad semanal solo en este dia.</p>
                  </div>
                  <button type="button" onClick={handleAddExceptionBlock} disabled={isSavingAvailabilityException} className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition disabled:opacity-60"><Plus size={14} className="mr-2" /> Agregar bloque</button>
                </div>
                <div className="space-y-2">
                  {exceptionForm.blocks.map((block) => <div key={block.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-center">
                    <select value={block.startTime} onChange={(event) => handleExceptionBlockChange(block.id, 'startTime', event.target.value)} disabled={isSavingAvailabilityException} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                      {availabilityStartOptions.map((option) => <option key={option.value} value={option.value}>Desde {option.label}</option>)}
                    </select>
                    <select value={block.endTime} onChange={(event) => handleExceptionBlockChange(block.id, 'endTime', event.target.value)} disabled={isSavingAvailabilityException} className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                      {availabilityEndOptions.map((option) => <option key={option.value} value={option.value}>Hasta {option.label}</option>)}
                    </select>
                    <button type="button" onClick={() => handleRemoveExceptionBlock(block.id)} disabled={isSavingAvailabilityException} className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-700 hover:bg-red-100 transition disabled:opacity-60"><Trash2 size={16} /></button>
                  </div>)}
                </div>
              </div>}

              <button type="submit" disabled={isSavingAvailabilityException || !exceptionForm.date} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700 transition disabled:opacity-60 disabled:cursor-not-allowed">
                {isSavingAvailabilityException ? 'Guardando...' : editingExceptionDate ? 'Guardar excepcion' : 'Crear excepcion'}
              </button>
            </form>

            <div className="mt-4 space-y-3">
              {availabilityExceptions.length > 0 ? availabilityExceptions.map((exception) => (
                <div key={exception.date} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-gray-800 capitalize">{formatExceptionDate(exception.date)}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {exception.isUnavailable
                          ? 'Dia completo no disponible.'
                          : exception.blocks.map((block) => `${String(block.startTime).slice(0, 5)}-${String(block.endTime).slice(0, 5)}`).join(' | ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => handleEditException(exception)} className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition"><Pencil size={14} className="mr-2" /> Editar</button>
                      <button type="button" onClick={() => handleDeleteException(exception.date)} disabled={isSavingAvailabilityException} className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition disabled:opacity-60"><Trash2 size={14} className="mr-2" /> Eliminar</button>
                    </div>
                  </div>
                </div>
              )) : <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500">Todavia no hay excepciones configuradas.</div>}
            </div>
          </div>
        </div>}
      </div>
    </div>
  );
}
