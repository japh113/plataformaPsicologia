export const initialPatients = [
  {
    id: '1',
    nombre: 'Ana Garcia',
    edad: 28,
    riesgo: 'alto',
    ultimaSesion: '2026-04-05',
    motivo: 'Depresion mayor',
    notas: 'Ideacion estructurada. Protocolo activo.',
    tareas: [
      { id: 101, texto: 'Llamar al psiquiatra para ajustar dosis', completada: false },
      { id: 102, texto: 'Registro de pensamientos automaticos', completada: true },
    ],
  },
  {
    id: '2',
    nombre: 'Carlos Lopez',
    edad: 35,
    riesgo: 'medio',
    ultimaSesion: '2026-04-01',
    motivo: 'Ansiedad generalizada',
    notas: 'Ejercicios de respiracion funcionando. Mejoria en sueno.',
    tareas: [{ id: 201, texto: 'Practicar respiracion diafragmatica (10 min/dia)', completada: false }],
  },
  {
    id: '3',
    nombre: 'Sofia Martinez',
    edad: 22,
    riesgo: 'bajo',
    ultimaSesion: '2026-03-28',
    motivo: 'Autoestima',
    notas: 'Progreso constante. Reducir frecuencia de sesiones.',
    tareas: [],
  },
];

export const todayAppointments = [
  { id: 101, pacienteId: '1', hora: '10:00 AM', estado: 'pendiente' },
  { id: 102, pacienteId: '2', hora: '11:30 AM', estado: 'completada' },
];

export const initialTransactions = [
  { id: 1, pacienteId: '1', fecha: '2026-04-05', monto: 800, estado: 'pagado', metodo: 'Transferencia', factura: true },
  { id: 2, pacienteId: '2', fecha: '2026-04-01', monto: 800, estado: 'pendiente', metodo: '-', factura: false },
  { id: 3, pacienteId: '3', fecha: '2026-03-28', monto: 600, estado: 'pagado', metodo: 'Tarjeta', factura: false },
];

export const futureFeatures = [
  { id: 'finanzas', label: 'Finanzas y Cobros', description: 'Proximamente', icon: 'dollar' },
  { id: 'ia', label: 'Asistente Clinico IA', description: 'Proximamente', icon: 'sparkles' },
];
