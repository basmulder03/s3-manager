import { initTRPC } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

/**
 * Create tRPC context
 * This will be available in all procedures
 */
export const createContext = async (opts: FetchCreateContextFnOptions) => {
  return {
    req: opts.req,
    // Will add: user, s3 client, etc.
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

/**
 * Initialize tRPC instance
 */
const t = initTRPC.context<Context>().create();

/**
 * Export reusable router and procedure helpers
 */
export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
