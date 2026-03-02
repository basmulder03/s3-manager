import { useMemo } from 'react';
import { trpcProxyClient } from '@web/trpc/client';
import type { BrowseItem } from '@server/services/s3/types';
import type { DeleteModalState } from '@web/hooks/browserTypes';
import {
  getParentDirectoryPath,
  isBucketRootDirectory,
  isBucketRootPath,
  splitObjectPath,
  resolveMoveDestinationPath,
} from './browserPathUtils';

export interface UseFileOperationsOptions {
  canWrite: boolean;
  canDelete: boolean;
  selectedPath: string;
  browseItems: BrowseItem[] | undefined;
  enqueueSnackbar: (message: { message: string; tone: 'success' | 'error' | 'info' }) => void;
  closeContextMenu: () => void;
  refreshBrowse: () => void;
  setDeleteModal: (state: DeleteModalState | null) => void;
  setModalError: (error: string) => void;
  closeModals: () => void;
  clearSelection: () => void;
  createFileAsync: (input: { path: string; fileName: string }) => Promise<unknown>;
  createFolderAsync: (input: { path: string; folderName: string }) => Promise<unknown>;
  renameItemAsync: (input: {
    sourcePath: string;
    newName?: string;
    destinationPath?: string;
  }) => Promise<unknown>;
  deleteObjectAsync: (input: { bucketName: string; objectKey: string }) => Promise<unknown>;
  deleteFolderAsync: (input: { path: string }) => Promise<unknown>;
  deleteMultipleAsync: (input: { paths: string[] }) => Promise<{ message: string }>;
  updateFolderSizeAncestors: (directoryPath: string, delta: number) => void;
  removeFolderSizeEntriesByPrefix: (directoryPath: string) => void;
  invalidateAncestors: (path: string) => void;
  clearFolderSizeCaches: () => void;
}

export interface UseFileOperationsReturn {
  browseItemsByPath: Map<string, BrowseItem>;
  createFileInCurrentPath: (fileName: string) => Promise<void>;
  createFolderInCurrentPath: (folderName: string) => Promise<void>;
  downloadFile: (path: string, silent?: boolean) => Promise<void>;
  bulkDownload: (selectedRecords: BrowseItem[]) => Promise<void>;
  renamePathItem: (path: string, currentName: string) => void;
  movePathItem: (path: string, destinationPath?: string) => void;
  deletePathItems: (items: BrowseItem[]) => void;
  submitRename: (
    renameModal: { sourcePath: string; currentName: string; nextName: string } | null
  ) => Promise<void>;
  submitMove: (moveModal: { sourcePath: string; destinationPath: string } | null) => Promise<void>;
  submitDelete: (deleteModal: DeleteModalState | null) => Promise<void>;
}

/**
 * Hook to manage file and folder operations
 * Handles create, download, rename, move, and delete operations
 */
export const useFileOperations = ({
  canWrite,
  canDelete,
  selectedPath,
  browseItems,
  enqueueSnackbar,
  closeContextMenu,
  refreshBrowse,
  setDeleteModal,
  setModalError,
  closeModals,
  clearSelection,
  createFileAsync,
  createFolderAsync,
  renameItemAsync,
  deleteObjectAsync,
  deleteFolderAsync,
  deleteMultipleAsync,
  updateFolderSizeAncestors,
  removeFolderSizeEntriesByPrefix,
  invalidateAncestors,
  clearFolderSizeCaches,
}: UseFileOperationsOptions): UseFileOperationsReturn => {
  const browseItemsByPath = useMemo(() => {
    const byPath = new Map<string, BrowseItem>();
    for (const item of browseItems ?? []) {
      byPath.set(item.path, item);
    }
    return byPath;
  }, [browseItems]);

  const createFileInCurrentPath = async (fileName: string) => {
    if (!canWrite) {
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
      return;
    }

    if (!selectedPath) {
      enqueueSnackbar({
        message: 'Navigate to a bucket path before creating files.',
        tone: 'error',
      });
      return;
    }

    const trimmedFileName = fileName.trim();
    if (!trimmedFileName) {
      enqueueSnackbar({ message: 'File name is required.', tone: 'error' });
      return;
    }

    try {
      await createFileAsync({ path: selectedPath, fileName: trimmedFileName });
      enqueueSnackbar({ message: 'File created successfully.', tone: 'success' });
      refreshBrowse();
    } catch {
      enqueueSnackbar({ message: 'Failed to create file.', tone: 'error' });
    }
  };

  const createFolderInCurrentPath = async (folderName: string) => {
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

    const trimmedFolderName = folderName.trim();
    if (!trimmedFolderName) {
      enqueueSnackbar({ message: 'Folder name is required.', tone: 'error' });
      return;
    }

    try {
      await createFolderAsync({ path: selectedPath, folderName: trimmedFolderName });
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

  const bulkDownload = async (selectedRecords: BrowseItem[]) => {
    if (selectedRecords.length === 0) {
      enqueueSnackbar({ message: 'No items selected.', tone: 'info' });
      return;
    }

    const files = selectedRecords.filter((item) => item.type === 'file');
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

  const renamePathItem = (_path: string, _currentName: string) => {
    if (!canWrite) {
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
      return;
    }

    // Note: This function's implementation is completed in the main hook
    // where it has access to setRenameModal from useModalStates
  };

  const movePathItem = (_path: string, _destinationPath?: string) => {
    if (!canWrite) {
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
      return;
    }

    // Note: This function's implementation is completed in the main hook
    // where it has access to setMoveModal from useModalStates
  };

  const deletePathItems = (items: BrowseItem[]) => {
    if (!canDelete) {
      enqueueSnackbar({ message: 'You do not have delete permission.', tone: 'error' });
      return;
    }

    const deletableItems = items.filter((item) => !isBucketRootDirectory(item));
    if (deletableItems.length !== items.length) {
      enqueueSnackbar({
        message: 'Bucket deletion is not supported.',
        tone: 'info',
      });
    }

    if (deletableItems.length === 0) {
      return;
    }

    setDeleteModal({ items: deletableItems });
    closeContextMenu();
    setModalError('');
  };

  const removeItem = async (path: string, type: 'file' | 'directory'): Promise<boolean> => {
    if (type === 'directory' && isBucketRootPath(path)) {
      return false;
    }

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

  const submitRename = async (
    renameModal: { sourcePath: string; currentName: string; nextName: string } | null
  ) => {
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

  const submitMove = async (moveModal: { sourcePath: string; destinationPath: string } | null) => {
    if (!canWrite) {
      closeModals();
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
      return;
    }
    if (!moveModal) {
      return;
    }

    const destinationPath = resolveMoveDestinationPath(
      moveModal.sourcePath,
      moveModal.destinationPath
    );
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
    } catch (error) {
      const message = error instanceof Error ? error.message.trim() : '';
      setModalError(message || 'Failed to move item.');
    }
  };

  const submitDelete = async (deleteModal: DeleteModalState | null) => {
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
        clearSelection();
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
    clearSelection();
    closeContextMenu();
    enqueueSnackbar({
      message: `Deleted ${success} of ${targetItems.length} selected item(s).`,
      tone: success === targetItems.length ? 'success' : 'info',
    });
    refreshBrowse();
  };

  return {
    browseItemsByPath,
    createFileInCurrentPath,
    createFolderInCurrentPath,
    downloadFile,
    bulkDownload,
    renamePathItem,
    movePathItem,
    deletePathItems,
    submitRename,
    submitMove,
    submitDelete,
  };
};
