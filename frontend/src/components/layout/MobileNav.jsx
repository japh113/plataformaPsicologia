import React from 'react';
import { Calendar, User, LogOut, CalendarRange } from 'lucide-react';

export default function MobileNav({ currentUser, onLogout, vistaActiva, setVistaActiva }) {
  const isPsychologist = currentUser?.role === 'psychologist';
  const isBackoffice = ['admin', 'support', 'superadmin'].includes(currentUser?.role || '');
  const showBilateral = import.meta.env?.VITE_BILATERAL_ENABLED === 'true' && ['patient', 'psychologist'].includes(currentUser?.role);
  const showProfessional = import.meta.env.VITE_D2_ENABLED === 'true' && (isPsychologist || ['admin', 'superadmin'].includes(currentUser?.role));
  const columns = 4 + Number(showBilateral) + Number(showProfessional);

  return (
    <nav aria-label="Navegación móvil" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} className="md:hidden fixed bottom-0 w-full bg-white border-t border-gray-200 grid items-center h-16 z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      {showBilateral && <button aria-label="Vinculación bilateral" aria-current={vistaActiva === 'bilateral' ? 'page' : undefined} className={`p-1 text-[10px] font-bold ${vistaActiva === 'bilateral' ? 'text-indigo-600' : 'text-gray-400'}`} onClick={() => setVistaActiva('bilateral')}>Vinculación bilateral</button>}
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
