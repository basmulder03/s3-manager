import { z } from 'zod';
import { booleanString, trueBooleanString } from './common.js';

/**
 * Authentication and OIDC provider schemas
 */

export const keycloakSchema = z.object({
  serverUrl: z.string().url().default('http://keycloak:8080'),
  realm: z.string().default('s3-manager'),
  clientId: z.string().default('s3-manager-client'),
  clientSecret: z.string().default('your-keycloak-client-secret'),
  scopes: z.string().default('openid profile email'),
});

export const azureSchema = z.object({
  tenantId: z.string().default(''),
  clientId: z.string().default(''),
  clientSecret: z.string().default(''),
  authority: z.string().url().optional(),
  scopes: z.array(z.string()).default(['User.Read']),
});

export const googleSchema = z.object({
  clientId: z.string().default(''),
  clientSecret: z.string().default(''),
  scopes: z.string().default('openid profile email'),
});

export const authSchema = z.object({
  required: booleanString,
  issuer: z.string().url().optional(),
  audience: z.string().optional(),
  rolesClaim: z.string().default('roles'),
  groupsClaim: z.string().default('groups'),
  clockToleranceSeconds: z.coerce.number().int().nonnegative().default(10),
  accessTokenCookieMaxAgeSeconds: z.coerce.number().int().positive().default(3600),
  refreshTokenCookieMaxAgeSeconds: z.coerce.number().int().positive().default(2592000),
  revokeOnLogout: trueBooleanString,
});

export const oidcProviderSchema = z
  .enum(['keycloak', 'azure', 'azuread', 'google'])
  .default('keycloak');
export const oidcRedirectPathSchema = z.string().default('/api/auth/callback');
