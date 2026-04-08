import React from 'react';
import { X } from 'lucide-react';

export default function NewPatientModal({ isOpen, onClose, form, onChange, onSubmit, isSubmitting = false }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-end md:items-center justify-center z-[60] p-0 md:p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full max-w-md p-6 animate-in slide-in-from-bottom-10 md:zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">Registrar Nuevo Paciente</h3>
          <button onClick={onClose} disabled={isSubmitting} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre Completo *</label>
            <input
              required
              type="text"
              name="nombre"
              value={form.nombre}
              onChange={onChange}
              disabled={isSubmitting}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-50"
              placeholder="Ej. Juan Perez"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Edad</label>
              <input
                type="number"
                name="edad"
                value={form.edad}
                onChange={onChange}
                disabled={isSubmitting}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-50"
                placeholder="Anos"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Nivel de Riesgo</label>
              <select
                name="riesgo"
                value={form.riesgo}
                onChange={onChange}
                disabled={isSubmitting}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white disabled:bg-gray-50"
              >
                <option value="bajo">Bajo (Verde)</option>
                <option value="medio">Medio (Amarillo)</option>
                <option value="alto">Alto (Rojo)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Motivo de Consulta Principal</label>
            <input
              type="text"
              name="motivo"
              value={form.motivo}
              onChange={onChange}
              disabled={isSubmitting}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-gray-50"
              placeholder="Ej. Ansiedad social, Terapia de pareja..."
            />
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 p-2.5 border border-gray-300 rounded-lg text-gray-600 font-medium hover:bg-gray-50 transition disabled:bg-gray-50 disabled:text-gray-400"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 p-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Guardando...' : 'Guardar Expediente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
