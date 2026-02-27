import { createTRPCReact } from '@trpc/react-query';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@server/trpc/router';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/trpc';
export const API_ORIGIN = API_URL.replace(/\/trpc\/?$/, '');

let refreshRequestInFlight: Promise<boolean> | null = null;

const refreshSession = async (): Promise<boolean> => {
  if (refreshRequestInFlight) {
    return refreshRequestInFlight;
  }

  refreshRequestInFlight = (async () => {
    try {
      const response = await fetch(`${API_ORIGIN}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return response.ok;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshRequestInFlight = null;
  });

  return refreshRequestInFlight;
};

const fetchWithAuthRefresh = async (
  url: string | URL | Request,
  options?: RequestInit
): Promise<Response> => {
  const request = new Request(url, {
    ...options,
    credentials: 'include',
  });

  const response = await fetch(request.clone());
  if (response.status !== 401) {
    return response;
  }

  const refreshed = await refreshSession();
  if (!refreshed) {
    return response;
  }

  return fetch(request);
};

export const trpc = createTRPCReact<AppRouter>();

const links = [
  httpBatchLink({
    url: API_URL,
    fetch(url, options) {
      return fetchWithAuthRefresh(url, options);
    },
  }),
];

export const trpcClient = trpc.createClient({
  links,
});

export const trpcProxyClient = createTRPCProxyClient<AppRouter>({
  links,
});
