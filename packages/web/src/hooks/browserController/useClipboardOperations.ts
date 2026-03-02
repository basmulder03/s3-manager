import { useState } from 'react';
import type { BrowseItem } from '@server/services/s3/types';
import { isBucketRootDirectory } from './browserPathUtils';

type ClipboardMode = 'copy' | 'cut';

interface ClipboardState {
  mode: ClipboardMode;
  items: BrowseItem[];
}

export interface UseClipboardOperationsOptions {
  canWrite: boolean;
  enqueueSnackbar: (message: { message: string; tone: 'success' | 'error' | 'info' }) => void;
  closeContextMenu: () => void;
  refreshBrowse: () => void;
  renameItemAsync: (input: {
    sourcePath: string;
    newName?: string;
    destinationPath?: string;
  }) => Promise<unknown>;
  copyItemAsync: (input: { sourcePath: string; destinationPath: string }) => Promise<unknown>;
}

export interface UseClipboardOperationsReturn {
  clipboardState: ClipboardState | null;
  hasClipboardItems: boolean;
  clipboardMode: ClipboardMode | null;
  clipboardPaths: Set<string>;
  copyPathItems: (items: BrowseItem[]) => void;
  cutPathItems: (items: BrowseItem[]) => void;
  pasteClipboardItems: (destinationPath: string) => Promise<void>;
  copyTextToClipboard: (value: string, label: string) => Promise<void>;
}

/**
 * Hook to manage clipboard operations (copy, cut, paste)
 * Handles both file/folder operations and text clipboard
 */
export const useClipboardOperations = ({
  canWrite,
  enqueueSnackbar,
  closeContextMenu,
  refreshBrowse,
  renameItemAsync,
  copyItemAsync,
}: UseClipboardOperationsOptions): UseClipboardOperationsReturn => {
  const [clipboardState, setClipboardState] = useState<ClipboardState | null>(null);

  const normalizeClipboardItems = (items: BrowseItem[]): BrowseItem[] => {
    const allowed = items.filter((item) => !isBucketRootDirectory(item));
    const byPath = new Map<string, BrowseItem>();
    for (const item of allowed) {
      if (!byPath.has(item.path)) {
        byPath.set(item.path, item);
      }
    }
    return Array.from(byPath.values());
  };

  const copyPathItems = (items: BrowseItem[]) => {
    const normalizedItems = normalizeClipboardItems(items);
    if (normalizedItems.length === 0) {
      enqueueSnackbar({ message: 'Select files or folders to copy.', tone: 'info' });
      return;
    }

    if (normalizedItems.length !== items.length) {
      enqueueSnackbar({ message: 'Bucket roots cannot be copied.', tone: 'info' });
    }

    setClipboardState({ mode: 'copy', items: normalizedItems });
    closeContextMenu();
    enqueueSnackbar({
      message: `Copied ${normalizedItems.length} item(s) to clipboard.`,
      tone: 'success',
    });
  };

  const cutPathItems = (items: BrowseItem[]) => {
    if (!canWrite) {
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
      return;
    }

    const normalizedItems = normalizeClipboardItems(items);
    if (normalizedItems.length === 0) {
      enqueueSnackbar({ message: 'Select files or folders to cut.', tone: 'info' });
      return;
    }

    if (normalizedItems.length !== items.length) {
      enqueueSnackbar({ message: 'Bucket roots cannot be cut.', tone: 'info' });
    }

    setClipboardState({ mode: 'cut', items: normalizedItems });
    closeContextMenu();
    enqueueSnackbar({
      message: `Cut ${normalizedItems.length} item(s). Choose a destination and paste.`,
      tone: 'success',
    });
  };

  const copyTextToClipboard = async (value: string, label: string) => {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      enqueueSnackbar({
        message: `No ${label.toLowerCase()} value available to copy.`,
        tone: 'info',
      });
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== 'function'
    ) {
      enqueueSnackbar({
        message: 'Clipboard access is not available in this browser.',
        tone: 'error',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(normalizedValue);
      enqueueSnackbar({ message: `Copied ${label.toLowerCase()} to clipboard.`, tone: 'success' });
    } catch {
      enqueueSnackbar({ message: `Failed to copy ${label.toLowerCase()}.`, tone: 'error' });
    }
  };

  const pasteClipboardItems = async (destinationPath: string) => {
    if (!canWrite) {
      enqueueSnackbar({ message: 'You do not have write permission.', tone: 'error' });
      return;
    }

    if (!clipboardState || clipboardState.items.length === 0) {
      enqueueSnackbar({ message: 'Clipboard is empty.', tone: 'info' });
      return;
    }

    const normalizedDestinationPath = destinationPath
      .trim()
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
    if (!normalizedDestinationPath) {
      enqueueSnackbar({ message: 'Open a bucket or folder before pasting.', tone: 'info' });
      return;
    }

    const destinationHasBucket = normalizedDestinationPath.includes('/');
    const destinationPathWithBucket = destinationHasBucket
      ? normalizedDestinationPath
      : `${normalizedDestinationPath}`;

    let successCount = 0;
    let failureCount = 0;

    for (const item of clipboardState.items) {
      try {
        if (clipboardState.mode === 'copy') {
          await copyItemAsync({
            sourcePath: item.path,
            destinationPath: destinationPathWithBucket,
          });
        } else {
          await renameItemAsync({
            sourcePath: item.path,
            destinationPath: destinationPathWithBucket,
          });
        }
        successCount += 1;
      } catch {
        failureCount += 1;
      }
    }

    if (clipboardState.mode === 'cut' && failureCount === 0) {
      setClipboardState(null);
    }

    if (successCount > 0 && failureCount === 0) {
      enqueueSnackbar({
        message:
          clipboardState.mode === 'copy'
            ? `Pasted ${successCount} copied item(s).`
            : `Moved ${successCount} item(s).`,
        tone: 'success',
      });
    } else if (successCount > 0) {
      enqueueSnackbar({
        message: `Pasted ${successCount} item(s); ${failureCount} failed.`,
        tone: 'info',
      });
    } else {
      enqueueSnackbar({ message: 'Paste failed for all selected items.', tone: 'error' });
    }

    refreshBrowse();
  };

  const hasClipboardItems = Boolean(clipboardState && clipboardState.items.length > 0);
  const clipboardMode = clipboardState?.mode ?? null;
  const clipboardPaths = new Set((clipboardState?.items ?? []).map((item) => item.path));

  return {
    clipboardState,
    hasClipboardItems,
    clipboardMode,
    clipboardPaths,
    copyPathItems,
    cutPathItems,
    pasteClipboardItems,
    copyTextToClipboard,
  };
};
