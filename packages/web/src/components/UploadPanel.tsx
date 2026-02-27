import { useMemo } from 'react';
import { createUploadProceduresFromTrpc } from '@server/shared/upload/trpc-adapter';
import { trpc, trpcProxyClient } from '@web/trpc/client';
import { Button, Input } from '@web/components/ui';
import { useUploadController } from '@web/hooks';
import styles from '@web/components/UploadPanel.module.css';

interface UploadPanelProps {
  selectedPath: string;
  onUploadComplete: () => void;
}

export const UploadPanel = ({ selectedPath, onUploadComplete }: UploadPanelProps) => {
  const buckets = trpc.s3.listBuckets.useQuery({});
  const procedures = useMemo(() => createUploadProceduresFromTrpc(trpcProxyClient), []);
  const {
    bucketName,
    setBucketName,
    prefix,
    setPrefix,
    setFile,
    status,
    progress,
    result,
    upload,
  } = useUploadController({
    selectedPath,
    procedures,
    onUploadComplete,
  });

  return (
    <div className={styles.grid}>
      <div className={styles.fields}>
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

        <div className={styles.actions}>
          <Button onClick={upload}>Upload File</Button>
        </div>
      </div>

      <div className={styles.status}>
        <p className={styles.state}>{status}</p>
        <div className={styles.track}>
          <div className={styles.bar} style={{ width: `${progress}%` }} />
        </div>
        <p className={styles.state}>Progress: {progress}%</p>
        {result ? (
          <>
            <p className={styles.state}>Strategy: {result.strategy}</p>
            <p className={styles.state}>Key: {result.key}</p>
          </>
        ) : null}
      </div>
    </div>
  );
};
