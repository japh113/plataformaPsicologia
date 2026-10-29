// Resolve IDs against current tasks so completion changes update both views.
export const getPatientFollowUpGroups = (patient) => {
  const tasks = new Map((patient?.tareas || []).map(task => [task.id, task]));
  const resolve = ids => (ids || []).map(id => tasks.get(id)).filter(Boolean);
  const consultations = (patient?.seguimiento?.consultas || []).map(entry => ({
    ...entry, tasks: resolve(entry.tareaIds),
  }));
  return {
    consultations,
    unassignedTasks: resolve(patient?.seguimiento?.tareaIdsSinConsulta),
  };
};

export const formatFollowUpDate = (value) => {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(year, month - 1, day));
};

// Preserve only this patient's current-session projection during optional refreshes.
export const preservePatientFollowUp = (previous, next) => {
  if (previous?.id !== next.id || next.seguimiento) return next;
  return {
    ...next,
    seguimiento: previous.seguimiento,
    seguimientoEstado: next.seguimientoEstado === 'idle' ? previous.seguimientoEstado : next.seguimientoEstado,
  };
};

// A stale whole-file response may update demographics/interview, not newer activity.
export const preservePatientActivity = (previous, next, preserveActivity) => {
  if (previous?.id !== next.id) return next;
  if (!preserveActivity) return preservePatientFollowUp(previous, next);
  return {
    ...next,
    tareas: previous.tareas,
    objetivos: previous.objetivos,
    seguimiento: previous.seguimiento,
    seguimientoEstado: previous.seguimientoEstado,
  };
};
