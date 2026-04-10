import React from 'react';
import { FileText, Save, X } from 'lucide-react';
import { formatInterviewDate, interviewIndicatorGroups } from '../utils/patientInterview';

function ReadOnlyField({ label, value }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        {value || 'No registrado'}
      </div>
    </div>
  );
}

export default function PatientInterviewModal({
  patient,
  form,
  onChange,
  onToggleIndicator,
  onSubmit,
  isSubmitting = false,
  title = 'Entrevista inicial',
  description = '',
  allowClose = false,
  onClose = null,
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[32px] border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                <FileText size={14} className="mr-2" /> Entrevista obligatoria
              </div>
              <h2 className="mt-3 text-2xl font-black text-slate-900">{title}</h2>
              <p className="mt-2 text-sm text-slate-500">
                {description || 'Completa esta entrevista para continuar con tu seguimiento dentro de la plataforma.'}
              </p>
            </div>

            {allowClose && onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_180px]">
              <ReadOnlyField label="Nombre" value={patient?.nombre || ''} />
              <ReadOnlyField label="Edad" value={patient?.edad === null || typeof patient?.edad === 'undefined' ? 'No registrada' : `${patient.edad} anos`} />
              <ReadOnlyField label="Fecha" value={formatInterviewDate(form.fechaEntrevista)} />
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Fecha de nacimiento</label>
              <input
                type="date"
                value={form.fechaNacimiento}
                onChange={(event) => onChange('fechaNacimiento', event.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Lugar de nacimiento</label>
              <input
                type="text"
                value={form.lugarNacimiento}
                onChange={(event) => onChange('lugarNacimiento', event.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Ocupacion</label>
              <input
                type="text"
                value={form.ocupacion}
                onChange={(event) => onChange('ocupacion', event.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Hobbies</label>
              <input
                type="text"
                value={form.hobbies}
                onChange={(event) => onChange('hobbies', event.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Estado civil</label>
              <input
                type="text"
                value={form.estadoCivil}
                onChange={(event) => onChange('estadoCivil', event.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Quienes conforman su familia</label>
              <input
                type="text"
                value={form.familia}
                onChange={(event) => onChange('familia', event.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Con quienes vive</label>
              <textarea
                rows="4"
                value={form.viveCon}
                onChange={(event) => onChange('viveCon', event.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Enfermedades fisicas</label>
              <textarea
                rows="4"
                value={form.enfermedadesFisicas}
                onChange={(event) => onChange('enfermedadesFisicas', event.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Indicadores relevantes</h3>
                <p className="mt-1 text-sm text-slate-500">Marca los antecedentes o sintomas relevantes reportados en entrevista.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {interviewIndicatorGroups.map((group, index) => (
                <div key={`indicator-group-${index}`} className="grid gap-3 md:grid-cols-2">
                  {group.map((indicator) => (
                    indicator ? (
                      <label
                        key={indicator.key}
                        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                      >
                        <span>{indicator.label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(form.indicadores?.[indicator.key])}
                          onChange={() => onToggleIndicator(indicator.key)}
                          disabled={isSubmitting}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </label>
                    ) : (
                      <div key={`empty-indicator-${index}`} className="hidden md:block" />
                    )
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {allowClose && onClose ? (
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
            ) : null}
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={16} className="mr-2" />
              {isSubmitting ? 'Guardando...' : 'Guardar entrevista'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
