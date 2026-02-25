import { afterEach, describe, expect, it } from 'bun:test';
import type { UploadClientProcedures } from './upload-client-helper';
import { uploadObjectWithCookbook } from './upload-client-helper';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const createFile = (sizeBytes: number, contentType = 'application/octet-stream'): File => {
  return new File([new Uint8Array(sizeBytes)], 'demo.bin', { type: contentType });
};

describe('uploadObjectWithCookbook', () => {
  it('uses direct upload for small files', async () => {
    const calls: string[] = [];

    const client: UploadClientProcedures = {
      async uploadCookbook() {
        return {
          directUpload: {
            purpose: 'direct',
            trpcProcedure: 's3.createPresignedUpload',
            request: {
              bucketName: 'bucket',
              objectKey: 'small.bin',
              contentType: 'application/octet-stream',
              metadata: {},
            },
            responseFields: ['uploadUrl', 'requiredHeaders'],
            browserRequest: {
              method: 'PUT',
              url: 'uploadUrl',
              headersSource: 'requiredHeaders',
              body: 'file/blob',
            },
            successCriteria: ['ok'],
          },
          multipartUpload: {
            purpose: 'multipart',
            partSizeBytes: 8 * 1024 * 1024,
            estimatedPartCount: 1,
            sequence: [],
            constraints: [],
          },
        };
      },
      async createPresignedUpload() {
        calls.push('createPresignedUpload');
        return {
          uploadUrl: 'https://example.invalid/direct',
          key: 'small.bin',
          expiresInSeconds: 900,
          requiredHeaders: {
            'Content-Type': 'application/octet-stream',
          },
        };
      },
      async initiateMultipartUpload() {
        throw new Error('not expected');
      },
      async createMultipartPartUploadUrl() {
        throw new Error('not expected');
      },
      async completeMultipartUpload() {
        throw new Error('not expected');
      },
      async abortMultipartUpload() {
        throw new Error('not expected');
      },
    };

    globalThis.fetch = (async () => {
      calls.push('fetch-direct');
      return new Response(null, { status: 200, headers: { ETag: '"etag-direct"' } });
    }) as typeof fetch;

    const result = await uploadObjectWithCookbook({
      client,
      bucketName: 'bucket',
      objectKey: 'small.bin',
      file: createFile(1024),
      contentType: 'application/octet-stream',
      multipartThresholdBytes: 2048,
    });

    expect(result.strategy).toBe('direct');
    expect(calls).toEqual(['createPresignedUpload', 'fetch-direct']);
  });

  it('uses multipart upload for large files', async () => {
    const calls: string[] = [];

    const client: UploadClientProcedures = {
      async uploadCookbook() {
        return {
          directUpload: {
            purpose: 'direct',
            trpcProcedure: 's3.createPresignedUpload',
            request: {
              bucketName: 'bucket',
              objectKey: 'large.bin',
              contentType: 'application/octet-stream',
              metadata: {},
            },
            responseFields: ['uploadUrl', 'requiredHeaders'],
            browserRequest: {
              method: 'PUT',
              url: 'uploadUrl',
              headersSource: 'requiredHeaders',
              body: 'file/blob',
            },
            successCriteria: ['ok'],
          },
          multipartUpload: {
            purpose: 'multipart',
            partSizeBytes: 5 * 1024 * 1024,
            estimatedPartCount: 2,
            sequence: [],
            constraints: [],
          },
        };
      },
      async createPresignedUpload() {
        throw new Error('not expected');
      },
      async initiateMultipartUpload() {
        calls.push('initiateMultipartUpload');
        return { uploadId: 'upload-123', key: 'large.bin' };
      },
      async createMultipartPartUploadUrl(input) {
        calls.push(`createMultipartPartUploadUrl:${input.partNumber}`);
        return {
          uploadUrl: `https://example.invalid/part-${input.partNumber}`,
          partNumber: input.partNumber,
          expiresInSeconds: 900,
        };
      },
      async completeMultipartUpload(input) {
        calls.push(`completeMultipartUpload:${input.parts.length}`);
        return {
          key: 'large.bin',
          etag: '"etag-complete"',
          location: 's3://bucket/large.bin',
        };
      },
      async abortMultipartUpload() {
        calls.push('abortMultipartUpload');
        return { success: true };
      },
    };

    globalThis.fetch = (async (input: string | URL | Request) => {
      calls.push(`fetch-part:${String(input)}`);
      return new Response(null, {
        status: 200,
        headers: {
          ETag: '"etag-part"',
        },
      });
    }) as typeof fetch;

    const result = await uploadObjectWithCookbook({
      client,
      bucketName: 'bucket',
      objectKey: 'large.bin',
      file: createFile(6 * 1024 * 1024),
      contentType: 'application/octet-stream',
      multipartThresholdBytes: 1024,
    });

    expect(result.strategy).toBe('multipart');
    expect(calls).toEqual([
      'initiateMultipartUpload',
      'createMultipartPartUploadUrl:1',
      'fetch-part:https://example.invalid/part-1',
      'createMultipartPartUploadUrl:2',
      'fetch-part:https://example.invalid/part-2',
      'completeMultipartUpload:2',
    ]);
  });
});
