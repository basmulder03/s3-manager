import {
  ArrowDownToLine,
  ArrowRightLeft,
  BookOpenText,
  CheckSquare,
  ClipboardPaste,
  Copy,
  Eraser,
  File,
  Folder,
  Keyboard,
  PencilLine,
  RefreshCw,
  Scissors,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react';
import type {
  FilterHelpEntry,
  OverviewColumnDefinition,
  OverviewColumnKey,
  OverviewColumnVisibility,
  ShortcutDefinition,
  SortKey,
} from '@web/pages/browser/types';

export const formatShortcutHint = (shortcut: string[]): string => shortcut.join(' + ');

export const browserShortcuts: ShortcutDefinition[] = [
  {
    id: 'select-all',
    action: 'Select all visible items',
    shortcuts: [['Ctrl/Cmd', 'A']],
    Icon: CheckSquare,
  },
  {
    id: 'focus-filter',
    action: 'Focus file filter',
    shortcuts: [['/']],
    Icon: Search,
  },
  {
    id: 'refresh-explorer',
    action: 'Refresh explorer contents',
    shortcuts: [['F5']],
    Icon: RefreshCw,
  },
  {
    id: 'shortcuts-modal',
    action: 'Open shortcuts help',
    shortcuts: [['?']],
    Icon: Keyboard,
  },
  {
    id: 'parent',
    action: 'Go to parent folder',
    shortcuts: [['ArrowLeft'], ['Backspace'], ['Alt', 'ArrowUp']],
    Icon: Undo2,
  },
  {
    id: 'row-nav',
    action: 'Jump to explorer and move focus',
    shortcuts: [['Arrow keys'], ['Home'], ['End']],
    Icon: Folder,
  },
  {
    id: 'row-open',
    action: 'Open focused item',
    shortcuts: [['Enter'], ['ArrowRight']],
    Icon: File,
  },
  {
    id: 'row-select',
    action: 'Select focused item',
    shortcuts: [['Space']],
    Icon: CheckSquare,
  },
  {
    id: 'row-menu',
    action: 'Open item context menu',
    shortcuts: [['Shift', 'F10'], ['ContextMenu']],
    Icon: Keyboard,
  },
  {
    id: 'download',
    action: 'Download selected files',
    shortcuts: [['Ctrl/Cmd', 'D']],
    Icon: ArrowDownToLine,
  },
  {
    id: 'rename',
    action: 'Rename selected item',
    shortcuts: [['F2']],
    Icon: PencilLine,
  },
  {
    id: 'properties',
    action: 'Open selected file properties',
    shortcuts: [['Alt', 'Enter']],
    Icon: BookOpenText,
  },
  {
    id: 'calculate-folder-size',
    action: 'Calculate selected folder size',
    shortcuts: [['Ctrl/Cmd', 'Shift', 'S']],
    Icon: Folder,
  },
  {
    id: 'move',
    action: 'Move selected item',
    shortcuts: [['Ctrl/Cmd', 'Shift', 'M']],
    Icon: ArrowRightLeft,
  },
  {
    id: 'copy',
    action: 'Copy selected items',
    shortcuts: [['Ctrl/Cmd', 'C']],
    Icon: Copy,
  },
  {
    id: 'cut',
    action: 'Cut selected items',
    shortcuts: [['Ctrl/Cmd', 'X']],
    Icon: Scissors,
  },
  {
    id: 'paste',
    action: 'Paste into current folder',
    shortcuts: [['Ctrl/Cmd', 'V']],
    Icon: ClipboardPaste,
  },
  {
    id: 'delete',
    action: 'Delete selected items',
    shortcuts: [['Delete']],
    Icon: Trash2,
  },
  {
    id: 'escape',
    action: 'Clear selection or close dialogs',
    shortcuts: [['Esc']],
    Icon: Eraser,
  },
];

export const filterHelpEntries: FilterHelpEntry[] = [
  {
    id: 'text-search',
    query: 'report',
    whatItDoes: 'Runs a broad text search across file/folder names, paths, and loaded properties.',
    howItWorks: 'The token is matched as a case-insensitive contains check.',
    examples: ['report', 'invoice 2026', '"quarterly report"'],
  },
  {
    id: 'kind-filter',
    query: 'type:file',
    whatItDoes: 'Restricts results by item kind.',
    howItWorks: 'Use type/kind/is with file or directory for exact type matches.',
    examples: ['type:file', 'type:directory', 'is:file'],
  },
  {
    id: 'size-filter',
    query: 'size>=10mb',
    whatItDoes: 'Compares object sizes numerically.',
    howItWorks: 'Supports >, >=, <, <=, = and optional units (b, kb, mb, gb, tb).',
    examples: ['size>500kb', 'size<=2mb', 'size=1024'],
  },
  {
    id: 'property-filter',
    query: 'contentType:json',
    whatItDoes: 'Filters by file properties returned from object headers/details.',
    howItWorks:
      'Works with key, etag, storageClass, contentType, cacheControl, contentEncoding, contentLanguage, versionId, and more.',
    examples: ['contentType:application/json', 'storageClass=STANDARD', 'etag:abc123'],
  },
  {
    id: 'metadata-filter',
    query: 'meta.owner:alice',
    whatItDoes: 'Targets custom metadata values.',
    howItWorks: 'Use meta.<metadata-key>:<value> to match one metadata key.',
    examples: ['meta.owner:alice', 'meta.team:platform', 'meta.release>=2026'],
  },
  {
    id: 'negation-filter',
    query: '-type:directory',
    whatItDoes: 'Excludes matches from the result set.',
    howItWorks: 'Prefix any clause with - or ! to invert it.',
    examples: ['-type:directory', '!contentType:image/', '-meta.env:dev'],
  },
  {
    id: 'date-filter',
    query: 'modified>=2026-01-01',
    whatItDoes: 'Filters by modification/expiry timestamps.',
    howItWorks: 'Date values are parsed and compared with numeric date operators.',
    examples: ['modified>=2026-01-01', 'modified<2026-02-01', 'expires>2026-03-01'],
  },
];

export const nameCollator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
});

