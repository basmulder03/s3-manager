import { useRef, useState } from 'react';
import { trpcProxyClient } from '@web/trpc/client';
import type { BrowseItem } from '@server/services/s3/types';
import {
  type DeleteModalState,
  type MoveModalState,
  type PropertiesModalState,
  type RenameModalState,
} from '@web/hooks/browserTypes';
import { useBrowserSelectionState } from '@web/hooks/useBrowserSelectionState';
import { useBrowserShortcutsEffect } from '@web/hooks/useBrowserShortcutsEffect';
import { useModalFocusTrapEffect } from '@web/hooks/useModalFocusTrapEffect';

export type { DeleteModalState, MoveModalState, PropertiesModalState, RenameModalState };

interface UseBrowserControllerOptions {
  selectedPath: string;
  setSelectedPath: (path: string) => void;
  browseItems: BrowseItem[] | undefined;
  browsePath: string | undefined;
  refreshBrowse: () => void;
  canWrite: boolean;
  canDelete: boolean;
  locationPathname: string;
  createFolderAsync: (input: { path: string; folderName: string }) => Promise<unknown>;
  renameItemAsync: (input: {
    sourcePath: string;
    newName?: string;
    destinationPath?: string;
  }) => Promise<unknown>;
  deleteObjectAsync: (input: { bucketName: string; objectKey: string }) => Promise<unknown>;
  deleteFolderAsync: (input: { path: string }) => Promise<unknown>;
  deleteMultipleAsync: (input: { paths: string[] }) => Promise<{ message: string }>;
}

