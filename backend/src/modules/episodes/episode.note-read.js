import env from '../../config/env.js';
import { verifyAuthToken } from '../auth/auth.service.js';
import { ensureAccountCanAuthenticate, ensureSessionIsCurrent } from '../auth/auth.account-status.js';
import { episodeKey } from './episode.identifiers.js';
import { resolveEpisodeContext } from './episode.context.js';
import { assessPrivateNoteRead } from './episode.note-read-policy.js';

const denied = assessPrivateNoteRead(null);
const verifiedSession = token => {
  if (typeof token !== 'string' || !token) return null;
  try {
    const payload = verifyAuthToken(token);
    return Number.isSafeInteger(payload.sv) && payload.sv >= 0 ? payload : null;
  } catch { return null; }
};

// Private diagnostic evaluation ONLY. Owns a fresh checked-out connection and
// transaction; never accepts an existing context, actor, audience or grants.
// database is explicitly selected server-side, never from a request.
// Returns no IDs, token/session facts, content, callback or projection handle.
export async function evaluatePrivateNoteRead(database, { token, episodeId, noteId, operation } = {}) {
  const id = episodeKey(episodeId), note = episodeKey(noteId);
  const session = verifiedSession(token);
  if (!session || !id || !note || operation !== 'read') return denied;
  const client = await database.getClient();
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    // 009 encapsulates SHARE under a restricted owner. The caller has EXECUTE,
    // never UPDATE(session_version). The row lock survives function return
    // until this very connection commits/rolls back, including trigger waits.
    const accounts = (await client.query(`
      SELECT id, role, is_active, session_version
      FROM public.lock_account_session($1::text)
    `, [session.sub])).rows;
    const account = accounts.length === 1 ? accounts[0] : null;
    let result = denied;
    if (account?.id === session.sub && account.role === 'psychologist' && account.is_active === true) {
      // Deliberately do NOT lock profiles: raw profile-first UPDATE/DELETE holds
      // that row while its trigger waits for users. Locking it here would invert
      // that order. Every departure from active must update our locked user.
      const profiles = (await client.query(`
        SELECT user_id, approval_status
        FROM public.psychologist_profiles WHERE user_id=$1
      `, [session.sub])).rows;
      const profile = profiles.length === 1 ? profiles[0] : null;
      const actor = {
        id: account.id, role: account.role, isActive: account.is_active,
        sessionVersion: account.session_version,
        psychologistStatus: profile?.user_id === account.id ? profile.approval_status : null,
      };
      let current = false;
      try {
        ensureAccountCanAuthenticate(actor, env);
        ensureSessionIsCurrent(actor, session);
        current = true;
      } catch (error) {
        if (![401, 403].includes(error.status)) throw error;
      }
      if (current) {
        // Episode/composition/attribution are immutable in 008; note/cita
        // correspondence is protected by 001/003/008 and composite FKs.
        const context = await resolveEpisodeContext(client, {
          actor, episodeId: id, operation, resource: { type: 'note', id: note },
        });
        // Recheck signature/expiry after any lock waits and SQL reads too.
        const freshSession = verifiedSession(token);
        if (freshSession?.sub === actor.id && freshSession.sv === actor.sessionVersion) {
          result = assessPrivateNoteRead({ ...context, sessionCurrent: true });
        }
      }
    }
    // No content was read. The returned diagnostics cannot authorize a later
    // read after COMMIT. A future reader must stay inside its own guarded tx.
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error; // SQL/ACL/lock errors produce neither facts nor fallback.
  } finally {
    client.release();
  }
}
