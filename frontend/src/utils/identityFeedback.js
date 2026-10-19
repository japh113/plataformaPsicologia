// Display only: backend Retry-After and eligibility rules remain authoritative.
export function formatRetryAfter(value) {
  const seconds = Math.max(0, Math.ceil(Number(value) || 0));
  if (seconds < 60) return seconds + (seconds === 1 ? ' segundo' : ' segundos');
  const totalMinutes = Math.ceil(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours) parts.push(hours + (hours === 1 ? ' hora' : ' horas'));
  if (minutes) parts.push(minutes + (minutes === 1 ? ' minuto' : ' minutos'));
  return parts.join(' y ');
}

const registrationMessages = {
  'firstName is required': 'Escribe tu nombre.',
  'firstName must be text up to 100 characters': 'El nombre debe tener hasta 100 caracteres.',
  'lastName must be text up to 100 characters': 'El apellido debe tener hasta 100 caracteres.',
  'email must be valid': 'Escribe un correo válido.',
  'password must be 8 characters to 72 bytes': 'La contraseña debe tener al menos 8 caracteres y ocupar hasta 72 bytes.',
  'birthDate must be YYYY-MM-DD': 'Indica una fecha de nacimiento válida.',
  'birthDate must be a real date': 'La fecha de nacimiento debe existir.',
  'birthDate cannot be in the future': 'La fecha de nacimiento no puede ser futura.',
  'Independent registration requires age 18 or older': 'El registro independiente requiere tener 18 años o más.',
  'phone requires international format, for example +525512345678': 'Escribe el teléfono con prefijo internacional, por ejemplo +525512345678.',
  'Unexpected registration field': 'Revisa los campos del registro.',
};
export function patientRegistrationError(error) {
  // A fixed allowlist avoids echoing server/account details or reflecting input.
  if (error?.status === 400 && Array.isArray(error.details)) {
    return [...new Set(error.details.map(detail => registrationMessages[detail] || 'Revisa los datos del registro.'))].join(' ') || 'Revisa los datos del registro.';
  }
  return 'No se pudo completar el registro. Intenta de nuevo más tarde.';
}
