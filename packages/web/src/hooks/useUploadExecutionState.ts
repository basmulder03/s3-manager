import { useState } from 'react';
import { uploadObjectWithCookbook } from '@server/shared/upload/client';
import type { createUploadProceduresFromTrpc } from '@server/shared/upload/trpc-adapter';

type UploadProcedures = ReturnType<typeof createUploadProceduresFromTrpc>;

interface UseUploadExecutionOptions {
  procedures: UploadProcedures;
  bucketName: string;
  prefix: string;
  file: File | null;
  onUploadComplete: () => void;
}

export const useUploadExecutionState = ({
  procedures,
  bucketName,
  prefix,
  file,
  onUploadComplete,
}: UseUploadExecutionOptions) => {
  const [status, setStatus] = useState('Idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ strategy: string; key: string } | null>(null);

  const upload = async (): Promise<void> => {
    if (!file) {
      setStatus('Select a file first');
      return;
    }

    if (!bucketName) {
      setStatus('Select a bucket first');
      return;
    }

    setStatus('Uploading...');
    setProgress(0);
    setResult(null);

    const objectKey = `${prefix}${file.name}`;

    try {
      const uploaded = await uploadObjectWithCookbook({
        client: procedures,
        bucketName,
        objectKey,
        file,
        contentType: file.type || 'application/octet-stream',
        metadata: {
          original_filename: file.name,
        },
        onProgress(event) {
          const pct = Math.round((event.uploadedBytes / event.totalBytes) * 100);
          setProgress(Number.isFinite(pct) ? pct : 0);
        },
      });

      setStatus('Upload complete');
      setResult({ strategy: uploaded.strategy, key: uploaded.key });
      onUploadComplete();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setStatus(message);
    }
  };

  return {
    status,
    progress,
    result,
    upload,
  };
};
