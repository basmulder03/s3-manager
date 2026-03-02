# Configuration Module

This directory contains the refactored configuration system for the S3 Manager server. The configuration is organized into focused, single-responsibility modules for better maintainability and clarity.

## Architecture

The configuration system is organized into four main layers:

### 1. Schemas (`schemas/`)

Zod validation schemas organized by domain:

- **`common.ts`** (17 lines) - Shared schemas used across domains
  - `permissionSchema` - Permission types (view, write, delete, manage_properties)
  - `booleanString` - String to boolean transformer (default: false)
  - `trueBooleanString` - String to boolean transformer (default: true)

- **`s3.ts`** (46 lines) - S3 source configuration
  - `s3SourceSchema` - Individual S3 source validation
  - `s3ConfigSchema` - Complete S3 configuration with duplicate ID checking

- **`auth.ts`** (45 lines) - Authentication and OIDC providers
  - `keycloakSchema` - Keycloak OIDC provider configuration
  - `azureSchema` - Azure AD configuration
  - `googleSchema` - Google OAuth configuration
  - `authSchema` - JWT verification and authentication settings
  - `oidcProviderSchema` - OIDC provider selection
  - `oidcRedirectPathSchema` - OIDC redirect path configuration

- **`pim.ts`** (58 lines) - Privileged Identity Management
  - `pimAzureSchema` - Azure PIM API configuration
  - `pimGoogleSchema` - Google PIM API configuration
  - `elevationEntitlementSchema` - Individual entitlement validation
  - `pimSchema` - Complete PIM configuration with duplicate key checking

- **`server.ts`** (41 lines) - Server and infrastructure
  - `serverSchema` - Port and environment configuration
  - `secretKeySchema` - Secret key validation
  - `localDevModeSchema` - Local development mode flag
  - `appSchema` - Application metadata
  - `webSchema` - Web origin configuration
  - `httpSchema` - HTTP settings
  - `securitySchema` - Security settings
  - `rolePermissionsSchema` - Role-based permissions mapping
  - `defaultRoleSchema` - Default role selection

- **`telemetry.ts`** (57 lines) - Observability and telemetry
  - `otlpSchema` - OpenTelemetry Protocol endpoints
  - `telemetrySchema` - Complete telemetry configuration with redaction paths

- **`session.ts`** (13 lines) - Session management
  - `sessionSchema` - Cookie and session lifetime settings

- **`index.ts`** (96 lines) - Main schema composition
  - Combines all domain schemas into `configSchema`
  - Exports the `Config` type
  - Re-exports all schemas for external use

### 2. Parsers (`parsers/`)

Environment variable parsing utilities:

- **`env-helpers.ts`** (56 lines) - Core parsing functions
  - `optionalEnv()` - Normalizes optional environment variables
  - `isHttpsUrl()` - Validates HTTPS URLs
  - `parseBooleanEnv()` - Parses boolean environment variables with validation

- **`s3-parser.ts`** (92 lines) - S3 source parser
  - `parseS3SourcesEnv()` - Parses indexed S3 source environment variables
  - Pattern: `S3_SOURCE_0_ENDPOINT`, `S3_SOURCE_0_ACCESS_KEY`, etc.

- **`pim-parser.ts`** (127 lines) - PIM entitlement parser
  - `parsePermissionBundle()` - Parses comma-separated permission lists
  - `parseElevationEntitlementsEnv()` - Parses indexed elevation entitlements
  - Pattern: `ELEVATION_0_KEY`, `ELEVATION_0_PROVIDER`, etc.

- **`index.ts`** (8 lines) - Parser exports

### 3. Validators (`validators/`)

Additional validation logic beyond Zod schemas:

- **`runtime.ts`** (21 lines) - Runtime environment validations
  - `validateNonTestEnvironment()` - Ensures auth is required in non-test environments

- **`production.ts`** (96 lines) - Production-specific validations
  - `validateProductionEnvironment()` - Comprehensive production checks
  - `validateSecureUpstreams()` - Ensures HTTPS for all upstreams in production
  - Validates secret keys, session cookies, PIM settings, etc.

- **`index.ts`** (7 lines) - Validator exports

### 4. Main Entry Point (`index.ts`)

**199 lines** - Configuration composition and loading:

- `loadConfig()` - Loads and validates configuration from environment variables
- `getConfig()` - Singleton getter for configuration
- `resetConfigForTests()` - Resets configuration cache for testing
- `config` - Proxy object for convenient configuration access

## Usage

### Basic Usage

