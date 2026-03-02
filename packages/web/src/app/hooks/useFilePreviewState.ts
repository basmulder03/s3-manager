import { useCallback, useEffect, useRef, useState } from 'react';

type PreviewAction = { type: 'close' } | { type: 'open'; path: string; mode: 'view' | 'edit' };

interface UseFilePreviewStateProps {
  openedFilePath: string;
  openedFileMode: 'view' | 'edit';
  canView: boolean;
  canWrite: boolean;
  filePreviewModal: any; // Browser's file preview modal state
  hasUnsavedChanges: boolean;
  setOpenedFileInUrl: (path: string, mode: 'view' | 'edit') => void;
  clearOpenedFileInUrl: () => void;
  openFilePreview: (path: string, mode: 'view' | 'edit') => Promise<boolean>;
  closeFilePreview: () => void;
  setFilePreviewEditable: (editable: boolean) => void;
  closeModals: () => void;
}

/**
 * Hook for managing file preview state and actions.
 * Handles preview opening/closing with unsaved changes detection,
 * and synchronizes file preview state with URL parameters.
 */
export const useFilePreviewState = ({
  openedFilePath,
  openedFileMode,
  canView,
  canWrite,
  filePreviewModal,
  hasUnsavedChanges,
  setOpenedFileInUrl,
  clearOpenedFileInUrl,
  openFilePreview,
  closeFilePreview,
  setFilePreviewEditable,
  closeModals,
}: UseFilePreviewStateProps) => {
  const [pendingDiscardAction, setPendingDiscardAction] = useState<PreviewAction | null>(null);
  const lastOpenedPreviewKeyRef = useRef('');

  const executePreviewAction = useCallback(
    async (action: PreviewAction) => {
      if (action.type === 'close') {
        clearOpenedFileInUrl();
        return;
      }

      const opened = await openFilePreview(action.path, action.mode);
      if (!opened) {
        return;
      }

      const previewKey = `${action.path}|${action.mode}`;
      lastOpenedPreviewKeyRef.current = previewKey;
      setOpenedFileInUrl(action.path, action.mode);
    },
    [clearOpenedFileInUrl, openFilePreview, setOpenedFileInUrl]
  );

  const runPreviewAction = useCallback(
    async (action: PreviewAction) => {
      if (hasUnsavedChanges) {
        setPendingDiscardAction(action);
        return;
      }

      await executePreviewAction(action);
    },
    [executePreviewAction, hasUnsavedChanges]
  );

  const closeActiveModal = useCallback(() => {
    if (filePreviewModal) {
      void runPreviewAction({ type: 'close' });
      return;
    }

    closeModals();
  }, [filePreviewModal, runPreviewAction, closeModals]);

  const confirmDiscardChanges = useCallback(() => {
    if (!pendingDiscardAction) {
      return;
    }

    const action = pendingDiscardAction;
    setPendingDiscardAction(null);
    void executePreviewAction(action);
  }, [pendingDiscardAction, executePreviewAction]);

  const cancelDiscardChanges = useCallback(() => {
    setPendingDiscardAction(null);
  }, []);

  // Synchronize file preview with URL parameters
  useEffect(() => {
    if (!canView) {
      return;
    }

    if (!openedFilePath) {
      lastOpenedPreviewKeyRef.current = '';
      if (filePreviewModal) {
        closeFilePreview();
      }
      return;
    }

    if (openedFileMode === 'edit' && !canWrite) {
      setOpenedFileInUrl(openedFilePath, 'view');
      return;
    }

    const desiredMode: 'view' | 'edit' = openedFileMode === 'edit' && canWrite ? 'edit' : 'view';
    const previewKey = `${openedFilePath}|${desiredMode}`;

    if (filePreviewModal?.path === openedFilePath) {
      if (filePreviewModal.mode === 'text') {
        const shouldBeEditable = desiredMode === 'edit';
        if (filePreviewModal.editable !== shouldBeEditable) {
          setFilePreviewEditable(shouldBeEditable);
        }
      }
      lastOpenedPreviewKeyRef.current = previewKey;
      return;
    }

    if (lastOpenedPreviewKeyRef.current === previewKey) {
      return;
    }

    lastOpenedPreviewKeyRef.current = previewKey;
    void openFilePreview(openedFilePath, desiredMode).then((opened) => {
      if (opened) {
        return;
      }

      clearOpenedFileInUrl();
    });
  }, [
    canView,
    canWrite,
    clearOpenedFileInUrl,
    closeFilePreview,
    filePreviewModal,
    openFilePreview,
    openedFileMode,
    openedFilePath,
    setFilePreviewEditable,
    setOpenedFileInUrl,
  ]);

  return {
    pendingDiscardAction,
    runPreviewAction,
    closeActiveModal,
    confirmDiscardChanges,
    cancelDiscardChanges,
  };
};
