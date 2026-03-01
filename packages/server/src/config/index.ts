import { z } from 'zod';

const permissionSchema = z.enum(['view', 'write', 'delete', 'manage_properties']);

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

const optionalEnv = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

type MutableS3Source = {
  id?: string;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  region?: string;
  useSsl?: string;
  verifySsl?: string;
};

type MutableElevationEntitlement = {
  key?: string;
  provider?: string;
  target?: string;
  permissionBundle?: string;
  maxDurationMinutes?: string;
  requireJustification?: string;
};

const parseBooleanEnv = (
  value: string | undefined,
  envName: string,
  defaultValue: boolean
): boolean => {
  const normalized = optionalEnv(value);
  if (normalized === undefined) {
    return defaultValue;
  }

  const lowered = normalized.toLowerCase();
  if (lowered === 'true') {
    return true;
  }
  if (lowered === 'false') {
    return false;
  }

  throw new Error(`${envName} must be either 'true' or 'false'`);
};

const parseS3SourcesEnv = (): unknown => {
  const sourceByIndex = new Map<number, MutableS3Source>();

  for (const [envName, envValue] of Object.entries(process.env)) {
    const match = envName.match(
      /^S3_SOURCE_(\d+)_(ID|ENDPOINT|ACCESS_KEY|SECRET_KEY|REGION|USE_SSL|VERIFY_SSL)$/
    );
    if (!match) {
      continue;
    }

    const index = Number(match[1]);
    const field = match[2];
    const source = sourceByIndex.get(index) ?? {};

    if (field === 'ID') {
      source.id = envValue;
    } else if (field === 'ENDPOINT') {
      source.endpoint = envValue;
    } else if (field === 'ACCESS_KEY') {
      source.accessKey = envValue;
    } else if (field === 'SECRET_KEY') {
      source.secretKey = envValue;
    } else if (field === 'REGION') {
      source.region = envValue;
    } else if (field === 'USE_SSL') {
      source.useSsl = envValue;
    } else if (field === 'VERIFY_SSL') {
      source.verifySsl = envValue;
    }

    sourceByIndex.set(index, source);
  }

  if (sourceByIndex.size === 0) {
    return undefined;
  }

  const sortedIndexes = [...sourceByIndex.keys()].sort((a, b) => a - b);

  return sortedIndexes.map((index) => {
    const source = sourceByIndex.get(index)!;
    const endpoint = optionalEnv(source.endpoint);
    const accessKey = optionalEnv(source.accessKey);
    const secretKey = optionalEnv(source.secretKey);

    if (!endpoint || !accessKey || !secretKey) {
      throw new Error(
        `S3 source ${index} is missing required values. Set S3_SOURCE_${index}_ENDPOINT, S3_SOURCE_${index}_ACCESS_KEY, and S3_SOURCE_${index}_SECRET_KEY`
      );
    }

    return {
      id: optionalEnv(source.id) ?? `source${index}`,
      endpoint,
      accessKey,
      secretKey,
      region: optionalEnv(source.region) ?? 'us-east-1',
      useSsl: parseBooleanEnv(source.useSsl, `S3_SOURCE_${index}_USE_SSL`, false),
      verifySsl: parseBooleanEnv(source.verifySsl, `S3_SOURCE_${index}_VERIFY_SSL`, false),
    };
  });
};

const parsePermissionBundle = (
  value: string | undefined,
  envName: string
): Array<'view' | 'write' | 'delete' | 'manage_properties'> => {
  const normalized = optionalEnv(value);
  if (!normalized) {
    throw new Error(`${envName} must contain at least one permission`);
  }

  const permissions = normalized
    .split(',')
    .map((entry) => entry.trim())
    .filter(
      (entry): entry is 'view' | 'write' | 'delete' | 'manage_properties' =>
        entry === 'view' || entry === 'write' || entry === 'delete' || entry === 'manage_properties'
    );

  if (permissions.length === 0) {
    throw new Error(
      `${envName} must contain one or more valid permissions: view, write, delete, manage_properties`
    );
  }

  return Array.from(new Set(permissions));
};

const parseElevationEntitlementsEnv = (): unknown => {
  const entitlementByIndex = new Map<number, MutableElevationEntitlement>();

  for (const [envName, envValue] of Object.entries(process.env)) {
    const match = envName.match(
      /^ELEVATION_(\d+)_(KEY|PROVIDER|TARGET|PERMISSION_BUNDLE|MAX_DURATION_MINUTES|REQUIRE_JUSTIFICATION)$/
    );
    if (!match) {
      continue;
    }

    const index = Number(match[1]);
    const field = match[2];
    const entitlement = entitlementByIndex.get(index) ?? {};

    if (field === 'KEY') {
      entitlement.key = envValue;
    } else if (field === 'PROVIDER') {
      entitlement.provider = envValue;
    } else if (field === 'TARGET') {
      entitlement.target = envValue;
    } else if (field === 'PERMISSION_BUNDLE') {
      entitlement.permissionBundle = envValue;
    } else if (field === 'MAX_DURATION_MINUTES') {
      entitlement.maxDurationMinutes = envValue;
    } else if (field === 'REQUIRE_JUSTIFICATION') {
      entitlement.requireJustification = envValue;
    }

    entitlementByIndex.set(index, entitlement);
  }

  if (entitlementByIndex.size === 0) {
    return undefined;
  }

  const sortedIndexes = [...entitlementByIndex.keys()].sort((a, b) => a - b);

  return sortedIndexes.map((index) => {
    const entitlement = entitlementByIndex.get(index)!;
    const key = optionalEnv(entitlement.key);
    const provider = optionalEnv(entitlement.provider);
    const target = optionalEnv(entitlement.target);

    if (!key || !provider || !target) {
      throw new Error(
        `Elevation entitlement ${index} is missing required values. Set ELEVATION_${index}_KEY, ELEVATION_${index}_PROVIDER, and ELEVATION_${index}_TARGET`
      );
    }

    return {
      key,
      provider,
      target,
      permissions: parsePermissionBundle(
        entitlement.permissionBundle,
        `ELEVATION_${index}_PERMISSION_BUNDLE`
      ),
      maxDurationMinutes: Number.parseInt(entitlement.maxDurationMinutes ?? '60', 10),
      requireJustification: parseBooleanEnv(
        entitlement.requireJustification,
        `ELEVATION_${index}_REQUIRE_JUSTIFICATION`,
        false
      ),
    };
  });
};

