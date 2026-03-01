import { beforeAll, describe, expect, it } from 'bun:test';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { resetConfigForTests } from '../config';
import { resetElevationStoreForTests } from '../auth/elevation';

describe('auth elevation endpoints', () => {
  beforeAll(() => {
    process.env.SECRET_KEY = 'test-secret';
    process.env.S3_SOURCE_0_ID = 'test';
    process.env.S3_SOURCE_0_ENDPOINT = 'http://localhost:4566';
    process.env.S3_SOURCE_0_ACCESS_KEY = 'test';
    process.env.S3_SOURCE_0_SECRET_KEY = 'test';
    process.env.S3_SOURCE_0_REGION = 'us-east-1';
    process.env.S3_SOURCE_0_USE_SSL = 'false';
    process.env.S3_SOURCE_0_VERIFY_SSL = 'false';
    process.env.NODE_ENV = 'test';
    process.env.LOCAL_DEV_MODE = 'false';
    process.env.AUTH_REQUIRED = 'true';

    process.env.OIDC_PROVIDER = 'azure';
    process.env.AZURE_AD_TENANT_ID = 'test-tenant';
    process.env.AZURE_AD_CLIENT_ID = 'test-client';
    process.env.AZURE_AD_CLIENT_SECRET = 'test-secret';
    process.env.AUTH_ISSUER = 'http://127.0.0.1:4201/issuer';
    process.env.AUTH_AUDIENCE = 'test-client';
    process.env.AUTH_GROUPS_CLAIM = 'groups';

    process.env.PIM_ENABLED = 'true';
    process.env.PIM_AZURE_ASSIGNMENT_SCHEDULE_REQUEST_API =
      'http://127.0.0.1:4201/graph/assignmentScheduleRequests';
    process.env.PIM_AZURE_ELIGIBILITY_SCHEDULE_API =
      'http://127.0.0.1:4201/graph/eligibilityScheduleInstances';

    process.env.ELEVATION_0_KEY = 'property-admin-temp';
    process.env.ELEVATION_0_PROVIDER = 'azure';
    process.env.ELEVATION_0_TARGET = 'group-123';
    process.env.ELEVATION_0_PERMISSION_BUNDLE = 'view,write,manage_properties';
    process.env.ELEVATION_0_MAX_DURATION_MINUTES = '60';
    process.env.ELEVATION_0_REQUIRE_JUSTIFICATION = 'true';
  });

  it('lists entitlements, submits request, and returns status', async () => {
    resetConfigForTests();
    resetElevationStoreForTests();

    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    const issuer = 'http://127.0.0.1:4201/issuer';
    const audience = 'test-client';

    const accessToken = await new SignJWT({
      email: 'alice@example.com',
      name: 'Alice',
      roles: ['S3-Viewer'],
      groups: ['group-123'],
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'kid-1' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);

    const server = Bun.serve({
      port: 4201,
      fetch: async (request) => {
        const url = new URL(request.url);

        if (url.pathname === '/issuer/.well-known/openid-configuration') {
          return Response.json({
            authorization_endpoint: `${issuer}/oauth2/v2.0/authorize`,
            token_endpoint: `${issuer}/oauth2/v2.0/token`,
            jwks_uri: `${issuer}/discovery/keys`,
          });
        }

        if (url.pathname === '/issuer/discovery/keys') {
          return Response.json({
            keys: [{ ...publicJwk, kid: 'kid-1', use: 'sig', alg: 'RS256' }],
          });
        }

        if (url.pathname === '/graph/eligibilityScheduleInstances') {
          const filter = url.searchParams.get('$filter') ?? '';
          if (
            filter.includes("principalId eq 'user-1'") &&
            filter.includes("groupId eq 'group-123'")
          ) {
            return Response.json({
              value: [{ id: 'eligible-1' }],
            });
          }

          return Response.json({ value: [] });
        }

        if (url.pathname === '/graph/assignmentScheduleRequests' && request.method === 'POST') {
          return Response.json({
            id: 'req-1',
            status: 'PendingApproval',
          });
        }

        if (url.pathname === '/graph/assignmentScheduleRequests/req-1') {
          return Response.json({
            id: 'req-1',
            status: 'Granted',
            scheduleInfo: {
              expiration: {
                endDateTime: '2026-01-01T00:00:00Z',
              },
            },
          });
        }

        return new Response('not-found', { status: 404 });
      },
    });

    try {
      const { createApp } = await import('../app');
      const app = createApp();
      const cookie = `s3_access_token=${encodeURIComponent(accessToken)}`;

      const entitlementsResponse = await app.request(
        'http://localhost:3000/auth/elevation/entitlements',
        {
          headers: {
            cookie,
          },
        }
      );

      expect(entitlementsResponse.status).toBe(200);
      const entitlementsJson = await entitlementsResponse.json();
      expect(entitlementsJson.entitlements).toHaveLength(1);
      expect(entitlementsJson.entitlements[0].key).toBe('property-admin-temp');

      const userResponse = await app.request('http://localhost:3000/auth/user', {
        headers: {
          cookie,
        },
      });
      expect(userResponse.status).toBe(200);
      const userJson = await userResponse.json();
      expect(userJson.user.permissions).toContain('manage_properties');
      expect(userJson.user.elevationSources).toHaveLength(1);
      expect(userJson.user.elevationSources[0].entitlementKey).toBe('property-admin-temp');

      const missingReasonResponse = await app.request(
        'http://localhost:3000/auth/elevation/request',
        {
          method: 'POST',
          headers: {
            cookie,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            entitlementKey: 'property-admin-temp',
          }),
        }
      );
      expect(missingReasonResponse.status).toBe(400);

      const csrfResponse = await app.request('http://localhost:3000/auth/elevation/request', {
        method: 'POST',
        headers: {
          cookie,
          origin: 'https://evil.example.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          entitlementKey: 'property-admin-temp',
          justification: 'Cross-site attempt',
        }),
      });
      expect(csrfResponse.status).toBe(403);

      const requestResponse = await app.request('http://localhost:3000/auth/elevation/request', {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          entitlementKey: 'property-admin-temp',
          justification: 'Need metadata updates',
          durationMinutes: 45,
        }),
      });

      expect(requestResponse.status).toBe(200);
      const requestJson = await requestResponse.json();
      expect(requestJson.request.status).toBe('pending');
      const requestId = requestJson.request.id as string;
      expect(requestId.length).toBeGreaterThan(0);

      const statusResponse = await app.request(
        `http://localhost:3000/auth/elevation/status/${encodeURIComponent(requestId)}`,
        {
          headers: {
            cookie,
          },
        }
      );

      expect(statusResponse.status).toBe(200);
      const statusJson = await statusResponse.json();
      expect(statusJson.request.status).toBe('granted');
      expect(statusJson.request.expiresAt).toBe('2026-01-01T00:00:00Z');
    } finally {
      server.stop(true);
    }
  }, 120000);

  it('supports dev mock elevation without provider APIs', async () => {
    process.env.PIM_DEV_MOCK_ENABLED = 'true';
    process.env.OIDC_PROVIDER = 'keycloak';
    process.env.AUTH_ISSUER = 'http://127.0.0.1:4202/issuer';
    process.env.AUTH_AUDIENCE = 'test-client';
    process.env.ELEVATION_0_PROVIDER = 'azure';
    process.env.ELEVATION_0_TARGET = 'group-dev-mock-1';

    resetConfigForTests();
    resetElevationStoreForTests();

    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    const issuer = 'http://127.0.0.1:4202/issuer';

    const accessToken = await new SignJWT({
      email: 'dev@example.com',
      name: 'Dev User',
      roles: ['S3-Viewer'],
      groups: [],
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'kid-2' })
      .setIssuer(issuer)
      .setAudience('test-client')
      .setSubject('dev-user-1')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);

    const server = Bun.serve({
      port: 4202,
      fetch: async (request) => {
        const url = new URL(request.url);

        if (url.pathname === '/issuer/.well-known/openid-configuration') {
          return Response.json({
            authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
            token_endpoint: `${issuer}/protocol/openid-connect/token`,
            jwks_uri: `${issuer}/protocol/openid-connect/certs`,
          });
        }

        if (url.pathname === '/issuer/protocol/openid-connect/certs') {
          return Response.json({
            keys: [{ ...publicJwk, kid: 'kid-2', use: 'sig', alg: 'RS256' }],
          });
        }

        return new Response('not-found', { status: 404 });
      },
    });

    try {
      const { createApp } = await import('../app');
      const app = createApp();
      const cookie = `s3_access_token=${encodeURIComponent(accessToken)}`;

      const beforeUserResponse = await app.request('http://localhost:3000/auth/user', {
        headers: {
          cookie,
        },
      });
      expect(beforeUserResponse.status).toBe(200);
      const beforeUser = await beforeUserResponse.json();
      expect(beforeUser.user.permissions).not.toContain('manage_properties');

      const requestResponse = await app.request('http://localhost:3000/auth/elevation/request', {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          entitlementKey: 'property-admin-temp',
          justification: 'Dev mock flow',
        }),
      });

      expect(requestResponse.status).toBe(200);
      const requestJson = await requestResponse.json();
      expect(requestJson.request.status).toBe('granted');

      const duplicateResponse = await app.request('http://localhost:3000/auth/elevation/request', {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          entitlementKey: 'property-admin-temp',
          justification: 'Trying duplicate request',
        }),
      });
      expect(duplicateResponse.status).toBe(409);

      const afterUserResponse = await app.request('http://localhost:3000/auth/user', {
        headers: {
          cookie,
        },
      });
      expect(afterUserResponse.status).toBe(200);
      const afterUser = await afterUserResponse.json();
      expect(afterUser.user.permissions).toContain('manage_properties');
      expect(afterUser.user.elevationSources).toHaveLength(1);
      expect(afterUser.user.elevationSources[0].entitlementKey).toBe('property-admin-temp');

      const deactivateResponse = await app.request(
        'http://localhost:3000/auth/elevation/deactivate',
        {
          method: 'POST',
          headers: {
            cookie,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            entitlementKey: 'property-admin-temp',
          }),
        }
      );
      expect(deactivateResponse.status).toBe(200);

      const afterDeactivateResponse = await app.request('http://localhost:3000/auth/user', {
        headers: {
          cookie,
        },
      });
      expect(afterDeactivateResponse.status).toBe(200);
      const afterDeactivate = await afterDeactivateResponse.json();
      expect(afterDeactivate.user.permissions).not.toContain('manage_properties');
      expect(afterDeactivate.user.elevationSources).toHaveLength(0);

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const throttledProbe = await app.request(
          'http://localhost:3000/auth/elevation/deactivate',
          {
            method: 'POST',
            headers: {
              cookie,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              entitlementKey: 'property-admin-temp',
            }),
          }
        );

        if (attempt < 7) {
          expect(throttledProbe.status).toBe(404);
        } else {
          expect(throttledProbe.status).toBe(429);
        }
      }
    } finally {
      server.stop(true);
      process.env.PIM_DEV_MOCK_ENABLED = 'false';
      process.env.OIDC_PROVIDER = 'azure';
      process.env.AUTH_ISSUER = 'http://127.0.0.1:4201/issuer';
      resetConfigForTests();
      resetElevationStoreForTests();
    }
  }, 120000);
});
