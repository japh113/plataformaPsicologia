import mockPatients from '../../data/mockPatients.js';
import { buildPatientEntity } from './patients.model.js';

let patients = [...mockPatients];

export const getAllPatients = () => {
  return patients;
};

export const getPatientById = (id) => {
  return patients.find((patient) => patient.id === id);
};

export const createPatient = (payload) => {
  const newPatient = buildPatientEntity(payload, String(Date.now()));
  patients.push(newPatient);
  return newPatient;
};

export const updatePatient = (id, payload) => {
  const index = patients.findIndex((patient) => patient.id === id);

  if (index === -1) {
    return null;
  }

  const current = patients[index];

  const updated = {
    ...current,
    ...payload,
  };

  updated.fullName = `${updated.firstName} ${updated.lastName}`.trim();

  patients[index] = updated;
  return updated;
};

export const deletePatient = (id) => {
  const index = patients.findIndex((patient) => patient.id === id);

  if (index === -1) {
    return false;
  }

  patients.splice(index, 1);
  return true;
};