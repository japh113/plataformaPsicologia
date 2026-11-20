const errorMiddleware = (err, req, res, next) => {
  if ((err.code === 'P0001' && err.message === 'consultation_slot_unavailable')
    || (err.code === '23505' && err.constraint === 'consultation_legacy_patient_day')) {
    return res.status(409).json({ success: false, message: 'El turno solicitado no está disponible.' });
  }
  if (err.code === 'P0001' && err.message === 'consultation_full_hour') {
    return res.status(400).json({ success: false, message: 'Selecciona una hora exacta para la cita.' });
  }
  console.error(err);

  const integrityConflict = err.code === 'P0001' && err.message?.startsWith('CLINICAL_INTEGRITY:');
  return res.status(integrityConflict ? 409 : (err.status || 500)).json({
    success: false,
    message: err.message || 'Internal server error',
    ...((integrityConflict || err.code === 'CLINICAL_RECORD_PRESERVED') ? { code: 'CLINICAL_RECORD_PRESERVED' } : {}),
  });
};

export default errorMiddleware;