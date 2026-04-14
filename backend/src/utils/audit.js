import env from '../config/env.js';

export const logAuditEvent = async (
  client,
  {
    actorUserId = null,
    actorRole = '',
    action,
    entityType,
    entityId = '',
    targetUserId = null,
    patientId = null,
    metadata = {},
  },
) => {
  await client.query(
    `
      INSERT INTO audit_logs (
        actor_user_id,
        actor_role,
        action,
        entity_type,
        entity_id,
        target_user_id,
        patient_id,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      actorUserId,
      actorRole || '',
      action,
      entityType,
      entityId ? String(entityId) : '',
      targetUserId,
      patientId,
      JSON.stringify(metadata || {}),
    ],
  );
};

export const buildRelationshipInvitePreview = ({
  inviteCode,
  expiresAt = null,
  appBaseUrl = env.appBaseUrl,
}) => ({
  inviteCode,
  inviteLink: `${appBaseUrl.replace(/\/$/, '')}?inviteCode=${encodeURIComponent(inviteCode)}`,
  expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
});
