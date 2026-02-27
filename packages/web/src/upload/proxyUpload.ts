import { API_ORIGIN } from '@web/trpc/client';
import type { BrowserFileLike } from '@server/shared/upload/contracts';

export const uploadObjectViaProxy = async (input: {
  bucketName: string;
  objectKey: string;
  file: BrowserFileLike;
  contentType?: string;
  metadata?: Record<string, string>;
}): Promise<{ key: string; etag: string | null; location: string | null }> => {
  if (!(input.file instanceof File)) {
    throw new Error('Backend proxy upload requires a File object');
  }

  const formData = new FormData();
  formData.set('bucketName', input.bucketName);
  formData.set('objectKey', input.objectKey);
  formData.set('contentType', input.contentType ?? input.file.type ?? 'application/octet-stream');
  formData.set('metadata', JSON.stringify(input.metadata ?? {}));
  formData.set('file', input.file);

  const response = await fetch(`${API_ORIGIN}/s3/upload/proxy`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    let message = `Proxy upload failed with status ${response.status}`;
    try {
      const data = await response.json();
      if (data && typeof data.error === 'string' && data.error.trim().length > 0) {
        message = data.error;
      }
    } catch {
      // ignore malformed error body
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as { key?: string; etag?: string | null };
  if (!payload.key) {
    throw new Error('Proxy upload response is missing object key');
  }

  return {
    key: payload.key,
    etag: payload.etag ?? null,
    location: null,
  };
};
