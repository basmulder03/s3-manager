import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { recordS3FileAccess } from '@/telemetry/metrics';
import { S3ServiceError } from '@/services/s3/errors';
import { mapError, metricActor, normalizeEtag, toIso } from '@/services/s3/helpers';
import { resolvePathTarget } from '@/services/s3/utils/path-resolution';
import type {
  ObjectTextContentInput,
  ObjectTextContentResult,
  UpdateObjectTextContentInput,
  UpdateObjectTextContentResult,
} from '@/services/s3/types';

const MAX_TEXT_OBJECT_BYTES = 1024 * 1024;

const TEXT_CONTENT_TYPE_MARKERS = [
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'application/x-yaml',
  'application/yaml',
  'application/x-sh',
  'application/x-httpd-php',
];

const TEXT_EXTENSION_ALLOWLIST = new Set([
  '.txt',
  '.md',
  '.json',
  '.yaml',
  '.yml',
  '.csv',
  '.log',
  '.xml',
  '.html',
  '.css',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
]);

const textDecoder = new TextDecoder('utf-8', { fatal: true });

const hasAllowedTextExtension = (objectKey: string): boolean => {
  const fileName = objectKey.split('/').pop() ?? objectKey;
  const extensionIndex = fileName.lastIndexOf('.');
  if (extensionIndex <= 0) {
    return false;
  }

  return TEXT_EXTENSION_ALLOWLIST.has(fileName.slice(extensionIndex).toLowerCase());
};

const isTextContentType = (contentType: string | null | undefined): boolean => {
  if (!contentType || contentType.trim().length === 0) {
    return false;
  }

  const normalized = contentType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (normalized.startsWith('text/')) {
    return true;
  }

  return TEXT_CONTENT_TYPE_MARKERS.some((marker) => normalized === marker);
};

const canReadOrWriteAsText = (
  objectKey: string,
  contentType: string | null | undefined
): boolean => {
  return hasAllowedTextExtension(objectKey) || isTextContentType(contentType);
};

const readBodyAsBytes = async (body: unknown): Promise<Uint8Array> => {
  if (!body) {
    return new Uint8Array();
  }

  const candidate = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
    transformToString?: (encoding?: string) => Promise<string>;
  };

  if (typeof candidate.transformToByteArray === 'function') {
    return candidate.transformToByteArray();
  }

  if (typeof candidate.transformToString === 'function') {
    const text = await candidate.transformToString('utf-8');
    return new TextEncoder().encode(text);
  }

  if (body instanceof Uint8Array) {
    return body;
  }

  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value) {
        chunks.push(value);
        totalLength += value.byteLength;
      }
    }

    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return merged;
  }

  throw new S3ServiceError('Unable to read object body as bytes', 'S3_UNKNOWN_ERROR');
};

export class TextContentOperations {
  constructor(private readonly clientProvider: (sourceId: string) => S3Client) {}

  async getObjectTextContent(
    input: ObjectTextContentInput,
    actor?: string
  ): Promise<ObjectTextContentResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const target = resolvePathTarget(input.path);
      const client = this.clientProvider(target.sourceId);
      const headResponse = await client.send(
        new HeadObjectCommand({
          Bucket: target.bucketName,
          Key: target.objectKey,
        })
      );

      const size = headResponse.ContentLength ?? 0;
      const contentType = headResponse.ContentType ?? 'application/octet-stream';
      if (!canReadOrWriteAsText(target.objectKey, contentType)) {
        throw new S3ServiceError('This file type cannot be viewed as text', 'ValidationError');
      }

      if (size > MAX_TEXT_OBJECT_BYTES) {
        throw new S3ServiceError(
          `Text preview is limited to ${MAX_TEXT_OBJECT_BYTES} bytes`,
          'ValidationError'
        );
      }

      const objectResponse = await client.send(
        new GetObjectCommand({
          Bucket: target.bucketName,
          Key: target.objectKey,
        })
      );

      const bytes = await readBodyAsBytes(objectResponse.Body);
      let content = '';
      try {
        content = textDecoder.decode(bytes);
      } catch {
        throw new S3ServiceError('Object is not valid UTF-8 text', 'ValidationError');
      }

      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: target.bucketReference,
          objectKey: target.objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        path: input.path,
        content,
        size,
        contentType,
        etag: normalizeEtag(headResponse.ETag),
        lastModified: toIso(headResponse.LastModified),
      };
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'read',
          actor: safeActor,
          bucket: '*',
          objectKey: input.path,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, `Failed to fetch text content for '${input.path}'`);
    }
  }

  async updateObjectTextContent(
    input: UpdateObjectTextContentInput,
    actor?: string
  ): Promise<UpdateObjectTextContentResult> {
    const startedAt = Date.now();
    const safeActor = metricActor(actor);

    try {
      const target = resolvePathTarget(input.path);
      const client = this.clientProvider(target.sourceId);
      const headResponse = await client.send(
        new HeadObjectCommand({
          Bucket: target.bucketName,
          Key: target.objectKey,
        })
      );

      const existingContentType = headResponse.ContentType ?? 'application/octet-stream';
      if (!canReadOrWriteAsText(target.objectKey, existingContentType)) {
        throw new S3ServiceError('This file type cannot be edited as text', 'ValidationError');
      }

      const currentEtag = normalizeEtag(headResponse.ETag);
      const expectedEtag = normalizeEtag(input.expectedEtag);
      if (expectedEtag && currentEtag && expectedEtag !== currentEtag) {
        throw new S3ServiceError('File changed since it was opened', 'ETAG_MISMATCH');
      }

      const body = new TextEncoder().encode(input.content);
      if (body.byteLength > MAX_TEXT_OBJECT_BYTES) {
        throw new S3ServiceError(
          `Text editing is limited to ${MAX_TEXT_OBJECT_BYTES} bytes`,
          'ValidationError'
        );
      }

      const putResponse = await client.send(
        new PutObjectCommand({
          Bucket: target.bucketName,
          Key: target.objectKey,
          Body: body,
          ContentType: existingContentType,
          Metadata: headResponse.Metadata,
        })
      );

      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: target.bucketReference,
          objectKey: target.objectKey,
          result: 'success',
        },
        Date.now() - startedAt
      );

      return {
        path: input.path,
        size: body.byteLength,
        contentType: existingContentType,
        etag: normalizeEtag(putResponse.ETag),
        lastModified: new Date().toISOString(),
      };
    } catch (error) {
      recordS3FileAccess(
        {
          operation: 'write',
          actor: safeActor,
          bucket: '*',
          objectKey: input.path,
          result: 'failure',
        },
        Date.now() - startedAt
      );
      throw mapError(error, `Failed to update text content for '${input.path}'`);
    }
  }
}
