// Bound raw input before trim/case conversion or scanning. This is the existing
// patient-registration ceiling, now shared by email-format validators.
export const MAX_EMAIL_LENGTH = 254;

export function isValidEmail(value) {
  if (typeof value !== 'string' || value.length > MAX_EMAIL_LENGTH) return false;
  const email = value.trim();
  const at = email.indexOf('@');
  if (at < 1 || at !== email.lastIndexOf('@') || /\s/u.test(email)) return false;
  // Same simple format as before: some dot with a domain character on each side.
  // Deliberately not an RFC/domain-label validator.
  const dot = email.indexOf('.', at + 2);
  return dot > at + 1 && dot < email.length - 1;
}
