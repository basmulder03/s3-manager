import { useMemo, useRef, useState } from 'react';
import { trpcProxyClient } from '@web/trpc/client';
import type { BrowseItem } from '@server/services/s3/types';
import { createUploadProceduresFromTrpc } from '@server/shared/upload/trpc-adapter';
import { uploadObjectWithCookbook } from '@server/shared/upload/client';
import { uploadObjectViaProxy } from '@web/upload/proxyUpload';
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
import { resolveFileCapability } from '@web/utils/fileCapabilities';
import { formatBytes } from '@web/utils/formatBytes';

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
  canManageProperties,
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
  const [filePreviewModal, setFilePreviewModal] = useState<FilePreviewModalState | null>(null);
  const [modalError, setModalError] = useState('');
  const [folderSizesByPath, setFolderSizesByPath] = useState<Record<string, number>>({});
  const [folderSizeLoadingPaths, setFolderSizeLoadingPaths] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const activeModalRef = useRef<HTMLDivElement>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const uploadCancellationRequestedRef = useRef(false);
  const { snackbars, enqueueSnackbar, updateSnackbar, dismissSnackbar } = useSnackbarQueue();
  const uploadProcedures = useMemo(() => createUploadProceduresFromTrpc(trpcProxyClient), []);

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
    renameModal !== null ||
    moveModal !== null ||
    deleteModal !== null ||
    propertiesModal !== null ||
    filePreviewModal !== null;

  useModalFocusTrapEffect(isModalOpen, activeModalRef);

  const closeModals = () => {
    setRenameModal(null);
    setMoveModal(null);
    setDeleteModal(null);
    setPropertiesModal(null);
    setFilePreviewModal(null);
    setModalError('');
  };

  const closeFilePreview = () => {
    setFilePreviewModal(null);
  };

  const splitObjectPath = (path: string): { bucketName: string; objectKey: string } => {
    const [bucketName, ...parts] = path.split('/');
    return {
      bucketName: bucketName ?? '',
      objectKey: parts.join('/'),
    };
  };

  const isBucketRootPath = (path: string): boolean => {
    return !path.includes('/');
  };

  const isBucketRootDirectory = (item: BrowseItem): boolean => {
    return item.type === 'directory' && isBucketRootPath(item.path);
  };

  const toMetadataDraftRows = (metadata: Record<string, string>) => {
    return Object.entries(metadata).map(([key, value], index) => ({
      id: `${index}-${key}`,
      key,
      value,
    }));
  };

  const normalizeMetadataRecord = (rows: Array<{ key: string; value: string }>) => {
    const normalized: Record<string, string> = {};
    for (const row of rows) {
      const key = row.key.trim().toLowerCase();
      const value = row.value.trim();
      if (!key || !value) {
        continue;
      }
      normalized[key] = value;
    }
    return normalized;
  };

  const parseExpiresAsIso = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString();
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

  const uploadFromSelection = async (
    files: FileList | File[],
    mode: 'files' | 'folder'
  ): Promise<void> => {
    if (isUploading) {
      return;
    }

    if (!canWrite) {
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
      return;
    }

    const normalizedSelectedPath = selectedPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    const [bucketName, ...prefixParts] = normalizedSelectedPath.split('/');
    if (!bucketName) {
      enqueueSnackbar({
        message: 'Navigate to a bucket path before uploading.',
        tone: 'error',
      });
      return;
    }

    const uploadFiles = Array.from(files);
    if (uploadFiles.length === 0) {
      return;
    }

    const prefix = prefixParts.join('/');
    const normalizedPrefix = prefix ? `${prefix}/` : '';

    let uploadedCount = 0;
    let failedCount = 0;
    let cancelled = false;
    const failureReasons = new Map<string, number>();
    const failureExamples = new Map<string, string[]>();
    const totalCount = uploadFiles.length;
    const totalBytes = uploadFiles.reduce((sum, file) => sum + file.size, 0);
    let uploadedBytes = 0;
    uploadCancellationRequestedRef.current = false;
    let progressSnackbarId = 0;
    progressSnackbarId = enqueueSnackbar({
      message: `Uploading 0/${totalCount} item(s) (${formatBytes(0)} / ${formatBytes(totalBytes)})...`,
      tone: 'info',
      durationMs: 0,
      progress: 0,
      actionLabel: 'Cancel',
      onAction: () => {
        uploadCancellationRequestedRef.current = true;
        uploadAbortControllerRef.current?.abort();
        updateSnackbar(progressSnackbarId, {
          message: 'Cancelling upload...',
          actionLabel: null,
          onAction: null,
        });
      },
    });

    const getUploadFailureReason = (error: unknown): string => {
      const rawMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message.trim()
          : 'Upload failed';
      const normalized = rawMessage.toLowerCase();

      if (normalized.includes('failed to fetch')) {
        return 'Upload request could not reach the backend upload proxy.';
      }

      return rawMessage;
    };

    const isAbortError = (error: unknown): boolean => {
      if (error instanceof DOMException) {
        return error.name === 'AbortError';
      }

      return error instanceof Error && error.name === 'AbortError';
    };

    setIsUploading(true);

    try {
      for (const file of uploadFiles) {
        if (uploadCancellationRequestedRef.current) {
          cancelled = true;
          break;
        }

        const relativePath =
          mode === 'folder'
            ? (file.webkitRelativePath || file.name).replace(/\\/g, '/').replace(/^\/+/, '')
            : file.name;
        const objectKey = `${normalizedPrefix}${relativePath}`;
        const fileAbortController = new AbortController();
        uploadAbortControllerRef.current = fileAbortController;

        try {
          const uploadedBytesBeforeFile = uploadedBytes;
          await uploadObjectWithCookbook({
            client: uploadProcedures,
            bucketName,
            objectKey,
            file,
            contentType: file.type || 'application/octet-stream',
            metadata: {
              original_filename: file.name,
            },
            forceProxyUpload: true,
            proxyUpload: (input) =>
              uploadObjectViaProxy({
                ...input,
                signal: fileAbortController.signal,
              }),
            onProgress: (event) => {
              const totalUploadedBytes = Math.min(
                totalBytes,
                uploadedBytesBeforeFile + event.uploadedBytes
              );
              const progress =
                totalBytes > 0 ? Math.round((totalUploadedBytes / totalBytes) * 100) : 0;
              updateSnackbar(progressSnackbarId, {
                message: `Uploading ${uploadedCount + failedCount}/${totalCount} item(s) (${formatBytes(totalUploadedBytes)} / ${formatBytes(totalBytes)})...`,
                progress,
              });
            },
          });
          uploadedCount += 1;
          uploadedBytes += file.size;
        } catch (error) {
          if (uploadCancellationRequestedRef.current && isAbortError(error)) {
            cancelled = true;
            break;
          }

          failedCount += 1;
          const reason = getUploadFailureReason(error);
          failureReasons.set(reason, (failureReasons.get(reason) ?? 0) + 1);
          const examples = failureExamples.get(reason) ?? [];
          if (examples.length < 2) {
            examples.push(relativePath);
            failureExamples.set(reason, examples);
          }
        } finally {
          if (uploadAbortControllerRef.current === fileAbortController) {
            uploadAbortControllerRef.current = null;
          }
        }

        const processedCount = uploadedCount + failedCount;
        const progress = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
        updateSnackbar(progressSnackbarId, {
          message: `Uploading ${processedCount}/${totalCount} item(s) (${formatBytes(uploadedBytes)} / ${formatBytes(totalBytes)})...`,
          progress,
        });
      }

      if (uploadedCount > 0) {
        refreshBrowse();
      }

      if (cancelled) {
        enqueueSnackbar({
          message: `Upload cancelled after ${uploadedCount}/${totalCount} item(s) (${formatBytes(uploadedBytes)} / ${formatBytes(totalBytes)}).`,
          tone: uploadedCount > 0 ? 'info' : 'error',
        });
        return;
      }

      const failureReasonSummary = Array.from(failureReasons.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 2)
        .map(([reason, count]) => {
          const examples = failureExamples.get(reason) ?? [];
          const suffix = examples.length > 0 ? `, e.g. ${examples.join(', ')}` : '';
          return count > 1 ? `${reason} (${count}${suffix})` : `${reason}${suffix}`;
        })
        .join('; ');

      if (failedCount === 0) {
        enqueueSnackbar({ message: `Uploaded ${uploadedCount} item(s).`, tone: 'success' });
        return;
      }

      if (uploadedCount === 0) {
        enqueueSnackbar({
          message: `Failed to upload ${failedCount} item(s): ${failureReasonSummary}`,
          tone: 'error',
        });
        return;
      }

      enqueueSnackbar({
        message: `Uploaded ${uploadedCount} item(s), failed ${failedCount} item(s): ${failureReasonSummary}`,
        tone: 'info',
      });
    } finally {
      uploadCancellationRequestedRef.current = false;
      uploadAbortControllerRef.current = null;
      dismissSnackbar(progressSnackbarId);
      setIsUploading(false);
    }
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
        message: `Calculated size for ${normalized}: ${formatBytes(totalSize)}.`,
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
    setPropertiesModal({
      path,
      loading: true,
      saving: false,
      error: '',
      dirty: false,
      details: null,
      draft: null,
    });

    try {
      const details = await trpcProxyClient.s3.getProperties.query({ path });
      setPropertiesModal({
        path,
        loading: false,
        saving: false,
        error: '',
        dirty: false,
        details,
        draft: {
          contentType: details.contentType,
          storageClass: details.storageClass,
          cacheControl: details.cacheControl ?? '',
          contentDisposition: details.contentDisposition ?? '',
          contentEncoding: details.contentEncoding ?? '',
          contentLanguage: details.contentLanguage ?? '',
          expires: details.expires ?? '',
          metadata: toMetadataDraftRows(details.metadata),
        },
      });
    } catch {
      setPropertiesModal({
        path,
        loading: false,
        saving: false,
        error: 'Failed to load file properties.',
        dirty: false,
        details: null,
        draft: null,
      });
    }
  };

  const isPropertiesDraftDirty = (
    details: NonNullable<PropertiesModalState['details']>,
    draft: NonNullable<PropertiesModalState['draft']>
  ): boolean => {
    const expiresIso = parseExpiresAsIso(draft.expires);
    const detailsExpiresIso = details.expires ? parseExpiresAsIso(details.expires) : null;
    if ((expiresIso ?? '') !== (detailsExpiresIso ?? '')) {
      return true;
    }

    if (draft.contentType.trim() !== details.contentType) {
      return true;
    }
    if (draft.storageClass.trim() !== details.storageClass) {
      return true;
    }
    if (draft.cacheControl.trim() !== (details.cacheControl ?? '')) {
      return true;
    }
    if (draft.contentDisposition.trim() !== (details.contentDisposition ?? '')) {
      return true;
    }
    if (draft.contentEncoding.trim() !== (details.contentEncoding ?? '')) {
      return true;
    }
    if (draft.contentLanguage.trim() !== (details.contentLanguage ?? '')) {
      return true;
    }

    const draftMetadata = normalizeMetadataRecord(draft.metadata);
    const detailsMetadata = normalizeMetadataRecord(
      Object.entries(details.metadata).map(([key, value]) => ({ key, value }))
    );

    const draftKeys = Object.keys(draftMetadata).sort();
    const detailKeys = Object.keys(detailsMetadata).sort();
    if (draftKeys.length !== detailKeys.length) {
      return true;
    }

    return draftKeys.some((key, index) => {
      const detailKey = detailKeys[index];
      if (!detailKey || key !== detailKey) {
        return true;
      }
      return draftMetadata[key] !== detailsMetadata[key];
    });
  };

  const updatePropertiesDraft = (
    updater: (
      draft: NonNullable<PropertiesModalState['draft']>
    ) => NonNullable<PropertiesModalState['draft']>
  ) => {
    setPropertiesModal((previous) => {
      if (!previous || !previous.details || !previous.draft) {
        return previous;
      }

      const nextDraft = updater(previous.draft);
      return {
        ...previous,
        error: '',
        draft: nextDraft,
        dirty: isPropertiesDraftDirty(previous.details, nextDraft),
      };
    });
  };

  const saveProperties = async () => {
    if (!canWrite || !canManageProperties) {
      enqueueSnackbar({
        message: 'You need both write and manage_properties permissions to edit file properties.',
        tone: 'error',
      });
      return;
    }

    if (
      !propertiesModal ||
      !propertiesModal.details ||
      !propertiesModal.draft ||
      !propertiesModal.dirty
    ) {
      return;
    }

    const normalizedMetadata = normalizeMetadataRecord(propertiesModal.draft.metadata);
    const metadataKeys = propertiesModal.draft.metadata
      .map((entry) => entry.key.trim().toLowerCase())
      .filter((key) => key.length > 0);
    const duplicateOrEmptyKey = new Set(metadataKeys).size !== metadataKeys.length;

    if (duplicateOrEmptyKey) {
      setPropertiesModal((previous) =>
        previous ? { ...previous, error: 'Duplicate metadata keys are not allowed.' } : previous
      );
      return;
    }

    const hasKeyWithoutValue = propertiesModal.draft.metadata.some(
      (entry) => entry.key.trim().length > 0 && entry.value.trim().length === 0
    );
    if (hasKeyWithoutValue) {
      setPropertiesModal((previous) =>
        previous
          ? { ...previous, error: 'Metadata values are required for each metadata key.' }
          : previous
      );
      return;
    }

    const hasValueWithoutKey = propertiesModal.draft.metadata.some(
      (entry) => entry.key.trim().length === 0 && entry.value.trim().length > 0
    );
    if (hasValueWithoutKey) {
      setPropertiesModal((previous) =>
        previous
          ? { ...previous, error: 'Metadata keys are required for each metadata value.' }
          : previous
      );
      return;
    }

    const expiresInput = propertiesModal.draft.expires.trim();
    const parsedExpires = expiresInput ? new Date(expiresInput) : null;
    if (expiresInput && (!parsedExpires || Number.isNaN(parsedExpires.getTime()))) {
      setPropertiesModal((previous) =>
        previous ? { ...previous, error: 'Expires must be a valid date/time.' } : previous
      );
      return;
    }

    setPropertiesModal((previous) =>
      previous
        ? {
            ...previous,
            saving: true,
            error: '',
          }
        : previous
    );

    try {
      const result = await trpcProxyClient.s3.updateProperties.mutate({
        path: propertiesModal.path,
        contentType: propertiesModal.draft.contentType.trim(),
        storageClass: propertiesModal.draft.storageClass.trim(),
        cacheControl: propertiesModal.draft.cacheControl.trim() || null,
        contentDisposition: propertiesModal.draft.contentDisposition.trim() || null,
        contentEncoding: propertiesModal.draft.contentEncoding.trim() || null,
        contentLanguage: propertiesModal.draft.contentLanguage.trim() || null,
        expires: expiresInput ? parsedExpires!.toISOString() : null,
        metadata: normalizedMetadata,
      });

      setPropertiesModal((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          saving: false,
          dirty: false,
          details: result,
          draft: {
            contentType: result.contentType,
            storageClass: result.storageClass,
            cacheControl: result.cacheControl ?? '',
            contentDisposition: result.contentDisposition ?? '',
            contentEncoding: result.contentEncoding ?? '',
            contentLanguage: result.contentLanguage ?? '',
            expires: result.expires ?? '',
            metadata: toMetadataDraftRows(result.metadata),
          },
          error: '',
        };
      });
      enqueueSnackbar({ message: 'File properties updated.', tone: 'success' });
      refreshBrowse();
    } catch (error) {
      setPropertiesModal((previous) =>
        previous
          ? {
              ...previous,
              saving: false,
              error: error instanceof Error ? error.message : 'Failed to save file properties.',
            }
          : previous
      );
    }
  };

  const setPropertiesField = (
    field:
      | 'contentType'
      | 'storageClass'
      | 'cacheControl'
      | 'contentDisposition'
      | 'contentEncoding'
      | 'contentLanguage'
      | 'expires',
    value: string
  ) => {
    updatePropertiesDraft((draft) => ({
      ...draft,
      [field]: value,
    }));
  };

  const addPropertiesMetadataRow = () => {
    updatePropertiesDraft((draft) => ({
      ...draft,
      metadata: [
        ...draft.metadata,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          key: '',
          value: '',
        },
      ],
    }));
  };

  const updatePropertiesMetadataRow = (id: string, field: 'key' | 'value', value: string) => {
    updatePropertiesDraft((draft) => ({
      ...draft,
      metadata: draft.metadata.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry
      ),
    }));
  };

  const removePropertiesMetadataRow = (id: string) => {
    updatePropertiesDraft((draft) => ({
      ...draft,
      metadata: draft.metadata.filter((entry) => entry.id !== id),
    }));
  };

  const resetPropertiesDraft = () => {
    setPropertiesModal((previous) => {
      if (!previous || !previous.details) {
        return previous;
      }

      const details = previous.details;
      return {
        ...previous,
        error: '',
        saving: false,
        dirty: false,
        draft: {
          contentType: details.contentType,
          storageClass: details.storageClass,
          cacheControl: details.cacheControl ?? '',
          contentDisposition: details.contentDisposition ?? '',
          contentEncoding: details.contentEncoding ?? '',
          contentLanguage: details.contentLanguage ?? '',
          expires: details.expires ?? '',
          metadata: toMetadataDraftRows(details.metadata),
        },
      };
    });
  };

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
      window.open(metadata.downloadUrl, '_blank', 'noopener,noreferrer');
      enqueueSnackbar({
        message: 'Preview is not available for this file type. Download link opened.',
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
    isUploading,
    folderSizesByPath,
    folderSizeLoadingPaths,
    contextMenu: selection.contextMenu,
    renameModal,
    moveModal,
    deleteModal,
    propertiesModal,
    filePreviewModal,
    modalError,
    activeModalRef,
    closeModals,
    closeFilePreview,
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
    uploadFiles: (files: FileList | File[]) => uploadFromSelection(files, 'files'),
    uploadFolder: (files: FileList | File[]) => uploadFromSelection(files, 'folder'),
    bulkDownload,
    bulkDelete,
    renamePathItem,
    movePathItem,
    downloadFile,
    calculateFolderSize,
    openProperties,
    saveProperties,
    setPropertiesField,
    addPropertiesMetadataRow,
    updatePropertiesMetadataRow,
    removePropertiesMetadataRow,
    resetPropertiesDraft,
    openFilePreview,
    saveFilePreviewText,
    setFilePreviewEditable,
    setFilePreviewTextContent: (value: string) => {
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
    },
    deletePathItems,
    submitRename,
    submitMove,
    submitDelete,
  };
};
