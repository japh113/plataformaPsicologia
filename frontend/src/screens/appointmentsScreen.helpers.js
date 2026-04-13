import {
  formatAppointmentDisplayHour,
  getAppointmentDisplayStatus,
  getAppointmentHourOptions,
  getMonthDates,
  getMonthLabel,
  getMonthWeekdayHeaders,
  getWeekDates,
  getWeekRangeLabel,
  isAppointmentOverdue,
  shiftDateByDays,
  shiftDateByMonths,
} from '../mappers/appointments';

export {
  formatAppointmentDisplayHour,
  getAppointmentDisplayStatus,
  getAppointmentHourOptions,
  getMonthDates,
  getMonthLabel,
  getMonthWeekdayHeaders,
  getWeekDates,
  getWeekRangeLabel,
  isAppointmentOverdue,
  shiftDateByDays,
  shiftDateByMonths,
};

export const emptyForm = { pacienteId: '', fecha: '', hora24: '', estado: 'pendiente', notas: '', recurrenciaActiva: false, recurrenciaHasta: '', recurrenceEditScope: 'single' };
export const emptyWaitlistForm = { pacienteId: '', fecha: '', hora24: '', notas: '' };
export const weekdayLabels = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
export const exceptionDateFormatter = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const recurrenceDateFormatter = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const getStatusBadge = (estado) => (estado === 'completada' ? 'bg-green-100 text-green-700 border-green-200' : estado === 'cancelada' ? 'bg-red-100 text-red-700 border-red-200' : estado === 'no asistio' ? 'bg-slate-100 text-slate-700 border-slate-200' : estado === 'por cerrar' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-indigo-100 text-indigo-700 border-indigo-200');
export const getMiniAppointmentChip = (estado) => (estado === 'completada' ? 'bg-green-100 text-green-700 border-green-200' : estado === 'cancelada' ? 'bg-red-100 text-red-700 border-red-200' : estado === 'no asistio' ? 'bg-slate-100 text-slate-700 border-slate-200' : estado === 'por cerrar' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-indigo-100 text-indigo-700 border-indigo-200');
export const getAppointmentAccent = (estado) => (estado === 'completada' ? 'border-l-green-500 bg-green-50/40' : estado === 'cancelada' ? 'border-l-red-500 bg-red-50/40' : estado === 'no asistio' ? 'border-l-slate-500 bg-slate-50/70' : estado === 'por cerrar' ? 'border-l-amber-500 bg-amber-50/40' : 'border-l-indigo-500 bg-indigo-50/40');
export const getSessionIndicatorClasses = (sessionState) => (sessionState === 'registered' ? 'bg-emerald-500 ring-emerald-100' : sessionState === 'missing' ? 'bg-sky-500 ring-sky-100' : '');
export const getSessionBadgeClasses = (sessionState) => (sessionState === 'registered' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : sessionState === 'missing' ? 'border-sky-200 bg-sky-50 text-sky-700' : '');
export const getDayNumberBadge = ({ isToday, isActive, isHovered, isCurrentMonth }) => (isActive ? 'bg-indigo-600 text-white shadow-sm' : isHovered ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-200' : isToday ? 'bg-indigo-100 text-indigo-700' : isCurrentMonth ? 'text-slate-900' : 'text-slate-400');
export const getExceptionPillClasses = (isUnavailable) => (isUnavailable ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700');
export const getExceptionDotClasses = (isUnavailable) => (isUnavailable ? 'bg-red-500 ring-red-100' : 'bg-amber-500 ring-amber-100');
export const getExceptionCellAccent = (isUnavailable) => (isUnavailable ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/40');
export const getWaitlistBadgeClasses = () => 'border-violet-200 bg-violet-50 text-violet-700';
export const getWaitlistCountDotClasses = () => 'bg-violet-500 ring-violet-100';
export const getWeekdayFromDateString = (value) => { const [y = '0', m = '1', d = '1'] = String(value).split('-'); return new Date(Number(y), Number(m) - 1, Number(d)).getDay(); };
export const createTempId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const buildAppointmentSlotKey = (date, hour24) => `${date}::${hour24}`;
export const getAppointmentDateTime = (appointment) => {
  if (!appointment?.fecha) {
    return new Date(0);
  }

  const [year = '0', month = '1', day = '1'] = String(appointment.fecha).split('-');
  const [hours = '0', minutes = '0'] = String(appointment.hora24 || '00:00').split(':');

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    0,
    0,
  );
};
export const normalizeBlocks = (blocks, prefix) => (blocks || []).map((block, index) => ({ id: block.id || `${prefix}-${index}`, startTime: String(block.startTime || '').slice(0, 5), endTime: String(block.endTime || '').slice(0, 5) }));
export const normalizeDraftEntries = (entries) => (entries || []).map((entry) => ({ weekday: entry.weekday, blocks: normalizeBlocks(entry.blocks, `tmp-${entry.weekday}`) }));
export const createDefaultExceptionBlock = () => ({ id: createTempId('exception-block'), startTime: '09:00', endTime: '10:00' });
export const createEmptyExceptionForm = (date = '') => ({ date, isUnavailable: false, blocks: [createDefaultExceptionBlock()] });
export const normalizeExceptionForm = (exception) => ({
  date: exception?.date || '',
  isUnavailable: Boolean(exception?.isUnavailable),
  blocks: exception?.isUnavailable
    ? []
    : normalizeBlocks(exception?.blocks, `exception-${exception?.date || 'draft'}`).length > 0
      ? normalizeBlocks(exception?.blocks, `exception-${exception?.date || 'draft'}`)
      : [createDefaultExceptionBlock()],
});
export const formatExceptionDate = (date) => {
  const [year = '0', month = '1', day = '1'] = String(date).split('-');
  return exceptionDateFormatter.format(new Date(Number(year), Number(month) - 1, Number(day)));
};
export const getRangeDayCount = (startDate, endDate) => {
  if (!startDate || !endDate || endDate < startDate) {
    return 0;
  }

  const [startYear = '0', startMonth = '1', startDay = '1'] = String(startDate).split('-');
  const [endYear = '0', endMonth = '1', endDay = '1'] = String(endDate).split('-');
  const start = new Date(Number(startYear), Number(startMonth) - 1, Number(startDay));
  const end = new Date(Number(endYear), Number(endMonth) - 1, Number(endDay));
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
};

export const addDaysToDateString = (dateString, amount) => {
  const [year = '0', month = '1', day = '1'] = String(dateString).split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
};

export const formatRecurrenceDateLabel = (date) => {
  const [year = '0', month = '1', day = '1'] = String(date).split('-');
  return recurrenceDateFormatter.format(new Date(Number(year), Number(month) - 1, Number(day)));
};

export const buildRecurringEndDateOptions = (startDate, weeks = 52) => {
  if (!startDate) {
    return [];
  }

  return Array.from({ length: weeks }, (_, index) => {
    const value = addDaysToDateString(startDate, (index + 1) * 7);
    return {
      value,
      label: formatRecurrenceDateLabel(value),
    };
  });
};

export const getRecurringOccurrencesCount = (startDate, endDate) => {
  if (!startDate || !endDate || endDate <= startDate) {
    return 0;
  }

  const [startYear = '0', startMonth = '1', startDay = '1'] = String(startDate).split('-');
  const [endYear = '0', endMonth = '1', endDay = '1'] = String(endDate).split('-');
  const start = new Date(Number(startYear), Number(startMonth) - 1, Number(startDay));
  const end = new Date(Number(endYear), Number(endMonth) - 1, Number(endDay));
  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000);

  if (!Number.isFinite(diffDays) || diffDays < 7 || diffDays % 7 !== 0) {
    return 0;
  }

  return diffDays / 7;
};

export const buildBlockedRanges = (exceptions) => {
  const unavailableDates = [...(exceptions || [])]
    .filter((exception) => exception.isUnavailable)
    .map((exception) => exception.date)
    .sort((left, right) => left.localeCompare(right));

  if (unavailableDates.length === 0) {
    return [];
  }

  const ranges = [];
  let rangeStart = unavailableDates[0];
  let previousDate = unavailableDates[0];

  for (let index = 1; index < unavailableDates.length; index += 1) {
    const currentDate = unavailableDates[index];

    if (currentDate === addDaysToDateString(previousDate, 1)) {
      previousDate = currentDate;
      continue;
    }

    ranges.push({
      startDate: rangeStart,
      endDate: previousDate,
      dayCount: getRangeDayCount(rangeStart, previousDate),
    });
    rangeStart = currentDate;
    previousDate = currentDate;
  }

  ranges.push({
    startDate: rangeStart,
    endDate: previousDate,
    dayCount: getRangeDayCount(rangeStart, previousDate),
  });

  return ranges;
};

export const formatBlockedRangeLabel = (range) => (
  range.startDate === range.endDate
    ? formatExceptionDate(range.startDate)
    : `${formatExceptionDate(range.startDate)} - ${formatExceptionDate(range.endDate)}`
);
export const getAppointmentSessionState = (appointment, hasLinkedSession) => {
  if (appointment.estado !== 'completada') {
    return 'none';
  }

  return hasLinkedSession ? 'registered' : 'missing';
};
export const getAppointmentSessionLabel = (sessionState) => (
  sessionState === 'registered' ? 'Nota clinica registrada' : sessionState === 'missing' ? 'Falta nota clinica' : ''
);
export const calendarStatusPriority = {
  cancelada: 0,
  'no asistio': 1,
  'por cerrar': 2,
  pendiente: 3,
  completada: 4,
};
export const sortCalendarDayAppointments = (entries) => (
  [...entries].sort((left, right) => {
    const timeCompare = (left.hora24 || '').localeCompare(right.hora24 || '');

    if (timeCompare !== 0) {
      return timeCompare;
    }

    const leftStatus = getAppointmentDisplayStatus(left);
    const rightStatus = getAppointmentDisplayStatus(right);
    const leftPriority = calendarStatusPriority[leftStatus] ?? 99;
    const rightPriority = calendarStatusPriority[rightStatus] ?? 99;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return String(left.id).localeCompare(String(right.id));
  })
);
export const getVisibleCalendarAppointments = (entries, baseLimit) => {
  if (entries.length <= baseLimit) {
    return entries;
  }

  const visibleEntries = entries.slice(0, baseLimit);
  const lastVisible = visibleEntries[visibleEntries.length - 1];
  const overflowEntries = entries.slice(baseLimit);

  if (!lastVisible || overflowEntries.length === 0) {
    return visibleEntries;
  }

  const sameSlotEntries = overflowEntries.filter((entry) => entry.hora24 === lastVisible.hora24);
  return [...visibleEntries, ...sameSlotEntries];
};
export const groupCalendarAppointmentsBySlot = (entries) => {
  const groups = [];

  entries.forEach((entry) => {
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup[0]?.hora24 === entry.hora24) {
      lastGroup.push(entry);
      return;
    }

    groups.push([entry]);
  });

  return groups;
};
export const getCalendarGroupContainerClasses = (groupLength, size) => {
  if (groupLength <= 1) {
    return 'grid grid-cols-1 gap-1';
  }

  return size === 'month'
    ? 'mx-auto flex max-w-full items-center justify-center gap-1'
    : 'mx-auto flex max-w-full items-center justify-center gap-1.5';
};

const includesAny = (message, fragments) => fragments.some((fragment) => message.includes(fragment));

export const getAppointmentErrorMeta = (rawMessage = '') => {
  const message = String(rawMessage || '').toLowerCase();

  if (includesAny(message, ['ya tiene una cita agendada en este dia', 'paciente ya agendado este dia'])) {
    return {
      title: 'Ese paciente ya tiene una cita activa ese dia',
      hint: 'Elige otra fecha o libera primero la cita existente antes de intentar guardar una nueva.',
    };
  }

  if (includesAny(message, ['otra cita agendada en ese horario', 'mismo horario', 'solap'])) {
    return {
      title: 'Ese horario ya no esta disponible',
      hint: 'Prueba otro bloque libre o usa la lista de espera si quieres apartar ese mismo horario ocupado.',
    };
  }

  if (includesAny(message, ['fuera de tu disponibilidad', 'sin disponibilidad', 'dia no disponible'])) {
    return {
      title: 'La cita queda fuera de la disponibilidad actual',
      hint: 'Ajusta la hora o revisa primero la disponibilidad y las excepciones para esa fecha.',
    };
  }

  if (includesAny(message, ['no puedes completar y registrar una cita futura', 'cita futura'])) {
    return {
      title: 'Las citas futuras no se pueden cerrar todavia',
      hint: 'Espera a que llegue el dia de la cita para marcarla como completada y registrar la nota clinica.',
    };
  }

  if (includesAny(message, ['nota clinica'])) {
    return {
      title: 'Esta cita ya tiene seguimiento clinico asociado',
      hint: 'Cuando una cita ya tiene nota clinica, el sistema protege su trazabilidad y restringe ciertos cambios.',
    };
  }

  return {
    title: 'No pudimos guardar la cita',
    hint: 'Revisa fecha, hora, disponibilidad y estado antes de volver a intentarlo.',
  };
};

export const getWaitlistErrorMeta = (rawMessage = '') => {
  const message = String(rawMessage || '').toLowerCase();

  if (includesAny(message, ['ya agendado ese dia', 'ya tiene una cita agendada en este dia'])) {
    return {
      title: 'Ese paciente ya tiene una cita activa ese dia',
      hint: 'La lista de espera solo tiene sentido si el paciente no esta ya agendado en otra hora de esa misma fecha.',
    };
  }

  if (includesAny(message, ['duplic', 'ya existe', 'lista de espera'])) {
    return {
      title: 'La solicitud de espera ya existe o no es valida',
      hint: 'Evita duplicar al mismo paciente en el mismo horario y asegúrate de elegir un slot ocupado.',
    };
  }

  return {
    title: 'No pudimos actualizar la lista de espera',
    hint: 'Comprueba que el horario este ocupado y que el paciente no tenga otra cita activa ese mismo dia.',
  };
};

export const getAvailabilityErrorMeta = (rawMessage = '') => {
  const message = String(rawMessage || '').toLowerCase();

  if (includesAny(message, ['citas agendadas fuera del nuevo horario', 'no puedes reducir la disponibilidad'])) {
    return {
      title: 'La nueva disponibilidad deja citas sin cobertura',
      hint: 'Primero reprograma o cancela las citas futuras afectadas antes de reducir bloques u horarios.',
    };
  }

  return {
    title: 'No pudimos guardar la disponibilidad semanal',
    hint: 'Revisa que los bloques no se pisen y que los horarios mantengan cobertura para las citas futuras.',
  };
};

export const getAvailabilityExceptionErrorMeta = (rawMessage = '') => {
  const message = String(rawMessage || '').toLowerCase();

  if (includesAny(message, ['cita', 'citas futuras', 'fuera de cobertura'])) {
    return {
      title: 'Ese cambio afecta citas ya registradas',
      hint: 'Antes de guardar la excepcion, reprograma o cancela las citas que quedarian fuera del nuevo horario.',
    };
  }

  return {
    title: 'No pudimos guardar esta excepcion',
    hint: 'Verifica la fecha, los bloques y que el cambio no choque con vacaciones, bloqueos o citas futuras.',
  };
};
