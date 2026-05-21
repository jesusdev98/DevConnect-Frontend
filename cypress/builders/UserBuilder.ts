export type E2ECredentials = {
  nombre: string;
  apellidos: string;
  usuario: string;
  username: string;
  email: string;
  password: string;
  passwordConfirmation: string;
};

const buildUsername = (prefix: string, suffix: string): string => {
  const normalizedPrefix = prefix.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
  const normalizedSuffix = suffix.slice(-8);

  return `${normalizedPrefix}_${normalizedSuffix}`;
};

export const buildE2ECredentials = (prefix: string): E2ECredentials => {
  const suffix = Date.now().toString();
  const username = buildUsername(prefix, suffix);

  return {
    nombre: 'Test',
    apellidos: 'User',
    usuario: username,
    username,
    email: `test_${suffix}@test.com`,
    password: 'Password123!',
    passwordConfirmation: 'Password123!',
  };
};

