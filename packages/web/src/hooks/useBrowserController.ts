import { useMemo, useRef, useState } from 'react';
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
import { useSnackbarQueue } from '@web/hooks/useSnackbarQueue';

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
  const [renameModal, setRenameModal] = useState<RenameModalState | null>(null);
  const [moveModal, setMoveModal] = useState<MoveModalState | null>(null);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);
  const [propertiesModal, setPropertiesModal] = useState<PropertiesModalState | null>(null);
  const [modalError, setModalError] = useState('');
  const [folderSizesByPath, setFolderSizesByPath] = useState<Record<string, number>>({});
  const [folderSizeLoadingPaths, setFolderSizeLoadingPaths] = useState<Set<string>>(new Set());
  const activeModalRef = useRef<HTMLDivElement>(null);
  const { snackbars, enqueueSnackbar, dismissSnackbar } = useSnackbarQueue();

  const browseItemsByPath = useMemo(() => {
    const byPath = new Map<string, BrowseItem>();
    for (const item of browseItems ?? []) {
      byPath.set(item.path, item);
    }
    return byPath;
  }, [browseItems]);

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

  const getAncestorDirectories = (directoryPath: string): string[] => {
    const normalized = directoryPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) {
      return [''];
    }

    const segments = normalized.split('/');
    const ancestors = [''];
    for (let index = 0; index < segments.length; index += 1) {
      ancestors.push(segments.slice(0, index + 1).join('/'));
    }
    return ancestors;
  };

  const getParentDirectoryPath = (path: string): string => {
    const normalized = path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) {
      return '';
    }

    const parts = normalized.split('/');
    return parts.slice(0, -1).join('/');
  };

  const removeFolderSizeEntriesByPrefix = (directoryPath: string) => {
    const normalized = directoryPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    setFolderSizesByPath((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const key of Object.keys(next)) {
        if (key === normalized || key.startsWith(`${normalized}/`)) {
          delete next[key];
          changed = true;
        }
      }

      return changed ? next : previous;
    });
  };

  const invalidateAncestors = (path: string) => {
    const parentDirectoryPath = getParentDirectoryPath(path);
    const ancestors = getAncestorDirectories(parentDirectoryPath);
    setFolderSizesByPath((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const ancestor of ancestors) {
        if (ancestor in next) {
          delete next[ancestor];
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  };

  const updateFolderSizeAncestors = (directoryPath: string, delta: number) => {
    const ancestors = getAncestorDirectories(directoryPath);
    setFolderSizesByPath((previous) => {
      const next = { ...previous };
      let changed = false;

      for (const ancestor of ancestors) {
        const current = next[ancestor];
        if (typeof current !== 'number') {
          continue;
        }

        next[ancestor] = Math.max(0, current + delta);
        changed = true;
      }

      return changed ? next : previous;
    });
  };

  const clearFolderSizeCaches = () => {
    setFolderSizesByPath({});
    setFolderSizeLoadingPaths(new Set());
  };

  const closeContextMenu = () => {
    selection.setContextMenu(null);
  };

  const createFolderInCurrentPath = async () => {
    if (!canWrite) {
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
      return;
    }

    if (!selectedPath) {
      enqueueSnackbar({
        message: 'Navigate to a bucket path before creating folders.',
        tone: 'error',
      });
      return;
    }

    if (!newFolderName.trim()) {
      enqueueSnackbar({ message: 'Folder name is required.', tone: 'error' });
      return;
    }

    try {
      await createFolderAsync({ path: selectedPath, folderName: newFolderName.trim() });
      setNewFolderName('');
      enqueueSnackbar({ message: 'Folder created successfully.', tone: 'success' });
      refreshBrowse();
    } catch {
      enqueueSnackbar({ message: 'Failed to create folder.', tone: 'error' });
    }
  };

  const downloadFile = async (path: string, silent = false) => {
    try {
      const { bucketName, objectKey } = splitObjectPath(path);
      const metadata = await trpcProxyClient.s3.getObjectMetadata.query({ bucketName, objectKey });
      window.open(metadata.downloadUrl, '_blank', 'noopener,noreferrer');
      if (!silent) {
        enqueueSnackbar({ message: 'Download link opened.', tone: 'success' });
      }
    } catch {
      if (!silent) {
        enqueueSnackbar({ message: 'Failed to generate download URL.', tone: 'error' });
      }
    }
  };

  const calculateFolderSize = async (path: string) => {
    const normalized = path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) {
      return;
    }

    closeContextMenu();

    setFolderSizeLoadingPaths((previous) => {
      const next = new Set(previous);
      next.add(normalized);
      return next;
    });

    try {
      const updates: Record<string, number> = {};

      const calculateRecursive = async (directoryPath: string): Promise<number> => {
        const result = await trpcProxyClient.s3.browse.query({ virtualPath: directoryPath });
        let totalSize = 0;

        for (const item of result.items) {
          if (item.type === 'file') {
            totalSize += item.size ?? 0;
            continue;
          }

          totalSize += await calculateRecursive(item.path);
        }

        updates[directoryPath] = totalSize;
        return totalSize;
      };

      const totalSize = await calculateRecursive(normalized);

      setFolderSizesByPath((previous) => ({
        ...previous,
        ...updates,
      }));
      enqueueSnackbar({
        message: `Calculated size for ${normalized}: ${totalSize} bytes.`,
        tone: 'info',
      });
    } catch {
      enqueueSnackbar({ message: 'Failed to calculate folder size.', tone: 'error' });
    } finally {
      setFolderSizeLoadingPaths((previous) => {
        const next = new Set(previous);
        next.delete(normalized);
        return next;
      });
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
      enqueueSnackbar({ message: 'You do not have delete permission.', tone: 'error' });
      return;
    }

    setDeleteModal({ items });
    closeContextMenu();
    setModalError('');
  };

  const bulkDelete = async () => {
    if (!canDelete) {
      enqueueSnackbar({ message: 'You do not have delete permission.', tone: 'error' });
      return;
    }

    if (selection.selectedRecords.length === 0) {
      enqueueSnackbar({ message: 'No items selected.', tone: 'info' });
      return;
    }

    deletePathItems(selection.selectedRecords);
  };

  const bulkDownload = async () => {
    if (selection.selectedRecords.length === 0) {
      enqueueSnackbar({ message: 'No items selected.', tone: 'info' });
      return;
    }

    const files = selection.selectedRecords.filter((item) => item.type === 'file');
    if (files.length === 0) {
      enqueueSnackbar({
        message: 'No files selected. Folders cannot be downloaded.',
        tone: 'info',
      });
      return;
    }

    for (const file of files) {
      await downloadFile(file.path, true);
    }

    enqueueSnackbar({ message: `Started download for ${files.length} file(s).`, tone: 'success' });
  };

  const renamePathItem = (path: string, currentName: string) => {
    if (!canWrite) {
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
      return;
    }

    setRenameModal({ sourcePath: path, currentName, nextName: currentName });
    closeContextMenu();
    setModalError('');
  };

  const movePathItem = (path: string) => {
    if (!canWrite) {
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
      return;
    }

    setMoveModal({ sourcePath: path, destinationPath: selectedPath || '' });
    closeContextMenu();
    setModalError('');
  };

  const openProperties = async (path: string) => {
    closeContextMenu();
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
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
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
      const sourceItem = browseItemsByPath.get(renameModal.sourcePath);
      await renameItemAsync({ sourcePath: renameModal.sourcePath, newName: nextName });
      closeModals();
      enqueueSnackbar({ message: 'Item renamed successfully.', tone: 'success' });
      closeContextMenu();

      if (sourceItem?.type === 'directory') {
        removeFolderSizeEntriesByPrefix(sourceItem.path);
      }

      refreshBrowse();
    } catch {
      setModalError('Failed to rename item.');
    }
  };

  const submitMove = async () => {
    if (!canWrite) {
      closeModals();
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
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
      const sourceItem = browseItemsByPath.get(moveModal.sourcePath);
      await renameItemAsync({ sourcePath: moveModal.sourcePath, destinationPath });
      closeModals();
      enqueueSnackbar({ message: 'Item moved successfully.', tone: 'success' });
      closeContextMenu();

      if (sourceItem?.type === 'file' && typeof sourceItem.size === 'number') {
        const sourceParent = getParentDirectoryPath(sourceItem.path);
        const destinationParent = getParentDirectoryPath(destinationPath);
        updateFolderSizeAncestors(sourceParent, -sourceItem.size);
        updateFolderSizeAncestors(destinationParent, sourceItem.size);
      } else {
        clearFolderSizeCaches();
      }

      refreshBrowse();
    } catch {
      setModalError('Failed to move item.');
    }
  };

  const submitDelete = async () => {
    if (!canDelete) {
      closeModals();
      enqueueSnackbar({ message: 'You do not have delete permission.', tone: 'error' });
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
        closeContextMenu();
        clearFolderSizeCaches();
        enqueueSnackbar({ message: result.message, tone: 'success' });
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
        if (item.type === 'file' && typeof item.size === 'number') {
          const parentDirectoryPath = getParentDirectoryPath(item.path);
          updateFolderSizeAncestors(parentDirectoryPath, -item.size);
        } else {
          removeFolderSizeEntriesByPrefix(item.path);
          invalidateAncestors(item.path);
        }
      }
    }

    closeModals();
    selection.clearSelection();
    closeContextMenu();
    enqueueSnackbar({
      message: `Deleted ${success} of ${targetItems.length} selected item(s).`,
      tone: success === targetItems.length ? 'success' : 'info',
    });
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
    onCloseContextMenu: closeContextMenu,
    onSelectAll: (paths) => selection.setSelectedItems(new Set(paths)),
    onBulkDelete: bulkDelete,
    onBulkDownload: bulkDownload,
    onRename: renamePathItem,
    onMove: movePathItem,
  });

  return {
    newFolderName,
    setNewFolderName,
    snackbars,
    dismissSnackbar,
    selectedItems: selection.selectedItems,
    selectedFiles: selection.selectedFiles,
    folderSizesByPath,
    folderSizeLoadingPaths,
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
    handleRowDoubleClick: selection.handleRowDoubleClick,
    openContextMenu: selection.openContextMenu,
    closeContextMenu,
    createFolderInCurrentPath,
    bulkDownload,
    bulkDelete,
    renamePathItem,
    movePathItem,
    downloadFile,
    calculateFolderSize,
    openProperties,
    deletePathItems,
    submitRename,
    submitMove,
    submitDelete,
  };
};
