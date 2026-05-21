declare global {
  interface Window {
    __DEVCONNECT_CONFIG__?: {
      apiUrl?: string;
    };
  }
}

type RuntimeApiOptions = {
  required?: boolean;
};

type ViteImportMeta = ImportMeta & {
  readonly env?: {
    readonly VITE_API_URL?: string;
  };
};

export const resolveApiUrl = (fallback?: string, options: RuntimeApiOptions = {}): string => {
  const runtimeApiUrl =
    typeof window !== 'undefined' ? window.__DEVCONNECT_CONFIG__?.apiUrl : undefined;
  const buildApiUrl = (import.meta as ViteImportMeta).env?.VITE_API_URL;

  const resolved =
    normalizeApiUrl(runtimeApiUrl) ?? normalizeApiUrl(buildApiUrl) ?? normalizeApiUrl(fallback);

  if (resolved !== null) {
    return resolved;
  }

  if (options.required === true) {
    throw new Error('Missing required API URL. Configure VITE_API_URL for production builds.');
  }

  return '';
};

const normalizeApiUrl = (value: string | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('/')) {
    return trimmed.replace(/\/$/, '');
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }

    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};
