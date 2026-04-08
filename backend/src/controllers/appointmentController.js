export const getAppointments = (_req, res) => {
  res.json({ data: [{ id: 101, pacienteId: 1, hora: '10:00 AM', estado: 'pendiente' }] });
};
