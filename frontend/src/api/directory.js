import {API_BASE_URL} from './client';

export const directoryEnabled = import.meta.env.DEV && import.meta.env.VITE_D3_ENABLED === 'true';
export const directoryPhoto = path => path ? API_BASE_URL + path : '';

async function directoryRequest(path, signal) {
  const response = await fetch(API_BASE_URL + '/directory' + path, {signal, credentials: 'omit', cache: 'no-store'});
  if (!response.ok) throw Object.assign(new Error(
    response.status === 404 ? 'Este perfil no está disponible.' :
      response.status === 429 ? 'Hay demasiadas consultas. Espera un momento y vuelve a intentar.' :
        'No pudimos consultar el directorio. Vuelve a intentar.'
  ), {status: response.status});
  return (await response.json()).data;
}

export const getDirectory = (filters, signal) => directoryRequest('?' + new URLSearchParams(filters), signal);
export const getDirectoryFilters = signal => directoryRequest('/filters', signal);
export const getDirectoryProfile = (id, signal) => directoryRequest('/' + encodeURIComponent(id), signal);