export const OVERVIEW_COLUMNS_STORAGE_KEY = 'browser-overview-columns';
export const BREADCRUMB_HINTS_STORAGE_KEY = 'browser-breadcrumb-hints';
export const EXPLORER_ZOOM_STORAGE_KEY = 'browser-explorer-zoom';
export const EXPLORER_ZOOM_EVENT_NAME = 's3-manager:explorer-zoom-change';
export const EXPLORER_ZOOM_LEVELS = [70, 85, 100, 115, 130, 150, 175, 200] as const;
export const EXPLORER_ZOOM_DEFAULT_LEVEL = 100;
export const EXPLORER_GRID_VIEW_MIN_ZOOM = 130;

export const resolveNearestExplorerZoomLevel = (value: number): number => {
  return EXPLORER_ZOOM_LEVELS.reduce((closest, candidate) => {
    return Math.abs(candidate - value) < Math.abs(closest - value) ? candidate : closest;
  }, EXPLORER_ZOOM_DEFAULT_LEVEL);
};

export const resolveNextExplorerZoomLevel = (current: number, direction: 1 | -1): number => {
  const nearest = resolveNearestExplorerZoomLevel(current);
  const currentIndex = EXPLORER_ZOOM_LEVELS.findIndex((level) => level === nearest);
  if (currentIndex < 0) {
    return EXPLORER_ZOOM_DEFAULT_LEVEL;
  }

  const nextIndex = Math.max(
    0,
    Math.min(EXPLORER_ZOOM_LEVELS.length - 1, currentIndex + direction)
  );
  return EXPLORER_ZOOM_LEVELS[nextIndex] ?? EXPLORER_ZOOM_DEFAULT_LEVEL;
};

