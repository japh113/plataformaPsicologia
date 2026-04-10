export const interviewIndicatorGroups = [
  [
    { key: 'insomnio', label: 'Insomnio' },
    { key: 'consumoDrogas', label: 'Consumo de drogas' },
  ],
  [
    { key: 'pesadillas', label: 'Pesadillas' },
    { key: 'maltratoPsicologico', label: 'Maltrato psicologico' },
  ],
  [
    { key: 'miedosOFobias', label: 'Miedos o fobias' },
    { key: 'maltratoFisico', label: 'Maltrato fisico' },
  ],
  [
    { key: 'accidentes', label: 'Accidentes' },
    { key: 'deseoDeMorir', label: 'Deseo de morir' },
  ],
  [
    { key: 'consumoAlcohol', label: 'Consumo alcohol' },
    { key: 'intentosSuicidas', label: 'Intentos suicidas' },
  ],
  [
    { key: 'consumoTabaco', label: 'Consumo tabaco' },
    null,
  ],
];

export const buildEmptyInterviewForm = () => ({
  fechaNacimiento: '',
  lugarNacimiento: '',
  ocupacion: '',
  hobbies: '',
  estadoCivil: '',
  familia: '',
  viveCon: '',
  enfermedadesFisicas: '',
  fechaEntrevista: '',
  indicadores: {
    insomnio: false,
    pesadillas: false,
    miedosOFobias: false,
    accidentes: false,
    consumoAlcohol: false,
    consumoTabaco: false,
    consumoDrogas: false,
    maltratoPsicologico: false,
    maltratoFisico: false,
    deseoDeMorir: false,
    intentosSuicidas: false,
  },
});

export const buildInterviewForm = (patient, todayDate) => {
  const baseForm = buildEmptyInterviewForm();

  if (!patient?.entrevista) {
    return {
      ...baseForm,
      fechaEntrevista: todayDate || '',
    };
  }

  return {
    ...baseForm,
    ...patient.entrevista,
    fechaEntrevista: patient.entrevista.fechaEntrevista || todayDate || '',
    indicadores: {
      ...baseForm.indicadores,
      ...(patient.entrevista.indicadores || {}),
    },
  };
};

export const formatInterviewDate = (value) => {
  if (!value) {
    return 'Pendiente';
  }

  const [year = '0', month = '1', day = '1'] = String(value).slice(0, 10).split('-');
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
};
