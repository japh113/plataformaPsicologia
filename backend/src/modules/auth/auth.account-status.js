export const ensureAccountCanAuthenticate = (user, { localDevelopment = false } = {}) => {
  const reject = (message, status) => { throw Object.assign(new Error(message), { status }); };
  if (!user || user.isActive === false) reject('User not found or inactive', 401);
  // Reserved IDs from the demo seed stay unusable if a demo DB is copied remotely.
  if (!localDevelopment && /^u_(admin_1|support_1|superadmin_1|psy_1|psy_2|psy_pending_1|pat_[1-5])$/.test(user.id)) {
    reject('Demo accounts are disabled outside local development', 403);
  }
  if (user.role !== 'psychologist' || user.psychologistStatus === 'active') return;

  const messages = {
    pending_review: 'Psychologist account is pending review',
    rejected: 'Psychologist account was rejected',
    suspended: 'Psychologist account is suspended',
  };
  reject(messages[user.psychologistStatus] || 'Psychologist account is not approved', 403);
};
