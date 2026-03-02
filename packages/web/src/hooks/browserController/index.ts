// Main hook
export { useBrowserController } from './useBrowserControllerCore';

// Utility functions
export {
  splitObjectPath,
  resolveMoveDestinationPath,
  isBucketRootPath,
  isBucketRootDirectory,
  getAncestorDirectories,
  getParentDirectoryPath,
  parseExpiresAsIso,
} from './browserPathUtils';

// Sub-hooks (exported for testing or advanced use cases)
export { useModalStates } from './useModalStates';
export { useFolderSizeCache } from './useFolderSizeCache';
export { useClipboardOperations } from './useClipboardOperations';
export { useUploadOperations } from './useUploadOperations';
export { useFileOperations } from './useFileOperations';
export { usePropertiesModal } from './usePropertiesModal';
export { useFilePreview } from './useFilePreview';

// Re-export types
export type {
  DeleteModalState,
  FilePreviewModalState,
  MoveModalState,
  PropertiesModalState,
  RenameModalState,
} from '@web/hooks/browserTypes';
