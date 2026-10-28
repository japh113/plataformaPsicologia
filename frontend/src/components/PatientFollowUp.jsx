import React from 'react';
import { formatFollowUpDate, getPatientFollowUpGroups } from '../utils/patientFollowUp';
import { formatAppointmentDisplayHour } from '../mappers/appointments';

export default function PatientFollowUp({ patient, onToggleTask, processingTaskId }) {
  const { consultations, unassignedTasks } = getPatientFollowUpGroups(patient);
  const renderTasks = tasks => (
    <div className="mt-4 space-y-2">
      {tasks.map(task => (
        <label key={task.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <input type="checkbox" aria-label={task.texto} checked={task.completada}
            disabled={processingTaskId === task.id} onChange={() => onToggleTask(task.id)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600" />
          <span className={`min-w-0 break-words text-sm ${task.completada ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{task.texto}</span>
        </label>
      ))}
    </div>
  );
  return (
    <section aria-label="Mi seguimiento" className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 md:p-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Mi seguimiento</h2>
        <p className="mt-1 text-sm text-slate-500">Tus consultas realizadas y las tareas asignadas entre consultas.</p>
      </div>
      {consultations.length ? consultations.map(consultation => (
        <article key={consultation.id} data-consultation-id={consultation.id}
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">{formatFollowUpDate(consultation.fecha)}</h3>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Consulta realizada</span>
          </div>
          {consultation.hora && <p className="mt-2 text-sm text-slate-500">{formatAppointmentDisplayHour(consultation.hora)}</p>}
          {consultation.tasks.length ? renderTasks(consultation.tasks) : <p className="mt-4 text-sm text-slate-500">Sin tareas asignadas</p>}
        </article>
      )) : <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-600">Todavía no tienes consultas realizadas</p>}
      {unassignedTasks.length > 0 && (
        <section aria-label="Tareas sin consulta identificada" className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold text-slate-900">Tareas sin consulta identificada</h3>
          <p className="mt-1 text-xs text-slate-500">Conservan su estado y puedes seguir trabajando en ellas.</p>
          {renderTasks(unassignedTasks)}
        </section>
      )}
    </section>
  );
}
