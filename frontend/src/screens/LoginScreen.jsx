import React, { useMemo, useState } from 'react';
import { LockKeyhole, Sparkles, UserPlus2, UserRoundCheck } from 'lucide-react';
import InlineNotice from '../components/shared/InlineNotice';

const demoAccounts = [
  { role: 'Psicologo', email: 'doctor@psicopanel.com', password: 'Demo12345!' },
  { role: 'Paciente', email: 'juan@example.com', password: 'Demo12345!' },
  { role: 'Admin', email: 'admin@psicopanel.com', password: 'Demo12345!' },
  { role: 'Soporte', email: 'support@psicopanel.com', password: 'Demo12345!' },
  { role: 'Superadmin', email: 'root@psicopanel.com', password: 'Demo12345!' },
];

const buildEmptyPatientRegisterForm = () => ({
  firstName: '',
  lastName: '',
  age: '',
  reasonForConsultation: '',
  email: '',
  password: '',
});

const buildEmptyPsychologistRegisterForm = () => ({
  firstName: '',
  lastName: '',
  professionalTitle: '',
  licenseNumber: '',
  email: '',
  password: '',
});

const getLoginErrorMeta = (rawMessage = '') => {
  const message = String(rawMessage || '').toLowerCase();

  if (message.includes('invalid email') || message.includes('invalid') || message.includes('password')) {
    return {
      title: 'No pudimos validar ese acceso',
      hint: 'Si estas probando el flujo demo, puedes usar una de las cuentas sugeridas arriba para entrar mas rapido.',
    };
  }

  if (message.includes('pending review')) {
    return {
      title: 'Tu cuenta profesional sigue en revision',
      hint: 'Todavia no puede iniciar sesion hasta que un administrador apruebe el registro.',
    };
  }

  return {
    title: 'No pudimos iniciar sesion',
    hint: 'Revisa el correo, la contrasena y tu conexion antes de volver a intentarlo.',
  };
};

const TABS = [
  { id: 'login', label: 'Iniciar sesion' },
  { id: 'patient', label: 'Crear cuenta paciente' },
  { id: 'psychologist', label: 'Registro psicologo' },
];

