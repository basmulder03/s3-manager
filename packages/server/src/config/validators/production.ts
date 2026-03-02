import type { Config } from '../schemas/index.js';
import { isHttpsUrl } from '../parsers/env-helpers.js';

/**
 * Production-specific validations
 */

/**
 * Validates production environment requirements
 * @param config - The configuration to validate
 * @throws Error if validation fails (for critical issues)
 * @logs warnings for non-critical issues
 */
export const validateProductionEnvironment = (config: Config): void => {
  if (config.nodeEnv !== 'production') {
    return;
  }

  // Critical validations
  if (config.secretKey === 'dev-secret-key-change-in-production') {
    throw new Error('SECRET_KEY must be changed from default in production');
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

  // Security warnings
  if (!config.session.cookieSecure) {
    console.warn('[WARN] SESSION_COOKIE_SECURE should be true in production');
  }

  if (!config.http.trustProxyHeaders) {
    console.warn('[WARN] TRUST_PROXY_HEADERS is false; rate limits will not use client IPs');
  }

  // Validate secure upstreams
  validateSecureUpstreams(config);
};

/**
 * Validates that all upstreams use secure protocols in production
 * @param config - The configuration to validate
 * @throws Error if insecure upstreams are found and not explicitly allowed
 * @logs warning if insecure upstreams are explicitly allowed
 */
const validateSecureUpstreams = (config: Config): void => {
  if (config.security.allowInsecureUpstreams) {
    console.warn(
      '[WARN] ALLOW_INSECURE_UPSTREAMS=true: HTTP upstreams and relaxed TLS verification are allowed in production'
    );
    return;
  }

  const insecureDetails: string[] = [];

  if (config.oidcProvider === 'keycloak' && !isHttpsUrl(config.keycloak.serverUrl)) {
    insecureDetails.push('KEYCLOAK_SERVER_URL must use https://');
  }

  if (config.auth.issuer && !isHttpsUrl(config.auth.issuer)) {
    insecureDetails.push('AUTH_ISSUER must use https://');
  }

  for (const source of config.s3.sources) {
    if (!isHttpsUrl(source.endpoint)) {
      insecureDetails.push(`S3 source '${source.id}' endpoint must use https://`);
    }

    if (!source.useSsl) {
      insecureDetails.push(`S3 source '${source.id}' must set USE_SSL=true`);
    }

    if (!source.verifySsl) {
      insecureDetails.push(`S3 source '${source.id}' must set VERIFY_SSL=true`);
    }
  }

  if (insecureDetails.length > 0) {
    throw new Error(
      `Insecure upstream configuration is not allowed in production: ${insecureDetails.join('; ')}`
    );
  }
};
