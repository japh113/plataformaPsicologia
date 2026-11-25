import React from 'react';

export default function PendingInvitationCount({ count, id, className = '', actions = false }) {
  if (!count) return null;
  return <>
    <span aria-hidden="true" className={`inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-indigo-100 px-1 text-[11px] font-bold leading-none text-indigo-800 ${className}`}>{count}</span>
    <span id={id} className="sr-only">{count} {actions ? count === 1 ? 'acción pendiente' : 'acciones pendientes' : count === 1 ? 'invitación pendiente' : 'invitaciones pendientes'}</span>
  </>;
}
