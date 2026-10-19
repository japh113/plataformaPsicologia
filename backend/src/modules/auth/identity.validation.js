// Product reference for Mexican patient registration B only; not the clinical agenda.
// Civil date comes from the server instant in this zone, never host/client timezone.
const registrationDateFormatter = new Intl.DateTimeFormat('en', {
  timeZone: 'America/Mexico_City', calendar: 'gregory', numberingSystem: 'latn',
  year: 'numeric', month: '2-digit', day: '2-digit',
});
const registrationCivilDate = now => {
  const parts = registrationDateFormatter.formatToParts(now);
  const part = type => parts.find(value => value.type === type).value;
  return [part('year').padStart(4, '0'), part('month'), part('day')].join('-');
};
export function adultBirthDateError(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'birthDate must be YYYY-MM-DD';
  const year = Number(value.slice(0, 4));
  const date = new Date(value + 'T00:00:00Z');
  if (year < 1 || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return 'birthDate must be a real date';
  const today = registrationCivilDate(now);
  if (value > today) return 'birthDate cannot be in the future';
  // On a non-leap year, 02-29 remains ineligible through 02-28; eligible on 03-01.
  const age = Number(today.slice(0, 4)) - year - (today.slice(5) < value.slice(5) ? 1 : 0);
  return age < 18 ? 'Independent registration requires age 18 or older' : null;
}
// Explicit international input only. No inferred country and no global uniqueness.
export function normalizePhone(value) {
  if (typeof value !== 'string' || !/^\+[1-9][0-9 ()-]{1,24}$/.test(value)) return null;
  const phone = value.replace(/[ ()-]/g, '');
  return /^\+[1-9]\d{1,14}$/.test(phone) ? phone : null;
}
export const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export function registrationErrors(payload = {}, now) {
  const errors = [];
  const allowed = ['firstName', 'lastName', 'email', 'password', 'birthDate', 'phone'];
  if (Object.keys(payload).some(key => !allowed.includes(key))) errors.push('Unexpected registration field');
  for (const name of ['firstName', 'lastName']) {
    if (typeof (payload[name] ?? '') !== 'string' || (payload[name] || '').trim().length > 100) errors.push(name + ' must be text up to 100 characters');
  }
  if (!payload.firstName?.trim?.()) errors.push('firstName is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(payload.email)) || String(payload.email).length > 254) errors.push('email must be valid');
  if (typeof payload.password !== 'string' || payload.password.length < 8 || Buffer.byteLength(payload.password) > 72) errors.push('password must be 8 characters to 72 bytes');
  const dobError = adultBirthDateError(payload.birthDate, now);
  if (dobError) errors.push(dobError);
  if (!normalizePhone(payload.phone)) errors.push('phone requires international format, for example +525512345678');
  return errors;
}
