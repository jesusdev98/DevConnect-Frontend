import { resolveApiUrl } from '../app/config/runtime-config';

export const environment = {
  production: true,
  apiUrl: resolveApiUrl(undefined, { required: true }),
  contactEmail: 'devconnectcontacto@gmail.com',
};
