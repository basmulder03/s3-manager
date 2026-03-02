import { z } from 'zod';
import { configSchema, type Config } from './schemas/index.js';
import { optionalEnv, parseS3SourcesEnv, parseElevationEntitlementsEnv } from './parsers/index.js';
import { validateNonTestEnvironment, validateProductionEnvironment } from './validators/index.js';

/**
 * Configuration module - provides type-safe, validated configuration from environment variables
 *
 * This module composes schemas, parsers, and validators to load and validate
 * the application configuration. It maintains backward compatibility by re-exporting
 * all necessary types and functions.
 *
 * Note: dotenv should be loaded in index.ts before this module is imported
 */

// Re-export types for backward compatibility
export type { Config } from './schemas/index.js';

/**
 * Load and validate configuration from environment variables
 * @returns Validated configuration object
 * @throws Error if validation fails
 */
export const loadConfig = (): Config => {
  try {
    const config = configSchema.parse({
      // Server
      port: process.env.PORT || process.env.APP_PORT,
      nodeEnv: optionalEnv(process.env.NODE_ENV),
      secretKey: process.env.SECRET_KEY,

      // Local Dev Mode
      localDevMode: process.env.LOCAL_DEV_MODE,

      // OIDC Provider
      oidcProvider: optionalEnv(process.env.OIDC_PROVIDER),

      // Keycloak
      keycloak: {
        serverUrl: optionalEnv(process.env.KEYCLOAK_SERVER_URL),
        realm: optionalEnv(process.env.KEYCLOAK_REALM),
        clientId: optionalEnv(process.env.KEYCLOAK_CLIENT_ID),
        clientSecret: optionalEnv(process.env.KEYCLOAK_CLIENT_SECRET),
        scopes: optionalEnv(process.env.KEYCLOAK_SCOPES),
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
        clientId: optionalEnv(process.env.GOOGLE_CLIENT_ID),
        clientSecret: optionalEnv(process.env.GOOGLE_CLIENT_SECRET),
        scopes: optionalEnv(process.env.GOOGLE_SCOPES),
      },

      // OIDC
      oidcRedirectPath: optionalEnv(process.env.OIDC_REDIRECT_PATH),

      // Auth
      auth: {
        required: process.env.AUTH_REQUIRED,
        issuer: optionalEnv(process.env.AUTH_ISSUER),
        audience: optionalEnv(process.env.AUTH_AUDIENCE),
        rolesClaim: process.env.AUTH_ROLES_CLAIM,
        groupsClaim: process.env.AUTH_GROUPS_CLAIM,
        clockToleranceSeconds: process.env.AUTH_CLOCK_TOLERANCE_SECONDS,
        accessTokenCookieMaxAgeSeconds: process.env.AUTH_ACCESS_TOKEN_COOKIE_MAX_AGE_SECONDS,
        refreshTokenCookieMaxAgeSeconds: process.env.AUTH_REFRESH_TOKEN_COOKIE_MAX_AGE_SECONDS,
        revokeOnLogout: process.env.AUTH_REVOKE_ON_LOGOUT,
      },

      // PIM
      pim: {
        enabled: process.env.PIM_ENABLED,
        devMockEnabled: process.env.PIM_DEV_MOCK_ENABLED,
        rateLimitWindowMs: process.env.PIM_RATE_LIMIT_WINDOW_MS,
        rateLimitMaxRequests: process.env.PIM_RATE_LIMIT_MAX_REQUESTS,
        azure: {
          assignmentScheduleRequestApi: optionalEnv(
            process.env.PIM_AZURE_ASSIGNMENT_SCHEDULE_REQUEST_API
          ),
          eligibilityScheduleApi: optionalEnv(process.env.PIM_AZURE_ELIGIBILITY_SCHEDULE_API),
        },
        google: {
          membershipsApiBase: optionalEnv(process.env.PIM_GOOGLE_MEMBERSHIPS_API_BASE),
          operationsApiBase: optionalEnv(process.env.PIM_GOOGLE_OPERATIONS_API_BASE),
        },
        entitlements: parseElevationEntitlementsEnv(),
      },

      // Role Permissions (use default from schema)
      defaultRole: optionalEnv(process.env.DEFAULT_ROLE),

      // S3
      s3: {
        sources: parseS3SourcesEnv(),
      },

      // App (use defaults)
      app: {},

      // Web
      web: {
        origin: optionalEnv(process.env.WEB_ORIGIN),
      },

      // HTTP
      http: {
        trustProxyHeaders: process.env.TRUST_PROXY_HEADERS,
      },

      // Security
      security: {
        allowInsecureUpstreams: process.env.ALLOW_INSECURE_UPSTREAMS,
      },

      // Telemetry
      telemetry: {
        enabled: process.env.OTEL_ENABLED,
        serviceName: optionalEnv(process.env.OTEL_SERVICE_NAME),
        serviceVersion: optionalEnv(process.env.OTEL_SERVICE_VERSION),
        logLevel: optionalEnv(process.env.OTEL_LOG_LEVEL),
        logFormat: optionalEnv(process.env.OTEL_LOG_FORMAT),
        exporterType: optionalEnv(process.env.OTEL_EXPORTER_TYPE),
        otlp: {
          logsEndpoint: optionalEnv(process.env.OTLP_LOGS_ENDPOINT),
          tracesEndpoint: optionalEnv(process.env.OTLP_TRACES_ENDPOINT),
          metricsEndpoint: optionalEnv(process.env.OTLP_METRICS_ENDPOINT),
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

    // Run additional validations
    validateNonTestEnvironment(config);
    validateProductionEnvironment(config);

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[ERROR] Configuration validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      const details = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join('; ');
      throw new Error(`Invalid configuration: ${details}`);
    }
    throw error;
  }
};

// Singleton pattern - lazy load config on first access
let _config: Config | null = null;

/**
 * Get the current configuration, loading it if necessary
 * @returns The configuration object
 */
export const getConfig = (): Config => {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
};

/**
 * Reset the configuration cache (primarily for testing)
 */
export const resetConfigForTests = (): void => {
  _config = null;
};

/**
 * Configuration proxy for convenient access
 * Usage: import { config } from './config'
 * Then access properties like: config.port, config.s3.sources, etc.
 */
export const config = new Proxy({} as Config, {
  get(_target, prop) {
    return getConfig()[prop as keyof Config];
  },
});
