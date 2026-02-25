import { describe, expect, it } from 'bun:test';
import { S3ServiceError } from '@/services/s3/errors';
import { mapS3ErrorToTrpc } from '@/routers/s3';

describe('mapS3ErrorToTrpc', () => {
  it('maps missing object/bucket errors to NOT_FOUND', () => {
    const trpcError = mapS3ErrorToTrpc(new S3ServiceError('missing', 'NoSuchKey'));
    expect(trpcError.code).toBe('NOT_FOUND');
  });

  it('maps invalid path to BAD_REQUEST', () => {
    const trpcError = mapS3ErrorToTrpc(new S3ServiceError('bad path', 'INVALID_PATH'));
    expect(trpcError.code).toBe('BAD_REQUEST');
  });

  it('maps unknown failures to INTERNAL_SERVER_ERROR', () => {
    const trpcError = mapS3ErrorToTrpc(new Error('boom'));
    expect(trpcError.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