```typescript
import { config } from '@/config';

// Access configuration properties
const port = config.port;
const s3Sources = config.s3.sources;
const authRequired = config.auth.required;
```

### Type-Safe Access

```typescript
import type { Config } from '@/config';

function processConfig(cfg: Config) {
  // Type-safe access to all configuration
  console.log(cfg.app.name);
  console.log(cfg.telemetry.logLevel);
}
```

### Loading Configuration

```typescript
import { loadConfig } from '@/config';

// Explicitly load configuration (throws on validation failure)
const config = loadConfig();
```

### Testing

```typescript
import { resetConfigForTests } from '@/config';

beforeEach(() => {
  resetConfigForTests(); // Reset singleton for fresh config in each test
});
```

## Environment Variables

### Server Configuration

- `PORT` or `APP_PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment: development, production, test
- `SECRET_KEY` - Application secret key (required)
- `LOCAL_DEV_MODE` - Local development mode (test only)

### Authentication

- `AUTH_REQUIRED` - Require authentication (default: false, must be true in production)
- `AUTH_ISSUER` - JWT issuer URL
- `AUTH_AUDIENCE` - JWT audience
- `AUTH_ROLES_CLAIM` - JWT roles claim name (default: roles)
- `AUTH_GROUPS_CLAIM` - JWT groups claim name (default: groups)

### OIDC Providers

- `OIDC_PROVIDER` - Provider selection: keycloak, azure, azuread, google
- `OIDC_REDIRECT_PATH` - Callback path (default: /api/auth/callback)

#### Keycloak

- `KEYCLOAK_SERVER_URL`
- `KEYCLOAK_REALM`
- `KEYCLOAK_CLIENT_ID`
- `KEYCLOAK_CLIENT_SECRET`

#### Azure AD

- `AZURE_AD_TENANT_ID`
- `AZURE_AD_CLIENT_ID`
- `AZURE_AD_CLIENT_SECRET`

#### Google

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### S3 Sources (Indexed)

- `S3_SOURCE_0_ENDPOINT` - S3 endpoint URL
- `S3_SOURCE_0_ACCESS_KEY` - Access key
- `S3_SOURCE_0_SECRET_KEY` - Secret key
- `S3_SOURCE_0_REGION` - AWS region (default: us-east-1)
- `S3_SOURCE_0_ID` - Source identifier (default: source0)
- `S3_SOURCE_0_USE_SSL` - Use SSL (default: false)
- `S3_SOURCE_0_VERIFY_SSL` - Verify SSL certificates (default: false)

### PIM/Elevation (Indexed)

- `ELEVATION_0_KEY` - Unique entitlement key
- `ELEVATION_0_PROVIDER` - Provider: azure or google
- `ELEVATION_0_TARGET` - Target group/role ID
- `ELEVATION_0_PERMISSION_BUNDLE` - Comma-separated permissions
- `ELEVATION_0_MAX_DURATION_MINUTES` - Maximum duration (default: 60)
- `ELEVATION_0_REQUIRE_JUSTIFICATION` - Require justification (default: false)

### Telemetry

- `OTEL_ENABLED` - Enable telemetry (default: true)
- `OTEL_SERVICE_NAME` - Service name (default: s3-manager)
- `OTEL_LOG_LEVEL` - Log level: trace, debug, info, warn, error, fatal
- `OTLP_LOGS_ENDPOINT` - OpenTelemetry logs endpoint
- `OTLP_TRACES_ENDPOINT` - OpenTelemetry traces endpoint

## Refactoring Summary

### Before

- Single file: 709 lines
- All concerns mixed together
- Difficult to navigate and maintain

### After

- 16 focused modules: 979 lines total (270 lines added for better organization)
- Clear separation of concerns:
  - **Schemas** (373 lines) - Validation definitions
  - **Parsers** (283 lines) - Environment variable parsing
  - **Validators** (124 lines) - Additional validation logic
  - **Main entry** (199 lines) - Composition and loading

### Benefits

1. **Single Responsibility** - Each module has one clear purpose
2. **Better Navigation** - Easy to find related code
3. **Improved Testability** - Smaller, focused modules
4. **Type Safety** - Maintained throughout
5. **Backward Compatible** - 100% API compatibility
6. **Documentation** - Clear module boundaries and purposes

## Migration Notes

No migration required! All exports remain identical:

- `config` - Proxy object for configuration access
- `getConfig()` - Get configuration singleton
- `loadConfig()` - Load configuration explicitly
- `resetConfigForTests()` - Reset for testing
- `Config` type - Configuration type definition

The refactoring is internal only - the public API is unchanged.
