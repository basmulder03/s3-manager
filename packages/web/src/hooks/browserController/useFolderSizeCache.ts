import { useState } from 'react';
import { trpcProxyClient } from '@web/trpc/client';
import { formatBytes } from '@web/utils/formatBytes';
import { getAncestorDirectories, getParentDirectoryPath } from './browserPathUtils';

export interface UseFolderSizeCacheOptions {
  enqueueSnackbar: (message: { message: string; tone: 'success' | 'error' | 'info' }) => void;
  closeContextMenu: () => void;
}

export interface UseFolderSizeCacheReturn {
  folderSizesByPath: Record<string, number>;
  folderSizeLoadingPaths: Set<string>;
  calculateFolderSize: (path: string) => Promise<void>;
  updateFolderSizeAncestors: (directoryPath: string, delta: number) => void;
  removeFolderSizeEntriesByPrefix: (directoryPath: string) => void;
  invalidateAncestors: (path: string) => void;
  clearFolderSizeCaches: () => void;
}

/**
 * Hook to manage folder size caching and calculation
 * Tracks folder sizes and loading states, with methods to update ancestors
 */
export const useFolderSizeCache = ({
  enqueueSnackbar,
  closeContextMenu,
}: UseFolderSizeCacheOptions): UseFolderSizeCacheReturn => {
  const [folderSizesByPath, setFolderSizesByPath] = useState<Record<string, number>>({});
  const [folderSizeLoadingPaths, setFolderSizeLoadingPaths] = useState<Set<string>>(new Set());

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

  return {
    folderSizesByPath,
    folderSizeLoadingPaths,
    calculateFolderSize,
    updateFolderSizeAncestors,
    removeFolderSizeEntriesByPrefix,
    invalidateAncestors,
    clearFolderSizeCaches,
  };
};
