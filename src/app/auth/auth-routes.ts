export const AUTH_PATHS = {
  login: 'login',
  register: 'register',
  forgotPassword: 'forgot-password',
  resetPassword: 'reset-password',
} as const;

export const AUTH_ROUTES = {
  login: `/${AUTH_PATHS.login}`,
  register: `/${AUTH_PATHS.register}`,
  forgotPassword: `/${AUTH_PATHS.forgotPassword}`,
  resetPassword: `/${AUTH_PATHS.resetPassword}`,
} as const;