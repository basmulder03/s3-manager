import { useCallback } from 'react';
import type { DragEvent as ReactDragEvent, MutableRefObject } from 'react';
import {
  cloneDroppedFile,
  extractFilesFromDroppedEntries,
  INTERNAL_MOVE_DRAG_TYPE,
} from '@web/pages/browser/dragDrop';

interface UseUploadDropHandlersParams {
  uploadDisabled: boolean;
  draggedMovePath: string | null;
  uploadDropEnterDepthRef: MutableRefObject<number>;
  setIsUploadDropActive: (value: boolean) => void;
  setPendingFileUploadFiles: (files: File[]) => void;
  setPendingFolderUploadFiles: (files: File[]) => void;
}

export const useUploadDropHandlers = ({
  uploadDisabled,
  draggedMovePath,
  uploadDropEnterDepthRef,
  setIsUploadDropActive,
  setPendingFileUploadFiles,
  setPendingFolderUploadFiles,
}: UseUploadDropHandlersParams) => {
  const getParentDirectoryPath = useCallback((path: string): string => {
    const normalized = path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) {
      return '';
    }

    const parts = normalized.split('/');
    return parts.slice(0, -1).join('/');
  }, []);

  const clearUploadDropState = useCallback(() => {
    uploadDropEnterDepthRef.current = 0;
    setIsUploadDropActive(false);
  }, [setIsUploadDropActive, uploadDropEnterDepthRef]);

  const isInternalMoveDrag = useCallback((dataTransfer: DataTransfer | null): boolean => {
    if (!dataTransfer) {
      return false;
    }

    return Array.from(dataTransfer.types).includes(INTERNAL_MOVE_DRAG_TYPE);
  }, []);

  const hasFileDropPayload = useCallback((dataTransfer: DataTransfer | null): boolean => {
    if (!dataTransfer) {
      return false;
    }

    return Array.from(dataTransfer.types).includes('Files');
  }, []);

  const getDraggedMovePath = useCallback(
    (dataTransfer: DataTransfer | null): string => {
      if (draggedMovePath) {
        return draggedMovePath;
      }

      if (!dataTransfer) {
        return '';
      }

      const payload = dataTransfer.getData(INTERNAL_MOVE_DRAG_TYPE);
      return payload.trim();
    },
    [draggedMovePath]
  );

  const canMoveToDestination = useCallback(
    (sourcePath: string, destinationPath: string): boolean => {
      const normalizedSource = sourcePath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      const normalizedDestination = destinationPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      if (!normalizedSource || !normalizedDestination) {
        return false;
      }

      if (normalizedSource === normalizedDestination) {
        return false;
      }

      if (normalizedDestination.startsWith(`${normalizedSource}/`)) {
        return false;
      }

      return getParentDirectoryPath(normalizedSource) !== normalizedDestination;
    },
    [getParentDirectoryPath]
  );

  const handleDroppedUploadFiles = useCallback(
    (files: FileList | File[]) => {
      if (uploadDisabled) {
        return;
      }

      const droppedFiles = Array.from(files);
      if (droppedFiles.length === 0) {
        return;
      }

      const folderFiles = droppedFiles.filter((file) => {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        return typeof relativePath === 'string' && relativePath.includes('/');
      });

      const folderFileSet = new Set(folderFiles);
      const standaloneFiles = droppedFiles
        .filter((file) => !folderFileSet.has(file))
        .map((file) => cloneDroppedFile(file));

      if (standaloneFiles.length > 0) {
        setPendingFileUploadFiles(standaloneFiles);
      }

      if (folderFiles.length > 0) {
        setPendingFolderUploadFiles(folderFiles);
      }
    },
    [setPendingFileUploadFiles, setPendingFolderUploadFiles, uploadDisabled]
  );

  const handleDroppedUploadDataTransfer = useCallback(
    async (dataTransfer: DataTransfer) => {
      const droppedFiles = Array.from(dataTransfer.files);
      const hasRelativePaths = droppedFiles.some((file) => {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        return typeof relativePath === 'string' && relativePath.includes('/');
      });
      const hasDirectoryItem = Array.from(dataTransfer.items ?? []).some((item) => {
        const entry = (
          item as DataTransferItem & {
            webkitGetAsEntry?: () => { isDirectory?: boolean } | null;
          }
        ).webkitGetAsEntry?.();
        return Boolean(entry?.isDirectory);
      });

      if (hasDirectoryItem) {
        try {
          const { files: entryFiles } = await extractFilesFromDroppedEntries(dataTransfer);
          if (entryFiles.length > 0) {
            handleDroppedUploadFiles(entryFiles);
            return;
          }
        } catch {
          // ignore entry API issues and continue with fallback heuristics
        }

        const droppedFolderFiles = droppedFiles.filter((file) => {
          const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
          return typeof relativePath === 'string' && relativePath.includes('/');
        });
        if (droppedFolderFiles.length > 0) {
          handleDroppedUploadFiles(droppedFolderFiles);
        }
        return;
      }

      if (hasRelativePaths || droppedFiles.length > 0) {
        handleDroppedUploadFiles(droppedFiles);
        return;
      }

      try {
        const { files: entryFiles } = await extractFilesFromDroppedEntries(dataTransfer);
        if (entryFiles.length > 0) {
          handleDroppedUploadFiles(entryFiles);
          return;
        }
      } catch {
        // ignore entry API issues and fall back below
      }

      handleDroppedUploadFiles(dataTransfer.files);
    },
    [handleDroppedUploadFiles]
  );

  const handleUploadDropEnter = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (uploadDisabled) {
        return;
      }

      if (isInternalMoveDrag(event.dataTransfer) || !hasFileDropPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      uploadDropEnterDepthRef.current += 1;
      setIsUploadDropActive(true);
    },
    [
      hasFileDropPayload,
      isInternalMoveDrag,
      setIsUploadDropActive,
      uploadDisabled,
      uploadDropEnterDepthRef,
    ]
  );

  const handleUploadDropOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (uploadDisabled) {
        return;
      }

      if (isInternalMoveDrag(event.dataTransfer) || !hasFileDropPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    [hasFileDropPayload, isInternalMoveDrag, uploadDisabled]
  );

  const handleUploadDropLeave = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (uploadDisabled) {
        return;
      }

      if (isInternalMoveDrag(event.dataTransfer) || !hasFileDropPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      uploadDropEnterDepthRef.current = Math.max(0, uploadDropEnterDepthRef.current - 1);
      if (uploadDropEnterDepthRef.current === 0) {
        setIsUploadDropActive(false);
      }
    },
    [
      hasFileDropPayload,
      isInternalMoveDrag,
      setIsUploadDropActive,
      uploadDisabled,
      uploadDropEnterDepthRef,
    ]
  );

  const handleUploadDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (uploadDisabled) {
        return;
      }

      if (isInternalMoveDrag(event.dataTransfer) || !hasFileDropPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      clearUploadDropState();
      void handleDroppedUploadDataTransfer(event.dataTransfer);
    },
    [
      clearUploadDropState,
      handleDroppedUploadDataTransfer,
      hasFileDropPayload,
      isInternalMoveDrag,
      uploadDisabled,
    ]
  );

  return {
    canMoveToDestination,
    clearUploadDropState,
    getDraggedMovePath,
    handleDroppedUploadFiles,
    handleUploadDrop,
    handleUploadDropEnter,
    handleUploadDropLeave,
    handleUploadDropOver,
    isInternalMoveDrag,
  };
};
