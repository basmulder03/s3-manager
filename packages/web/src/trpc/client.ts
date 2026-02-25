import { createTRPCReact } from '@trpc/react-query';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@server/trpc/router';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/trpc';
export const API_ORIGIN = API_URL.replace(/\/trpc\/?$/, '');

export const trpc = createTRPCReact<AppRouter>();

const links = [
  httpBatchLink({
    url: API_URL,
    fetch(url, options) {
      return fetch(url, {
        ...options,
        credentials: 'include',
      });
    },
  }),
];

export const trpcClient = trpc.createClient({
  links,
});

export const trpcProxyClient = createTRPCProxyClient<AppRouter>({
  links,
});
