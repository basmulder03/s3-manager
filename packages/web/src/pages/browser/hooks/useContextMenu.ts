import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BrowseItem } from '@server/services/s3/types';
import type { ContextMenuAction } from '@web/pages/browser/types';
import { buildContextMenuActions } from '@web/pages/browser/utils/contextMenuActions';

interface UseContextMenuParams {
  contextMenu: { x: number; y: number; item: BrowseItem } | null;
  hasBucketContext: boolean;
  hasClipboardItems: boolean;
  canWrite: boolean;
  canDelete: boolean;
  propertiesByPath: Record<string, any>;
  propertiesLoadingPaths: Set<string>;
  onCloseContextMenu: () => void;
  setSelectedPath: (path: string) => void;
  onCalculateFolderSize: (path: string) => Promise<void>;
  onPasteIntoPath: (destinationPath: string) => Promise<void>;
  onViewFile: (path: string) => Promise<void>;
  onEditFile: (path: string) => Promise<void>;
  onDownload: (path: string) => Promise<void>;
  onOpenProperties: (path: string) => Promise<void>;
  onCopyTextToClipboard: (value: string, label: string) => Promise<void>;
  onCopyItems: (items: BrowseItem[]) => void;
  onCutItems: (items: BrowseItem[]) => void;
  onRename: (path: string, currentName: string) => void;
  onMove: (path: string, destinationPath?: string) => void;
  onDeletePathItems: (items: BrowseItem[]) => void;
}

