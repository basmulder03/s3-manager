import { useEffect, useMemo, useState } from 'react';
import { uploadObjectWithCookbook } from '@server/shared/upload/client';
import { createUploadProceduresFromTrpc } from '@server/shared/upload/trpc-adapter';
import { trpc, trpcProxyClient } from '@web/trpc/client';
import { Button } from '@web/components/ui/Button';
import { Input } from '@web/components/ui/Input';

interface UploadPanelProps {
  selectedPath: string;
  onUploadComplete: () => void;
}

const parsePath = (path: string): { bucket: string; prefix: string } => {
  const trimmed = path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmed) {
    return { bucket: '', prefix: '' };
  }

  const [bucket, ...parts] = trimmed.split('/');
  return {
    bucket: bucket ?? '',
    prefix: parts.length > 0 ? `${parts.join('/')}/` : '',
  };
};

export const UploadPanel = ({ selectedPath, onUploadComplete }: UploadPanelProps) => {
  const buckets = trpc.s3.listBuckets.useQuery({});
  const procedures = useMemo(() => createUploadProceduresFromTrpc(trpcProxyClient), []);

  const parsedPath = parsePath(selectedPath);
  const [bucketName, setBucketName] = useState(parsedPath.bucket);
  const [prefix, setPrefix] = useState(parsedPath.prefix);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('Idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ strategy: string; key: string } | null>(null);

  useEffect(() => {
    if (parsedPath.bucket) {
      setBucketName(parsedPath.bucket);
      setPrefix(parsedPath.prefix);
    }
  }, [parsedPath.bucket, parsedPath.prefix]);

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

  return (
    <div className="upload-grid">
      <div className="upload-fields">
        <label>
          Bucket
          <select value={bucketName} onChange={(event) => setBucketName(event.target.value)}>
            <option value="">Select bucket</option>
            {buckets.data?.buckets.map((bucket) => (
              <option key={bucket.name} value={bucket.name}>
                {bucket.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Prefix
          <Input
            className="path-input"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
            placeholder="folder/subfolder/"
          />
        </label>

        <label>
          File
          <Input
            type="file"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
            }}
          />
        </label>

        <div className="row-actions">
          <Button onClick={upload}>Upload File</Button>
        </div>
      </div>

      <div className="upload-status">
        <p className="state">{status}</p>
        <div className="progress-track">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <p className="state">Progress: {progress}%</p>
        {result ? (
          <>
            <p className="state">Strategy: {result.strategy}</p>
            <p className="state">Key: {result.key}</p>
          </>
        ) : null}
      </div>
    </div>
  );
};
