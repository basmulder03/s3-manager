import { useRef, useState } from 'react';
import { collectFilesFromDirectoryHandle } from '@web/pages/browser/utils';

export function useUploadHandling() {
  const [pendingFileUploadFiles, setPendingFileUploadFiles] = useState<File[]>([]);
  const [pendingFolderUploadFiles, setPendingFolderUploadFiles] = useState<File[]>([]);

  const uploadFilesInputRef = useRef<HTMLInputElement>(null);
  const uploadFolderInputRef = useRef<HTMLInputElement>(null);

  const folderInputAttributes = {
    directory: '',
    webkitdirectory: '',
  } as Record<string, string>;

  /**
   * Handle folder selection using modern directory picker API with fallback
   */
  const onSelectFolderForUpload = async () => {
    const directoryPicker = (
      window as Window & {
        showDirectoryPicker?: () => Promise<{ values: () => AsyncIterable<unknown> }>;
      }
    ).showDirectoryPicker;

    if (!directoryPicker) {
      uploadFolderInputRef.current?.click();
      return;
    }

    try {
      const directoryHandle = await directoryPicker();
      const files = await collectFilesFromDirectoryHandle(directoryHandle);
      if (files.length === 0) {
        return;
      }

      setPendingFolderUploadFiles(files);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      uploadFolderInputRef.current?.click();
    }
  };

  return {
    // File upload state
    pendingFileUploadFiles,
    setPendingFileUploadFiles,

    // Folder upload state
    pendingFolderUploadFiles,
    setPendingFolderUploadFiles,

    // Refs
    uploadFilesInputRef,
    uploadFolderInputRef,

    // Helpers
    folderInputAttributes,
    onSelectFolderForUpload,
  };
}
