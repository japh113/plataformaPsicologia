// PostgreSQL BIGINT keys: no coercion, rounded numbers, signs or leading zeroes.
export const episodeKey = value => {
  const key = typeof value === 'bigint' || (typeof value === 'number' && Number.isSafeInteger(value))
    ? String(value) : value;
  return typeof key === 'string' && /^[1-9][0-9]{0,18}$/.test(key) &&
    BigInt(key) <= 9223372036854775807n ? key : null;
};
export const textKey = value => typeof value === 'string' && value.trim().length > 0 &&
  !value.includes('\0') ? value : null;
