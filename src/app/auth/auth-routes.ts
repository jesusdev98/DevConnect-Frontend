export const AUTH_PATHS = {
  login: 'login',
  register: 'register',
} as const;

export const AUTH_ROUTES = {
  login: `/${AUTH_PATHS.login}`,
  register: `/${AUTH_PATHS.register}`,
} as const;