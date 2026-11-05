import { isIP } from 'node:net';
import { performance } from 'node:perf_hooks';
import { errorResponse } from '../../utils/response.js';

// Technical starting budgets, not account quotas or a product entitlement.
export const PUBLIC_AUTH_POLICIES = Object.freeze({
  login: Object.freeze({ limit: 60, windowMs: 60_000 }),
  registration: Object.freeze({ limit: 30, windowMs: 600_000 }),
  passwordReset: Object.freeze({ limit: 40, windowMs: 600_000 }),
});

export function publicAuthClientKey(req) {
  // Socket peer only. Never req.ip, X-Forwarded-For, Forwarded or X-Real-IP.
  const address = req.socket?.remoteAddress;
  if (typeof address !== 'string' || address.length > 64) return null;
  const family = isIP(address);
  if (family === 4) return `v4:${address}`;
  if (family !== 6) return null;
  // URL canonicalizes embedded IPv4 and IPv6 spelling after net.isIP validation.
  const canonical = new URL(`http://[${address.split('%')[0]}]/`).hostname.slice(1, -1);
  const [left, right] = canonical.split('::');
  const start = left ? left.split(':') : [];
  const end = right ? right.split(':') : [];
  const groups = right === undefined ? start : [...start, ...Array(8 - start.length - end.length).fill('0'), ...end];
  const words = groups.map(word => parseInt(word, 16));
  if (words.slice(0, 5).every(word => word === 0) && words[5] === 0xffff) {
    return `v4:${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`;
  }
  // Privacy-address rotation within one IPv6 /64 must not reset the budget.
  return `v6:${words.slice(0, 4).map(word => word.toString(16)).join(':')}/64`;
}

export function createPublicAuthLimiter({ limit, windowMs, maxClients = 4096, now = () => performance.now() }) {
  if (![limit, windowMs, maxClients].every(value => Number.isSafeInteger(value) && value > 0) || typeof now !== 'function') {
    throw new TypeError('Invalid public authentication limiter configuration');
  }
  // A shared fixed window bounds both cardinality and per-request work. No timers,
  // eviction of live counters, body-derived keys, database access or secret logging.
  let clients = new Map();
  let resetAt = null;
  let lastNow = -Infinity;
  return (req, res, next) => {
    let status;
    let retryAfter = 1;
    try {
      const current = now();
      if (!Number.isFinite(current) || current < lastNow) throw new Error('Unavailable clock');
      lastNow = current;
      if (resetAt === null || current >= resetAt) {
        clients = new Map();
        resetAt = current + windowMs;
      }
      retryAfter = Math.max(1, Math.ceil((resetAt - current) / 1000));
      const key = publicAuthClientKey(req);
      if (key === null) {
        status = 503;
      } else {
        const count = clients.get(key) || 0;
        if (count >= limit) status = 429;
        else if (count === 0 && clients.size >= maxClients) status = 503;
        else clients.set(key, count + 1);
      }
    } catch {
      // Fail closed; never forward an internal exception containing request data.
      status = 503;
    }
    if (status) {
      res.setHeader('Retry-After', String(retryAfter));
      res.setHeader('Cache-Control', 'no-store');
      return errorResponse(res, status === 429 ? 'Too many requests. Please try again later.' : 'Authentication temporarily unavailable', status);
    }
    return next();
  };
}

export function createPublicAuthLimiters(options = {}) {
  return Object.fromEntries(Object.entries(PUBLIC_AUTH_POLICIES).map(([name, policy]) => [
    name, createPublicAuthLimiter({ ...policy, ...options[name] }),
  ]));
}
