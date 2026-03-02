import type { FilePreviewModalState } from '@web/hooks/browserTypes';
import { trpcProxyClient } from '@web/trpc/client';
import { resolveFileCapability } from '@web/utils/fileCapabilities';
import { splitObjectPath } from './browserPathUtils';

export interface UseFilePreviewOptions {
  canWrite: boolean;
  filePreviewModal: FilePreviewModalState | null;
  setFilePreviewModal: (
    state:
      | FilePreviewModalState
      | null
      | ((prev: FilePreviewModalState | null) => FilePreviewModalState | null)
  ) => void;
  enqueueSnackbar: (message: { message: string; tone: 'success' | 'error' | 'info' }) => void;
  closeContextMenu: () => void;
  refreshBrowse: () => void;
}

export interface UseFilePreviewReturn {
  openFilePreview: (path: string, intent: 'view' | 'edit') => Promise<boolean>;
  saveFilePreviewText: () => Promise<void>;
  setFilePreviewEditable: (editable: boolean) => void;
  setFilePreviewTextContent: (value: string) => void;
}

/**
 * Hook to manage file preview modal (text, image, audio, video)
 * Handles viewing and editing file content
 */
export const useFilePreview = ({
  canWrite,
  filePreviewModal,
  setFilePreviewModal,
  enqueueSnackbar,
  closeContextMenu,
  refreshBrowse,
}: UseFilePreviewOptions): UseFilePreviewReturn => {
  const openFilePreview = async (path: string, intent: 'view' | 'edit'): Promise<boolean> => {
    if (intent === 'edit' && !canWrite) {
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
      return false;
    }

    closeContextMenu();
    setFilePreviewModal({
      mode: 'text',
      path,
      contentType: 'application/octet-stream',
      etag: null,
      loading: true,
      error: '',
      content: '',
      originalContent: '',
      editable: false,
      canToggleEdit: false,
    });

    try {
      const { bucketName, objectKey } = splitObjectPath(path);
      const metadata = await trpcProxyClient.s3.getObjectMetadata.query({ bucketName, objectKey });
      const capability = resolveFileCapability(path, metadata.contentType);

      if (capability.previewKind === 'text') {
        if (intent === 'edit' && !capability.canEditText) {
          setFilePreviewModal(null);
          enqueueSnackbar({
            message: 'This text file type can be viewed but not edited.',
            tone: 'info',
          });
          return false;
        }

        const textContent = await trpcProxyClient.s3.getObjectTextContent.query({ path });
        setFilePreviewModal({
          mode: 'text',
          path,
          contentType: textContent.contentType,
          etag: textContent.etag,
          loading: false,
          error: '',
          content: textContent.content,
          originalContent: textContent.content,
          editable: intent === 'edit' && canWrite && capability.canEditText,
          canToggleEdit: canWrite && capability.canEditText,
        });
        return true;
      }

      if (
        capability.previewKind === 'image' ||
        capability.previewKind === 'audio' ||
        capability.previewKind === 'video'
      ) {
        setFilePreviewModal({
          mode: capability.previewKind,
          path,
          contentType: metadata.contentType,
          etag: metadata.etag,
          loading: false,
          error: '',
          mediaUrl: metadata.downloadUrl,
        });
        return true;
      }

      setFilePreviewModal(null);
      enqueueSnackbar({
        message: 'Preview is not available for this file type. Use Download to access the file.',
        tone: 'info',
      });
      return false;
    } catch (error) {
      setFilePreviewModal((previous) => {
        if (!previous || previous.path !== path) {
          return previous;
        }

        return {
          ...previous,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to open file preview.',
        };
      });
      return false;
    }
  };

  const saveFilePreviewText = async () => {
    if (!canWrite) {
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
      return;
    }

    if (!filePreviewModal || filePreviewModal.mode !== 'text' || !filePreviewModal.editable) {
      return;
    }

    setFilePreviewModal((previous) => {
      if (!previous || previous.mode !== 'text') {
        return previous;
      }

      return {
        ...previous,
        loading: true,
        error: '',
      };
    });

    try {
      const result = await trpcProxyClient.s3.updateObjectTextContent.mutate({
        path: filePreviewModal.path,
        content: filePreviewModal.content,
        expectedEtag: filePreviewModal.etag ?? undefined,
      });

      setFilePreviewModal((previous) => {
        if (!previous || previous.mode !== 'text') {
          return previous;
        }

        return {
          ...previous,
          loading: false,
          error: '',
          etag: result.etag,
          contentType: result.contentType,
          originalContent: previous.content,
        };
      });
      enqueueSnackbar({ message: 'File saved successfully.', tone: 'success' });
      refreshBrowse();
    } catch (error) {
      setFilePreviewModal((previous) => {
        if (!previous || previous.mode !== 'text') {
          return previous;
        }

        return {
          ...previous,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to save file.',
        };
      });
    }
  };

  const setFilePreviewEditable = (editable: boolean) => {
    setFilePreviewModal((previous) => {
      if (!previous || previous.mode !== 'text') {
        return previous;
      }

      if (editable && (!canWrite || !previous.canToggleEdit)) {
        return previous;
      }

      return {
        ...previous,
        editable,
        error: '',
      };
    });
  };

  const setFilePreviewTextContent = (value: string) => {
    setFilePreviewModal((previous) => {
      if (!previous || previous.mode !== 'text') {
        return previous;
      }

      return {
        ...previous,
        content: value,
        error: '',
      };
    });
  };

  return {
    openFilePreview,
    saveFilePreviewText,
    setFilePreviewEditable,
    setFilePreviewTextContent,
  };
};
