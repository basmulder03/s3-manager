import type { Context } from 'hono';
import { config } from '@/config';
import { ACCESS_TOKEN_COOKIE, ID_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/auth/context';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const sameOrigin = (rawOriginOrReferer: string | null): boolean => {
  if (!rawOriginOrReferer) {
    return true;
  }

  try {
    const trustedOrigin = trimTrailingSlash(config.web.origin);
    const parsed = new URL(rawOriginOrReferer);
    return trimTrailingSlash(parsed.origin) === trustedOrigin;
  } catch {
    return false;
  }
};

const isMutationMethod = (method: string): boolean => {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
};

const hasAuthCookie = (cookieHeader: string | null): boolean => {
  if (!cookieHeader || cookieHeader.length === 0) {
    return false;
  }

  const cookies = cookieHeader.split(';').map((entry) => entry.trim());
  return cookies.some(
    (cookie) =>
      cookie.startsWith(`${ACCESS_TOKEN_COOKIE}=`) ||
      cookie.startsWith(`${ID_TOKEN_COOKIE}=`) ||
      cookie.startsWith(`${REFRESH_TOKEN_COOKIE}=`)
  );
};

export const shouldEnforceCsrf = (request: Request): boolean => {
  if (!isMutationMethod(request.method)) {
    return false;
  }

  return hasAuthCookie(request.headers.get('cookie'));
};

export const enforceSameOriginForMutation = (c: Context): Response | null => {
  if (!shouldEnforceCsrf(c.req.raw)) {
    return null;
  }

  const origin = c.req.header('origin') ?? null;
  const referer = c.req.header('referer') ?? null;

  if (origin && !sameOrigin(origin)) {
    return c.json({ error: 'Blocked by CSRF protection' }, 403);
  }

  if (!origin && referer && !sameOrigin(referer)) {
    return c.json({ error: 'Blocked by CSRF protection' }, 403);
  }

  return null;
};
