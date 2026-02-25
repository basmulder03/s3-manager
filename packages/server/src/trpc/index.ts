import { initTRPC } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { TRPCError } from '@trpc/server';
import { config } from '../config';

export type Permission = 'view' | 'write' | 'delete';

const VALID_PERMISSIONS: Permission[] = ['view', 'write', 'delete'];

const parsePermissionHeader = (rawHeader: string | null): Permission[] => {
  if (!rawHeader) {
    return [];
  }

  const tokens = rawHeader
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);

  const parsed = tokens.filter((token): token is Permission => {
    return (VALID_PERMISSIONS as string[]).includes(token);
  });

  return Array.from(new Set(parsed));
};

const resolvePermissions = (opts: FetchCreateContextFnOptions): Permission[] => {
  if (config.localDevMode) {
    const rolePermissions = config.rolePermissions[config.defaultRole] ?? ['view'];
    return Array.from(new Set(rolePermissions));
  }

  const fromPermissionsHeader = parsePermissionHeader(opts.req.headers.get('x-user-permissions'));
  if (fromPermissionsHeader.length > 0) {
    return fromPermissionsHeader;
  }

  const roleHeader = opts.req.headers.get('x-user-role');
  if (roleHeader && config.rolePermissions[roleHeader]) {
    const rolePermissions = config.rolePermissions[roleHeader] ?? ['view'];
    return Array.from(new Set(rolePermissions));
  }

  return ['view'];
};

/**
 * Create tRPC context
 * This will be available in all procedures
 */
export const createContext = async (opts: FetchCreateContextFnOptions) => {
  const actorHeader = opts.req.headers.get('x-user-email')
    ?? opts.req.headers.get('x-user-id')
    ?? opts.req.headers.get('x-forwarded-user');

  return {
    req: opts.req,
    actor: actorHeader && actorHeader.trim().length > 0 ? actorHeader.trim() : 'anonymous',
    permissions: resolvePermissions(opts),
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