export const useBrowserController = ({
  selectedPath,
  setSelectedPath,
  browseItems,
  browsePath,
  refreshBrowse,
  canWrite,
  canDelete,
  locationPathname,
  createFolderAsync,
  renameItemAsync,
  deleteObjectAsync,
  deleteFolderAsync,
  deleteMultipleAsync,
}: UseBrowserControllerOptions) => {
  const [newFolderName, setNewFolderName] = useState('');
  const [browserMessage, setBrowserMessage] = useState('');
  const [renameModal, setRenameModal] = useState<RenameModalState | null>(null);
  const [moveModal, setMoveModal] = useState<MoveModalState | null>(null);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);
  const [propertiesModal, setPropertiesModal] = useState<PropertiesModalState | null>(null);
  const [modalError, setModalError] = useState('');
  const activeModalRef = useRef<HTMLDivElement>(null);

  const selection = useBrowserSelectionState({
    browseItems,
    selectedPath,
    browsePath,
    setSelectedPath,
  });

  const isModalOpen =
    renameModal !== null || moveModal !== null || deleteModal !== null || propertiesModal !== null;

  useModalFocusTrapEffect(isModalOpen, activeModalRef);

  const closeModals = () => {
    setRenameModal(null);
    setMoveModal(null);
    setDeleteModal(null);
    setPropertiesModal(null);
    setModalError('');
  };

  const splitObjectPath = (path: string): { bucketName: string; objectKey: string } => {
    const [bucketName, ...parts] = path.split('/');
    return {
      bucketName: bucketName ?? '',
      objectKey: parts.join('/'),
    };
  };

  const createFolderInCurrentPath = async () => {
    if (!canWrite) {
      setBrowserMessage('You do not have write permission.');
      return;
    }

    if (!selectedPath) {
      setBrowserMessage('Navigate to a bucket path before creating folders.');
      return;
    }

    if (!newFolderName.trim()) {
      setBrowserMessage('Folder name is required.');
      return;
    }

    try {
      await createFolderAsync({ path: selectedPath, folderName: newFolderName.trim() });
      setNewFolderName('');
      setBrowserMessage('Folder created successfully.');
      refreshBrowse();
    } catch {
      setBrowserMessage('Failed to create folder.');
    }
  };

  const downloadFile = async (path: string, silent = false) => {
    try {
      const { bucketName, objectKey } = splitObjectPath(path);
      const metadata = await trpcProxyClient.s3.getObjectMetadata.query({ bucketName, objectKey });
      window.open(metadata.downloadUrl, '_blank', 'noopener,noreferrer');
      if (!silent) {
        setBrowserMessage('Download link opened.');
      }
    } catch {
      if (!silent) {
        setBrowserMessage('Failed to generate download URL.');
      }
    }
  };

  const removeItem = async (path: string, type: 'file' | 'directory'): Promise<boolean> => {
    try {
      if (type === 'directory') {
        await deleteFolderAsync({ path });
      } else {
        const { bucketName, objectKey } = splitObjectPath(path);
        await deleteObjectAsync({ bucketName, objectKey });
      }
      return true;
    } catch {
      return false;
    }
  };

  const deletePathItems = (items: BrowseItem[]) => {
    if (!canDelete) {
      setBrowserMessage('You do not have delete permission.');
      return;
    }

    setDeleteModal({ items });
    selection.setContextMenu(null);
    setModalError('');
  };

  const bulkDelete = async () => {
    if (!canDelete) {
      setBrowserMessage('You do not have delete permission.');
      return;
    }

    if (selection.selectedRecords.length === 0) {
      setBrowserMessage('No items selected.');
      return;
    }

    deletePathItems(selection.selectedRecords);
  };

  const bulkDownload = async () => {
    if (selection.selectedRecords.length === 0) {
      setBrowserMessage('No items selected.');
      return;
    }

    const files = selection.selectedRecords.filter((item) => item.type === 'file');
    if (files.length === 0) {
      setBrowserMessage('No files selected. Folders cannot be downloaded.');
      return;
    }

    for (const file of files) {
      await downloadFile(file.path, true);
    }

    setBrowserMessage(`Started download for ${files.length} file(s).`);
  };

  const renamePathItem = (path: string, currentName: string) => {
    if (!canWrite) {
      setBrowserMessage('You do not have write permission.');
      return;
    }

    setRenameModal({ sourcePath: path, currentName, nextName: currentName });
    selection.setContextMenu(null);
    setModalError('');
  };

  const movePathItem = (path: string) => {
    if (!canWrite) {
      setBrowserMessage('You do not have write permission.');
      return;
    }

    setMoveModal({ sourcePath: path, destinationPath: selectedPath || '' });
    selection.setContextMenu(null);
    setModalError('');
  };

  const openProperties = async (path: string) => {
    selection.setContextMenu(null);
    setPropertiesModal({ path, loading: true, error: '', details: null });

    try {
      const details = await trpcProxyClient.s3.getProperties.query({ path });
      setPropertiesModal({ path, loading: false, error: '', details });
    } catch {
      setPropertiesModal({
        path,
        loading: false,
        error: 'Failed to load file properties.',
        details: null,
      });
    }
  };

  const submitRename = async () => {
    if (!canWrite) {
      closeModals();
      setBrowserMessage('You do not have write permission.');
      return;
    }
    if (!renameModal) {
      return;
    }

    const nextName = renameModal.nextName.trim();
    if (!nextName) {
      setModalError('Name is required.');
      return;
    }
    if (nextName === renameModal.currentName) {
      closeModals();
      return;
    }

    try {
      await renameItemAsync({ sourcePath: renameModal.sourcePath, newName: nextName });
      closeModals();
      setBrowserMessage('Item renamed successfully.');
      refreshBrowse();
    } catch {
      setModalError('Failed to rename item.');
    }
  };

  const submitMove = async () => {
    if (!canWrite) {
      closeModals();
      setBrowserMessage('You do not have write permission.');
      return;
    }
    if (!moveModal) {
      return;
    }

    const destinationPath = moveModal.destinationPath.trim();
    if (!destinationPath) {
      setModalError('Destination path is required.');
      return;
    }

    try {
      await renameItemAsync({ sourcePath: moveModal.sourcePath, destinationPath });
      closeModals();
      setBrowserMessage('Item moved successfully.');
      refreshBrowse();
    } catch {
      setModalError('Failed to move item.');
    }
  };

  const submitDelete = async () => {
    if (!canDelete) {
      closeModals();
      setBrowserMessage('You do not have delete permission.');
      return;
    }
    if (!deleteModal) {
      return;
    }

    const targetItems = deleteModal.items;
    if (targetItems.length > 1) {
      try {
        const result = await deleteMultipleAsync({ paths: targetItems.map((item) => item.path) });
        closeModals();
        selection.clearSelection();
        setBrowserMessage(result.message);
        refreshBrowse();
        return;
      } catch {
        setModalError('Failed to delete selected items.');
        return;
      }
    }

    let success = 0;
    for (const item of targetItems) {
      const ok = await removeItem(item.path, item.type);
      if (ok) {
        success += 1;
      }
    }

    closeModals();
    selection.clearSelection();
    setBrowserMessage(`Deleted ${success} of ${targetItems.length} selected item(s).`);
    refreshBrowse();
  };

  useBrowserShortcutsEffect({
    locationPathname,
    isModalOpen,
    browseItems,
    canDelete,
    canWrite,
    selectedRecordsCount: selection.selectedRecords.length,
    selectedFilesCount: selection.selectedFiles.length,
    selectedSingleItem: selection.selectedSingleItem,
    onCloseModals: closeModals,
    onClearSelection: selection.clearSelection,
    onCloseContextMenu: () => selection.setContextMenu(null),
    onSelectAll: (paths) => selection.setSelectedItems(new Set(paths)),
    onBulkDelete: bulkDelete,
    onBulkDownload: bulkDownload,
    onRename: renamePathItem,
    onMove: movePathItem,
  });

  return {
    newFolderName,
    setNewFolderName,
    browserMessage,
    selectedItems: selection.selectedItems,
    selectedFiles: selection.selectedFiles,
    contextMenu: selection.contextMenu,
    renameModal,
    moveModal,
    deleteModal,
    propertiesModal,
    modalError,
    activeModalRef,
    closeModals,
    setRenameNextName: (value: string) => {
      setRenameModal((previous) => (previous ? { ...previous, nextName: value } : previous));
      setModalError('');
    },
    setMoveDestinationPath: (value: string) => {
      setMoveModal((previous) => (previous ? { ...previous, destinationPath: value } : previous));
      setModalError('');
    },
    setLastSelectedIndex: selection.setLastSelectedIndex,
    toggleSelection: selection.toggleSelection,
    clearSelection: selection.clearSelection,
    handleRowClick: selection.handleRowClick,
    openContextMenu: selection.openContextMenu,
    createFolderInCurrentPath,
    bulkDownload,
    bulkDelete,
    renamePathItem,
    movePathItem,
    downloadFile,
    openProperties,
    deletePathItems,
    submitRename,
    submitMove,
    submitDelete,
  };
};
