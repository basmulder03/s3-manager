import { z } from 'zod';

// Re-export all schemas
export * from './common.js';
export * from './s3.js';
export * from './auth.js';
export * from './pim.js';
export * from './server.js';
export * from './telemetry.js';
export * from './session.js';

// Import what we need for the main schema composition
import {
  serverSchema,
  secretKeySchema,
  localDevModeSchema,
  appSchema,
  webSchema,
  httpSchema,
  securitySchema,
  rolePermissionsSchema,
  defaultRoleSchema,
} from './server.js';
import {
  oidcProviderSchema,
  oidcRedirectPathSchema,
  keycloakSchema,
  azureSchema,
  googleSchema,
  authSchema,
} from './auth.js';
import { pimSchema } from './pim.js';
import { s3ConfigSchema } from './s3.js';
import { telemetrySchema } from './telemetry.js';
import { sessionSchema } from './session.js';

/**
 * Main configuration schema - composes all domain-specific schemas
 */
export const configSchema = z.object({
  // Server Configuration
  port: serverSchema.shape.port,
  nodeEnv: serverSchema.shape.nodeEnv,

  // Secret Keys
  secretKey: secretKeySchema,

  // Local Development Mode
  localDevMode: localDevModeSchema,

  // OIDC Provider Selection
  oidcProvider: oidcProviderSchema,

  // Keycloak Configuration
  keycloak: keycloakSchema,

  // Azure AD Configuration
  azure: azureSchema,

  // Google OAuth Configuration
  google: googleSchema,

  // OIDC Redirect Configuration
  oidcRedirectPath: oidcRedirectPathSchema,

  // Authentication / JWT Verification Configuration
  auth: authSchema,

  // PIM Configuration
  pim: pimSchema,

  // Role-Based Permissions
  rolePermissions: rolePermissionsSchema,

  defaultRole: defaultRoleSchema,

  // S3 Configuration
  s3: s3ConfigSchema,

  // Application Configuration
  app: appSchema,

  web: webSchema,

  http: httpSchema,

  security: securitySchema,

  // Telemetry / Observability Configuration
  telemetry: telemetrySchema,

  // Session Configuration
  session: sessionSchema,
});

export type Config = z.infer<typeof configSchema>;
