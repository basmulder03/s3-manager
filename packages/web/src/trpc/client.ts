import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../server/src/trpc/router';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/trpc';

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: API_URL,
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: 'include',
        });
      },
    }),
  ],
});