export function useContextMenu(params: UseContextMenuParams) {
  const {
    contextMenu,
    hasBucketContext,
    hasClipboardItems,
    canWrite,
    canDelete,
    propertiesByPath,
    propertiesLoadingPaths,
    onCloseContextMenu,
    setSelectedPath,
    onCalculateFolderSize,
    onPasteIntoPath,
    onViewFile,
    onEditFile,
    onDownload,
    onOpenProperties,
    onCopyTextToClipboard,
    onCopyItems,
    onCutItems,
    onRename,
    onMove,
    onDeletePathItems,
  } = params;

  // Refs
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const contextSubmenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const contextSubmenuRef = useRef<HTMLDivElement>(null);
  const contextMenuFocusRestoreRef = useRef<HTMLElement | null>(null);
  const wasContextMenuOpenRef = useRef(false);

  // State
  const [openSubmenuActionId, setOpenSubmenuActionId] = useState<string | null>(null);
  const [contextSubmenuSide, setContextSubmenuSide] = useState<'left' | 'right'>('right');

  // Build context menu actions
  const contextMenuActions = useMemo<ContextMenuAction[]>(() => {
    if (!contextMenu) {
      return [];
    }

    return buildContextMenuActions({
      contextItem: contextMenu.item,
      hasBucketContext,
      hasClipboardItems,
      canWrite,
      canDelete,
      propertiesByPath,
      propertiesLoadingPaths,
      onCloseContextMenu,
      setSelectedPath,
      onCalculateFolderSize,
      onPasteIntoPath,
      onViewFile,
      onEditFile,
      onDownload,
      onOpenProperties,
      onCopyTextToClipboard,
      onCopyItems,
      onCutItems,
      onRename,
      onMove,
      onDeletePathItems,
    });
  }, [
    contextMenu,
    hasBucketContext,
    hasClipboardItems,
    canWrite,
    canDelete,
    propertiesByPath,
    propertiesLoadingPaths,
    onCloseContextMenu,
    setSelectedPath,
    onCalculateFolderSize,
    onPasteIntoPath,
    onViewFile,
    onEditFile,
    onDownload,
    onOpenProperties,
    onCopyTextToClipboard,
    onCopyItems,
    onCutItems,
    onRename,
    onMove,
    onDeletePathItems,
  ]);

  // Position context submenu
  const positionContextSubmenu = useCallback(() => {
    if (!openSubmenuActionId) {
      return;
    }

    const submenu = contextSubmenuRef.current;
    const actionIndex = contextMenuActions.findIndex((action) => action.id === openSubmenuActionId);
    const actionButton = actionIndex >= 0 ? contextMenuItemRefs.current[actionIndex] : null;
    if (!submenu || !actionButton) {
      return;
    }

    const viewportPadding = 8;
    const gap = 6;
    const triggerRect = actionButton.getBoundingClientRect();
    const submenuRect = submenu.getBoundingClientRect();
    const hasRoomOnRight =
      triggerRect.right + gap + submenuRect.width <= window.innerWidth - viewportPadding;
    setContextSubmenuSide(hasRoomOnRight ? 'right' : 'left');
  }, [contextMenuActions, openSubmenuActionId]);

  // Focus navigation helpers
  const focusRootContextMenuItemAtIndex = useCallback((index: number) => {
    const focusableItems = contextMenuItemRefs.current.filter(
      (item): item is HTMLButtonElement => item !== null
    );
    if (focusableItems.length === 0) {
      return;
    }

    const wrappedIndex =
      ((index % focusableItems.length) + focusableItems.length) % focusableItems.length;
    focusableItems[wrappedIndex]?.focus();
  }, []);

  const focusContextSubmenuItemAtIndex = useCallback((index: number) => {
    const focusableItems = contextSubmenuItemRefs.current.filter(
      (item): item is HTMLButtonElement => item !== null
    );
    if (focusableItems.length === 0) {
      return;
    }

    const wrappedIndex =
      ((index % focusableItems.length) + focusableItems.length) % focusableItems.length;
    focusableItems[wrappedIndex]?.focus();
  }, []);

  // Keyboard handler
  const handleContextMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseContextMenu();
        return;
      }

      const rootItems = contextMenuItemRefs.current.filter(
        (item): item is HTMLButtonElement => item !== null
      );
      if (rootItems.length === 0) {
        return;
      }

      const submenuItems = contextSubmenuItemRefs.current.filter(
        (item): item is HTMLButtonElement => item !== null
      );
      const focusedItem = document.activeElement;
      const isFocusedInSubmenu = submenuItems.includes(focusedItem as HTMLButtonElement);
      const activeItems = isFocusedInSubmenu ? submenuItems : rootItems;
      if (activeItems.length === 0) {
        return;
      }

      const focusedIndex = activeItems.findIndex((item) => item === focusedItem);
      const currentIndex = focusedIndex >= 0 ? focusedIndex : 0;

      const focusedRootIndex = rootItems.findIndex((item) => item === focusedItem);
      const rootIndex = focusedRootIndex >= 0 ? focusedRootIndex : 0;
      const focusedRootAction = contextMenuActions[rootIndex];
      const canOpenFocusedSubmenu = Boolean(
        focusedRootAction?.submenuActions?.some((action) => !action.isDisabled)
      );

      if (event.key === 'ArrowRight' && !isFocusedInSubmenu && canOpenFocusedSubmenu) {
        event.preventDefault();
        if (!focusedRootAction) {
          return;
        }

        setOpenSubmenuActionId(focusedRootAction.id);
        window.requestAnimationFrame(() => {
          focusContextSubmenuItemAtIndex(0);
        });
        return;
      }

      if (event.key === 'ArrowLeft' && isFocusedInSubmenu) {
        event.preventDefault();
        const activeSubmenuActionId = openSubmenuActionId;
        setOpenSubmenuActionId(null);

        if (!activeSubmenuActionId) {
          return;
        }

        const submenuParentIndex = contextMenuActions.findIndex(
          (action) => action.id === activeSubmenuActionId
        );
        if (submenuParentIndex < 0) {
          return;
        }

        window.requestAnimationFrame(() => {
          contextMenuItemRefs.current[submenuParentIndex]?.focus();
        });
        return;
      }

      if (
        (event.key === 'Enter' || event.key === ' ') &&
        !isFocusedInSubmenu &&
        canOpenFocusedSubmenu
      ) {
        event.preventDefault();
        if (!focusedRootAction) {
          return;
        }

        setOpenSubmenuActionId(focusedRootAction.id);
        window.requestAnimationFrame(() => {
          focusContextSubmenuItemAtIndex(0);
        });
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (isFocusedInSubmenu) {
          focusContextSubmenuItemAtIndex(currentIndex + 1);
        } else {
          focusRootContextMenuItemAtIndex(currentIndex + 1);
        }
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (isFocusedInSubmenu) {
          focusContextSubmenuItemAtIndex(currentIndex - 1);
        } else {
          focusRootContextMenuItemAtIndex(currentIndex - 1);
        }
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        if (isFocusedInSubmenu) {
          focusContextSubmenuItemAtIndex(0);
        } else {
          focusRootContextMenuItemAtIndex(0);
        }
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        if (isFocusedInSubmenu) {
          focusContextSubmenuItemAtIndex(activeItems.length - 1);
        } else {
          focusRootContextMenuItemAtIndex(activeItems.length - 1);
        }
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        if (isFocusedInSubmenu) {
          focusContextSubmenuItemAtIndex(currentIndex + (event.shiftKey ? -1 : 1));
        } else {
          focusRootContextMenuItemAtIndex(currentIndex + (event.shiftKey ? -1 : 1));
        }
      }
    },
    [
      contextMenuActions,
      focusContextSubmenuItemAtIndex,
      focusRootContextMenuItemAtIndex,
      onCloseContextMenu,
      openSubmenuActionId,
    ]
  );

  // Initialize focus when context menu opens
  useEffect(() => {
    if (!contextMenu || contextMenuActions.length === 0) {
      return;
    }

    contextMenuFocusRestoreRef.current = document.activeElement as HTMLElement | null;
    wasContextMenuOpenRef.current = true;
    setOpenSubmenuActionId(null);
    contextMenuItemRefs.current[0]?.focus();
  }, [contextMenu, contextMenuActions]);

  // Restore focus when context menu closes
  useEffect(() => {
    if (contextMenu || !wasContextMenuOpenRef.current) {
      return;
    }

    wasContextMenuOpenRef.current = false;
    const restoreTarget = contextMenuFocusRestoreRef.current;
    contextMenuFocusRestoreRef.current = null;
    if (!restoreTarget || !document.contains(restoreTarget)) {
      return;
    }

    restoreTarget.focus();
  }, [contextMenu]);

  // Clear submenu item refs when submenu changes
  useEffect(() => {
    contextSubmenuItemRefs.current = [];
  }, [openSubmenuActionId]);

  // Close invalid submenu
  useEffect(() => {
    if (!contextMenu) {
      setOpenSubmenuActionId(null);
      return;
    }

    if (
      openSubmenuActionId &&
      !contextMenuActions.some(
        (action) => action.id === openSubmenuActionId && action.submenuActions
      )
    ) {
      setOpenSubmenuActionId(null);
    }
  }, [contextMenu, contextMenuActions, openSubmenuActionId]);

  // Position submenu on open
  useEffect(() => {
    if (!openSubmenuActionId) {
      setContextSubmenuSide('right');
      return;
    }

    const frameId = window.requestAnimationFrame(positionContextSubmenu);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [openSubmenuActionId, positionContextSubmenu]);

  // Reposition submenu on resize/scroll
  useEffect(() => {
    if (!openSubmenuActionId) {
      return;
    }

    const reposition = () => {
      positionContextSubmenu();
    };

    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [openSubmenuActionId, positionContextSubmenu]);

  // Focus first submenu item
  useEffect(() => {
    if (!openSubmenuActionId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const focusableSubmenuItems = contextSubmenuItemRefs.current.filter(
        (item): item is HTMLButtonElement => item !== null && !item.disabled
      );
      focusableSubmenuItems[0]?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [openSubmenuActionId]);

  return {
    contextMenuRef,
    contextMenuItemRefs,
    contextSubmenuItemRefs,
    contextSubmenuRef,
    contextMenuActions,
    openSubmenuActionId,
    setOpenSubmenuActionId,
    contextSubmenuSide,
    handleContextMenuKeyDown,
  };
}
