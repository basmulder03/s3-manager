import type { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { config } from '@/config';
import { getLogger } from '@/telemetry';
import {
  ACCESS_TOKEN_COOKIE,
  ID_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  resolveAuthUser,
} from '@/auth/context';
import {
  buildAuthorizationUrl,
  buildLogoutUrl,
  exchangeAuthorizationCode,
  refreshAccessToken,
  revokeToken,
} from '@/auth/oidc';
import { createAuthState, consumeAuthState } from '@/auth/state';
import { enforceSameOriginForMutation } from '@/http/csrf';
import {
  deactivateElevation,
  getElevationRequestStatus,
  isElevationError,
  listElevationEntitlements,
  submitElevationRequest,
} from '@/auth/elevation';

const authLogger = () => getLogger('Auth');

const cookieBaseOptions = {
  path: '/',
  httpOnly: true,
  secure: config.session.cookieSecure,
  sameSite: config.session.cookieSameSite.toLowerCase() as 'strict' | 'lax' | 'none',
};

const callbackPath = config.oidcRedirectPath.startsWith('/')
  ? config.oidcRedirectPath
  : `/${config.oidcRedirectPath}`;
const elevationRateLimit = new Map<string, { timestamps: number[]; lastSeenAt: number }>();
const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const pruneElevationRateLimit = (now: number): void => {
  const staleAfterMs = Math.max(config.pim.rateLimitWindowMs * 3, 5 * 60 * 1000);

  for (const [key, entry] of elevationRateLimit.entries()) {
    if (now - entry.lastSeenAt > staleAfterMs) {
      elevationRateLimit.delete(key);
    }
  }
};

const resolveClientIp = (c: Context): string => {
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

const enforceElevationRateLimit = (c: Context, userId: string, route: string): Response | null => {
  const now = Date.now();
  pruneElevationRateLimit(now);

  const clientIp = resolveClientIp(c);
  const key = `${route}:${userId}:${clientIp}`;
  const existing = elevationRateLimit.get(key)?.timestamps ?? [];
  const recent = existing.filter((timestamp) => now - timestamp <= config.pim.rateLimitWindowMs);

  if (recent.length >= config.pim.rateLimitMaxRequests) {
    const earliest = recent[0] ?? now;
    const retryAfterMs = Math.max(1_000, config.pim.rateLimitWindowMs - (now - earliest));
    return c.json(
      {
        error: 'Too many elevation requests. Please retry shortly.',
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      },
      429
    );
  }

  recent.push(now);
  elevationRateLimit.set(key, {
    timestamps: recent,
    lastSeenAt: now,
  });

  return null;
};

const resolveReturnTo = (rawReturnTo: string | undefined): string => {
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

const clearAuthCookies = (c: Context): void => {
  deleteCookie(c, ACCESS_TOKEN_COOKIE, { path: '/' });
  deleteCookie(c, ID_TOKEN_COOKIE, { path: '/' });
  deleteCookie(c, REFRESH_TOKEN_COOKIE, { path: '/' });
};

export const registerAuthHttpRoutes = (app: Hono): void => {
  app.get('/auth/login', async (c) => {
    const returnTo = resolveReturnTo(c.req.query('returnTo'));

    if (config.localDevMode) {
      return c.redirect(returnTo);
    }

    try {
      const redirectUri = new URL(callbackPath, c.req.url).toString();
      const stateRecord = createAuthState(returnTo);

      const authorizationUrl = await buildAuthorizationUrl({
        redirectUri,
        state: stateRecord.state,
        nonce: stateRecord.nonce,
        codeChallenge: stateRecord.codeChallenge,
      });

      return c.redirect(authorizationUrl);
    } catch (error) {
      authLogger().error({ err: error }, 'Failed to initialize OIDC login flow');
      return c.json({ error: 'Failed to initialize login flow' }, 500);
    }
  });

  app.get(callbackPath, async (c) => {
    const state = c.req.query('state') || '';
    const code = c.req.query('code') || '';
    const oauthError = c.req.query('error');
    const oauthErrorDescription = c.req.query('error_description');

    if (oauthError) {
      authLogger().warn(
        {
          error: oauthError,
          description: oauthErrorDescription,
        },
        'OIDC callback returned provider error'
      );
      return c.json(
        {
          error: oauthErrorDescription || oauthError,
        },
        400
      );
    }

    if (!state || !code) {
      return c.json({ error: 'Missing state or code' }, 400);
    }

    const authState = consumeAuthState(state);
    if (!authState) {
      return c.json({ error: 'Invalid or expired authentication state' }, 400);
    }

    try {
      const redirectUri = new URL(callbackPath, c.req.url).toString();
      const tokenResult = await exchangeAuthorizationCode({
        code,
        redirectUri,
        codeVerifier: authState.codeVerifier,
      });

      setCookie(c, ACCESS_TOKEN_COOKIE, tokenResult.access_token, {
        ...cookieBaseOptions,
        maxAge: Math.min(
          tokenResult.expires_in ?? config.auth.accessTokenCookieMaxAgeSeconds,
          config.auth.accessTokenCookieMaxAgeSeconds
        ),
      });

      if (tokenResult.id_token) {
        setCookie(c, ID_TOKEN_COOKIE, tokenResult.id_token, {
          ...cookieBaseOptions,
          maxAge: Math.min(
            tokenResult.expires_in ?? config.auth.accessTokenCookieMaxAgeSeconds,
            config.auth.accessTokenCookieMaxAgeSeconds
          ),
        });
      }

      if (tokenResult.refresh_token) {
        setCookie(c, REFRESH_TOKEN_COOKIE, tokenResult.refresh_token, {
          ...cookieBaseOptions,
          maxAge: config.auth.refreshTokenCookieMaxAgeSeconds,
        });
      }

      authLogger().info('OIDC login flow completed successfully');
      return c.redirect(authState.returnTo || '/');
    } catch (error) {
      authLogger().error({ err: error }, 'Failed to process OIDC callback');
      return c.json({ error: 'Failed to process authentication callback' }, 500);
    }
  });

  app.get('/auth/logout', async (c) => {
    return c.json(
      {
        error: 'Use POST /auth/logout',
      },
      405
    );
  });

  app.post('/auth/logout', async (c) => {
    const returnTo = resolveReturnTo(c.req.query('returnTo'));
    const accessToken = getCookie(c, ACCESS_TOKEN_COOKIE);
    const refreshToken = getCookie(c, REFRESH_TOKEN_COOKIE);
    const idToken = getCookie(c, ID_TOKEN_COOKIE);

    if (config.localDevMode) {
      clearAuthCookies(c);
      return c.json({
        logoutUrl: returnTo,
      });
    }

    try {
      if (config.auth.revokeOnLogout && accessToken) {
        await revokeToken({
          token: accessToken,
          tokenTypeHint: 'access_token',
        });
      }

      if (config.auth.revokeOnLogout && refreshToken) {
        await revokeToken({
          token: refreshToken,
          tokenTypeHint: 'refresh_token',
        });
      }

      const logoutUrl = await buildLogoutUrl({
        postLogoutRedirectUri: returnTo,
        idTokenHint: idToken,
      });

      clearAuthCookies(c);

      return c.json({
        logoutUrl: logoutUrl || returnTo,
      });
    } catch (error) {
      authLogger().warn({ err: error }, 'Failed to build provider logout URL, using local logout');
      clearAuthCookies(c);
      return c.json({
        logoutUrl: returnTo,
      });
    }
  });

  app.get('/auth/user', async (c) => {
    const user = await resolveAuthUser(c.req.raw);
    if (!user) {
      return c.json(
        {
          authenticated: false,
          user: null,
        },
        401
      );
    }

    return c.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        permissions: user.permissions,
        elevationSources: user.elevationSources,
        provider: user.provider,
      },
    });
  });

  app.post('/auth/refresh', async (c) => {
    if (config.localDevMode) {
      return c.json({
        refreshed: true,
        localDevMode: true,
      });
    }

    const refreshToken = getCookie(c, REFRESH_TOKEN_COOKIE);
    if (!refreshToken) {
      clearAuthCookies(c);
      return c.json({ error: 'Refresh token not available' }, 401);
    }

    try {
      const tokenResult = await refreshAccessToken({
        refreshToken,
      });

      setCookie(c, ACCESS_TOKEN_COOKIE, tokenResult.access_token, {
        ...cookieBaseOptions,
        maxAge: Math.min(
          tokenResult.expires_in ?? config.auth.accessTokenCookieMaxAgeSeconds,
          config.auth.accessTokenCookieMaxAgeSeconds
        ),
      });

      if (tokenResult.id_token) {
        setCookie(c, ID_TOKEN_COOKIE, tokenResult.id_token, {
          ...cookieBaseOptions,
          maxAge: Math.min(
            tokenResult.expires_in ?? config.auth.accessTokenCookieMaxAgeSeconds,
            config.auth.accessTokenCookieMaxAgeSeconds
          ),
        });
      }

      if (tokenResult.refresh_token) {
        setCookie(c, REFRESH_TOKEN_COOKIE, tokenResult.refresh_token, {
          ...cookieBaseOptions,
          maxAge: config.auth.refreshTokenCookieMaxAgeSeconds,
        });
      }

      return c.json({
        refreshed: true,
        expiresInSeconds: Math.min(
          tokenResult.expires_in ?? config.auth.accessTokenCookieMaxAgeSeconds,
          config.auth.accessTokenCookieMaxAgeSeconds
        ),
      });
    } catch (error) {
      authLogger().warn({ err: error }, 'Token refresh failed');
      clearAuthCookies(c);
      return c.json({ error: 'Failed to refresh token' }, 401);
    }
  });

  app.post('/auth/pim/elevate', async (c) => {
    const csrfFailure = enforceSameOriginForMutation(c);
    if (csrfFailure) {
      return csrfFailure;
    }

    const user = await resolveAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const rateLimited = enforceElevationRateLimit(c, user.id, '/auth/pim/elevate');
    if (rateLimited) {
      return rateLimited;
    }

    let entitlementKey = '';
    let justification = '';
    let durationMinutes: number | undefined;
    try {
      const body = await c.req.json<{
        role?: string;
        justification?: string;
        durationMinutes?: number;
      }>();
      entitlementKey = body.role?.trim() ?? '';
      justification = body.justification?.trim() ?? '';
      durationMinutes = body.durationMinutes;
    } catch {
      return c.json({ error: 'Invalid request body' }, 400);
    }

    if (!entitlementKey) {
      return c.json({ error: 'Role is required' }, 400);
    }

    try {
      const request = await submitElevationRequest({
        user,
        entitlementKey,
        justification,
        durationMinutes,
      });

      return c.json({
        message: 'Elevation request submitted',
        request,
      });
    } catch (error) {
      if (isElevationError(error)) {
        return c.json({ error: error.message }, error.status as never);
      }

      authLogger().error({ err: error }, 'Failed to submit legacy elevation request');
      return c.json({ error: 'Failed to submit elevation request' }, 500);
    }
  });

  app.get('/auth/elevation/entitlements', async (c) => {
    const user = await resolveAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    try {
      const entitlements = listElevationEntitlements();
      return c.json({
        entitlements,
      });
    } catch (error) {
      if (isElevationError(error)) {
        return c.json({ error: error.message }, error.status as never);
      }

      authLogger().error({ err: error }, 'Failed to list elevation entitlements');
      return c.json({ error: 'Failed to load elevation entitlements' }, 500);
    }
  });

  app.post('/auth/elevation/request', async (c) => {
    const csrfFailure = enforceSameOriginForMutation(c);
    if (csrfFailure) {
      return csrfFailure;
    }

    const user = await resolveAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const rateLimited = enforceElevationRateLimit(c, user.id, '/auth/elevation/request');
    if (rateLimited) {
      return rateLimited;
    }

    let entitlementKey = '';
    let justification = '';
    let durationMinutes: number | undefined;
    try {
      const body = await c.req.json<{
        entitlementKey?: string;
        justification?: string;
        durationMinutes?: number;
      }>();
      entitlementKey = body.entitlementKey?.trim() ?? '';
      justification = body.justification?.trim() ?? '';
      durationMinutes = body.durationMinutes;
    } catch {
      return c.json({ error: 'Invalid request body' }, 400);
    }

    if (!entitlementKey) {
      return c.json({ error: 'entitlementKey is required' }, 400);
    }

    try {
      const request = await submitElevationRequest({
        user,
        entitlementKey,
        justification,
        durationMinutes,
      });

      return c.json({
        request,
      });
    } catch (error) {
      if (isElevationError(error)) {
        return c.json({ error: error.message }, error.status as never);
      }

      authLogger().error({ err: error }, 'Failed to submit elevation request');
      return c.json({ error: 'Failed to submit elevation request' }, 500);
    }
  });

  app.get('/auth/elevation/status/:requestId', async (c) => {
    const user = await resolveAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const requestId = c.req.param('requestId')?.trim() ?? '';
    if (!requestId) {
      return c.json({ error: 'requestId is required' }, 400);
    }

    try {
      const request = await getElevationRequestStatus({
        user,
        requestId,
      });

      return c.json({ request });
    } catch (error) {
      if (isElevationError(error)) {
        return c.json({ error: error.message }, error.status as never);
      }

      authLogger().error({ err: error }, 'Failed to fetch elevation request status');
      return c.json({ error: 'Failed to fetch elevation request status' }, 500);
    }
  });

  app.post('/auth/elevation/deactivate', async (c) => {
    const csrfFailure = enforceSameOriginForMutation(c);
    if (csrfFailure) {
      return csrfFailure;
    }

    const user = await resolveAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const rateLimited = enforceElevationRateLimit(c, user.id, '/auth/elevation/deactivate');
    if (rateLimited) {
      return rateLimited;
    }

    let entitlementKey = '';
    try {
      const body = await c.req.json<{ entitlementKey?: string }>();
      entitlementKey = body.entitlementKey?.trim() ?? '';
    } catch {
      return c.json({ error: 'Invalid request body' }, 400);
    }

    if (!entitlementKey) {
      return c.json({ error: 'entitlementKey is required' }, 400);
    }

    try {
      const result = await deactivateElevation({
        user,
        entitlementKey,
      });
      return c.json(result);
    } catch (error) {
      if (isElevationError(error)) {
        return c.json({ error: error.message }, error.status as never);
      }

      authLogger().error({ err: error }, 'Failed to deactivate elevation');
      return c.json({ error: 'Failed to deactivate elevation' }, 500);
    }
  });
};
