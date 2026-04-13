import React, { useState } from 'react';
import { LockKeyhole, Sparkles } from 'lucide-react';
import InlineNotice from '../components/shared/InlineNotice';

const demoAccounts = [
  { role: 'Psicologo', email: 'doctor@psicopanel.com', password: 'Demo12345!' },
  { role: 'Paciente', email: 'juan@example.com', password: 'Demo12345!' },
];

const getLoginErrorMeta = (rawMessage = '') => {
  const message = String(rawMessage || '').toLowerCase();

  if (message.includes('credenciales') || message.includes('correo') || message.includes('password')) {
    return {
      title: 'No pudimos validar ese acceso',
      hint: 'Si estas probando el flujo demo, puedes usar una de las cuentas sugeridas arriba para entrar mas rapido.',
    };
  }

  return {
    title: 'No pudimos iniciar sesion',
    hint: 'Revisa el correo, la contrasena y tu conexion antes de volver a intentarlo.',
  };
};

export default function LoginScreen({ onLogin, isSubmitting = false, error = '' }) {
  const [form, setForm] = useState({
    email: demoAccounts[0].email,
    password: demoAccounts[0].password,
  });

  const handleChange = (event) => {
    setForm((currentForm) => ({
      ...currentForm,
      [event.target.name]: event.target.value,
    }));
  };

  const handleUseDemo = (account) => {
    setForm({
      email: account.email,
      password: account.password,
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onLogin(form);
  };

  const loginErrorMeta = getLoginErrorMeta(error);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_35%),linear-gradient(135deg,_#f8fafc,_#eef2ff_45%,_#f8fafc)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1.2fr_0.9fr] gap-6">
        <section className="hidden lg:flex flex-col justify-between rounded-[28px] bg-slate-900 text-white p-10 shadow-2xl">
          <div>
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium">
              <Sparkles size={16} className="mr-2" /> PsicoPanel
            </div>
            <h1 className="mt-8 text-5xl font-black leading-tight">Acceso seguro para consulta y seguimiento.</h1>
            <p className="mt-5 max-w-xl text-base text-slate-300">
              Inicia sesion como psicologo para gestionar pacientes o como paciente para revisar tareas y agenda personal.
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
          <div className="mx-auto max-w-md">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
              <LockKeyhole size={26} />
            </div>
            <h2 className="mt-6 text-3xl font-black text-slate-900">Iniciar sesion</h2>
            <p className="mt-2 text-sm text-slate-500">Usa una cuenta demo para entrar como psicologo o paciente.</p>

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

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Correo</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                  placeholder="tu@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Contrasena</label>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                  placeholder="********"
                />
              </div>

              {error && (
                <InlineNotice
                  tone="error"
                  title={loginErrorMeta.title}
                  message={error}
                  hint={loginErrorMeta.hint}
                />
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
