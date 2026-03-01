import { API_ORIGIN } from '@web/trpc/client';
import type { BrowserFileLike } from '@server/shared/upload/contracts';

export const uploadObjectViaProxy = async (input: {
  bucketName: string;
  objectKey: string;
  file: BrowserFileLike;
  contentType?: string;
  metadata?: Record<string, string>;
  signal?: AbortSignal;
  onUploadProgress?: (uploadedBytes: number, totalBytes: number) => void;
}): Promise<{ key: string; etag: string | null; location: string | null }> => {
  const uploadContentType = input.contentType ?? input.file.type ?? 'application/octet-stream';
  const params = new URLSearchParams({
    bucketName: input.bucketName,
    objectKey: input.objectKey,
    contentType: uploadContentType,
  });
  if (input.metadata && Object.keys(input.metadata).length > 0) {
    params.set('metadata', JSON.stringify(input.metadata));
  }

  const fileBlob = input.file.slice(0, input.file.size);

  const sendWithXhr = () =>
    new Promise<{ status: number; responseText: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_ORIGIN}/s3/upload/proxy?${params.toString()}`);
      xhr.withCredentials = true;
      xhr.responseType = 'text';
      xhr.setRequestHeader('content-type', uploadContentType);

      const handleAbort = () => {
        xhr.abort();
      };

      if (input.signal) {
        if (input.signal.aborted) {
          reject(new DOMException('The upload was aborted.', 'AbortError'));
          return;
        }

        input.signal.addEventListener('abort', handleAbort, { once: true });
      }

      xhr.upload.onprogress = (event) => {
        const totalBytes = event.lengthComputable ? event.total : input.file.size;
        input.onUploadProgress?.(event.loaded, totalBytes);
      };

      xhr.onerror = () => {
        if (input.signal) {
          input.signal.removeEventListener('abort', handleAbort);
        }
        reject(new Error('Upload request could not reach the backend upload proxy.'));
      };

      xhr.onabort = () => {
        if (input.signal) {
          input.signal.removeEventListener('abort', handleAbort);
        }
        reject(new DOMException('The upload was aborted.', 'AbortError'));
      };

      xhr.onload = () => {
        if (input.signal) {
          input.signal.removeEventListener('abort', handleAbort);
        }
        resolve({ status: xhr.status, responseText: xhr.responseText ?? '' });
      };

      xhr.send(fileBlob);
    });

  const response = await sendWithXhr();

  if (response.status < 200 || response.status >= 300) {
    let message = `Proxy upload failed with status ${response.status}`;
    try {
      const data = JSON.parse(response.responseText) as { error?: string };
      if (data && typeof data.error === 'string' && data.error.trim().length > 0) {
        message = data.error;
      }
    } catch {
      // ignore malformed error body
    }
    throw new Error(message);
  }

  const payload = JSON.parse(response.responseText) as { key?: string; etag?: string | null };
  if (!payload.key) {
    throw new Error('Proxy upload response is missing object key');
  }

  return {
    key: payload.key,
    etag: payload.etag ?? null,
    location: null,
  };
};
