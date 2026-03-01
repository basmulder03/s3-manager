import type { Hono } from 'hono';
import { Readable } from 'node:stream';
import { S3Service } from '@/services/s3/service';
import { resolveAuthUser, resolvePermissions, shouldRequireAuth } from '@/auth/context';

const s3Service = new S3Service();

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

    const body = await c.req.parseBody();
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

    let metadata: Record<string, string> | undefined;
    if (metadataRaw) {
      try {
        const parsed = JSON.parse(metadataRaw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          metadata = Object.fromEntries(
            Object.entries(parsed)
              .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
              .map(([key, value]) => [key, value])
          );
        }
      } catch {
        return c.json({ error: 'metadata must be valid JSON object' }, 400);
      }
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
