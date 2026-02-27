import { useEffect } from 'react';
import type { BrowseItem } from '@server/services/s3/types';

interface UseBrowserShortcutsOptions {
  locationPathname: string;
  isModalOpen: boolean;
  browseItems: BrowseItem[] | undefined;
  canDelete: boolean;
  canWrite: boolean;
  selectedRecordsCount: number;
  selectedFilesCount: number;
  selectedSingleItem: BrowseItem | null;
  onCloseModals: () => void;
  onClearSelection: () => void;
  onCloseContextMenu: () => void;
  onSelectAll: (paths: string[]) => void;
  onBulkDelete: () => Promise<void>;
  onBulkDownload: () => Promise<void>;
  onRename: (path: string, name: string) => void;
  onMove: (path: string) => void;
}

export const useBrowserShortcutsEffect = ({
  locationPathname,
  isModalOpen,
  browseItems,
  canDelete,
  canWrite,
  selectedRecordsCount,
  selectedFilesCount,
  selectedSingleItem,
  onCloseModals,
  onClearSelection,
  onCloseContextMenu,
  onSelectAll,
  onBulkDelete,
  onBulkDownload,
  onRename,
  onMove,
}: UseBrowserShortcutsOptions) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (locationPathname !== '/') {
        return;
      }

      if (isModalOpen) {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCloseModals();
        }
        return;
      }

      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        onSelectAll((browseItems ?? []).map((item) => item.path));
        return;
      }

      if (event.key === 'Escape') {
        onClearSelection();
        onCloseContextMenu();
        return;
      }

      if (event.key === 'Delete' && canDelete && selectedRecordsCount > 0) {
        event.preventDefault();
        void onBulkDelete();
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'd' &&
        selectedFilesCount > 0
      ) {
        event.preventDefault();
        void onBulkDownload();
        return;
      }

      if (event.key === 'F2' && canWrite && selectedSingleItem) {
        event.preventDefault();
        onRename(selectedSingleItem.path, selectedSingleItem.name);
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'm' &&
        canWrite &&
        selectedSingleItem
      ) {
        event.preventDefault();
        onMove(selectedSingleItem.path);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    locationPathname,
    isModalOpen,
    browseItems,
    canDelete,
    canWrite,
    selectedRecordsCount,
    selectedFilesCount,
    selectedSingleItem,
    onCloseModals,
    onClearSelection,
    onCloseContextMenu,
    onSelectAll,
    onBulkDelete,
    onBulkDownload,
    onRename,
    onMove,
  ]);
};
