import React from 'react';
import { Calendar, Plus, User } from 'lucide-react';

export default function MobileNav({ vistaActiva, setVistaActiva, onAddPatient }) {
  return (
    <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-gray-200 flex justify-around items-center h-16 z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      <button onClick={() => setVistaActiva('dashboard')} className={`flex flex-col items-center p-2 w-full ${vistaActiva === 'dashboard' ? 'text-indigo-600' : 'text-gray-400'}`}>
        <Calendar size={20} />
        <span className="text-[10px] mt-1 font-bold">Agenda</span>
      </button>
      <div className="relative -top-5">
        <button onClick={onAddPatient} className="bg-indigo-600 text-white w-12 h-12 rounded-full flex items-center justify-center shadow-lg border-4 border-indigo-50">
          <Plus size={24} />
        </button>
      </div>
      <button onClick={() => setVistaActiva('patients')} className={`flex flex-col items-center p-2 w-full ${vistaActiva === 'patients' ? 'text-indigo-600' : 'text-gray-400'}`}>
        <User size={20} />
        <span className="text-[10px] mt-1 font-bold">Pacientes</span>
      </button>
    </nav>
  );
}
