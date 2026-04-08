const patients = [
  { id: 1, nombre: 'Ana García', edad: 28, riesgo: 'alto', motivo: 'Depresión Mayor' },
  { id: 2, nombre: 'Carlos López', edad: 35, riesgo: 'medio', motivo: 'Ansiedad Generalizada' },
];

export const patientModel = {
  findAll() {
    return patients;
  },
  findById(id) {
    return patients.find((patient) => patient.id === Number(id));
  },
};
