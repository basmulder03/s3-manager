import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { BrowseItem } from '@server/services/s3/types';

interface UseBrowserSelectionOptions {
  browseItems: BrowseItem[] | undefined;
  selectedPath: string;
  browsePath: string | undefined;
  setSelectedPath: (path: string) => void;
}

export const useBrowserSelectionState = ({
  browseItems,
  selectedPath,
  browsePath,
  setSelectedPath,
}: UseBrowserSelectionOptions) => {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: BrowseItem;
  } | null>(null);

  const itemsByPath = useMemo(() => {
    const map = new Map<string, BrowseItem>();
    for (const item of browseItems ?? []) {
      map.set(item.path, item);
    }
    return map;
  }, [browseItems]);

  const selectedRecords = useMemo(() => {
    const records: BrowseItem[] = [];
    for (const path of selectedItems) {
      const record = itemsByPath.get(path);
      if (record) {
        records.push(record);
      }
    }
    return records;
  }, [itemsByPath, selectedItems]);

  const selectedFiles = useMemo(() => {
    return selectedRecords.filter((item) => item.type === 'file');
  }, [selectedRecords]);

  const selectedSingleItem = useMemo(() => {
    return selectedRecords.length === 1 ? (selectedRecords[0] ?? null) : null;
  }, [selectedRecords]);

  useEffect(() => {
    setSelectedItems(new Set());
    setLastSelectedIndex(null);
  }, [selectedPath, browsePath]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const close = () => {
      setContextMenu(null);
    };

    window.addEventListener('pointerdown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
    };
  }, [contextMenu]);

  const toggleSelection = (path: string, checked: boolean) => {
    setSelectedItems((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
    setLastSelectedIndex(null);
  };

  const selectRange = (endIndex: number) => {
    if (!browseItems || lastSelectedIndex === null) {
      return;
    }

    const start = Math.min(lastSelectedIndex, endIndex);
    const end = Math.max(lastSelectedIndex, endIndex);

    setSelectedItems((previous) => {
      const next = new Set(previous);
      for (let index = start; index <= end; index += 1) {
        const item = browseItems[index];
        if (item) {
          next.add(item.path);
        }
      }
      return next;
    });
  };

  const selectOnly = (path: string, index?: number) => {
    setSelectedItems(new Set([path]));
    if (typeof index === 'number') {
      setLastSelectedIndex(index);
    }
  };

  const toggleSelectionAtPath = (path: string, index: number) => {
    setSelectedItems((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
    setLastSelectedIndex(index);
  };

  const handleRowClick = (item: BrowseItem, index: number, event: MouseEvent<HTMLElement>) => {
    if (event.shiftKey) {
      event.preventDefault();
      selectRange(index);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      toggleSelectionAtPath(item.path, index);
      return;
    }

    if (selectedItems.has(item.path)) {
      setSelectedItems((previous) => {
        const next = new Set(previous);
        next.delete(item.path);
        return next;
      });
      setLastSelectedIndex(null);
      return;
    }

    selectOnly(item.path, index);
  };

  const openContextMenuAt = (item: BrowseItem, clientX: number, clientY: number) => {
    if (!selectedItems.has(item.path)) {
      selectOnly(item.path);
    }

    const menuWidth = 220;
    const menuHeight = 230;
    const margin = 10;

    const x = Math.min(clientX, window.innerWidth - menuWidth - margin);
    const y = Math.min(clientY, window.innerHeight - menuHeight - margin);

    setContextMenu({
      x: Math.max(margin, x),
      y: Math.max(margin, y),
      item,
    });
  };

  const handleRowDoubleClick = (item: BrowseItem) => {
    if (item.type === 'directory') {
      setSelectedPath(item.path);
    }
  };

  const openContextMenu = (item: BrowseItem, event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    openContextMenuAt(item, event.clientX, event.clientY);
  };

  const openContextMenuForItem = (item: BrowseItem) => {
    const x = Math.max(20, window.innerWidth * 0.55);
    const y = Math.max(20, window.innerHeight * 0.34);
    openContextMenuAt(item, x, y);
  };

  return {
    selectedItems,
    setSelectedItems,
    setLastSelectedIndex,
    selectedRecords,
    selectedFiles,
    selectedSingleItem,
    contextMenu,
    setContextMenu,
    toggleSelection,
    toggleSelectionAtPath,
    selectOnly,
    clearSelection,
    handleRowClick,
    handleRowDoubleClick,
    openContextMenu,
    openContextMenuForItem,
  };
};
