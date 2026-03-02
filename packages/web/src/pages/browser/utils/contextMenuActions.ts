import type { BrowseItem } from '@server/services/s3/types';
import type { ContextMenuAction } from '@web/pages/browser/types';
import { formatShortcutHint } from '@web/pages/browser/constants';
import { resolveFileCapability } from '@web/utils/fileCapabilities';
import { getObjectKeyFromPath } from '@web/pages/browser/utils';

interface ContextMenuActionsParams {
  contextItem: BrowseItem;
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

/**
 * Builds the context menu actions for a given item
 */
export function buildContextMenuActions(params: ContextMenuActionsParams): ContextMenuAction[] {
  const {
    contextItem,
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

  const actions: ContextMenuAction[] = [];
  const contextItemCapability =
    contextItem.type === 'file' ? resolveFileCapability(contextItem.path) : null;
  const canDeleteContextItem =
    canDelete && !(contextItem.type === 'directory' && !contextItem.path.includes('/'));

  if (contextItem.type === 'directory') {
    actions.push({
      id: 'open',
      label: 'Open',
      hint: 'Enter',
      onSelect: () => {
        onCloseContextMenu();
        setSelectedPath(contextItem.path);
      },
    });
    actions.push({
      id: 'calculate-size',
      label: 'Calculate Size',
      hint: formatShortcutHint(['Ctrl/Cmd', 'Shift', 'S']),
      onSelect: () => {
        void onCalculateFolderSize(contextItem.path);
      },
    });

    if (hasBucketContext && hasClipboardItems && canWrite) {
      actions.push({
        id: 'paste',
        label: 'Paste into Folder',
        hint: formatShortcutHint(['Ctrl/Cmd', 'V']),
        onSelect: () => {
          onCloseContextMenu();
          void onPasteIntoPath(contextItem.path);
        },
      });
    }
  } else {
    // File actions
    if (contextItemCapability?.canView) {
      actions.push({
        id: 'view',
        label: 'View',
        onSelect: () => {
          onCloseContextMenu();
          void onViewFile(contextItem.path);
        },
      });
    }

    if (canWrite && contextItemCapability?.canEditText) {
      actions.push({
        id: 'edit',
        label: 'Edit',
        onSelect: () => {
          onCloseContextMenu();
          void onEditFile(contextItem.path);
        },
      });
    }

    actions.push({
      id: 'download',
      label: 'Download',
      hint: formatShortcutHint(['Ctrl/Cmd', 'D']),
      onSelect: () => {
        onCloseContextMenu();
        void onDownload(contextItem.path);
      },
    });
    actions.push({
      id: 'properties',
      label: 'Properties',
      hint: formatShortcutHint(['Alt', 'Enter']),
      onSelect: () => {
        void onOpenProperties(contextItem.path);
      },
    });

    // Build "Copy details" submenu
    const details = propertiesByPath[contextItem.path];
    const isLoadingDetails = propertiesLoadingPaths.has(contextItem.path);
    const copyDetailActions = buildCopyDetailsSubmenu(
      contextItem,
      details,
      isLoadingDetails,
      onCloseContextMenu,
      onCopyTextToClipboard
    );

    actions.push({
      id: 'copy-details',
      label: 'Copy details',
      hint: 'ArrowRight',
      submenuActions: copyDetailActions,
      onSelect: () => {},
    });
  }

  const hasWritableItemContext = hasBucketContext || contextItem.type === 'file';

  if (hasWritableItemContext) {
    actions.push({
      id: 'copy',
      label: 'Copy',
      hint: formatShortcutHint(['Ctrl/Cmd', 'C']),
      onSelect: () => {
        onCloseContextMenu();
        onCopyItems([contextItem]);
      },
    });
  }

  if (hasWritableItemContext && canWrite) {
    actions.push({
      id: 'cut',
      label: 'Cut',
      hint: formatShortcutHint(['Ctrl/Cmd', 'X']),
      onSelect: () => {
        onCloseContextMenu();
        onCutItems([contextItem]);
      },
    });
  }

  if (hasWritableItemContext && canWrite) {
    actions.push({
      id: 'rename',
      label: 'Rename',
      hint: 'F2',
      onSelect: () => {
        onCloseContextMenu();
        onRename(contextItem.path, contextItem.name);
      },
    });
    actions.push({
      id: 'move',
      label: 'Move',
      hint: formatShortcutHint(['Ctrl/Cmd', 'Shift', 'M']),
      onSelect: () => {
        onCloseContextMenu();
        onMove(contextItem.path);
      },
    });
  }

  if (canDeleteContextItem) {
    actions.push({
      id: 'delete',
      label: 'Delete',
      hint: 'Delete',
      isDanger: true,
      onSelect: () => {
        onCloseContextMenu();
        onDeletePathItems([contextItem]);
      },
    });
  }

  return actions;
}

/**
 * Builds the "Copy details" submenu for file items
 */
function buildCopyDetailsSubmenu(
  contextItem: BrowseItem,
  details: any,
  isLoadingDetails: boolean,
  onCloseContextMenu: () => void,
  onCopyTextToClipboard: (value: string, label: string) => Promise<void>
): ContextMenuAction[] {
  const copyDetailActions: ContextMenuAction[] = [];

  const pushCopyDetailAction = (id: string, label: string, value: string | null | undefined) => {
    if (value === null || value === undefined) {
      return;
    }

    const normalizedValue = String(value).trim();
    if (!normalizedValue) {
      return;
    }

    copyDetailActions.push({
      id,
      label,
      onSelect: () => {
        onCloseContextMenu();
        void onCopyTextToClipboard(normalizedValue, label);
      },
    });
  };

  pushCopyDetailAction('copy-detail-name', 'Name', contextItem.name);
  pushCopyDetailAction('copy-detail-path', 'Path', contextItem.path);
  pushCopyDetailAction(
    'copy-detail-key',
    'Object key',
    details?.key ?? getObjectKeyFromPath(contextItem.path)
  );
  pushCopyDetailAction('copy-detail-size', 'Size', contextItem.size?.toString());
  pushCopyDetailAction(
    'copy-detail-last-modified',
    'Last modified',
    contextItem.lastModified ?? details?.lastModified
  );
  pushCopyDetailAction('copy-detail-etag', 'ETag', contextItem.etag ?? details?.etag);
  pushCopyDetailAction('copy-detail-content-type', 'Content type', details?.contentType);
  pushCopyDetailAction('copy-detail-storage-class', 'Storage class', details?.storageClass);
  pushCopyDetailAction('copy-detail-version-id', 'Version ID', details?.versionId);

  const metadataEntries = details ? Object.entries(details.metadata) : [];
  for (const [metadataKey, metadataValue] of metadataEntries) {
    const metadataActionId = `copy-detail-metadata-${metadataKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    pushCopyDetailAction(metadataActionId, `Metadata: ${metadataKey}`, metadataValue as string);
  }

  if (isLoadingDetails) {
    copyDetailActions.push({
      id: 'copy-detail-loading',
      label: 'Loading properties...',
      isDisabled: true,
      onSelect: () => {},
    });
  } else if (copyDetailActions.length === 0) {
    copyDetailActions.push({
      id: 'copy-detail-empty',
      label: 'No copyable details',
      isDisabled: true,
      onSelect: () => {},
    });
  }

  return copyDetailActions;
}
