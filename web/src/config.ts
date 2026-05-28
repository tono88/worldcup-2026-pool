export const isLocalBackend = import.meta.env.VITE_DATA_BACKEND === 'local';

export const apiBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api';
