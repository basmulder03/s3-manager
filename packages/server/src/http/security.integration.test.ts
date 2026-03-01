import { beforeEach, describe, expect, it } from 'bun:test';

const setBaseEnv = (): void => {
  process.env.SECRET_KEY = 'test-secret';
  process.env.S3_SOURCE_0_ID = 'test';
  process.env.S3_SOURCE_0_ENDPOINT = 'http://localhost:4566';
  process.env.S3_SOURCE_0_ACCESS_KEY = 'test';
  process.env.S3_SOURCE_0_SECRET_KEY = 'test';
  process.env.S3_SOURCE_0_REGION = 'us-east-1';
  process.env.S3_SOURCE_0_USE_SSL = 'false';
  process.env.S3_SOURCE_0_VERIFY_SSL = 'false';
  process.env.NODE_ENV = 'test';
  process.env.WEB_ORIGIN = 'http://localhost:5173';
  process.env.OIDC_PROVIDER = 'keycloak';
  process.env.KEYCLOAK_SERVER_URL = 'http://127.0.0.1:4101';
  process.env.KEYCLOAK_REALM = 'test-realm';
  process.env.KEYCLOAK_CLIENT_ID = 'test-client';
  process.env.KEYCLOAK_CLIENT_SECRET = 'test-secret';
  process.env.KEYCLOAK_SCOPES = 'openid profile email';
};

describe('security hardening', () => {
  beforeEach(async () => {
    setBaseEnv();
    const { resetConfigForTests } = await import('../config');
    resetConfigForTests();
  });

  it('blocks CSRF for cookie-authenticated mutations', async () => {
    process.env.LOCAL_DEV_MODE = 'false';
    process.env.AUTH_REQUIRED = 'true';

    const { createApp } = await import('../app');
    const app = createApp();

    const response = await app.request('http://localhost:3000/auth/refresh', {
      method: 'POST',
      headers: {
        cookie: 's3_refresh_token=test-refresh-token',
        origin: 'http://evil.example',
      },
    });

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.error).toBe('Blocked by CSRF protection');
  });
});
