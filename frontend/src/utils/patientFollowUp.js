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
