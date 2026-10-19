import ContactChangePanel from './ContactChangePanel';
import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { formatRetryAfter } from '../utils/identityFeedback';

const initialEmailSecret = () => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('verifyEmail') || '';
  return token;
};
export default function IdentityPanel({ onIdentityUpdated }) {
  const [identity, setIdentity] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '' });
  const [emailSecret, setEmailSecret] = useState(initialEmailSecret);
  const [smsSecret, setSmsSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [wait, setWait] = useState({ email: 0, sms: 0 });
  useEffect(() => {
    const readEmailLink = () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      if (!params.has('verifyEmail')) return;
      const token = params.get('verifyEmail') || '';
      setEmailSecret(token);
      // Preserve unrelated fragment parameters and remove the secret immediately.
      params.delete('verifyEmail');
      const remaining = params.toString();
      window.history.replaceState({}, '', window.location.pathname + window.location.search + (remaining ? '#' + remaining : ''));
    };
    readEmailLink();
    window.addEventListener('hashchange', readEmailLink);
    let live = true;
    apiRequest('/auth/identity').then(response => {
      if (live) { setIdentity(response.data); setForm({ firstName: response.data.firstName, lastName: response.data.lastName }); }
    }).catch(error => { if (live) setNotice(error.message); });
    return () => { live = false; window.removeEventListener('hashchange', readEmailLink); };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setWait(current => ({
      email: Math.max(0, current.email - 1), sms: Math.max(0, current.sms - 1),
    })), 1000);
    return () => clearInterval(timer);
  }, []);
  const action = async (path, body, channel) => {
    if (busy) return;
    setBusy(true); setNotice('');
    try {
      const response = await apiRequest(path, { method: path.endsWith('identity') ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      if (response.data.sent) {
        setWait(current => ({ ...current, [channel]: response.data.retryAfter }));
        setNotice(channel === 'email' ? 'Enlace solicitado. Caduca en 24 horas; solo funciona el más reciente.' : 'Código solicitado. Caduca en 10 minutos; tienes cinco intentos.');
      } else {
        setIdentity(response.data);
        if (path === '/auth/identity') onIdentityUpdated?.(response.data);
        setNotice('Datos actualizados.');
        if (channel === 'email') setEmailSecret('');
        if (channel === 'sms') setSmsSecret('');
      }
    } catch (error) {
      if (channel && error.retryAfter && path.endsWith('/request')) setWait(current => ({ ...current, [channel]: error.retryAfter }));
      setNotice(error.message);
    } finally { setBusy(false); }
  };
  return <section className="mb-6 rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-bold text-slate-900">Mi identidad y contactos</h2>
    <p className="mt-1 text-sm text-slate-500">Puedes usar tu cuenta antes de verificar. Verificar contactos no crea una relación clínica.</p>
    <p role="status" className="mt-2 text-sm text-indigo-700">{notice}</p>
    {identity && <>
      <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); action('/auth/identity', form); }}>
        {['firstName','lastName'].map((field, index) => <label key={field} className="text-sm text-slate-600">{index ? 'Apellido' : 'Nombre'}
          <input aria-label={index ? 'Apellido' : 'Nombre'} required={!index} maxLength={100} className="mt-1 block rounded-xl border p-2" value={form[field]} onChange={event => setForm(current => ({ ...current, [field]: event.target.value }))} />
        </label>)}
        <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">Guardar nombre</button>
      </form>
      <p className="mt-3 text-sm text-slate-600">Fecha de nacimiento: {identity.birthDate || 'Desconocida en el registro histórico'}. Las correcciones posteriores están pendientes.</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {['email','sms'].map(channel => {
          const verified = channel === 'email' ? identity.emailVerifiedAt : identity.phoneVerifiedAt;
          return <div key={channel} className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold">{channel === 'email' ? 'Correo' : 'Teléfono'}: {channel === 'email' ? identity.email : identity.phone || 'Sin formato verificable'}</h3>
            <span className={verified ? 'text-sm text-emerald-700' : 'text-sm text-amber-700'}>{verified ? 'Verificado' : 'Sin verificar'}</span>
            {!verified && <>
              <button type="button" disabled={busy || wait[channel] > 0} className="my-2 block rounded-xl border px-3 py-2 text-sm disabled:opacity-50" onClick={() => action('/auth/verification/' + channel + '/request', {}, channel)}>
                {wait[channel] ? 'Reintenta en ' + formatRetryAfter(wait[channel]) : channel === 'email' ? 'Solicitar enlace' : 'Solicitar SMS'}
              </button>
              {channel === 'email' ? <p className="mb-2 text-xs text-slate-500">Abre el enlace recibido y confirma aquí. Requiere la sesión de esta cuenta.</p> : <p className="mb-2 text-xs text-slate-500">Verifica primero tu correo. Después ingresa el código SMS recibido; el más reciente sustituye al anterior.</p>}
              <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); action('/auth/verification/' + channel + '/confirm', { secret: channel === 'email' ? emailSecret : smsSecret }, channel); }}>
                <input aria-label={channel === 'email' ? 'Token del enlace recibido' : 'Código SMS'} type={channel === 'email' ? 'password' : 'text'} autoComplete="one-time-code" inputMode={channel === 'sms' ? 'numeric' : 'text'} required maxLength={channel === 'sms' ? 6 : 43}
                  className="min-w-0 rounded-xl border p-2" placeholder={channel === 'email' ? 'Token del enlace recibido' : 'Código de seis dígitos'}
                  value={channel === 'email' ? emailSecret : smsSecret} onChange={event => channel === 'email' ? setEmailSecret(event.target.value) : setSmsSecret(event.target.value)} />
                <button disabled={busy} className="rounded-xl bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">Confirmar {channel === 'email' ? 'correo' : 'teléfono'}</button>
              </form>
            </>}
          </div>;
        })}
      </div>
      <ContactChangePanel />
    </>}
  </section>;
}
