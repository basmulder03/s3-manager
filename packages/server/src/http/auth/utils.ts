import type { Context } from 'hono';
import { config } from '@/config';

const API_PREFIX = '/api';

/**
 * Constructs an API path by prepending the API prefix
 */
export const apiPath = (path: string): string => `${API_PREFIX}${path}`;

/**
 * Removes trailing slashes from a string
 */
export const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

/**
 * Resolves the client IP address from request headers
 * Respects the trustProxyHeaders configuration setting
 */
export const resolveClientIp = (c: Context): string => {
  if (!config.http.trustProxyHeaders) {
    return 'unknown';
  }

  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded
      .split(',')
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0);
    if (first) {
      return first;
    }
  }

  const realIp = c.req.header('x-real-ip');
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }

  return 'unknown';
};

/**
 * Validates and resolves the return URL for redirects
 * Ensures the URL is within the configured web origin
 */
export const resolveReturnTo = (rawReturnTo: string | undefined): string => {
  const webOrigin = trimTrailingSlash(config.web.origin);
  const fallback = `${webOrigin}/`;

  if (!rawReturnTo || rawReturnTo.trim().length === 0) {
    return fallback;
  }

  try {
    const parsed = new URL(rawReturnTo, fallback);
    if (parsed.origin !== webOrigin) {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
};

/**
 * Computes the callback path for OIDC redirects
 */
export const getCallbackPath = (): string => {
  const callbackPathInput = config.oidcRedirectPath.startsWith('/')
    ? config.oidcRedirectPath
    : `/${config.oidcRedirectPath}`;

  return callbackPathInput.startsWith(API_PREFIX) ? callbackPathInput : apiPath(callbackPathInput);
};
