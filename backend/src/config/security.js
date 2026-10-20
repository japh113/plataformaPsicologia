// Local shortcuts require an explicit opt-in; NODE_ENV alone is not a boundary.
export const isLocalDevelopment = (source) =>
  source.LOCAL_DEVELOPMENT === 'true' && ['development', 'test'].includes(source.NODE_ENV || 'development');

export const resolveJwtSecret = (source) => {
  if (isLocalDevelopment(source)) return source.JWT_SECRET || 'psicopanel-dev-secret';

  const secret = source.JWT_SECRET || '';
  const known = /psicopanel|change[-_ ]?this|replace[-_ ]?me|your[-_ ]?(jwt|secret)|disposable|example|password|development|demo/i;
  if (Buffer.byteLength(secret, 'utf8') < 32 || new Set(secret).size < 8 ||
      secret !== secret.trim() || known.test(secret) || /^(.{1,32})\1+$/.test(secret) ||
      /abcdefghijklmnopqrstuvwxyz|0123456789/i.test(secret)) {
    throw new Error('JWT_SECRET must be a unique random secret of at least 32 bytes outside explicit local development');
  }
  return secret;
};

export const assertLocalInitialization = (env) => {
  if (!env.localDevelopment) throw new Error('Legacy schema and demo seeds are restricted to explicit local development; use db:init:production for a NEW empty database');
};

export const resolveRestrictedSecret = (source,ordinary) => {
  if(source.D2_ENABLED!=='true') return '';
  const value=source.RESTRICTED_JWT_SECRET || '';
  if(value===ordinary || value!==value.trim() || Buffer.byteLength(value)<32 || new Set(value).size<12 || /^(.)\1+$/.test(value))
    throw new Error('D2 requires a distinct configured RESTRICTED_JWT_SECRET of at least 32 bytes');
  if(!isLocalDevelopment(source)) resolveJwtSecret({...source,JWT_SECRET:value});
  return value;
};