export default function LoginScreen({
  onLogin,
  onRegisterPatient,
  onRegisterPsychologist,
  isSubmitting = false,
  isRegistering = false,
  error = '',
  registrationError = '',
  registrationSuccess = '',
}) {
  const [activeTab, setActiveTab] = useState('login');
  const [loginForm, setLoginForm] = useState({
    email: demoAccounts[0].email,
    password: demoAccounts[0].password,
  });
  const [patientForm, setPatientForm] = useState(buildEmptyPatientRegisterForm());
  const [psychologistForm, setPsychologistForm] = useState(buildEmptyPsychologistRegisterForm());

  const loginErrorMeta = useMemo(() => getLoginErrorMeta(error), [error]);

  const handleLoginChange = (event) => {
    const { name, value } = event.target;
    setLoginForm((currentForm) => ({ ...currentForm, [name]: value }));
  };

  const handlePatientChange = (event) => {
    const { name, value } = event.target;
    setPatientForm((currentForm) => ({ ...currentForm, [name]: value }));
  };

  const handlePsychologistChange = (event) => {
    const { name, value } = event.target;
    setPsychologistForm((currentForm) => ({ ...currentForm, [name]: value }));
  };

  const handleUseDemo = (account) => {
    setActiveTab('login');
    setLoginForm({
      email: account.email,
      password: account.password,
    });
  };

  const handleLoginSubmit = (event) => {
    event.preventDefault();
    onLogin(loginForm);
  };

  const handlePatientSubmit = async (event) => {
    event.preventDefault();
    const wasRegistered = await onRegisterPatient(patientForm);

    if (wasRegistered) {
      setPatientForm(buildEmptyPatientRegisterForm());
    }
  };

  const handlePsychologistSubmit = async (event) => {
    event.preventDefault();
    const wasRegistered = await onRegisterPsychologist(psychologistForm);

    if (wasRegistered) {
      setPsychologistForm(buildEmptyPsychologistRegisterForm());
    }
  };

  const renderTextField = ({ label, name, value, onChange, type = 'text', placeholder, disabled = false, required = false }) => (
    <div>
      <label className="mb-1 block text-sm font-semibold text-slate-700">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
      />
    </div>
  );

  const renderLoginForm = () => (
    <form onSubmit={handleLoginSubmit} className="mt-8 space-y-4">
      {renderTextField({
        label: 'Correo',
        name: 'email',
        value: loginForm.email,
        onChange: handleLoginChange,
        type: 'email',
        placeholder: 'tu@email.com',
        disabled: isSubmitting,
        required: true,
      })}

      {renderTextField({
        label: 'Contrasena',
        name: 'password',
        value: loginForm.password,
        onChange: handleLoginChange,
        type: 'password',
        placeholder: '********',
        disabled: isSubmitting,
        required: true,
      })}

      {error ? (
        <InlineNotice
          tone="error"
          title={loginErrorMeta.title}
          message={error}
          hint={loginErrorMeta.hint}
        />
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );

  const renderPatientRegistrationForm = () => (
    <form onSubmit={handlePatientSubmit} className="mt-8 space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {renderTextField({
          label: 'Nombre',
          name: 'firstName',
          value: patientForm.firstName,
          onChange: handlePatientChange,
          placeholder: 'Nombre',
          disabled: isRegistering,
          required: true,
        })}
        {renderTextField({
          label: 'Apellido',
          name: 'lastName',
          value: patientForm.lastName,
          onChange: handlePatientChange,
          placeholder: 'Apellido',
          disabled: isRegistering,
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-[0.35fr_1fr]">
        {renderTextField({
          label: 'Edad',
          name: 'age',
          value: patientForm.age,
          onChange: handlePatientChange,
          type: 'number',
          placeholder: '29',
          disabled: isRegistering,
        })}
        {renderTextField({
          label: 'Motivo de consulta',
          name: 'reasonForConsultation',
          value: patientForm.reasonForConsultation,
          onChange: handlePatientChange,
          placeholder: 'Ansiedad, duelo, habitos de sueno...',
          disabled: isRegistering,
        })}
      </div>

      {renderTextField({
        label: 'Correo',
        name: 'email',
        value: patientForm.email,
        onChange: handlePatientChange,
        type: 'email',
        placeholder: 'tu@email.com',
        disabled: isRegistering,
        required: true,
      })}

      {renderTextField({
        label: 'Contrasena',
        name: 'password',
        value: patientForm.password,
        onChange: handlePatientChange,
        type: 'password',
        placeholder: 'Minimo 8 caracteres',
        disabled: isRegistering,
        required: true,
      })}

      {registrationError ? (
        <InlineNotice
          tone="error"
          title="No pudimos crear tu cuenta"
          message={registrationError}
          hint="Revisa los campos requeridos y vuelve a intentarlo."
        />
      ) : null}

      <button
        type="submit"
        disabled={isRegistering}
        className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRegistering ? 'Creando cuenta...' : 'Crear cuenta paciente'}
      </button>
    </form>
  );

  const renderPsychologistRegistrationForm = () => (
    <form onSubmit={handlePsychologistSubmit} className="mt-8 space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {renderTextField({
          label: 'Nombre',
          name: 'firstName',
          value: psychologistForm.firstName,
          onChange: handlePsychologistChange,
          placeholder: 'Nombre',
          disabled: isRegistering,
          required: true,
        })}
        {renderTextField({
          label: 'Apellido',
          name: 'lastName',
          value: psychologistForm.lastName,
          onChange: handlePsychologistChange,
          placeholder: 'Apellido',
          disabled: isRegistering,
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {renderTextField({
          label: 'Titulo profesional',
          name: 'professionalTitle',
          value: psychologistForm.professionalTitle,
          onChange: handlePsychologistChange,
          placeholder: 'Psicologo clinico',
          disabled: isRegistering,
          required: true,
        })}
        {renderTextField({
          label: 'Numero de licencia',
          name: 'licenseNumber',
          value: psychologistForm.licenseNumber,
          onChange: handlePsychologistChange,
          placeholder: 'LIC-PSI-001',
          disabled: isRegistering,
        })}
      </div>

      {renderTextField({
        label: 'Correo',
        name: 'email',
        value: psychologistForm.email,
        onChange: handlePsychologistChange,
        type: 'email',
        placeholder: 'tu@email.com',
        disabled: isRegistering,
        required: true,
      })}

      {renderTextField({
        label: 'Contrasena',
        name: 'password',
        value: psychologistForm.password,
        onChange: handlePsychologistChange,
        type: 'password',
        placeholder: 'Minimo 8 caracteres',
        disabled: isRegistering,
        required: true,
      })}

      {registrationError ? (
        <InlineNotice
          tone="error"
          title="No pudimos registrar tu solicitud"
          message={registrationError}
          hint="Revisa tus datos profesionales y vuelve a intentarlo."
        />
      ) : null}

      {registrationSuccess ? (
        <InlineNotice
          tone="success"
          title="Solicitud enviada"
          message={registrationSuccess}
        />
      ) : null}

      <button
        type="submit"
        disabled={isRegistering}
        className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRegistering ? 'Enviando solicitud...' : 'Solicitar alta como psicologo'}
      </button>
    </form>
  );

  const activeTabMeta = activeTab === 'login'
    ? {
        icon: LockKeyhole,
        title: 'Iniciar sesion',
        subtitle: 'Usa una cuenta demo o tu acceso real para entrar al flujo que corresponde a tu rol.',
      }
    : activeTab === 'patient'
      ? {
          icon: UserPlus2,
          title: 'Crear cuenta paciente',
          subtitle: 'La cuenta queda activa al instante para completar entrevista, revisar agenda y seguimiento.',
        }
      : {
          icon: UserRoundCheck,
          title: 'Registro de psicologo',
          subtitle: 'Tu cuenta quedara pendiente de revision hasta que el backoffice la apruebe.',
        };

  const ActiveIcon = activeTabMeta.icon;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_35%),linear-gradient(135deg,_#f8fafc,_#eef2ff_45%,_#f8fafc)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-6xl grid lg:grid-cols-[1.15fr_0.95fr] gap-6">
        <section className="hidden lg:flex flex-col justify-between rounded-[28px] bg-slate-900 text-white p-10 shadow-2xl">
          <div>
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium">
              <Sparkles size={16} className="mr-2" /> PsicoPanel
            </div>
            <h1 className="mt-8 text-5xl font-black leading-tight">Acceso seguro para consulta, seguimiento y backoffice.</h1>
            <p className="mt-5 max-w-xl text-base text-slate-300">
              Esta entrada ya soporta tres caminos: acceso existente, alta inmediata de paciente y solicitud profesional para psicologos.
            </p>
          </div>

          <div className="grid gap-3">
            {demoAccounts.map((account) => (
              <button
                key={account.role}
                onClick={() => handleUseDemo(account)}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left transition hover:bg-white/10"
              >
                <p className="text-sm font-semibold text-white">{account.role}</p>
                <p className="mt-1 text-sm text-slate-300">{account.email}</p>
                <p className="text-xs text-slate-400">Password demo: {account.password}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] bg-white shadow-xl border border-slate-200 p-6 md:p-8">
          <div className="mx-auto max-w-xl">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
              <ActiveIcon size={26} />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <h2 className="mt-6 text-3xl font-black text-slate-900">{activeTabMeta.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{activeTabMeta.subtitle}</p>

            <div className="mt-6 grid gap-3 lg:hidden">
              {demoAccounts.map((account) => (
                <button
                  key={account.role}
                  onClick={() => handleUseDemo(account)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100"
                >
                  <p className="text-sm font-semibold text-slate-900">{account.role}</p>
                  <p className="text-xs text-slate-500">{account.email}</p>
                </button>
              ))}
            </div>

            {activeTab === 'login' ? renderLoginForm() : null}
            {activeTab === 'patient' ? renderPatientRegistrationForm() : null}
            {activeTab === 'psychologist' ? renderPsychologistRegistrationForm() : null}
          </div>
        </section>
      </div>
    </div>
  );
}
