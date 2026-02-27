import { initTRPC } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { TRPCError } from '@trpc/server';
import { resolveAuthUser, resolvePermissions, shouldRequireAuth } from '@/auth/context';
import type { AuthUser } from '@/auth/types';

export type Permission = 'view' | 'write' | 'delete' | 'manage_properties';

/**
 * Create tRPC context
 * This will be available in all procedures
 */
export const createContext = async (opts: FetchCreateContextFnOptions) => {
  const user = await resolveAuthUser(opts.req);
  const actorHeader =
    opts.req.headers.get('x-user-email') ??
    opts.req.headers.get('x-user-id') ??
    opts.req.headers.get('x-forwarded-user');

  const actor =
    user?.email ||
    (actorHeader && actorHeader.trim().length > 0 ? actorHeader.trim() : 'anonymous');

  return {
    req: opts.req,
    actor,
    user,
    permissions: resolvePermissions(user, opts.req),
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

const requirePermission = (permission: Permission) =>
  t.middleware(({ ctx, next }) => {
    if (shouldRequireAuth() && !ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    if (ctx.permissions.includes(permission)) {
      return next();
    }

    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Missing '${permission}' permission`,
    });
  });

export const viewProcedure = publicProcedure.use(requirePermission('view'));
export const writeProcedure = publicProcedure.use(requirePermission('write'));
export const deleteProcedure = publicProcedure.use(requirePermission('delete'));
export const managePropertiesProcedure = publicProcedure.use(
  requirePermission('manage_properties')
);

const requireAuthentication = t.middleware(({ ctx, next }) => {
  if (!shouldRequireAuth()) {
    return next();
  }

  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user as AuthUser,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuthentication);
