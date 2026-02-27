import { useEffect, useMemo, useState } from 'react';

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

export const useUploadTargetState = (selectedPath: string) => {
  const parsedPath = useMemo(() => parsePath(selectedPath), [selectedPath]);
  const [bucketName, setBucketName] = useState(parsedPath.bucket);
  const [prefix, setPrefix] = useState(parsedPath.prefix);

  useEffect(() => {
    if (parsedPath.bucket) {
      setBucketName(parsedPath.bucket);
      setPrefix(parsedPath.prefix);
    }
  }, [parsedPath.bucket, parsedPath.prefix]);

  return {
    bucketName,
    setBucketName,
    prefix,
    setPrefix,
  };
};
