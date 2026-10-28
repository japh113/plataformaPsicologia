import React from 'react';

export default function PatientFollowUpNotice({ patient, onRetry }) {
  const state = patient?.seguimientoEstado;
  if (state === 'ready' || (!state && patient?.seguimiento)) return null;
  const loading = state !== 'error';
  return (
    <div role={loading ? 'status' : 'alert'} className="my-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p>{loading ? 'Actualizando seguimiento…' : patient?.seguimiento
        ? 'No se pudo actualizar el seguimiento. Se muestra la última información cargada.'
        : 'Seguimiento temporalmente no disponible. Tus otras secciones siguen disponibles.'}</p>
      {onRetry && <button type="button" onClick={onRetry} disabled={loading}
        className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold disabled:opacity-50">
        Reintentar seguimiento
      </button>}
    </div>
  );
}
