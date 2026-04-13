import React, { useMemo, useState } from 'react';
import {
  Clock3,
  Search,
  ShieldCheck,
  Users,
  UserRound,
  XCircle,
} from 'lucide-react';
import InlineNotice from '../components/shared/InlineNotice';

const ROLE_LABELS = {
  admin: 'Admin',
  support: 'Soporte',
  superadmin: 'Superadmin',
  psychologist: 'Psicologo',
  patient: 'Paciente',
};

const APPROVAL_STATUS_LABELS = {
  pending_review: 'Pendiente',
  active: 'Aprobado',
  rejected: 'Rechazado',
  suspended: 'Suspendido',
};

const buildRoleBadgeClassName = (role) => {
  if (role === 'superadmin') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  if (role === 'admin') {
    return 'border-indigo-200 bg-indigo-50 text-indigo-700';
  }

  if (role === 'support') {
    return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  }

  if (role === 'psychologist') {
    return 'border-violet-200 bg-violet-50 text-violet-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const buildApprovalBadgeClassName = (approvalStatus) => {
  if (approvalStatus === 'active') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (approvalStatus === 'rejected') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  if (approvalStatus === 'suspended') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  return 'border-orange-200 bg-orange-50 text-orange-700';
};

const formatDateTime = (value) => {
  if (!value) {
    return 'Sin fecha';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
};

const buildSummaryCards = (users, pendingPsychologists) => {
  const activePsychologists = users.filter(
    (user) => user.role === 'psychologist' && user.psychologistProfile?.approvalStatus === 'active',
  ).length;
  const patients = users.filter((user) => user.role === 'patient').length;
  const supportUsers = users.filter((user) => ['admin', 'support', 'superadmin'].includes(user.role)).length;

  return [
    {
      id: 'pending',
      label: 'Solicitudes pendientes',
      value: pendingPsychologists.length,
      description: 'Psicologos esperando revision',
      icon: Clock3,
      className: 'border-orange-200 bg-orange-50 text-orange-700',
    },
    {
      id: 'psychologists',
      label: 'Psicologos activos',
      value: activePsychologists,
      description: 'Cuentas ya aprobadas',
      icon: ShieldCheck,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    {
      id: 'patients',
      label: 'Pacientes',
      value: patients,
      description: 'Usuarios clinicos activos',
      icon: UserRound,
      className: 'border-sky-200 bg-sky-50 text-sky-700',
    },
    {
      id: 'backoffice',
      label: 'Backoffice',
      value: supportUsers,
      description: 'Usuarios internos',
      icon: Users,
      className: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    },
  ];
};

const buildUserStatusLabel = (user) => {
  if (user.role === 'psychologist') {
    return APPROVAL_STATUS_LABELS[user.psychologistProfile?.approvalStatus] || 'Pendiente';
  }

  return user.isActive ? 'Activo' : 'Inactivo';
};

export default function BackofficeScreen({
  section = 'overview',
  currentUser,
  users = [],
  pendingPsychologists = [],
  onReviewPsychologist,
  reviewingPsychologistId = null,
  actionError = '',
  onDismissActionError,
}) {
  const [search, setSearch] = useState('');
  const [selectedPsychologist, setSelectedPsychologist] = useState(null);
  const [reviewForm, setReviewForm] = useState({
    approvalStatus: 'active',
    reviewNotes: '',
  });

  const canReviewPsychologists = ['admin', 'superadmin'].includes(currentUser?.role || '');
  const summaryCards = useMemo(() => buildSummaryCards(users, pendingPsychologists), [users, pendingPsychologists]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return users;
    }

    return users.filter((user) =>
      [user.fullName, user.email, ROLE_LABELS[user.role], user.patientName, user.psychologistProfile?.professionalTitle]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
    );
  }, [users, search]);

  const openReviewModal = (psychologistUser) => {
    setSelectedPsychologist(psychologistUser);
    setReviewForm({
      approvalStatus: 'active',
      reviewNotes: psychologistUser?.psychologistProfile?.reviewNotes || '',
    });
  };

  const closeReviewModal = () => {
    setSelectedPsychologist(null);
    setReviewForm({
      approvalStatus: 'active',
      reviewNotes: '',
    });
  };

  const handleSubmitReview = async (event) => {
    event.preventDefault();

    if (!selectedPsychologist || !canReviewPsychologists) {
      return;
    }

    const wasReviewed = await onReviewPsychologist(selectedPsychologist.id, reviewForm);

    if (wasReviewed) {
      closeReviewModal();
    }
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Backoffice
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900">Consola operativa</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Aqui revisamos altas de psicologos y el estado general de usuarios sin mezclar esta capa con la operacion clinica diaria.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">{ROLE_LABELS[currentUser?.role] || 'Backoffice'}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">Acceso actual</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;

            return (
              <div key={card.id} className={`rounded-2xl border p-4 ${card.className}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-80">{card.label}</p>
                    <p className="mt-2 text-3xl font-black">{card.value}</p>
                  </div>
                  <div className="rounded-2xl bg-white/70 p-3">
                    <Icon size={22} />
                  </div>
                </div>
                <p className="mt-3 text-sm opacity-90">{card.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">Solicitudes pendientes</h2>
            <p className="mt-1 text-sm text-slate-500">Primera cola de trabajo para nuevas cuentas profesionales.</p>
          </div>
          <p className="text-sm font-semibold text-slate-500">{pendingPsychologists.length} pendiente(s)</p>
        </div>

        {actionError ? (
          <div className="mt-4">
            <InlineNotice tone="error" title="No pudimos actualizar la revision" message={actionError} onDismiss={onDismissActionError} />
          </div>
        ) : null}

        {pendingPsychologists.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-slate-900">No hay psicologos pendientes por revisar.</p>
            <p className="mt-1 text-sm text-slate-500">Cuando llegue una nueva solicitud, aparecera aqui para aprobacion o rechazo.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {pendingPsychologists.slice(0, 4).map((user) => (
              <article key={user.id} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-black text-slate-900">{user.fullName}</h3>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${buildRoleBadgeClassName(user.role)}`}>
                    {ROLE_LABELS[user.role]}
                  </span>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${buildApprovalBadgeClassName(user.psychologistProfile?.approvalStatus)}`}>
                    {APPROVAL_STATUS_LABELS[user.psychologistProfile?.approvalStatus] || 'Pendiente'}
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-sm text-slate-600">
                  <p>{user.email}</p>
                  <p>{user.psychologistProfile?.professionalTitle || 'Psicologo sin titulo registrado'}</p>
                  <p>Licencia: {user.psychologistProfile?.licenseNumber || 'Sin capturar'}</p>
                  <p>Alta solicitada: {formatDateTime(user.createdAt)}</p>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => openReviewModal(user)}
                    className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                  >
                    Revisar solicitud
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderPending = () => (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Solicitudes de psicologos</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Revisa titulos, licencias y estado de aprobacion antes de habilitar cuentas profesionales para operar en la red.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">{pendingPsychologists.length} por revisar</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">Cola actual</p>
        </div>
      </div>

      {actionError ? (
        <div className="mt-4">
          <InlineNotice tone="error" title="No pudimos actualizar la revision" message={actionError} onDismiss={onDismissActionError} />
        </div>
      ) : null}

      {pendingPsychologists.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
          <p className="text-sm font-semibold text-slate-900">No hay solicitudes pendientes.</p>
          <p className="mt-1 text-sm text-slate-500">La cola de aprobacion esta limpia por ahora.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {pendingPsychologists.map((user) => (
            <article key={user.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-black text-slate-900">{user.fullName}</h3>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${buildRoleBadgeClassName(user.role)}`}>
                  {ROLE_LABELS[user.role]}
                </span>
                <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${buildApprovalBadgeClassName(user.psychologistProfile?.approvalStatus)}`}>
                  {APPROVAL_STATUS_LABELS[user.psychologistProfile?.approvalStatus] || 'Pendiente'}
                </span>
              </div>

              <dl className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Correo</dt>
                  <dd className="mt-1 font-medium text-slate-700">{user.email}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Fecha de alta</dt>
                  <dd className="mt-1 font-medium text-slate-700">{formatDateTime(user.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Titulo</dt>
                  <dd className="mt-1 font-medium text-slate-700">{user.psychologistProfile?.professionalTitle || 'Sin registrar'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Licencia</dt>
                  <dd className="mt-1 font-medium text-slate-700">{user.psychologistProfile?.licenseNumber || 'Sin registrar'}</dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => openReviewModal(user)}
                  className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                >
                  Revisar solicitud
                </button>
                {!canReviewPsychologists ? (
                  <p className="self-center text-sm text-slate-500">Tu rol puede revisar contexto, pero no aprobar ni rechazar.</p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );

  const renderUsers = () => (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Usuarios</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Directorio operativo para revisar cuentas internas, profesionales y pacientes sin entrar a la capa clinica.
          </p>
        </div>

        <label className="relative block w-full max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, correo o rol"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </label>
      </div>

      <div className="mt-6 grid gap-4">
        {filteredUsers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-slate-900">No encontramos usuarios con ese criterio.</p>
            <p className="mt-1 text-sm text-slate-500">Prueba otro nombre, correo o rol para volver a filtrar el directorio.</p>
          </div>
        ) : (
          filteredUsers.map((user) => (
            <article key={user.id} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900">{user.fullName}</h3>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${buildRoleBadgeClassName(user.role)}`}>
                      {ROLE_LABELS[user.role]}
                    </span>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                      user.role === 'psychologist'
                        ? buildApprovalBadgeClassName(user.psychologistProfile?.approvalStatus)
                        : user.isActive
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}>
                      {buildUserStatusLabel(user)}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    <p>{user.email}</p>
                    <p>Alta: {formatDateTime(user.createdAt)}</p>
                    {user.role === 'patient' ? <p>Paciente asociado: {user.patientName || 'Sin perfil paciente'}</p> : null}
                    {user.role === 'psychologist' ? (
                      <p>
                        {user.psychologistProfile?.professionalTitle || 'Psicologo'} · Licencia {user.psychologistProfile?.licenseNumber || 'Sin registrar'}
                      </p>
                    ) : null}
                  </div>
                </div>

                {user.role === 'psychologist' && user.psychologistProfile?.approvalStatus === 'pending_review' ? (
                  <button
                    type="button"
                    onClick={() => openReviewModal(user)}
                    className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                  >
                    Revisar solicitud
                  </button>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      {section === 'pending' ? renderPending() : section === 'users' ? renderUsers() : renderOverview()}

      {selectedPsychologist ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4 py-8">
          <div className="w-full max-w-2xl rounded-[32px] border border-slate-200 bg-white p-6 shadow-2xl md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-orange-700">
                  Revision
                </div>
                <h2 className="mt-4 text-2xl font-black text-slate-900">{selectedPsychologist.fullName}</h2>
                <p className="mt-2 text-sm text-slate-500">
                  {selectedPsychologist.email} · {selectedPsychologist.psychologistProfile?.professionalTitle || 'Psicologo'}
                </p>
              </div>

              <button
                type="button"
                onClick={closeReviewModal}
                className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <XCircle size={18} />
              </button>
            </div>

            {actionError ? (
              <div className="mt-5">
                <InlineNotice tone="error" title="No pudimos guardar la revision" message={actionError} onDismiss={onDismissActionError} />
              </div>
            ) : null}

            <form onSubmit={handleSubmitReview} className="mt-6 space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Licencia</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {selectedPsychologist.psychologistProfile?.licenseNumber || 'Sin licencia registrada'}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Alta solicitada</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(selectedPsychologist.createdAt)}</p>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Decision</label>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    { value: 'active', label: 'Aprobar', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
                    { value: 'rejected', label: 'Rechazar', className: 'border-rose-200 bg-rose-50 text-rose-700' },
                    { value: 'suspended', label: 'Suspender', className: 'border-amber-200 bg-amber-50 text-amber-700' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!canReviewPsychologists}
                      onClick={() => setReviewForm((currentForm) => ({ ...currentForm, approvalStatus: option.value }))}
                      className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                        reviewForm.approvalStatus === option.value ? option.className : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      } ${!canReviewPsychologists ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Notas internas</label>
                <textarea
                  rows={4}
                  value={reviewForm.reviewNotes}
                  disabled={!canReviewPsychologists}
                  onChange={(event) => setReviewForm((currentForm) => ({ ...currentForm, reviewNotes: event.target.value }))}
                  placeholder="Motivo de aprobacion, rechazo o suspension."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-70"
                />
              </div>

              {!canReviewPsychologists ? (
                <InlineNotice
                  tone="warning"
                  title="Acceso de solo lectura"
                  message="Tu rol puede revisar esta solicitud, pero la aprobacion final queda reservada para admin o superadmin."
                />
              ) : null}

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeReviewModal}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={!canReviewPsychologists || reviewingPsychologistId === selectedPsychologist.id}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {reviewingPsychologistId === selectedPsychologist.id ? 'Guardando...' : 'Guardar revision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
