import { useState } from 'react';
import type { createUploadProceduresFromTrpc } from '@server/shared/upload/trpc-adapter';
import { useUploadTargetState } from '@web/hooks/useUploadTargetState';
import { useUploadExecutionState } from '@web/hooks/useUploadExecutionState';

type UploadProcedures = ReturnType<typeof createUploadProceduresFromTrpc>;

interface UseUploadControllerOptions {
  selectedPath: string;
  procedures: UploadProcedures;
  onUploadComplete: () => void;
}

export const useUploadController = ({
  selectedPath,
  procedures,
  onUploadComplete,
}: UseUploadControllerOptions) => {
  const { bucketName, setBucketName, prefix, setPrefix } = useUploadTargetState(selectedPath);
  const [file, setFile] = useState<File | null>(null);

  const { status, progress, result, upload } = useUploadExecutionState({
    procedures,
    bucketName,
    prefix,
    file,
    onUploadComplete,
  });

  return {
    bucketName,
    setBucketName,
    prefix,
    setPrefix,
    setFile,
    status,
    progress,
    result,
    upload,
  };
};
