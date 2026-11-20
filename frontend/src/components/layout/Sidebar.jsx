import React from 'react';
import { Calendar, Sparkles, User, DollarSign, Bot, LogOut, CalendarRange, House, UsersRound, ClipboardList } from 'lucide-react';

function NavButton({ active, onClick, children, disabled = false }) {
  const base = 'flex items-center w-full px-4 py-3 rounded-xl text-left transition-all';

  if (disabled) {
    return <div className={`${base} text-gray-400 bg-gray-50/80 cursor-not-allowed opacity-75`}>{children}</div>;
  }

  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined}
      className={`${base} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 ${active ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-gray-50 hover:text-gray-900'}`}>
      {children}
    </button>
  );
}

export default function Sidebar({ currentUser, onLogout, vistaActiva, setVistaActiva }) {
  const isPsychologist = currentUser?.role === 'psychologist';
  const isBackoffice = ['admin', 'support', 'superadmin'].includes(currentUser?.role || '');
  const showCare = import.meta.env.VITE_BILATERAL_ENABLED === 'true' && currentUser?.role === 'patient';
  const showLinked = import.meta.env.VITE_BILATERAL_ENABLED === 'true' && isPsychologist;
  const careNav = showCare || showLinked;
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
        {careNav ? <p className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-950">
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-indigo-700 text-xl text-indigo-700">P</span>
          PsicoPanel
        </p> : <h1 className="text-2xl font-black tracking-tight flex items-center">
          <Sparkles className="text-indigo-600 mr-2" size={24} />
          Psico<span className="text-indigo-600">Panel</span>
        </h1>}
      </div>

      <nav aria-label="Navegación principal" className="flex-1 space-y-2 overflow-y-auto p-4">
        <NavButton active={vistaActiva === 'dashboard'} onClick={() => setVistaActiva('dashboard')}>
          {careNav ? <House className="mr-3 shrink-0" size={20} aria-hidden="true" /> : <Calendar className="mr-3" size={20} />} {careNav ? 'Inicio' : primaryNavLabel}
        </NavButton>
        {showLinked && <NavButton active={['my-patients', 'legacy-patients'].includes(vistaActiva)} onClick={() => setVistaActiva('my-patients')}>
          <UsersRound className="mr-3 shrink-0" size={20} aria-hidden="true" /> Mis pacientes
        </NavButton>}
        {showCare && <NavButton active={['my-care', 'legacy-patients', 'admissions', 'appointments'].includes(vistaActiva)} onClick={() => setVistaActiva('my-care')}>
          <UsersRound className="mr-3 shrink-0" size={20} aria-hidden="true" /> Mi atención
        </NavButton>}
        {!showCare && <NavButton active={vistaActiva === 'appointments'} onClick={() => setVistaActiva('appointments')}>
          <CalendarRange className="mr-3" size={20} aria-hidden="true" /> {showLinked ? 'Agenda' : appointmentsLabel}
        </NavButton>}
        {!careNav && <NavButton active={vistaActiva === 'patients'} onClick={() => setVistaActiva('patients')}>
          <User className="mr-3" size={20} /> {secondaryNavLabel}
        </NavButton>}
        {!showCare && import.meta.env.VITE_ADMISSION_ENABLED === 'true' && ['patient', 'psychologist'].includes(currentUser?.role) &&
          <NavButton active={vistaActiva === 'admissions'} onClick={() => setVistaActiva('admissions')}>
            <ClipboardList className="mr-3 shrink-0" size={20} aria-hidden="true" /> Admisión
          </NavButton>}
        {import.meta.env.VITE_D2_ENABLED==='true' && isPsychologist && <NavButton active={vistaActiva==='professional-profile'} onClick={()=>setVistaActiva('professional-profile')}>Mi perfil profesional</NavButton>}
        {import.meta.env.VITE_D2_ENABLED==='true' && ['admin','superadmin'].includes(currentUser?.role) && <NavButton active={vistaActiva==='professional-reviews'} onClick={()=>setVistaActiva('professional-reviews')}>Credenciales profesionales</NavButton>}

        {!careNav && <div className="pt-4 mt-4 border-t border-gray-100 space-y-2">
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
        </div>}
      </nav>

      <div className="p-4 border-t border-gray-100 mt-auto space-y-3">
        {showCare && <NavButton active={vistaActiva === 'account'} onClick={() => setVistaActiva('account')}>
          <User className="mr-3" size={20} aria-hidden="true" /> Mi cuenta
        </NavButton>}
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
