import { useCallback, useState } from 'react';

interface CreateEntryModal {
  kind: 'file' | 'folder';
  value: string;
}

export function useModalManagement(
  isShortcutsModalOpenProp?: boolean,
  setIsShortcutsModalOpenProp?: (isOpen: boolean) => void,
  isFilterHelpModalOpenProp?: boolean,
  setIsFilterHelpModalOpenProp?: (isOpen: boolean) => void
) {
  // Internal modal states
  const [isShortcutsModalOpenInternal, setIsShortcutsModalOpenInternal] = useState(false);
  const [isFilterHelpModalOpenInternal, setIsFilterHelpModalOpenInternal] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [createEntryModal, setCreateEntryModal] = useState<CreateEntryModal | null>(null);
  const [createEntryError, setCreateEntryError] = useState('');

  // Modal state management with optional external control
  const isShortcutsModalOpen = isShortcutsModalOpenProp ?? isShortcutsModalOpenInternal;
  const setIsShortcutsModalOpen = useCallback(
    (isOpen: boolean) => {
      if (isShortcutsModalOpenProp === undefined) {
        setIsShortcutsModalOpenInternal(isOpen);
      }
      setIsShortcutsModalOpenProp?.(isOpen);
    },
    [isShortcutsModalOpenProp, setIsShortcutsModalOpenProp]
  );

  const isFilterHelpModalOpen = isFilterHelpModalOpenProp ?? isFilterHelpModalOpenInternal;
  const setIsFilterHelpModalOpen = useCallback(
    (isOpen: boolean) => {
      if (isFilterHelpModalOpenProp === undefined) {
        setIsFilterHelpModalOpenInternal(isOpen);
      }
      setIsFilterHelpModalOpenProp?.(isOpen);
    },
    [isFilterHelpModalOpenProp, setIsFilterHelpModalOpenProp]
  );

  // Create entry modal helpers
  const openCreateEntryModal = useCallback((kind: 'file' | 'folder') => {
    setCreateEntryError('');
    setCreateEntryModal({ kind, value: '' });
  }, []);

  const closeCreateEntryModal = useCallback(() => {
    setCreateEntryError('');
    setCreateEntryModal(null);
  }, []);

  const submitCreateEntryModal = useCallback(
    async (
      onCreateFile: (fileName: string) => Promise<void>,
      onCreateFolder: (folderName: string) => Promise<void>
    ) => {
      if (!createEntryModal) {
        return;
      }

      const value = createEntryModal.value.trim();
      if (!value) {
        setCreateEntryError(
          createEntryModal.kind === 'file' ? 'File name is required.' : 'Folder name is required.'
        );
        return;
      }

      if (createEntryModal.kind === 'file') {
        await onCreateFile(value);
      } else {
        await onCreateFolder(value);
      }

      closeCreateEntryModal();
    },
    [createEntryModal, closeCreateEntryModal]
  );

  return {
    // Shortcuts modal
    isShortcutsModalOpen,
    setIsShortcutsModalOpen,

    // Filter help modal
    isFilterHelpModalOpen,
    setIsFilterHelpModalOpen,

    // Actions menu
    isActionsMenuOpen,
    setIsActionsMenuOpen,

    // Create entry modal
    createEntryModal,
    setCreateEntryModal,
    createEntryError,
    setCreateEntryError,
    openCreateEntryModal,
    closeCreateEntryModal,
    submitCreateEntryModal,
  };
}
