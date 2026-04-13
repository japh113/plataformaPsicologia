import React from 'react';
import { Calendar, Sparkles, User, DollarSign, Bot, LogOut, CalendarRange } from 'lucide-react';

function NavButton({ active, onClick, children, disabled = false }) {
  const base = 'flex items-center w-full px-4 py-3 rounded-xl text-left transition-all';

  if (disabled) {
    return <div className={`${base} text-gray-400 bg-gray-50/80 cursor-not-allowed opacity-75`}>{children}</div>;
  }

  return (
    <button onClick={onClick} className={`${base} ${active ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>
      {children}
    </button>
  );
}

export default function Sidebar({ currentUser, onLogout, vistaActiva, setVistaActiva }) {
  const isPsychologist = currentUser?.role === 'psychologist';
  const isBackoffice = ['admin', 'support', 'superadmin'].includes(currentUser?.role || '');
  const primaryNavLabel = isBackoffice ? 'Backoffice' : 'Tablero';
  const appointmentsLabel = isBackoffice ? 'Solicitudes' : isPsychologist ? 'Citas' : 'Mis Citas';
  const secondaryNavLabel = isBackoffice ? 'Usuarios' : isPsychologist ? 'Mis Pacientes' : 'Mi Seguimiento';
  const roleLabel = currentUser?.role === 'superadmin'
    ? 'Superadmin'
    : currentUser?.role === 'support'
      ? 'Soporte'
      : currentUser?.role === 'admin'
        ? 'Admin'
        : isPsychologist
          ? 'Psicologo'
          : 'Paciente';

  return (
    <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col z-10 shadow-sm sticky top-0 h-screen">
      <div className="p-6 border-b border-gray-100">
        <h1 className="text-2xl font-black tracking-tight flex items-center">
          <Sparkles className="text-indigo-600 mr-2" size={24} />
          Psico<span className="text-indigo-600">Panel</span>
        </h1>
        <p className="text-xs text-gray-400 mt-1 font-medium">MVP v2.0</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <NavButton active={vistaActiva === 'dashboard'} onClick={() => setVistaActiva('dashboard')}>
          <Calendar className="mr-3" size={20} /> {primaryNavLabel}
        </NavButton>
        <NavButton active={vistaActiva === 'appointments'} onClick={() => setVistaActiva('appointments')}>
          <CalendarRange className="mr-3" size={20} /> {appointmentsLabel}
        </NavButton>
        <NavButton active={vistaActiva === 'patients'} onClick={() => setVistaActiva('patients')}>
          <User className="mr-3" size={20} /> {secondaryNavLabel}
        </NavButton>

        <div className="pt-4 mt-4 border-t border-gray-100 space-y-2">
          <NavButton disabled>
            <DollarSign className="mr-3" size={20} />
            <div>
              <div className="text-sm font-medium">Finanzas y Cobros</div>
              <div className="text-[10px] uppercase tracking-wider">Proximamente</div>
            </div>
          </NavButton>
          <NavButton disabled>
            <Bot className="mr-3" size={20} />
            <div>
              <div className="text-sm font-medium">Asistente Clinico IA</div>
              <div className="text-[10px] uppercase tracking-wider">Proximamente</div>
            </div>
          </NavButton>
        </div>
      </nav>

      <div className="p-4 border-t border-gray-100 mt-auto space-y-3">
        <div className="flex items-center p-3 bg-gray-50 rounded-xl">
          <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold shadow-sm">
            {(currentUser?.firstName || 'U').slice(0, 2).toUpperCase()}
          </div>
          <div className="ml-3">
            <p className="text-sm font-bold text-gray-800">{currentUser?.fullName}</p>
            <p className="text-xs text-gray-500">{roleLabel}</p>
          </div>
        </div>

        <button onClick={onLogout} className="w-full inline-flex items-center justify-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50">
          <LogOut size={16} className="mr-2" /> Cerrar sesion
        </button>
      </div>
    </aside>
  );
}
