const errorMiddleware = (err, req, res, next) => {
  console.error(err);

  return res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
};

export default errorMiddleware;