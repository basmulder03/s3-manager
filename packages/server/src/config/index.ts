import { z } from 'zod';

/**
 * Configuration schema with Zod validation
 * Provides type-safe, validated configuration from environment variables
 * 
 * Note: dotenv should be loaded in index.ts before this module is imported
 */

const booleanString = z
  .string()
  .default('false')
  .transform((val) => val.toLowerCase() === 'true');

const trueBooleanString = z
  .string()
  .default('true')
  .transform((val) => val.toLowerCase() === 'true');

const configSchema = z.object({
  // Server Configuration
  port: z.coerce.number().int().positive().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),

  // Secret Keys
  secretKey: z.string().min(1, 'SECRET_KEY must be set'),

  // Local Development Mode
  localDevMode: booleanString,

  // OIDC Provider Selection
  oidcProvider: z.enum(['keycloak', 'azure', 'azuread', 'google']).default('keycloak'),

  // Keycloak Configuration
  keycloak: z.object({
    serverUrl: z.string().url().default('http://keycloak:8080'),
    realm: z.string().default('s3-manager'),
    clientId: z.string().default('s3-manager-client'),
    clientSecret: z.string().default('your-keycloak-client-secret'),
    scopes: z.string().default('openid profile email'),
  }),

  // Azure AD Configuration
  azure: z.object({
    tenantId: z.string().default(''),
    clientId: z.string().default(''),
    clientSecret: z.string().default(''),
    authority: z.string().url().optional(),
    scopes: z.array(z.string()).default(['User.Read']),
  }),

  // Google OAuth Configuration
  google: z.object({
    clientId: z.string().default(''),
    clientSecret: z.string().default(''),
    scopes: z.string().default('openid profile email'),
  }),

  // OIDC Redirect Configuration
  oidcRedirectPath: z.string().default('/auth/callback'),

  // Authentication / JWT Verification Configuration
  auth: z.object({
    required: booleanString,
    issuer: z.string().url().optional(),
    audience: z.string().optional(),
    rolesClaim: z.string().default('roles'),
    clockToleranceSeconds: z.coerce.number().int().nonnegative().default(10),
    accessTokenCookieMaxAgeSeconds: z.coerce.number().int().positive().default(3600),
    refreshTokenCookieMaxAgeSeconds: z.coerce.number().int().positive().default(2592000),
    revokeOnLogout: trueBooleanString,
  }),

  // PIM Configuration
  pim: z.object({
    enabled: booleanString,
    roleAssignmentApi: z
      .string()
      .url()
      .default('https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments'),
  }),

  // Role-Based Permissions
  rolePermissions: z
    .record(z.string(), z.array(z.enum(['view', 'write', 'delete'])))
    .default({
      'S3-Viewer': ['view'],
      'S3-Editor': ['view', 'write'],
      'S3-Admin': ['view', 'write', 'delete'],
    }),

  defaultRole: z.string().default('S3-Viewer'),

  // S3 Configuration
  s3: z.object({
    endpoint: z.string().url(),
    accessKey: z.string().min(1, 'S3_ACCESS_KEY must be set'),
    secretKey: z.string().min(1, 'S3_SECRET_KEY must be set'),
    region: z.string().default('us-east-1'),
    useSsl: booleanString,
    verifySsl: booleanString,
  }),

  // Application Configuration
  app: z.object({
    name: z.string().default('S3 Manager'),
    version: z.string().default('2.0.0'),
  }),

  web: z.object({
    origin: z.string().url().default('http://localhost:5173'),
  }),

  // Telemetry / Observability Configuration
  telemetry: z.object({
    enabled: trueBooleanString,
    serviceName: z.string().default('s3-manager'),
    serviceVersion: z.string().default('2.0.0'),
    logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    logFormat: z.enum(['pretty', 'json']).default('pretty'),
    exporterType: z.enum(['console', 'otlp', 'none']).default('console'),
    otlp: z.object({
      logsEndpoint: z.string().url().default('http://localhost:4318/v1/logs'),
      tracesEndpoint: z.string().url().default('http://localhost:4318/v1/traces'),
      metricsEndpoint: z.string().url().default('http://localhost:4318/v1/metrics'),
    }),
    traceSampleRate: z.coerce.number().min(0).max(1).default(1),
    batchSize: z.coerce.number().int().positive().default(512),
    batchTimeoutMs: z.coerce.number().int().positive().default(30000),
    redactPaths: z.array(z.string()).default([
      'password',
      '*.password',
      'secret',
      '*.secret',
      'secretKey',
      '*.secretKey',
      'accessKey',
      '*.accessKey',
      'token',
      '*.token',
      'apiKey',
      '*.apiKey',
      'apikey',
      'authorization',
      '*.authorization',
      'cookie',
      '*.cookie',
      'headers.authorization',
      'headers.cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'request.headers.authorization',
      'request.headers.cookie',
      's3.accessKey',
      's3.secretKey',
      'keycloak.clientSecret',
      'azure.clientSecret',
      'google.clientSecret',
    ]),
  }),

  // Session Configuration
  session: z.object({
    cookieSecure: booleanString,
    cookieHttpOnly: z.boolean().default(true),
    cookieSameSite: z.enum(['Strict', 'Lax', 'None']).default('Lax'),
    lifetime: z.coerce.number().int().positive().default(3600), // 1 hour in seconds
  }),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Load and validate configuration from environment variables
 */
export const loadConfig = (): Config => {
  try {
    const config = configSchema.parse({
      // Server
      port: process.env.PORT || process.env.APP_PORT,
      nodeEnv: process.env.NODE_ENV,
      secretKey: process.env.SECRET_KEY,

      // Local Dev Mode
      localDevMode: process.env.LOCAL_DEV_MODE,

      // OIDC Provider
      oidcProvider: process.env.OIDC_PROVIDER,

      // Keycloak
      keycloak: {
        serverUrl: process.env.KEYCLOAK_SERVER_URL,
        realm: process.env.KEYCLOAK_REALM,
        clientId: process.env.KEYCLOAK_CLIENT_ID,
        clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
        scopes: process.env.KEYCLOAK_SCOPES,
      },

      // Azure AD
      azure: {
        tenantId: process.env.AZURE_AD_TENANT_ID,
        clientId: process.env.AZURE_AD_CLIENT_ID,
        clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
        authority: process.env.AZURE_AD_TENANT_ID
          ? `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}`
          : undefined,
        scopes: ['User.Read'],
      },

      // Google
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        scopes: process.env.GOOGLE_SCOPES,
      },

      // OIDC
      oidcRedirectPath: process.env.OIDC_REDIRECT_PATH,

      // Auth
      auth: {
        required: process.env.AUTH_REQUIRED,
        issuer: process.env.AUTH_ISSUER,
        audience: process.env.AUTH_AUDIENCE,
        rolesClaim: process.env.AUTH_ROLES_CLAIM,
        clockToleranceSeconds: process.env.AUTH_CLOCK_TOLERANCE_SECONDS,
        accessTokenCookieMaxAgeSeconds: process.env.AUTH_ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS,
        refreshTokenCookieMaxAgeSeconds: process.env.AUTH_REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS,
        revokeOnLogout: process.env.AUTH_REVOKE_ON_LOGOUT,
      },

      // PIM
      pim: {
        enabled: process.env.PIM_ENABLED,
        roleAssignmentApi: process.env.PIM_ROLE_ASSIGNMENT_API,
      },

      // Role Permissions (use default from schema)
      defaultRole: process.env.DEFAULT_ROLE,

      // S3
      s3: {
        endpoint: process.env.S3_ENDPOINT,
        accessKey: process.env.S3_ACCESS_KEY,
        secretKey: process.env.S3_SECRET_KEY,
        region: process.env.S3_REGION,
        useSsl: process.env.S3_USE_SSL,
        verifySsl: process.env.S3_VERIFY_SSL,
      },

      // App (use defaults)
      app: {},

      // Web
      web: {
        origin: process.env.WEB_ORIGIN,
      },

      // Telemetry
      telemetry: {
        enabled: process.env.OTEL_ENABLED,
        serviceName: process.env.OTEL_SERVICE_NAME,
        serviceVersion: process.env.OTEL_SERVICE_VERSION,
        logLevel: process.env.OTEL_LOG_LEVEL,
        logFormat: process.env.OTEL_LOG_FORMAT,
        exporterType: process.env.OTEL_EXPORTER_TYPE,
        otlp: {
          logsEndpoint: process.env.OTLP_LOGS_ENDPOINT,
          tracesEndpoint: process.env.OTLP_TRACES_ENDPOINT,
          metricsEndpoint: process.env.OTLP_METRICS_ENDPOINT,
        },
        traceSampleRate: process.env.OTEL_TRACE_SAMPLE_RATE,
        batchSize: process.env.OTEL_BATCH_SIZE,
        batchTimeoutMs: process.env.OTEL_BATCH_TIMEOUT_MS,
      },

      // Session
      session: {
        cookieSecure: process.env.SESSION_COOKIE_SECURE,
        lifetime: process.env.PERMANENT_SESSION_LIFETIME,
      },
    });

    // Additional production validation
    if (config.nodeEnv === 'production') {
      if (config.secretKey === 'dev-secret-key-change-in-production') {
        throw new Error('SECRET_KEY must be changed from default in production');
      }
      if (!config.session.cookieSecure) {
        console.warn('[WARN] SESSION_COOKIE_SECURE should be true in production');
      }
      if (config.session.cookieSameSite === 'None' && !config.session.cookieSecure) {
        throw new Error('SESSION_COOKIE_SECURE must be true when SESSION_COOKIE_SAME_SITE=None');
      }
      if (config.localDevMode) {
        throw new Error('LOCAL_DEV_MODE cannot be enabled in production');
      }
      if (!config.auth.required) {
        throw new Error('AUTH_REQUIRED must be true in production');
      }
    }

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[ERROR] Configuration validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      throw new Error('Invalid configuration');
    }
    throw error;
  }
};

// Singleton pattern - lazy load config on first access
let _config: Config | null = null;

export const getConfig = (): Config => {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
};

export const resetConfigForTests = (): void => {
  _config = null;
};

// For convenience, export as config (but it's actually a getter)
export const config = new Proxy({} as Config, {
  get(_target, prop) {
    return getConfig()[prop as keyof Config];
  },
});
