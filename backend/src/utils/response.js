export const successResponse = (res, data, message = 'OK', status = 200) => {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
};

export const errorResponse = (res, message = 'Error', status = 500, details = null) => {
  return res.status(status).json({
    success: false,
    message,
    details,
  });
};