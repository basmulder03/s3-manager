import { beforeAll, describe, expect, it } from 'bun:test';
import { resetConfigForTests } from '../config';
import { appRouter } from './router';
import type { Context } from './index';

const getErrorCode = (error: unknown): string => {
  if (typeof error === 'object' && error !== null) {
    const candidate = (error as { code?: unknown }).code;
    if (typeof candidate === 'string') {
      return candidate;
    }
  }

  return 'UNKNOWN';
};

describe('tRPC auth boundaries', () => {
  beforeAll(() => {
    process.env.SECRET_KEY = 'test-secret';
    process.env.S3_ENDPOINT = 'http://localhost:4566';
    process.env.S3_ACCESS_KEY = 'test';
    process.env.S3_SECRET_KEY = 'test';
    process.env.S3_REGION = 'us-east-1';
    process.env.NODE_ENV = 'test';
    process.env.LOCAL_DEV_MODE = 'false';
    process.env.AUTH_REQUIRED = 'true';

    resetConfigForTests();
  });

  it('returns UNAUTHORIZED for protected procedure without user', async () => {
    const caller = appRouter.createCaller({
      req: new Request('http://localhost:3000/trpc/auth.me'),
      actor: 'anonymous',
      user: null,
      permissions: [],
    } as Context);

    try {
      await caller.auth.me();
      throw new Error('Expected auth.me to throw');
    } catch (error) {
      expect(getErrorCode(error)).toBe('UNAUTHORIZED');
    }
  });

  it('returns FORBIDDEN when user lacks delete permission', async () => {
    const caller = appRouter.createCaller({
      req: new Request('http://localhost:3000/trpc/s3.deleteObject'),
      actor: 'viewer@example.com',
      user: {
        id: 'user-1',
        email: 'viewer@example.com',
        name: 'Viewer',
        roles: ['S3-Viewer'],
        permissions: ['view'],
        provider: 'keycloak',
        token: 'token',
      },
      permissions: ['view'],
    } as Context);

    try {
      await caller.s3.deleteObject({
        bucketName: 'my-bucket',
        objectKey: 'file.txt',
      });
      throw new Error('Expected s3.deleteObject to throw');
    } catch (error) {
      expect(getErrorCode(error)).toBe('FORBIDDEN');
    }
  });
});
