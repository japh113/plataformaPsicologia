const errorMiddleware = (err, req, res, next) => {
  console.error(err);

  const integrityConflict = err.code === 'P0001' && err.message?.startsWith('CLINICAL_INTEGRITY:');
  return res.status(integrityConflict ? 409 : (err.status || 500)).json({
    success: false,
    message: err.message || 'Internal server error',
    ...((integrityConflict || err.code === 'CLINICAL_RECORD_PRESERVED') ? { code: 'CLINICAL_RECORD_PRESERVED' } : {}),
  });
};

export default errorMiddleware;