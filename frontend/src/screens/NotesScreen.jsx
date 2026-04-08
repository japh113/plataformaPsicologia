import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckSquare, Plus, Save, Trash2 } from 'lucide-react';
import { getRiskColor } from '../utils/risk';
import FutureFeatureCard from '../components/shared/FutureFeatureCard';

export default function NotesScreen({ patient, setVistaActiva, notesTemp, setNotesTemp, onSaveNotes, onToggleTask, onDeleteTask, onAddTask }) {
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [taskText, setTaskText] = useState('');
  const adherence = useMemo(() => {
    if (!patient?.tareas?.length) return 0;
    const completed = patient.tareas.filter((task) => task.completada).length;
    return Math.round((completed / patient.tareas.length) * 100);
  }, [patient]);

  if (!patient) return null;

  const handleAddTask = () => {
    if (!taskText.trim()) return;
    onAddTask(taskText);
    setTaskText('');
    setShowTaskInput(false);
  };

  return (
    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 h-full animate-in slide-in-from-right-4 duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-3">
        <div className="order-2 md:order-1 text-center md:text-left">
          <h2 className="text-xl md:text-2xl font-bold text-gray-800">{patient.nombre}</h2>
          <p className="text-gray-500 flex items-center justify-center md:justify-start mt-1 text-sm">
            <span className={`px-2 py-0.5 rounded-full text-[10px] md:text-xs font-bold border mr-2 md:mr-3 ${getRiskColor(patient.riesgo)} uppercase`}>Riesgo {patient.riesgo}</span>
            {patient.motivo} • {patient.edad} años
          </p>
        </div>
        <button onClick={() => setVistaActiva('dashboard')} className="order-1 md:order-2 self-start md:self-auto text-gray-500 hover:text-gray-800 transition font-medium bg-gray-100 md:bg-transparent px-3 py-1.5 md:p-0 rounded-lg text-sm md:text-base">← Volver</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <FutureFeatureCard title="Asistente Clínico IA" description="Mantuvimos el módulo visible, bloqueado y marcado como próxima fase para no perder el concepto del producto." />

          <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 pt-4 flex gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-600 text-white">Simple</span>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-gray-200 text-gray-500">SOAP</span>
            </div>
            <textarea value={notesTemp} onChange={(e) => setNotesTemp(e.target.value)} placeholder="Escribe la nota clínica de la sesión aquí..." className="w-full h-[420px] p-4 bg-transparent focus:outline-none resize-none leading-relaxed" />
          </div>

          <button onClick={onSaveNotes} className="flex items-center justify-center w-full px-4 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition font-medium shadow-sm"><Save size={18} className="mr-2" /> Guardar en Expediente</button>
        </div>

        <div className="space-y-4">
          {patient.riesgo === 'alto' && (
            <div className="bg-red-50 p-4 md:p-5 rounded-xl border border-red-200 shadow-sm animate-in zoom-in duration-300">
              <h3 className="font-bold text-red-800 mb-2 flex items-center text-sm md:text-base"><AlertCircle size={18} className="mr-2" />Protocolo de Crisis</h3>
              <p className="text-xs md:text-sm text-red-600 mb-4">Verificar red de apoyo y recursos disponibles.</p>
              <button className="w-full py-2.5 bg-red-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-red-700 transition">Ver Contactos</button>
            </div>
          )}

          <div className="bg-gray-50 p-4 md:p-5 rounded-xl border border-gray-200">
            <h3 className="font-bold text-gray-800 mb-2 flex items-center text-sm md:text-base"><CheckSquare className="mr-2 text-indigo-500" size={20} /> Tareas Asignadas</h3>
            <p className="text-xs text-gray-500 mb-4">Adherencia actual: <span className="font-bold text-gray-700">{adherence}%</span></p>

            <div className="space-y-3 mb-4 max-h-60 overflow-y-auto pr-1">
              {(!patient.tareas || patient.tareas.length === 0) ? (
                <p className="text-sm text-gray-500 italic text-center py-4 bg-white rounded border border-dashed border-gray-300">No hay tareas pendientes</p>
              ) : (
                patient.tareas.map((task) => (
                  <div key={task.id} className="flex items-start bg-white p-3 rounded-lg border border-gray-200 group shadow-sm">
                    <input type="checkbox" checked={task.completada} onChange={() => onToggleTask(task.id)} className="mt-1 h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer shrink-0" />
                    <span className={`ml-3 text-xs md:text-sm flex-1 ${task.completada ? 'line-through text-gray-400' : 'text-gray-700'}`}>{task.texto}</span>
                    <button onClick={() => onDeleteTask(task.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition ml-2 shrink-0"><Trash2 size={16} /></button>
                  </div>
                ))
              )}
            </div>

            {showTaskInput ? (
              <div className="animate-in fade-in zoom-in-95 duration-200">
                <textarea autoFocus value={taskText} onChange={(e) => setTaskText(e.target.value)} placeholder="Ej. Registro diario de emociones..." className="w-full p-3 border border-indigo-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none mb-2 shadow-sm" rows="2" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddTask(); } }} />
                <div className="flex space-x-2">
                  <button onClick={() => setShowTaskInput(false)} className="flex-1 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">Cancelar</button>
                  <button onClick={handleAddTask} className="flex-1 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition">Guardar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowTaskInput(true)} className="flex items-center justify-center w-full p-2.5 text-sm text-indigo-700 bg-indigo-100/50 border border-indigo-200 border-dashed rounded-lg hover:bg-indigo-100 transition font-medium"><Plus size={16} className="mr-2" /> Asignar nueva tarea</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
