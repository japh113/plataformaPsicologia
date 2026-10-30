import { ensureEpisodeOperation } from './episode.policy.js';

// No clinical DTO is representable safely in 008 (no recipients/versions/grants).
// Check before touching the row, including its IDs, metadata and derived values.
// There is deliberately no projection fallback or default audience.
export function projectEpisodeResource(context, _row) {
  ensureEpisodeOperation(context);
  throw Object.assign(new Error('Forbidden'), { status: 403 });
}
