import { z } from 'zod';
import { protectedProcedure, publicProcedure, router } from '@/trpc';
import { config } from '@/config';
import { providerName, resolveAudience, resolveIssuer } from '@/auth/provider';
import { introspectToken } from '@/auth/oidc';

export const authRouter = router({
  status: publicProcedure.query(({ ctx }) => {
    return {
      authenticated: ctx.user !== null,
      authRequired: config.auth.required,
      localDevMode: config.localDevMode,
      provider: providerName(),
      issuer: resolveIssuer() ?? null,
      audience: resolveAudience() ?? null,
    };
  }),

  me: protectedProcedure.query(({ ctx }) => {
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

  introspect: protectedProcedure.query(async ({ ctx }) => {
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
    .input(
      z.object({
        tokenPreview: z.string().min(10).max(64),
      })
    )
    .query(({ input }) => {
      return {
        authorizationHeader: `Bearer ${input.tokenPreview}...`,
      };
    }),
});
