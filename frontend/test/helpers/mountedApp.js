import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import React, { act } from 'react';
import { transformWithOxc } from 'vite';
import { installReactDomHost, elements } from './reactDomHost.js';

const document = installReactDomHost();
const { createRoot, version } = await import('react-dom/client');
const appUrl = new URL('../../src/App.jsx', import.meta.url).href;
const source = await readFile(new URL(appUrl), 'utf8');
const { code } = await transformWithOxc(source, 'App.jsx', { jsx: { runtime: 'classic' } });
const key = '__psicopanelMountedApp';
const stubUrl = name => 'data:text/javascript,' + encodeURIComponent(name);
const child = stubUrl(`import React from 'react';export default function Child(props) {
  return globalThis.${key}.renderChild(import.meta.url,props,React);
}`);
// Each child needs its own module URL so the fixture can retain its identity.
const childUrls = new Map();
const apiNames = [...source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](.\/api\/[^'"]+)['"]/g)]
  .flatMap(match => match[1].split(',').map(name => name.trim()).filter(Boolean));
const apiUrl = stubUrl(apiNames.map(name => `export const ${name}=(...args)=>globalThis.${key}.api.${name}(...args);`).join('\n'));
const emptyUrl = stubUrl('export {};');
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === appUrl && specifier.startsWith('./api/')) return { url: apiUrl, shortCircuit: true };
    if (context.parentURL === appUrl && (/\.css$/.test(specifier))) return { url: emptyUrl, shortCircuit: true };
    if (context.parentURL === appUrl && /^(\.\/components\/|\.\/screens\/|\.\/modals\/)/.test(specifier)) {
      const url = child + '#' + specifier;
      childUrls.set(url, specifier.split('/').at(-1));
      return { url, shortCircuit: true };
    }
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const url = new URL(specifier, context.parentURL);
      if (!existsSync(url) && existsSync(new URL(url.href + '.js'))) return { url: url.href + '.js', shortCircuit: true };
    }
    if (context.parentURL?.startsWith('data:') && !specifier.startsWith('.')) return nextResolve(specifier, { ...context, parentURL: appUrl });
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === appUrl) return { format: 'module', source: code, shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { default: App } = await import(appUrl);
hooks.deregister();

export function deferred() {
  let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
export const patient = (id = 'p') => ({ id, fullName: 'Fictional ' + id.toUpperCase(),
  notes: 'PRIVATE_' + id.toUpperCase(), tasks: [], objectives: [], clinicalNotes: [{ id: 'note-' + id, content: 'PRIVATE_NOTE_' + id.toUpperCase() }] });
export async function mountedApp() {
  const h = { token: 'fixture-session', actor: { id: 'a', role: 'psychologist' }, boot: [], lists: [], children: {}, errors: [], logoutCalls: 0, writes: 0 };
  h.api = Object.fromEntries(apiNames.map(name => [name, async () => { throw new Error('Unexpected API: ' + name); }]));
  for (const name of ['getAppointments','getMyReminders','getCareRelationships','getAppointmentWaitlist','getMyAvailability','getMyAvailabilityExceptions']) h.api[name] = async () => [];
  h.api.getAuthToken = () => h.token;
  h.api.getCurrentUser = () => { const d = deferred(); h.boot.push(d); return d.promise; };
  h.api.getPatients = () => { const d = deferred(); h.lists.push(d); return d.promise; };
  h.api.logout = () => { h.logoutCalls++; h.token = null; };
  h.api.login = async () => { h.token = 'next-session'; return { user: { ...h.actor } }; };
  h.api.getPatient = async id => patient(id);
  h.api.updatePatientClinicalNote = async () => { h.writes++; return { id: 'confirmed-note' }; };
  h.renderChild = (url, props, R) => {
    const name = childUrls.get(url); h.children[name] = props;
    const button = (label, onClick) => R.createElement('button', { key: label, onClick }, label);
    if (name === 'Sidebar') return R.createElement('aside', null,
      button('Tablero', () => props.setVistaActiva('dashboard')),
      button('Pacientes', () => props.setVistaActiva('patients')),
      button('Cerrar sesión', props.onLogout));
    if (name === 'DashboardScreen' || name === 'PatientsScreen') return R.createElement('section', { 'data-screen': name },
      name, ...props.patients.map(p => button('Abrir ' + p.id, () => props.onOpenPatient(p))));
    if (name === 'NotesScreen') return R.createElement('section', { 'data-screen': name },
      'Expediente ' + props.patient.id + ' ' + props.patient.notas,
      props.clinicalRecordSync?.pending ? ' Pendiente ' + props.clinicalRecordSync.patientId : ' Actualizado',
      button('Guardar nota fixture', () => { h.lastAction = props.onUpdateSession('note-' + props.patient.id, { content: 'Fixture', tasks: [] }, props.clinicalRecordSync?.version || 0); }));
    if (name === 'LoginScreen') return button('Iniciar fixture', () => { h.lastAction = props.onLogin({}); });
    return null;
  };
  globalThis[key] = h;
  h.container = document.createElement('div'); document.body.appendChild(h.container);
  const capture = error => h.errors.push(error);
  h.root = createRoot(h.container, { onUncaughtError: capture, onCaughtError: capture, onRecoverableError: capture });
  await act(async () => h.root.render(React.createElement(React.StrictMode, null, React.createElement(App))));
  h.version = { react: React.version, reactDom: version };
  h.text = () => h.container.textContent;
  h.button = label => elements(h.container).find(node => node.tagName === 'BUTTON' && node.textContent === label);
  h.click = async label => {
    const button = h.button(label); if (!button) throw new Error('Missing button: ' + label + ' in ' + h.text());
    await act(async () => { button.click(); if (h.lastAction) { await h.lastAction; h.lastAction = null; } });
  };
  h.settle = async (d, value, reject = false) => act(async () => { if (reject) d.reject(value); else d.resolve(value); });
  h.concurrentLists = async () => {
    if (h.boot.length !== 2) throw new Error('StrictMode must execute both bootstrap effects');
    await h.settle(h.boot[0], { ...h.actor });
    await h.settle(h.boot[1], { ...h.actor });
    if (h.lists.length !== 2) throw new Error('Expected two concurrent patient loads');
  };
  h.close = async () => { await act(async () => h.root.unmount()); document.body.removeChild(h.container); };
  return h;
}
