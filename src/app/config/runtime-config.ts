declare global {
  interface Window {
    __DEVCONNECT_CONFIG__?: {
      apiUrl?: string;
    };
  }
}

export const resolveApiUrl = (fallback: string): string => {
  const runtimeApiUrl =
    typeof window !== 'undefined'
      ? window.__DEVCONNECT_CONFIG__?.apiUrl
      : undefined;

  return normalizeApiUrl(runtimeApiUrl) ?? normalizeApiUrl(fallback) ?? '';
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
