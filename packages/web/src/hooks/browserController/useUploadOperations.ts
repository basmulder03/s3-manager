import { useMemo, useState } from 'react';
import { trpcProxyClient } from '@web/trpc/client';
import { createUploadProceduresFromTrpc } from '@server/shared/upload/trpc-adapter';
import { uploadObjectWithCookbook } from '@server/shared/upload/client';
import { uploadObjectViaProxy } from '@web/upload/proxyUpload';
import { formatBytes } from '@web/utils/formatBytes';

export interface UseUploadOperationsOptions {
  canWrite: boolean;
  selectedPath: string;
  enqueueSnackbar: (message: {
    message: string;
    tone: 'success' | 'error' | 'info';
    durationMs?: number;
    progress?: number;
    actionLabel?: string;
    onAction?: () => void;
  }) => number;
  updateSnackbar: (
    id: number,
    update: {
      message?: string;
      progress?: number;
      actionLabel?: string | null;
      onAction?: (() => void) | null;
    }
  ) => void;
  dismissSnackbar: (id: number) => void;
  refreshBrowse: () => void;
}

export interface UseUploadOperationsReturn {
  isUploading: boolean;
  uploadFiles: (files: FileList | File[]) => Promise<void>;
  uploadFolder: (files: FileList | File[]) => Promise<void>;
}

/**
 * Hook to manage file and folder upload operations
 * Handles upload progress tracking, cancellation, and error reporting
 */
