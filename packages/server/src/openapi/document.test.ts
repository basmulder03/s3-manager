import { describe, expect, it } from 'bun:test';
import { getOpenApiDocument } from '@/openapi/document';

describe('OpenAPI document', () => {
  it('includes generated tRPC and HTTP auth/health paths', () => {
    const document = getOpenApiDocument('http://localhost:3000');
    const paths = (document.paths ?? {}) as Record<string, unknown>;

    expect(paths['/s3/buckets']).toBeDefined();
    expect(paths['/s3/item/rename']).toBeDefined();
    expect(paths['/auth/me']).toBeDefined();
    expect(paths['/auth/login']).toBeDefined();
    expect(paths['/health']).toBeDefined();
  });
});
