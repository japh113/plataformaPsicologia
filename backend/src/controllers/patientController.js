import { patientModel } from '../models/patientModel.js';

export const getPatients = (_req, res) => {
  res.json({ data: patientModel.findAll() });
};

export const getPatientById = (req, res) => {
  const patient = patientModel.findById(req.params.id);
  if (!patient) {
    return res.status(404).json({ error: 'Paciente no encontrado' });
  }
  return res.json({ data: patient });
};
