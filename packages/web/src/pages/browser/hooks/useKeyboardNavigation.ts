import { useEffect, useCallback, useMemo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { BrowseItem } from '@server/services/s3/types';

interface UseKeyboardNavigationProps {
  renderedItems: Array<{ item: BrowseItem; isParentNavigation: boolean }>;
  isExplorerGridView: boolean;
  selectedPath: string;
  setSelectedPath: (path: string) => void;
  parentPath: string;
  onViewFile: (path: string) => Promise<void>;
  onRowDoubleClick: (item: BrowseItem) => void;
  onSelectItemOnly: (path: string, index: number) => void;
  onToggleItemSelection: (path: string, index: number) => void;
  onOpenItemContextMenu: (item: BrowseItem) => void;
  openFilter: () => void;
  setIsShortcutsModalOpen: (open: boolean) => void;
  onRefetch: () => void;
  nudgeExplorerZoom: (direction: 1 | -1) => void;
  resetExplorerZoom: () => void;
  contextMenu: unknown;
  isActionsMenuOpen: boolean;
  setIsActionsMenuOpen: (open: boolean) => void;
  isShortcutsModalOpen: boolean;
  isFilterHelpModalOpen: boolean;
  rowRefs: React.MutableRefObject<Array<HTMLTableRowElement | null>>;
}

export const useKeyboardNavigation = ({
  renderedItems,
  isExplorerGridView,
  selectedPath,
  setSelectedPath,
  parentPath,
  onViewFile,
  onRowDoubleClick,
  onSelectItemOnly,
  onToggleItemSelection,
  onOpenItemContextMenu,
  openFilter,
  setIsShortcutsModalOpen,
  onRefetch,
  nudgeExplorerZoom,
  resetExplorerZoom,
  contextMenu,
  isActionsMenuOpen,
  setIsActionsMenuOpen,
  isShortcutsModalOpen,
  isFilterHelpModalOpen,
  rowRefs,
}: UseKeyboardNavigationProps) => {
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);

  const defaultRowIndex = useMemo(() => {
    if (renderedItems.length === 0) {
      return -1;
    }
    if (renderedItems[0]?.isParentNavigation && renderedItems.length > 1) {
      return 1;
    }
    return 0;
  }, [renderedItems]);

  const focusRowAtIndex = useCallback(
    (index: number) => {
      if (renderedItems.length === 0) {
        return;
      }

      const nextIndex = Math.max(0, Math.min(index, renderedItems.length - 1));
      setFocusedRowIndex(nextIndex);
      rowRefs.current[nextIndex]?.focus();
    },
    [renderedItems.length, rowRefs]
  );

  const getGridColumnCount = useCallback((): number => {
    const rowElements = rowRefs.current
      .slice(0, renderedItems.length)
      .filter((row): row is HTMLTableRowElement => row !== null);
    if (rowElements.length <= 1) {
      return 1;
    }

    const firstRow = rowElements[0];
    if (!firstRow) {
      return 1;
    }

    const firstRect = firstRow.getBoundingClientRect();
    if (firstRect.width === 0 && firstRect.height === 0) {
      return 1;
    }

    const firstTop = firstRect.top;
    let columns = 1;
    for (let index = 1; index < rowElements.length; index += 1) {
      const rowElement = rowElements[index];
      if (!rowElement) {
        break;
      }

      const rect = rowElement.getBoundingClientRect();
      if (Math.abs(rect.top - firstTop) > 2) {
        break;
      }

      columns += 1;
    }

    return Math.max(1, columns);
  }, [renderedItems.length, rowRefs]);

  const getGridNavigationIndex = useCallback(
    (currentIndex: number, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'): number => {
      const totalItems = renderedItems.length;
      if (totalItems <= 1) {
        return currentIndex;
      }

      const columns = getGridColumnCount();
      const totalRows = Math.ceil(totalItems / columns);
      const currentRow = Math.floor(currentIndex / columns);
      const currentColumn = currentIndex % columns;
      const getRowLength = (rowIndex: number) => {
        const rowStart = rowIndex * columns;
        return Math.max(0, Math.min(columns, totalItems - rowStart));
      };

      const currentRowLength = getRowLength(currentRow);
      const currentRowStart = currentRow * columns;

      if (key === 'ArrowLeft') {
        if (currentColumn > 0) {
          return currentIndex - 1;
        }

        return currentRowStart + Math.max(0, currentRowLength - 1);
      }

      if (key === 'ArrowRight') {
        if (currentColumn + 1 < currentRowLength) {
          return currentIndex + 1;
        }

        return currentRowStart;
      }

      const direction = key === 'ArrowUp' ? -1 : 1;
      for (let step = 1; step <= totalRows; step += 1) {
        const nextRow = (currentRow + direction * step + totalRows) % totalRows;
        const nextRowLength = getRowLength(nextRow);
        if (nextRowLength > currentColumn) {
          return nextRow * columns + currentColumn;
        }
      }

      return currentIndex;
    },
    [getGridColumnCount, renderedItems.length]
  );

  const handleRowKeyDown = (
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    item: BrowseItem,
    renderedIndex: number,
    isParentNavigation: boolean
  ) => {
    const hasOpenModalDialog = () =>
      document.querySelector('[role="dialog"][aria-modal="true"]') !== null;

    if (hasOpenModalDialog()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (
      isExplorerGridView &&
      (event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight')
    ) {
      event.preventDefault();
      const nextIndex = getGridNavigationIndex(
        renderedIndex,
        event.key as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'
      );
      focusRowAtIndex(nextIndex);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusRowAtIndex(renderedIndex + 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRowAtIndex(renderedIndex - 1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focusRowAtIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      focusRowAtIndex(renderedItems.length - 1);
      return;
    }

    if ((event.key === 'ArrowLeft' || event.key === 'Backspace') && selectedPath) {
      event.preventDefault();
      setSelectedPath(parentPath);
      return;
    }

    if ((event.key === 'Enter' && !event.altKey) || event.key === 'ArrowRight') {
      event.preventDefault();
      if (isParentNavigation) {
        setSelectedPath(parentPath);
        return;
      }

      if (item.type === 'file') {
        void onViewFile(item.path);
        return;
      }

      onRowDoubleClick(item);
      return;
    }

    if (event.key === ' ' || event.key === 'Spacebar') {
      if (isParentNavigation) {
        return;
      }

      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        onToggleItemSelection(item.path, renderedIndex);
      } else {
        onSelectItemOnly(item.path, renderedIndex);
      }
      return;
    }

    if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
      if (isParentNavigation) {
        return;
      }

      event.preventDefault();
      onOpenItemContextMenu(item);
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const isModalNavigationBlocked =
      isShortcutsModalOpen ||
      isFilterHelpModalOpen ||
      document.querySelector('[role="dialog"][aria-modal="true"]') !== null;

    if (
      renderedItems.length === 0 ||
      defaultRowIndex < 0 ||
      isModalNavigationBlocked ||
      contextMenu !== null
    ) {
      return;
    }

    const activeElement = document.activeElement;
    const isTypingInInput =
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement ||
      Boolean((activeElement as HTMLElement | null)?.isContentEditable);

    if (isTypingInInput) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      focusRowAtIndex(defaultRowIndex);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [
    defaultRowIndex,
    focusRowAtIndex,
    isShortcutsModalOpen,
    isFilterHelpModalOpen,
    contextMenu,
    renderedItems,
    selectedPath,
  ]);

  // Global keyboard event handler
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target;
      const isTypingInInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean((target as HTMLElement | null)?.isContentEditable);

      const hasZoomModifier = event.ctrlKey || event.metaKey;
      const isZoomInKey = event.key === '=' || event.key === '+' || event.key === 'NumpadAdd';
      const isZoomOutKey = event.key === '-' || event.key === '_' || event.key === 'NumpadSubtract';
      const isZoomResetKey = event.key === '0';

      if (hasZoomModifier && !event.altKey && (isZoomInKey || isZoomOutKey || isZoomResetKey)) {
        event.preventDefault();
        event.stopPropagation();

        if (isZoomResetKey) {
          resetExplorerZoom();
          return;
        }

        nudgeExplorerZoom(isZoomInKey ? 1 : -1);
        return;
      }

      if (isActionsMenuOpen && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setIsActionsMenuOpen(false);
        return;
      }

      const hasOpenModalDialog = () =>
        document.querySelector('[role="dialog"][aria-modal="true"]') !== null;

      if (hasOpenModalDialog()) {
        return;
      }

      if (isTypingInInput) {
        return;
      }

      if (contextMenu) {
        return;
      }

      if (isActionsMenuOpen) {
        return;
      }

      const isExplorerRefreshShortcut =
        event.key === 'F5' && !event.ctrlKey && !event.metaKey && !event.altKey;

      if (isExplorerRefreshShortcut) {
        event.preventDefault();
        onRefetch();
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        openFilter();
        return;
      }

      if (event.key === '?') {
        event.preventDefault();
        setIsShortcutsModalOpen(true);
        return;
      }

      if (event.key === 'Backspace' && selectedPath) {
        event.preventDefault();
        setSelectedPath(parentPath);
        return;
      }

      if (event.altKey && event.key === 'ArrowUp' && selectedPath) {
        event.preventDefault();
        setSelectedPath(parentPath);
        return;
      }

      if (!isExplorerGridView && event.key === 'ArrowLeft' && selectedPath) {
        event.preventDefault();
        setSelectedPath(parentPath);
        return;
      }

      const isExplorerNavigationKey =
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'ArrowRight' ||
        event.key === 'ArrowLeft' ||
        event.key === 'Home' ||
        event.key === 'End';

      if (!isExplorerNavigationKey || renderedItems.length === 0) {
        return;
      }

      const activeElement = document.activeElement;
      const focusedRow =
        activeElement instanceof HTMLTableRowElement && rowRefs.current.includes(activeElement)
          ? activeElement
          : null;

      if (focusedRow) {
        return;
      }

      event.preventDefault();
      if (event.key === 'End') {
        focusRowAtIndex(renderedItems.length - 1);
        return;
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        focusRowAtIndex(defaultRowIndex > 0 ? defaultRowIndex : renderedItems.length - 1);
        return;
      }

      focusRowAtIndex(defaultRowIndex >= 0 ? defaultRowIndex : 0);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [
    defaultRowIndex,
    focusRowAtIndex,
    isActionsMenuOpen,
    setIsActionsMenuOpen,
    openFilter,
    contextMenu,
    isExplorerGridView,
    parentPath,
    onRefetch,
    renderedItems.length,
    selectedPath,
    setSelectedPath,
    nudgeExplorerZoom,
    resetExplorerZoom,
    setIsShortcutsModalOpen,
    rowRefs,
  ]);

  return {
    focusedRowIndex,
    setFocusedRowIndex,
    focusRowAtIndex,
    handleRowKeyDown,
    defaultRowIndex,
  };
};