export const resolveInitialExplorerZoomLevel = (): number => {
  if (typeof window === 'undefined') {
    return EXPLORER_ZOOM_DEFAULT_LEVEL;
  }

  const stored = window.localStorage.getItem(EXPLORER_ZOOM_STORAGE_KEY);
  if (!stored) {
    return EXPLORER_ZOOM_DEFAULT_LEVEL;
  }

  const parsed = Number.parseFloat(stored);
  if (!Number.isFinite(parsed)) {
    return EXPLORER_ZOOM_DEFAULT_LEVEL;
  }

  return resolveNearestExplorerZoomLevel(parsed);
};

export const defaultOverviewColumnVisibility: OverviewColumnVisibility = {
  showName: true,
  showKey: false,
  showSize: true,
  showModified: true,
  showEtag: false,
  showVersionId: false,
  showServerSideEncryption: false,
  showContentType: false,
  showStorageClass: false,
  showCacheControl: false,
  showContentDisposition: false,
  showContentEncoding: false,
  showContentLanguage: false,
  showExpires: false,
  showMetadata: false,
};

export const overviewColumnDefinitions: OverviewColumnDefinition[] = [
  { key: 'showKey', label: 'Key', requiresProperties: false },
  { key: 'showSize', label: 'Size', requiresProperties: false },
  { key: 'showModified', label: 'Modified', requiresProperties: false },
  { key: 'showEtag', label: 'ETag', requiresProperties: false },
  { key: 'showVersionId', label: 'Version Id', requiresProperties: true },
  {
    key: 'showServerSideEncryption',
    label: 'Server-side encryption',
    requiresProperties: true,
  },
  { key: 'showContentType', label: 'Content Type', requiresProperties: true },
  { key: 'showStorageClass', label: 'Storage Class', requiresProperties: true },
  { key: 'showCacheControl', label: 'Cache Control', requiresProperties: true },
  { key: 'showContentDisposition', label: 'Content Disposition', requiresProperties: true },
  { key: 'showContentEncoding', label: 'Content Encoding', requiresProperties: true },
  { key: 'showContentLanguage', label: 'Content Language', requiresProperties: true },
  { key: 'showExpires', label: 'Expires', requiresProperties: true },
];

export const overviewColumnSortKeyByColumn: Record<OverviewColumnKey, SortKey> = {
  showKey: 'key',
  showSize: 'size',
  showModified: 'modified',
  showEtag: 'etag',
  showVersionId: 'versionId',
  showServerSideEncryption: 'serverSideEncryption',
  showContentType: 'contentType',
  showStorageClass: 'storageClass',
  showCacheControl: 'cacheControl',
  showContentDisposition: 'contentDisposition',
  showContentEncoding: 'contentEncoding',
  showContentLanguage: 'contentLanguage',
  showExpires: 'expires',
};

export const resolveInitialOverviewColumnVisibility = (): OverviewColumnVisibility => {
  if (typeof window === 'undefined') {
    return defaultOverviewColumnVisibility;
  }

  const stored = window.localStorage.getItem(OVERVIEW_COLUMNS_STORAGE_KEY);
  if (!stored) {
    return defaultOverviewColumnVisibility;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<OverviewColumnVisibility>;
    return overviewColumnDefinitions.reduce<OverviewColumnVisibility>(
      (next, column) => {
        const parsedValue = parsed[column.key];
        next[column.key] =
          typeof parsedValue === 'boolean'
            ? parsedValue
            : defaultOverviewColumnVisibility[column.key];
        return next;
      },
      { ...defaultOverviewColumnVisibility }
    );
  } catch {
    return defaultOverviewColumnVisibility;
  }
};

export const resolveInitialBreadcrumbHintPaths = (): string[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  const stored = window.sessionStorage.getItem(BREADCRUMB_HINTS_STORAGE_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const unique = new Set<string>();
    for (const entry of parsed) {
      if (typeof entry !== 'string') {
        continue;
      }

      const normalized = entry.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      if (!normalized) {
        continue;
      }

      unique.add(normalized);
    }

    return Array.from(unique).slice(-600);
  } catch {
    return [];
  }
};
