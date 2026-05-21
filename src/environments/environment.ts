import { resolveApiUrl } from '../app/config/runtime-config';

export const environment = {
  production: false,
  apiUrl: resolveApiUrl('http://127.0.0.1:8001'),
  contactEmail: 'devconnectcontacto@gmail.com',
};