export const useUploadOperations = ({
  canWrite,
  selectedPath,
  enqueueSnackbar,
  updateSnackbar,
  dismissSnackbar,
  refreshBrowse,
}: UseUploadOperationsOptions): UseUploadOperationsReturn => {
  const [activeUploadCount, setActiveUploadCount] = useState(0);
  const uploadProcedures = useMemo(() => createUploadProceduresFromTrpc(trpcProxyClient), []);

  const uploadFromSelection = async (
    files: FileList | File[],
    mode: 'files' | 'folder'
  ): Promise<void> => {
    if (!canWrite) {
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
      return;
    }

    const normalizedSelectedPath = selectedPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    const [bucketName, ...prefixParts] = normalizedSelectedPath.split('/');
    if (!bucketName) {
      enqueueSnackbar({
        message: 'Navigate to a bucket path before uploading.',
        tone: 'error',
      });
      return;
    }

    const uploadFiles = Array.from(files);
    if (uploadFiles.length === 0) {
      return;
    }

    const prefix = prefixParts.join('/');
    const normalizedPrefix = prefix ? `${prefix}/` : '';

    let uploadedCount = 0;
    let failedCount = 0;
    let cancelled = false;
    const failureReasons = new Map<string, number>();
    const failureExamples = new Map<string, string[]>();
    const totalCount = uploadFiles.length;
    const totalBytes = uploadFiles.reduce((sum, file) => sum + file.size, 0);
    let uploadedBytes = 0;
    let cancellationRequested = false;
    let activeAbortController: AbortController | null = null;
    let progressSnackbarId = 0;
    progressSnackbarId = enqueueSnackbar({
      message: `Uploading 0/${totalCount} item(s) (${formatBytes(0)} / ${formatBytes(totalBytes)})...`,
      tone: 'info',
      durationMs: 0,
      progress: 0,
      actionLabel: 'Cancel',
      onAction: () => {
        cancellationRequested = true;
        activeAbortController?.abort();
        updateSnackbar(progressSnackbarId, {
          message: 'Cancelling upload...',
          actionLabel: null,
          onAction: null,
        });
      },
    });

    const getUploadFailureReason = (error: unknown): string => {
      const rawMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message.trim()
          : 'Upload failed';
      const normalized = rawMessage.toLowerCase();

      if (normalized.includes('failed to fetch')) {
        return 'Upload request could not reach the backend upload proxy.';
      }

      return rawMessage;
    };

    const isAbortError = (error: unknown): boolean => {
      if (error instanceof DOMException) {
        return error.name === 'AbortError';
      }

      return error instanceof Error && error.name === 'AbortError';
    };

    setActiveUploadCount((previous) => previous + 1);

    try {
      for (const file of uploadFiles) {
        if (cancellationRequested) {
          cancelled = true;
          break;
        }

        const relativePath =
          mode === 'folder'
            ? (file.webkitRelativePath || file.name).replace(/\\/g, '/').replace(/^\/+/, '')
            : file.name;
        const objectKey = `${normalizedPrefix}${relativePath}`;
        const fileAbortController = new AbortController();
        activeAbortController = fileAbortController;

        try {
          const uploadedBytesBeforeFile = uploadedBytes;
          await uploadObjectWithCookbook({
            client: uploadProcedures,
            bucketName,
            objectKey,
            file,
            contentType: file.type || 'application/octet-stream',
            metadata: {
              original_filename: file.name,
            },
            forceProxyUpload: true,
            proxyUpload: (input) =>
              uploadObjectViaProxy({
                ...input,
                signal: fileAbortController.signal,
                onUploadProgress: (uploadedBytesForFile, totalBytesForFile) => {
                  const totalUploadedBytes = Math.min(
                    totalBytes,
                    uploadedBytesBeforeFile + uploadedBytesForFile
                  );
                  const progress =
                    totalBytes > 0 ? Math.round((totalUploadedBytes / totalBytes) * 100) : 0;
                  updateSnackbar(progressSnackbarId, {
                    message: `Uploading ${uploadedCount + failedCount}/${totalCount} item(s) (${formatBytes(totalUploadedBytes)} / ${formatBytes(totalBytes)})...`,
                    progress,
                  });

                  if (totalBytesForFile > 0 && uploadedBytesForFile >= totalBytesForFile) {
                    updateSnackbar(progressSnackbarId, {
                      message: `Uploading ${uploadedCount + failedCount + 1}/${totalCount} item(s) (${formatBytes(totalUploadedBytes)} / ${formatBytes(totalBytes)})...`,
                      progress,
                    });
                  }
                },
              }),
            onProgress: (event) => {
              const totalUploadedBytes = Math.min(
                totalBytes,
                uploadedBytesBeforeFile + event.uploadedBytes
              );
              const progress =
                totalBytes > 0 ? Math.round((totalUploadedBytes / totalBytes) * 100) : 0;
              updateSnackbar(progressSnackbarId, {
                message: `Uploading ${uploadedCount + failedCount}/${totalCount} item(s) (${formatBytes(totalUploadedBytes)} / ${formatBytes(totalBytes)})...`,
                progress,
              });
            },
          });
          uploadedCount += 1;
          uploadedBytes += file.size;
        } catch (error) {
          if (cancellationRequested && isAbortError(error)) {
            cancelled = true;
            break;
          }

          failedCount += 1;
          const reason = getUploadFailureReason(error);
          failureReasons.set(reason, (failureReasons.get(reason) ?? 0) + 1);
          const examples = failureExamples.get(reason) ?? [];
          if (examples.length < 2) {
            examples.push(relativePath);
            failureExamples.set(reason, examples);
          }
        } finally {
          if (activeAbortController === fileAbortController) {
            activeAbortController = null;
          }
        }

        const processedCount = uploadedCount + failedCount;
        const progress = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
        updateSnackbar(progressSnackbarId, {
          message: `Uploading ${processedCount}/${totalCount} item(s) (${formatBytes(uploadedBytes)} / ${formatBytes(totalBytes)})...`,
          progress,
        });
      }

      if (uploadedCount > 0) {
        refreshBrowse();
      }

      if (cancelled) {
        enqueueSnackbar({
          message: `Upload cancelled after ${uploadedCount}/${totalCount} item(s) (${formatBytes(uploadedBytes)} / ${formatBytes(totalBytes)}).`,
          tone: uploadedCount > 0 ? 'info' : 'error',
        });
        return;
      }

      const failureReasonSummary = Array.from(failureReasons.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 2)
        .map(([reason, count]) => {
          const examples = failureExamples.get(reason) ?? [];
          const suffix = examples.length > 0 ? `, e.g. ${examples.join(', ')}` : '';
          return count > 1 ? `${reason} (${count}${suffix})` : `${reason}${suffix}`;
        })
        .join('; ');

      if (failedCount === 0) {
        enqueueSnackbar({ message: `Uploaded ${uploadedCount} item(s).`, tone: 'success' });
        return;
      }

      if (uploadedCount === 0) {
        enqueueSnackbar({
          message: `Failed to upload ${failedCount} item(s): ${failureReasonSummary}`,
          tone: 'error',
        });
        return;
      }

      enqueueSnackbar({
        message: `Uploaded ${uploadedCount} item(s), failed ${failedCount} item(s): ${failureReasonSummary}`,
        tone: 'info',
      });
    } finally {
      cancellationRequested = false;
      activeAbortController = null;
      dismissSnackbar(progressSnackbarId);
      setActiveUploadCount((previous) => Math.max(0, previous - 1));
    }
  };

  const isUploading = activeUploadCount > 0;

  return {
    isUploading,
    uploadFiles: (files: FileList | File[]) => uploadFromSelection(files, 'files'),
    uploadFolder: (files: FileList | File[]) => uploadFromSelection(files, 'folder'),
  };
};
