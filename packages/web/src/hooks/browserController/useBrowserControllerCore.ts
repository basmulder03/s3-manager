import type { BrowseItem } from '@server/services/s3/types';
import {
  type DeleteModalState,
  type FilePreviewModalState,
  type MoveModalState,
  type PropertiesModalState,
  type RenameModalState,
} from '@web/hooks/browserTypes';
import { useBrowserSelectionState } from '@web/hooks/useBrowserSelectionState';
import { useBrowserShortcutsEffect } from '@web/hooks/useBrowserShortcutsEffect';
import { useModalFocusTrapEffect } from '@web/hooks/useModalFocusTrapEffect';
import { useSnackbarQueue } from '@web/hooks/useSnackbarQueue';
import { useModalStates } from './useModalStates';
import { useFolderSizeCache } from './useFolderSizeCache';
import { useClipboardOperations } from './useClipboardOperations';
import { useUploadOperations } from './useUploadOperations';
import { useFileOperations } from './useFileOperations';
import { usePropertiesModal } from './usePropertiesModal';
import { useFilePreview } from './useFilePreview';

export type {
  DeleteModalState,
  FilePreviewModalState,
  MoveModalState,
  PropertiesModalState,
  RenameModalState,
};

interface UseBrowserControllerOptions {
  selectedPath: string;
  setSelectedPath: (path: string) => void;
  browseItems: BrowseItem[] | undefined;
  browsePath: string | undefined;
  refreshBrowse: () => void;
  canWrite: boolean;
  canDelete: boolean;
  canManageProperties: boolean;
  locationPathname: string;
  createFileAsync: (input: { path: string; fileName: string }) => Promise<unknown>;
  createFolderAsync: (input: { path: string; folderName: string }) => Promise<unknown>;
  renameItemAsync: (input: {
    sourcePath: string;
    newName?: string;
    destinationPath?: string;
  }) => Promise<unknown>;
  copyItemAsync: (input: { sourcePath: string; destinationPath: string }) => Promise<unknown>;
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
  canManageProperties,
  locationPathname,
  createFileAsync,
  createFolderAsync,
  renameItemAsync,
  copyItemAsync,
  deleteObjectAsync,
  deleteFolderAsync,
  deleteMultipleAsync,
}: UseBrowserControllerOptions) => {
  const { snackbars, enqueueSnackbar, updateSnackbar, dismissSnackbar } = useSnackbarQueue();

  const selection = useBrowserSelectionState({
    browseItems,
    selectedPath,
    browsePath,
    setSelectedPath,
  });

  const closeContextMenu = () => {
    selection.setContextMenu(null);
  };

  // Modal states management
  const modalStates = useModalStates();
  useModalFocusTrapEffect(modalStates.isModalOpen, modalStates.activeModalRef);

  // Folder size cache management
  const folderSizeCache = useFolderSizeCache({
    enqueueSnackbar,
    closeContextMenu,
  });

  // Clipboard operations
  const clipboard = useClipboardOperations({
    canWrite,
    enqueueSnackbar,
    closeContextMenu,
    refreshBrowse,
    renameItemAsync,
    copyItemAsync,
  });

  // Upload operations
  const upload = useUploadOperations({
    canWrite,
    selectedPath,
    enqueueSnackbar,
    updateSnackbar,
    dismissSnackbar,
    refreshBrowse,
  });

  // File operations
  const fileOps = useFileOperations({
    canWrite,
    canDelete,
    selectedPath,
    browseItems,
    enqueueSnackbar,
    closeContextMenu,
    refreshBrowse,
    setDeleteModal: modalStates.setDeleteModal,
    setModalError: modalStates.setModalError,
    closeModals: modalStates.closeModals,
    clearSelection: selection.clearSelection,
    createFileAsync,
    createFolderAsync,
    renameItemAsync,
    deleteObjectAsync,
    deleteFolderAsync,
    deleteMultipleAsync,
    updateFolderSizeAncestors: folderSizeCache.updateFolderSizeAncestors,
    removeFolderSizeEntriesByPrefix: folderSizeCache.removeFolderSizeEntriesByPrefix,
    invalidateAncestors: folderSizeCache.invalidateAncestors,
    clearFolderSizeCaches: folderSizeCache.clearFolderSizeCaches,
  });

  // Properties modal
  const properties = usePropertiesModal({
    canWrite,
    canManageProperties,
    propertiesModal: modalStates.propertiesModal,
    setPropertiesModal: modalStates.setPropertiesModal,
    enqueueSnackbar,
    closeContextMenu,
    refreshBrowse,
  });

  // File preview
  const filePreview = useFilePreview({
    canWrite,
    filePreviewModal: modalStates.filePreviewModal,
    setFilePreviewModal: modalStates.setFilePreviewModal,
    enqueueSnackbar,
    closeContextMenu,
    refreshBrowse,
  });

  // Helper functions for rename and move that bridge modal states
  const renamePathItem = (path: string, currentName: string) => {
    if (!canWrite) {
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
      return;
    }

    modalStates.setRenameModal({ sourcePath: path, currentName, nextName: currentName });
    closeContextMenu();
    modalStates.setModalError('');
  };

  const movePathItem = (path: string, destinationPath?: string) => {
    if (!canWrite) {
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
      return;
    }

    modalStates.setMoveModal({
      sourcePath: path,
      destinationPath: (destinationPath ?? selectedPath) || '',
    });
    closeContextMenu();
    modalStates.setModalError('');
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

    fileOps.deletePathItems(selection.selectedRecords);
  };

  // Keyboard shortcuts
  useBrowserShortcutsEffect({
    locationPathname,
    isModalOpen: modalStates.isModalOpen,
    browseItems,
    canDelete,
    canWrite,
    selectedRecords: selection.selectedRecords,
    selectedRecordsCount: selection.selectedRecords.length,
    selectedFilesCount: selection.selectedFiles.length,
    selectedSingleItem: selection.selectedSingleItem,
    selectedPath,
    onCloseModals: modalStates.closeModals,
    onClearSelection: selection.clearSelection,
    onCloseContextMenu: closeContextMenu,
    onSelectAll: (paths) => selection.setSelectedItems(new Set(paths)),
    onBulkDelete: bulkDelete,
    onBulkDownload: () => fileOps.bulkDownload(selection.selectedRecords),
    onCopySelection: () => clipboard.copyPathItems(selection.selectedRecords),
    onCutSelection: () => clipboard.cutPathItems(selection.selectedRecords),
    onPaste: () => {
      void clipboard.pasteClipboardItems(selectedPath);
    },
    onRename: renamePathItem,
    onMove: movePathItem,
    onOpenProperties: (path) => {
      void properties.openProperties(path);
    },
    onCalculateFolderSize: (path) => {
      void folderSizeCache.calculateFolderSize(path);
    },
  });

  return {
    // Snackbar
    snackbars,
    enqueueSnackbar,
    dismissSnackbar,

    // Selection
    selectedItems: selection.selectedItems,
    selectedFiles: selection.selectedFiles,
    setLastSelectedIndex: selection.setLastSelectedIndex,
    toggleSelection: selection.toggleSelection,
    toggleSelectionAtPath: selection.toggleSelectionAtPath,
    selectOnlyPath: selection.selectOnly,
    clearSelection: selection.clearSelection,
    handleRowClick: selection.handleRowClick,
    handleRowDoubleClick: selection.handleRowDoubleClick,

    // Context menu
    contextMenu: selection.contextMenu,
    openContextMenu: selection.openContextMenu,
    openContextMenuForItem: selection.openContextMenuForItem,
    closeContextMenu,

    // Clipboard
    hasClipboardItems: clipboard.hasClipboardItems,
    clipboardMode: clipboard.clipboardMode,
    clipboardPaths: clipboard.clipboardPaths,
    copyPathItems: clipboard.copyPathItems,
    copyTextToClipboard: clipboard.copyTextToClipboard,
    cutPathItems: clipboard.cutPathItems,
    pasteClipboardItems: clipboard.pasteClipboardItems,

    // Upload
    isUploading: upload.isUploading,
    uploadFiles: upload.uploadFiles,
    uploadFolder: upload.uploadFolder,

    // Folder sizes
    folderSizesByPath: folderSizeCache.folderSizesByPath,
    folderSizeLoadingPaths: folderSizeCache.folderSizeLoadingPaths,
    calculateFolderSize: folderSizeCache.calculateFolderSize,

    // File operations
    createFileInCurrentPath: fileOps.createFileInCurrentPath,
    createFolderInCurrentPath: fileOps.createFolderInCurrentPath,
    downloadFile: fileOps.downloadFile,
    bulkDownload: () => fileOps.bulkDownload(selection.selectedRecords),
    bulkDelete,
    renamePathItem,
    movePathItem,
    deletePathItems: fileOps.deletePathItems,
    submitRename: () => fileOps.submitRename(modalStates.renameModal),
    submitMove: () => fileOps.submitMove(modalStates.moveModal),
    submitDelete: () => fileOps.submitDelete(modalStates.deleteModal),

    // Modals
    renameModal: modalStates.renameModal,
    moveModal: modalStates.moveModal,
    deleteModal: modalStates.deleteModal,
    propertiesModal: modalStates.propertiesModal,
    filePreviewModal: modalStates.filePreviewModal,
    modalError: modalStates.modalError,
    activeModalRef: modalStates.activeModalRef,
    closeModals: modalStates.closeModals,
    closeFilePreview: modalStates.closeFilePreview,
    setRenameNextName: (value: string) => {
      modalStates.setRenameModal((previous: RenameModalState | null) =>
        previous ? { ...previous, nextName: value } : previous
      );
      modalStates.setModalError('');
    },
    setMoveDestinationPath: (value: string) => {
      modalStates.setMoveModal((previous: MoveModalState | null) =>
        previous ? { ...previous, destinationPath: value } : previous
      );
      modalStates.setModalError('');
    },

    // Properties modal
    openProperties: properties.openProperties,
    saveProperties: properties.saveProperties,
    setPropertiesField: properties.setPropertiesField,
    addPropertiesMetadataRow: properties.addPropertiesMetadataRow,
    updatePropertiesMetadataRow: properties.updatePropertiesMetadataRow,
    removePropertiesMetadataRow: properties.removePropertiesMetadataRow,
    resetPropertiesDraft: properties.resetPropertiesDraft,

    // File preview
    openFilePreview: filePreview.openFilePreview,
    saveFilePreviewText: filePreview.saveFilePreviewText,
    setFilePreviewEditable: filePreview.setFilePreviewEditable,
    setFilePreviewTextContent: filePreview.setFilePreviewTextContent,
  };
};
