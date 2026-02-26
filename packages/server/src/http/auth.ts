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

const clearAuthCookies = (c: Context): void => {
  deleteCookie(c, ACCESS_TOKEN_COOKIE, { path: '/' });
  deleteCookie(c, ID_TOKEN_COOKIE, { path: '/' });
  deleteCookie(c, REFRESH_TOKEN_COOKIE, { path: '/' });
};

export const registerAuthHttpRoutes = (app: Hono): void => {
  app.get('/auth/login', async (c) => {
    const returnTo = c.req.query('returnTo') || '/';

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
    const returnTo = c.req.query('returnTo') || '/';
    const accessToken = getCookie(c, ACCESS_TOKEN_COOKIE);
    const refreshToken = getCookie(c, REFRESH_TOKEN_COOKIE);
    const idToken = getCookie(c, ID_TOKEN_COOKIE);

    if (config.localDevMode) {
      clearAuthCookies(c);
      return c.redirect(returnTo);
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
        postLogoutRedirectUri: new URL(returnTo, c.req.url).toString(),
        idTokenHint: idToken,
      });

      clearAuthCookies(c);

      if (logoutUrl) {
        return c.redirect(logoutUrl);
      }

      return c.redirect(returnTo);
    } catch (error) {
      authLogger().warn({ err: error }, 'Failed to build provider logout URL, using local logout');
      clearAuthCookies(c);
      return c.redirect(returnTo);
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
    const user = await resolveAuthUser(c.req.raw);
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!config.pim.enabled) {
      return c.json({ error: 'PIM is not enabled' }, 400);
    }

    if (config.oidcProvider !== 'azure' && config.oidcProvider !== 'azuread') {
      return c.json({ error: 'PIM is only available with Azure AD' }, 400);
    }

    let requestedRole = '';
    try {
      const body = await c.req.json<{ role?: string }>();
      requestedRole = body.role?.trim() ?? '';
    } catch {
      return c.json({ error: 'Invalid request body' }, 400);
    }

    if (requestedRole.length === 0) {
      return c.json({ error: 'Role is required' }, 400);
    }

    return c.json({
      message: 'PIM elevation request submitted',
      role: requestedRole,
      status: 'pending',
    });
  });
};
