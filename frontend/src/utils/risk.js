export const getRiskColor = (riesgo) => {
  switch (riesgo) {
    case 'alto':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'medio':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'bajo':
      return 'bg-green-100 text-green-800 border-green-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

export const sortPatientsByRisk = (patients) => {
  const order = { alto: 1, medio: 2, bajo: 3 };
  return [...patients].sort((a, b) => order[a.riesgo] - order[b.riesgo]);
};
