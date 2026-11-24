import React from 'react';
import { CalendarRange, ClipboardList, House, LogOut, User, UsersRound } from 'lucide-react';
import PendingInvitationCount from './PendingInvitationCount';

export default function MobileNav({ currentUser, onLogout, vistaActiva, setVistaActiva, pendingCount = 0 }) {
  const role = currentUser?.role;
  const isPsychologist = role === 'psychologist';
  const isBackoffice = ['admin', 'support', 'superadmin'].includes(role);
  const showLinked = import.meta.env.VITE_BILATERAL_ENABLED === 'true' && isPsychologist;
  const showCare = import.meta.env.VITE_BILATERAL_ENABLED === 'true' && role === 'patient';
  const showAdmission = import.meta.env.VITE_ADMISSION_ENABLED === 'true' && ['patient', 'psychologist'].includes(role) && !showCare;
  const showProfessional = import.meta.env.VITE_D2_ENABLED === 'true' && (isPsychologist || ['admin', 'superadmin'].includes(role));
  const entries = [{ view: 'dashboard', label: isBackoffice ? 'Panel' : 'Inicio', Icon: House }];

  if (showCare) {
    entries.push(
      { view: 'my-care', label: 'Mi atención', Icon: UsersRound, related: ['appointments', 'admissions', 'legacy-patients'] },
      { view: 'account', label: 'Cuenta', Icon: User },
    );
  } else {
    const agenda = { view: 'appointments', label: isBackoffice ? 'Revisión' : showLinked ? 'Agenda' : 'Citas', Icon: CalendarRange };
    if (showLinked) entries.push({ view: 'my-patients', label: 'Mis pacientes', Icon: UsersRound, related: ['legacy-patients'] }, agenda);
    else entries.push(agenda, { view: 'patients', label: isBackoffice ? 'Usuarios' : isPsychologist ? 'Pacientes' : 'Perfil', Icon: User });
    if (showAdmission) entries.push({ view: 'admissions', label: 'Admisión', Icon: ClipboardList });
    if (showProfessional) entries.push({ view: isPsychologist ? 'professional-profile' : 'professional-reviews', label: isPsychologist ? 'Perfil profesional' : 'Credenciales', Icon: User });
    entries.push({ view: 'logout', label: 'Salir', Icon: LogOut });
  }

  return (
    <nav aria-label="Navegación móvil" style={{ gridTemplateColumns: `repeat(${entries.length}, minmax(0, 1fr))` }}
      className="fixed inset-x-0 bottom-0 z-40 grid min-h-16 items-stretch gap-0.5 border-t border-gray-200 bg-white p-1 shadow-sm md:hidden">
      {entries.map(({ view, label, Icon, related }) => {
        const active = vistaActiva === view || related?.includes(vistaActiva);
        const count = view === 'my-care' ? pendingCount : 0;
        return <button key={view} type="button" aria-current={active ? 'page' : undefined}
          aria-label={count ? label : undefined} aria-describedby={count ? 'mobile-invitation-count' : undefined}
          onClick={view === 'logout' ? onLogout : () => setVistaActiva(view)}
          className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1 text-center text-[11px] leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-700 ${active ? 'bg-indigo-50 font-bold text-indigo-700' : 'font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900'}`}>
          <span className="relative">
            {React.createElement(Icon, { size: 20, 'aria-hidden': true })}
            <PendingInvitationCount count={count} id="mobile-invitation-count" className="absolute -right-5 -top-1" />
          </span>
          <span className="max-w-full break-words">{label}</span>
        </button>;
      })}
    </nav>
  );
}
