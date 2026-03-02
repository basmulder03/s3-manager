import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
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
import { cookieBaseOptions, clearAuthCookies } from './cookies';
import { resolveReturnTo, getCallbackPath } from './utils';

const authLogger = () => getLogger('Auth');

/**
 * Handler for GET /api/auth/login
 * Initiates the OIDC login flow by redirecting to the authorization server
 */
export const handleLogin = async (c: Context) => {
  const returnTo = resolveReturnTo(c.req.query('returnTo'));

  if (config.localDevMode) {
    return c.redirect(returnTo);
  }

  try {
    const callbackPath = getCallbackPath();
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
};

/**
 * Handler for GET /api/auth/callback (or custom configured path)
 * Handles the OIDC callback, exchanges the authorization code for tokens,
 * and sets authentication cookies
 */
export const handleCallback = async (c: Context) => {
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
    const callbackPath = getCallbackPath();
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
};

/**
 * Handler for GET /api/auth/logout
 * Returns a 405 error, requiring POST method instead
 */
export const handleLogoutGet = async (c: Context) => {
  return c.json(
    {
      error: 'Use POST /api/auth/logout',
    },
    405
  );
};

/**
 * Handler for POST /api/auth/logout
 * Logs out the user by revoking tokens and clearing cookies
 * Returns a logout URL for the client to redirect to
 */
export const handleLogoutPost = async (c: Context) => {
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
};

/**
 * Handler for GET /api/auth/user
 * Returns the current authenticated user's information
 */
export const handleGetUser = async (c: Context) => {
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
};

/**
 * Handler for POST /api/auth/refresh
 * Refreshes the access token using the refresh token
 */
export const handleRefresh = async (c: Context) => {
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
};
