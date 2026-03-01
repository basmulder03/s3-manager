import type { Hono } from 'hono';
import { Readable } from 'node:stream';
import { S3Service } from '@/services/s3/service';
import { resolveAuthUser, resolvePermissions, shouldRequireAuth } from '@/auth/context';

const s3Service = new S3Service();

const parseMetadata = (
  metadataRaw: string
): { metadata: Record<string, string> | undefined; error: string | null } => {
  if (!metadataRaw) {
    return { metadata: undefined, error: null };
  }

  try {
    const parsed = JSON.parse(metadataRaw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { metadata: undefined, error: 'metadata must be a JSON object' };
    }

    const metadata = Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([key, value]) => [key, value])
    );
    return { metadata, error: null };
  } catch {
    return { metadata: undefined, error: 'metadata must be valid JSON object' };
  }
};

export const registerUploadHttpRoutes = (app: Hono) => {
  app.post('/s3/upload/proxy', async (c) => {
    const user = await resolveAuthUser(c.req.raw);
    if (shouldRequireAuth() && !user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const permissions = resolvePermissions(user, c.req.raw);
    if (!permissions.includes('write')) {
      return c.json({ error: "Missing 'write' permission" }, 403);
    }

    const requestContentType = (c.req.header('content-type') ?? '').toLowerCase();
    const isMultipartUpload = requestContentType.includes('multipart/form-data');

    if (!isMultipartUpload) {
      const bucketName = (c.req.query('bucketName') ?? '').trim();
      const objectKey = (c.req.query('objectKey') ?? '').trim();
      const contentType = (c.req.query('contentType') ?? '').trim();
      const metadataRaw = (c.req.query('metadata') ?? '').trim();

      if (!bucketName || !objectKey) {
        return c.json({ error: 'bucketName and objectKey are required' }, 400);
      }

      if (!c.req.raw.body) {
        return c.json({ error: 'upload body is required' }, 400);
      }

      const rawBody = await c.req.arrayBuffer();
      if (rawBody.byteLength === 0) {
        return c.json({ error: 'upload body is empty' }, 400);
      }

      const { metadata, error } = parseMetadata(metadataRaw);
      if (error) {
        return c.json({ error }, 400);
      }

      const uploaded = await s3Service.uploadObjectViaProxy(
        {
          bucketName,
          objectKey,
          body: Buffer.from(rawBody),
          contentLength: rawBody.byteLength,
          contentType: contentType || undefined,
          metadata,
        },
        user?.email ?? 'anonymous'
      );

      return c.json(uploaded);
    }

    let body: Record<string, string | File>;
    try {
      body = (await c.req.parseBody()) as Record<string, string | File>;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      const isMalformedMultipart =
        message.includes('missing final boundary') || message.includes('multipart');
      return c.json(
        {
          error: isMalformedMultipart
            ? 'Malformed multipart upload body. The upload may have been interrupted.'
            : 'Failed to parse upload request body.',
        },
        400
      );
    }

    const bucketName = typeof body.bucketName === 'string' ? body.bucketName.trim() : '';
    const objectKey = typeof body.objectKey === 'string' ? body.objectKey.trim() : '';
    const contentType = typeof body.contentType === 'string' ? body.contentType.trim() : '';
    const metadataRaw = typeof body.metadata === 'string' ? body.metadata.trim() : '';
    const filePart = body.file;

    if (!bucketName || !objectKey) {
      return c.json({ error: 'bucketName and objectKey are required' }, 400);
    }

    if (!(filePart instanceof File)) {
      return c.json({ error: 'file is required' }, 400);
    }

    const { metadata, error } = parseMetadata(metadataRaw);
    if (error) {
      return c.json({ error }, 400);
    }

    const uploaded = await s3Service.uploadObjectViaProxy(
      {
        bucketName,
        objectKey,
        body: Readable.fromWeb(filePart.stream() as ReadableStream<Uint8Array>),
        contentLength: filePart.size,
        contentType: contentType || filePart.type || undefined,
        metadata,
      },
      user?.email ?? 'anonymous'
    );

    return c.json(uploaded);
  });
};
