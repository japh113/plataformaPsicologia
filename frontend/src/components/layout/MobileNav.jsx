import React from 'react';
import { Calendar, User, LogOut, CalendarRange } from 'lucide-react';

export default function MobileNav({ currentUser, onLogout, vistaActiva, setVistaActiva }) {
  const isPsychologist = currentUser?.role === 'psychologist';
  const isBackoffice = ['admin', 'support', 'superadmin'].includes(currentUser?.role || '');

  return (
    <nav className={`md:hidden fixed bottom-0 w-full bg-white border-t border-gray-200 grid ${import.meta.env.VITE_D2_ENABLED==='true'&&(isPsychologist||['admin','superadmin'].includes(currentUser?.role))?'grid-cols-5':'grid-cols-4'} items-center h-16 z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]`}>
      {import.meta.env.VITE_D2_ENABLED==='true' && (isPsychologist||['admin','superadmin'].includes(currentUser?.role)) && <button className="p-2 text-xs" onClick={()=>setVistaActiva(isPsychologist?'professional-profile':'professional-reviews')}>{isPsychologist?'Perfil profesional':'Credenciales'}</button>}
      <button onClick={() => setVistaActiva('dashboard')} className={`flex flex-col items-center p-2 w-full ${vistaActiva === 'dashboard' ? 'text-indigo-600' : 'text-gray-400'}`}>
        <Calendar size={20} />
        <span className="text-[10px] mt-1 font-bold">{isBackoffice ? 'Panel' : 'Inicio'}</span>
      </button>

      <button onClick={() => setVistaActiva('appointments')} className={`flex flex-col items-center p-2 w-full ${vistaActiva === 'appointments' ? 'text-indigo-600' : 'text-gray-400'}`}>
        <CalendarRange size={20} />
        <span className="text-[10px] mt-1 font-bold">{isBackoffice ? 'Revision' : 'Citas'}</span>
      </button>

      <button onClick={() => setVistaActiva('patients')} className={`flex flex-col items-center p-2 w-full ${vistaActiva === 'patients' ? 'text-indigo-600' : 'text-gray-400'}`}>
        <User size={20} />
        <span className="text-[10px] mt-1 font-bold">{isBackoffice ? 'Usuarios' : isPsychologist ? 'Pacientes' : 'Perfil'}</span>
      </button>

      <button onClick={onLogout} className="flex flex-col items-center p-2 w-full text-gray-400">
        <LogOut size={20} />
        <span className="text-[10px] mt-1 font-bold">Salir</span>
      </button>
    </nav>
  );
}
