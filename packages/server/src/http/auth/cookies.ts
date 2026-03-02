import type { Context } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { config } from '@/config';
import { ACCESS_TOKEN_COOKIE, ID_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/auth/context';

/**
 * Base cookie options shared across all auth cookies
 */
export const cookieBaseOptions = {
  path: '/',
  httpOnly: true,
  secure: config.session.cookieSecure,
  sameSite: config.session.cookieSameSite.toLowerCase() as 'strict' | 'lax' | 'none',
};

/**
 * Clears all authentication cookies
 */
export const clearAuthCookies = (c: Context): void => {
  deleteCookie(c, ACCESS_TOKEN_COOKIE, { path: '/' });
  deleteCookie(c, ID_TOKEN_COOKIE, { path: '/' });
  deleteCookie(c, REFRESH_TOKEN_COOKIE, { path: '/' });
};
