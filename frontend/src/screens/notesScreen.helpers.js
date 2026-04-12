import { getAppointmentDisplayStatus, isAppointmentOverdue } from '../mappers/appointments';

export { getAppointmentDisplayStatus, isAppointmentOverdue };

export const emptySessionForm = {
  citaId: '',
  objetivo: '',
  observaciones: '',
  proximoPaso: '',
  contenido: '',
  tareas: [],
};

export const riskOptions = [
  { value: 'sin riesgo', label: 'Sin riesgo' },
  { value: 'bajo', label: 'Bajo' },
  { value: 'medio', label: 'Medio' },
  { value: 'alto', label: 'Alto' },
];

export const statusOptions = [
  { value: 'activo', label: 'Activo' },
  { value: 'en pausa', label: 'En pausa' },
  { value: 'de baja', label: 'De baja' },
  { value: 'de alta', label: 'De alta' },
];

export const getOptionLabel = (options, value, fallback = '') => (
  options.find((option) => option.value === value)?.label || fallback
);

export const agendaFilterOptions = [
  { id: 'proximas', label: 'Proximas' },
  { id: 'por-cerrar', label: 'Por cerrar' },
  { id: 'historial', label: 'Historial' },
];

export const getPatientAgeLabel = (patient) => (
  patient.edad === null || typeof patient.edad === 'undefined' ? 'Edad no registrada' : `${patient.edad} anos`
);

export const formatSessionDate = (value) => {
  if (!value) {
    return 'Fecha no registrada';
  }

  const [year = '0', month = '1', day = '1'] = String(value).split('-');
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
};

export const getRelativeLastSessionLabel = (value, todayDate) => {
  if (!value || !todayDate) {
    return '';
  }

  const [fromYear = '0', fromMonth = '1', fromDay = '1'] = String(value).split('-');
  const [toYear = '0', toMonth = '1', toDay = '1'] = String(todayDate).split('-');
  const fromDate = new Date(Number(fromYear), Number(fromMonth) - 1, Number(fromDay));
  const toDate = new Date(Number(toYear), Number(toMonth) - 1, Number(toDay));
  const diffDays = Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000);

  if (!Number.isFinite(diffDays) || diffDays < 0) {
    return '';
  }

  if (diffDays === 0) {
    return 'Hoy';
  }

  if (diffDays === 1) {
    return 'Hace 1 dia';
  }

  if (diffDays < 7) {
    return `Hace ${diffDays} dias`;
  }

  const diffWeeks = Math.floor(diffDays / 7);

  if (diffWeeks === 1) {
    return 'Hace 1 semana';
  }

  if (diffDays < 30) {
    return `Hace ${diffWeeks} semanas`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  return diffMonths <= 1 ? 'Hace 1 mes' : `Hace ${diffMonths} meses`;
};

export const formatAppointmentDateTime = (appointment) => {
  if (!appointment?.fecha) {
    return 'Fecha no registrada';
  }

  const [year = '0', month = '1', day = '1'] = String(appointment.fecha).split('-');
  const dateLabel = new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));

  return `${dateLabel} - ${appointment.hora}`;
};

export const getAppointmentStatusClasses = (status) => (
  status === 'por cerrar'
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : status === 'completada'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'cancelada'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-indigo-200 bg-indigo-50 text-indigo-700'
);

export const getSessionCoverageClasses = (hasSession) => (
  hasSession
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-sky-200 bg-sky-50 text-sky-700'
);

export const getStatusBadgeClasses = (status) => (
  status === 'en pausa'
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : status === 'de alta'
      ? 'border-sky-200 bg-sky-50 text-sky-700'
      : status === 'de baja'
        ? 'border-slate-200 bg-slate-100 text-slate-600'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
);

export const sortAppointmentsAsc = (entries) => (
  [...entries].sort((left, right) => `${left.fecha}T${left.hora24}`.localeCompare(`${right.fecha}T${right.hora24}`))
);

export const sortAppointmentsDesc = (entries) => (
  [...entries].sort((left, right) => `${right.fecha}T${right.hora24}`.localeCompare(`${left.fecha}T${left.hora24}`))
);

export const sortSessionsDesc = (entries) => (
  [...entries].sort((left, right) => {
    const leftKey = `${left.fecha || '0000-00-00'}T${left.actualizadaEn || left.creadaEn || '00:00:00'}`;
    const rightKey = `${right.fecha || '0000-00-00'}T${right.actualizadaEn || right.creadaEn || '00:00:00'}`;
    return rightKey.localeCompare(leftKey);
  })
);

export const buildProfileForm = (patient) => ({
  riesgo: patient?.riesgo || 'sin riesgo',
  estado: patient?.estado || 'activo',
  motivo: patient?.motivo || '',
});
