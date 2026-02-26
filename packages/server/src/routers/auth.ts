import { z } from 'zod';
import { protectedProcedure, publicProcedure, router } from '@/trpc';
import { config } from '@/config';
import { providerName, resolveAudience, resolveIssuer } from '@/auth/provider';
import { introspectToken } from '@/auth/oidc';

export const authRouter = router({
  status: publicProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/auth/status',
        tags: ['auth'],
        summary: 'Authentication status',
      },
    })
    .input(z.object({}))
    .output(z.any())
    .query(({ ctx }) => {
    return {
      authenticated: ctx.user !== null,
      authRequired: config.auth.required,
      localDevMode: config.localDevMode,
      provider: providerName(),
      issuer: resolveIssuer() ?? null,
      audience: resolveAudience() ?? null,
    };
    }),

  me: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/auth/me',
        tags: ['auth'],
        summary: 'Current authenticated user',
        protect: true,
      },
    })
    .input(z.object({}))
    .output(z.any())
    .query(({ ctx }) => {
    const user = ctx.user!;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
      permissions: user.permissions,
      provider: user.provider,
    };
    }),

  introspect: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/auth/introspect',
        tags: ['auth'],
        summary: 'Token introspection details',
        protect: true,
      },
    })
    .input(z.object({}))
    .output(z.any())
    .query(async ({ ctx }) => {
    const user = ctx.user!;

    const introspection = await introspectToken({
      token: user.token,
    });

    if (!introspection) {
      return {
        supported: false,
        active: true,
        provider: user.provider,
      };
    }

    return {
      supported: true,
      active: introspection.active,
      provider: user.provider,
      details: introspection,
    };
    }),

  authorizeHeaderExample: publicProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/auth/authorize-header-example',
        tags: ['auth'],
        summary: 'Authorization header example',
      },
    })
    .input(
      z.object({
        tokenPreview: z.string().min(10).max(64),
      })
    )
    .output(z.any())
    .query(({ input }) => {
      return {
        authorizationHeader: `Bearer ${input.tokenPreview}...`,
      };
    }),
});
