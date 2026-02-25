import { beforeAll, describe, expect, it } from 'bun:test';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

const getCookieHeader = (setCookieHeaders: string[]): string => {
  return setCookieHeaders
    .map((entry) => entry.split(';')[0])
    .join('; ');
};

describe('auth http flow', () => {
  beforeAll(() => {
    process.env.SECRET_KEY = 'test-secret';
    process.env.S3_ENDPOINT = 'http://localhost:4566';
    process.env.S3_ACCESS_KEY = 'test';
    process.env.S3_SECRET_KEY = 'test';
    process.env.S3_REGION = 'us-east-1';
    process.env.NODE_ENV = 'test';
    process.env.LOCAL_DEV_MODE = 'false';
    process.env.AUTH_REQUIRED = 'true';
    process.env.OIDC_PROVIDER = 'keycloak';
    process.env.KEYCLOAK_SERVER_URL = 'http://127.0.0.1:4101';
    process.env.KEYCLOAK_REALM = 'test-realm';
    process.env.KEYCLOAK_CLIENT_ID = 'test-client';
    process.env.KEYCLOAK_CLIENT_SECRET = 'test-secret';
    process.env.KEYCLOAK_SCOPES = 'openid profile email';
  });

  it('handles login callback refresh and user resolution', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    const issuer = 'http://127.0.0.1:4101/realms/test-realm';
    const audience = 'test-client';

    const signAccessToken = async (subject: string): Promise<string> => {
      return new SignJWT({
        email: 'alice@example.com',
        name: 'Alice',
        roles: ['S3-Admin'],
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'kid-1' })
        .setIssuer(issuer)
        .setAudience(audience)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(privateKey);
    };

    const firstAccessToken = await signAccessToken('user-1');
    const refreshedAccessToken = await signAccessToken('user-1');

    const oidcServer = Bun.serve({
      port: 4101,
      fetch: async (request) => {
        const url = new URL(request.url);

        if (url.pathname === '/realms/test-realm/.well-known/openid-configuration') {
          return Response.json({
            authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
            token_endpoint: `${issuer}/protocol/openid-connect/token`,
            jwks_uri: `${issuer}/protocol/openid-connect/certs`,
            end_session_endpoint: `${issuer}/protocol/openid-connect/logout`,
          });
        }

        if (url.pathname === '/realms/test-realm/protocol/openid-connect/token') {
          const body = await request.text();

          if (body.includes('grant_type=authorization_code')) {
            return Response.json({
              access_token: firstAccessToken,
              id_token: 'id-token-1',
              refresh_token: 'refresh-token-1',
              expires_in: 900,
            });
          }

          if (body.includes('grant_type=refresh_token')) {
            return Response.json({
              access_token: refreshedAccessToken,
              id_token: 'id-token-2',
              refresh_token: 'refresh-token-2',
              expires_in: 900,
            });
          }

          return new Response('unsupported_grant_type', { status: 400 });
        }

        if (url.pathname === '/realms/test-realm/protocol/openid-connect/certs') {
          return Response.json({
            keys: [{ ...publicJwk, kid: 'kid-1', use: 'sig', alg: 'RS256' }],
          });
        }

        if (url.pathname === '/realms/test-realm/protocol/openid-connect/logout') {
          return new Response(null, { status: 302, headers: { location: '/' } });
        }

        return new Response('not-found', { status: 404 });
      },
    });

    try {
      const { createApp } = await import('../app');
      const app = createApp();

      const loginResponse = await app.request('http://localhost:3000/auth/login?returnTo=%2Fdashboard');
      expect(loginResponse.status).toBe(302);

      const loginLocation = loginResponse.headers.get('location');
      expect(loginLocation).toBeTruthy();
      const loginUrl = new URL(loginLocation!);
      const state = loginUrl.searchParams.get('state');
      expect(state).toBeTruthy();

      const callbackResponse = await app.request(`http://localhost:3000/auth/callback?state=${state!}&code=sample-code`);
      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get('location')).toBe('/dashboard');

      const callbackSetCookie = callbackResponse.headers.getSetCookie();
      expect(callbackSetCookie.length).toBeGreaterThanOrEqual(3);
      const cookieHeader = getCookieHeader(callbackSetCookie);

      const userResponse = await app.request('http://localhost:3000/auth/user', {
        headers: {
          cookie: cookieHeader,
        },
      });

      expect(userResponse.status).toBe(200);
      const userJson = await userResponse.json();
      expect(userJson.authenticated).toBe(true);
      expect(userJson.user.email).toBe('alice@example.com');
      expect(userJson.user.permissions).toContain('view');
      expect(userJson.user.permissions).toContain('write');
      expect(userJson.user.permissions).toContain('delete');

      const refreshResponse = await app.request('http://localhost:3000/auth/refresh', {
        method: 'POST',
        headers: {
          cookie: cookieHeader,
        },
      });

      expect(refreshResponse.status).toBe(200);
      const refreshJson = await refreshResponse.json();
      expect(refreshJson.refreshed).toBe(true);

      const refreshSetCookie = refreshResponse.headers.getSetCookie();
      expect(refreshSetCookie.some((entry) => entry.startsWith('s3_access_token='))).toBeTrue();
      expect(refreshSetCookie.some((entry) => entry.startsWith('s3_refresh_token='))).toBeTrue();
    } finally {
      oidcServer.stop(true);
    }
  }, 60000);
});