const s3SourceSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'S3 source id must be alphanumeric, dash, or underscore'),
  endpoint: z.string().url(),
  accessKey: z.string().min(1, 'S3 source accessKey must be set'),
  secretKey: z.string().min(1, 'S3 source secretKey must be set'),
  region: z.string().default('us-east-1'),
  useSsl: z.coerce.boolean().default(false),
  verifySsl: z.coerce.boolean().default(false),
});

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
    groupsClaim: z.string().default('groups'),
    clockToleranceSeconds: z.coerce.number().int().nonnegative().default(10),
    accessTokenCookieMaxAgeSeconds: z.coerce.number().int().positive().default(3600),
    refreshTokenCookieMaxAgeSeconds: z.coerce.number().int().positive().default(2592000),
    revokeOnLogout: trueBooleanString,
  }),

  // PIM Configuration
  pim: z.object({
    enabled: booleanString,
    devMockEnabled: booleanString,
    azure: z.object({
      assignmentScheduleRequestApi: z
        .string()
        .url()
        .default(
          'https://graph.microsoft.com/v1.0/identityGovernance/privilegedAccess/group/assignmentScheduleRequests'
        ),
      eligibilityScheduleApi: z
        .string()
        .url()
        .default(
          'https://graph.microsoft.com/v1.0/identityGovernance/privilegedAccess/group/eligibilityScheduleInstances'
        ),
    }),
    google: z.object({
      membershipsApiBase: z
        .string()
        .url()
        .default('https://cloudidentity.googleapis.com/v1/groups'),
      operationsApiBase: z.string().url().default('https://cloudidentity.googleapis.com/v1'),
    }),
    entitlements: z
      .array(
        z.object({
          key: z.string().trim().min(1),
          provider: z.enum(['azure', 'google']),
          target: z.string().trim().min(1),
          permissions: z.array(permissionSchema).min(1),
          maxDurationMinutes: z.coerce.number().int().positive().max(1440).default(60),
          requireJustification: z.coerce.boolean().default(false),
        })
      )
      .default([])
      .transform((entitlements) => {
        const keys = new Set<string>();
        for (const entry of entitlements) {
          if (keys.has(entry.key)) {
            throw new Error(`Duplicate elevation entitlement key '${entry.key}'`);
          }
          keys.add(entry.key);
        }

        return entitlements;
      }),
  }),

  // Role-Based Permissions
  rolePermissions: z.record(z.string(), z.array(permissionSchema)).default({
    'S3-Viewer': ['view'],
    'S3-Editor': ['view', 'write'],
    'S3-Admin': ['view', 'write', 'delete'],
    'S3-Property-Admin': ['view', 'write', 'manage_properties'],
  }),

  defaultRole: z.string().default('S3-Viewer'),

  // S3 Configuration
  s3: z
    .object({
      sources: z
        .array(s3SourceSchema)
        .min(
          1,
          'Define at least one S3 source using S3_SOURCE_0_ENDPOINT, S3_SOURCE_0_ACCESS_KEY, and S3_SOURCE_0_SECRET_KEY'
        ),
    })
    .transform((value) => {
      const sources = value.sources;

      const uniqueIds = new Set<string>();
      for (const source of sources) {
        if (uniqueIds.has(source.id)) {
          throw new Error(`Duplicate S3 source id '${source.id}' in S3_SOURCE_<n>_ID values`);
        }
        uniqueIds.add(source.id);
      }

      const primary = sources[0]!;
      return {
        defaultSourceId: primary.id,
        sources,
      };
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
    redactPaths: z
      .array(z.string())
      .default([
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
        's3.sources.*.accessKey',
        's3.sources.*.secretKey',
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

    // Additional non-test validation
    if (config.nodeEnv !== 'test') {
      if (config.localDevMode) {
        throw new Error('LOCAL_DEV_MODE is only allowed when NODE_ENV=test');
      }
      if (!config.auth.required) {
        throw new Error('AUTH_REQUIRED must be true when NODE_ENV is not test');
      }
    }

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
      if (config.pim.devMockEnabled) {
        throw new Error('PIM_DEV_MOCK_ENABLED cannot be enabled in production');
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
      const details = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join('; ');
      throw new Error(`Invalid configuration: ${details}`);
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
