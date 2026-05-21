import { resolveApiUrl } from '../app/config/runtime-config';

export const environment = {
  production: true,
  apiUrl: resolveApiUrl('/'),
  adminEmail: 'contact@example.com',
};
