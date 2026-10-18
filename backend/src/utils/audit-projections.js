// Fail closed for unknown actions, fields and non-scalar legacy metadata.
export const projectOperationalAuditMetadata = (action, metadata) => {
  if (action !== 'psychologist_reviewed') return {};
  const status = metadata?.approvalStatus;
  return ['active', 'pending_review', 'rejected', 'suspended'].includes(status)
    ? { approvalStatus: status }
    : {};
};
