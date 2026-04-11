const backendToUiStatusMap = {
  pending: 'pendiente',
  completed: 'completada',
  cancelled: 'cancelada',
};

const uiToBackendStatusMap = {
  pendiente: 'pending',
  completada: 'completed',
  cancelada: 'cancelled',
};

const weekdayFormatter = new Intl.DateTimeFormat('es-MX', { weekday: 'short' });
const dateLabelFormatter = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const weekdayHeaderFormatter = new Intl.DateTimeFormat('es-MX', { weekday: 'short' });
const monthLabelFormatter = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });

const parseDateString = (dateString) => {
  const [year = '0', month = '1', day = '1'] = String(dateString).split('-');
  return new Date(Number(year), Number(month) - 1, Number(day));
};

const formatDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const startOfWeek = (date) => {
  const nextDate = new Date(date);
  const dayOfWeek = nextDate.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  nextDate.setDate(nextDate.getDate() + diff);
  return nextDate;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const startOfCalendarMonthGrid = (date) => startOfWeek(startOfMonth(date));

const addDays = (date, amount) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
};

const toDisplayHour = (scheduledTime) => {
  const [rawHours = '00', rawMinutes = '00'] = String(scheduledTime).split(':');
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return scheduledTime;
  }

  const normalizedHours = ((hours + 11) % 12) + 1;
  const period = hours >= 12 ? 'PM' : 'AM';
  const paddedMinutes = String(minutes).padStart(2, '0');

  return `${normalizedHours}:${paddedMinutes} ${period}`;
};

const toInputTime = (scheduledTime) => {
  const [hours = '00', minutes = '00'] = String(scheduledTime).split(':');
  return `${hours}:${minutes}`;
};

export const formatAppointmentDisplayHour = (scheduledTime) => toDisplayHour(scheduledTime);

export const getAppointmentHourOptions = (startHour = 7, endHour = 20) =>
  Array.from({ length: endHour - startHour + 1 }, (_, index) => {
    const hours = startHour + index;
    const value = `${String(hours).padStart(2, '0')}:00`;

    return {
      value,
      label: toDisplayHour(value),
    };
  });

export const getTodayDateString = () => {
  const now = new Date();
  return formatDateString(now);
};

export const mapBackendAppointmentToUiAppointment = (appointment) => ({
  id: String(appointment.id),
  pacienteId: String(appointment.patientId),
  fecha: appointment.scheduledDate,
  hora: toDisplayHour(appointment.scheduledTime),
  hora24: toInputTime(appointment.scheduledTime),
  recurrenciaGrupoId: appointment.recurrenceGroupId || null,
  estado: backendToUiStatusMap[appointment.status] || 'pendiente',
  notas: appointment.notes || '',
  sesionRegistrada: Boolean(appointment.hasLinkedClinicalNote ?? appointment.hasLinkedSession),
  waitlistCount: Number(appointment.waitlistCount || 0),
});

export const mapUiAppointmentToBackendAppointment = (appointment) => ({
  patientId: String(appointment.pacienteId),
  scheduledDate: appointment.fecha,
  scheduledTime: appointment.hora24,
  status: uiToBackendStatusMap[appointment.estado] || 'pending',
  notes: appointment.notas || '',
  recurrence: appointment.recurrenciaActiva && appointment.recurrenciaHasta
    ? {
      endDate: appointment.recurrenciaHasta,
    }
    : undefined,
});

export const filterAppointmentsByDate = (appointments, date) => {
  if (!date) {
    return appointments;
  }

  return appointments.filter((appointment) => appointment.fecha === date);
};

export const getWeekDates = (anchorDateString) => {
  const anchorDate = parseDateString(anchorDateString);
  const weekStart = startOfWeek(anchorDate);

  return Array.from({ length: 7 }, (_, index) => {
    const currentDate = addDays(weekStart, index);

    return {
      isoDate: formatDateString(currentDate),
      shortWeekday: weekdayFormatter.format(currentDate).replace('.', ''),
      shortLabel: dateLabelFormatter.format(currentDate),
    };
  });
};

export const shiftDateByDays = (dateString, amount) => {
  return formatDateString(addDays(parseDateString(dateString), amount));
};

export const shiftDateByMonths = (dateString, amount) => {
  const currentDate = parseDateString(dateString);
  return formatDateString(new Date(currentDate.getFullYear(), currentDate.getMonth() + amount, currentDate.getDate()));
};

export const getWeekRangeLabel = (anchorDateString) => {
  const weekDates = getWeekDates(anchorDateString);
  const firstDate = parseDateString(weekDates[0].isoDate);
  const lastDate = parseDateString(weekDates[weekDates.length - 1].isoDate);

  return `${dateLabelFormatter.format(firstDate)} - ${dateLabelFormatter.format(lastDate)}`;
};

export const getMonthLabel = (anchorDateString) => {
  return monthLabelFormatter.format(parseDateString(anchorDateString));
};

export const getMonthWeekdayHeaders = () => {
  const weekBase = startOfWeek(parseDateString('2026-04-06'));

  return Array.from({ length: 7 }, (_, index) => weekdayHeaderFormatter.format(addDays(weekBase, index)).replace('.', ''));
};

export const getMonthDates = (anchorDateString) => {
  const anchorDate = parseDateString(anchorDateString);
  const currentMonth = anchorDate.getMonth();
  const gridStart = startOfCalendarMonthGrid(anchorDate);

  return Array.from({ length: 42 }, (_, index) => {
    const currentDate = addDays(gridStart, index);

    return {
      isoDate: formatDateString(currentDate),
      dayNumber: currentDate.getDate(),
      isCurrentMonth: currentDate.getMonth() === currentMonth,
    };
  });
};

export const isAppointmentOverdue = (appointment, now = new Date()) => {
  if (!appointment || appointment.estado !== 'pendiente' || !appointment.fecha) {
    return false;
  }

  const scheduledTime = appointment.hora24 || '00:00';
  const [year = '0', month = '1', day = '1'] = String(appointment.fecha).split('-');
  const [hours = '0', minutes = '0'] = String(scheduledTime).split(':');
  const endDate = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes) + 60,
    0,
    0,
  );

  return now > endDate;
};

export const getAppointmentDisplayStatus = (appointment, now = new Date()) => (
  isAppointmentOverdue(appointment, now) ? 'por cerrar' : appointment.estado
);

export const mapBackendWaitlistToUiWaitlistEntry = (entry) => ({
  id: String(entry.id),
  pacienteId: String(entry.patientId),
  pacienteNombre: entry.patientName,
  fecha: entry.scheduledDate,
  hora24: toInputTime(entry.scheduledTime),
  hora: toDisplayHour(entry.scheduledTime),
  prioridad: Number(entry.priorityPosition || 0),
  notas: entry.notes || '',
  estado: entry.status || 'active',
  creadaEn: entry.createdAt,
});
