import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent, ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowRightLeft,
  BookOpenText,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Eraser,
  File,
  Folder,
  House,
  Keyboard,
  PencilLine,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { Button, Input } from '@web/components/ui';
import { trpcProxyClient } from '@web/trpc/client';
import type { BrowseItem, ObjectPropertiesResult } from '@server/services/s3/types';
import { resolveFileCapability } from '@web/utils/fileCapabilities';
import { formatBytes } from '@web/utils/formatBytes';
import styles from '@web/App.module.css';

interface BrowseData {
  breadcrumbs: Array<{ name: string; path: string }>;
  items: BrowseItem[];
}

interface BrowserPageProps {
  selectedPath: string;
  setSelectedPath: (path: string) => void;
  filterQuery: string;
  setFilterQuery: (query: string) => void;
  knownBucketNames: string[];
  breadcrumbValidationMessage?: string;
  canWrite: boolean;
  canDelete: boolean;
  isUploading: boolean;
  browse: {
    data?: BrowseData;
    isLoading: boolean;
    isFetching?: boolean;
    isError: boolean;
    refetch: () => void;
  };
  selectedItems: Set<string>;
  selectedFiles: BrowseItem[];
  folderSizesByPath: Record<string, number>;
  folderSizeLoadingPaths: Set<string>;
  contextMenu: { x: number; y: number; item: BrowseItem } | null;
  onBulkDownload: () => Promise<void>;
  onBulkDelete: () => Promise<void>;
  onUploadFiles: (files: FileList | File[]) => Promise<void>;
  onUploadFolder: (files: FileList | File[]) => Promise<void>;
  onClearSelection: () => void;
  onSelectItemOnly: (path: string, index: number) => void;
  onToggleItemSelection: (path: string, index: number) => void;
  onRowClick: (item: BrowseItem, index: number, event: MouseEvent<HTMLElement>) => void;
  onRowDoubleClick: (item: BrowseItem) => void;
  onOpenContextMenu: (item: BrowseItem, event: MouseEvent) => void;
  onOpenItemContextMenu: (item: BrowseItem) => void;
  onCloseContextMenu: () => void;
  onRename: (path: string, currentName: string) => void;
  onMove: (path: string) => void;
  onDownload: (path: string) => Promise<void>;
  onCalculateFolderSize: (path: string) => Promise<void>;
  onOpenProperties: (path: string) => Promise<void>;
  onDeletePathItems: (items: BrowseItem[]) => void;
  onViewFile: (path: string) => Promise<void>;
  onEditFile: (path: string) => Promise<void>;
  isShortcutsModalOpen?: boolean;
  setIsShortcutsModalOpen?: (isOpen: boolean) => void;
  isFilterHelpModalOpen?: boolean;
  setIsFilterHelpModalOpen?: (isOpen: boolean) => void;
}

type SortKey = 'name' | 'size' | 'modified' | 'type';
type SortDirection = 'asc' | 'desc';

interface SortRule {
  key: SortKey;
  direction: SortDirection;
}

type QueryOperator = ':' | '=' | '>' | '>=' | '<' | '<=';

type QueryClause = {
  negate: boolean;
} & (
  | {
      kind: 'text';
      value: string;
    }
  | {
      kind: 'field';
      field: string;
      operator: QueryOperator;
      value: string;
    }
);

type OverviewColumnKey =
  | 'showKey'
  | 'showSize'
  | 'showModified'
  | 'showEtag'
  | 'showVersionId'
  | 'showServerSideEncryption'
  | 'showContentType'
  | 'showStorageClass'
  | 'showCacheControl'
  | 'showContentDisposition'
  | 'showContentEncoding'
  | 'showContentLanguage'
  | 'showExpires';

type OverviewColumnVisibility = Record<OverviewColumnKey, boolean> & {
  showName: boolean;
  showMetadata: boolean;
};

interface OverviewColumnDefinition {
  key: OverviewColumnKey;
  label: string;
  requiresProperties: boolean;
}

interface ShortcutDefinition {
  id: string;
  action: string;
  shortcuts: string[][];
  Icon: typeof Keyboard;
}

interface ContextMenuAction {
  id: string;
  label: string;
  hint?: string;
  isDanger?: boolean;
  onSelect: () => void;
}

interface FilterHelpEntry {
  id: string;
  query: string;
  whatItDoes: string;
  howItWorks: string;
  examples: string[];
}

const formatShortcutHint = (shortcut: string[]): string => shortcut.join(' + ');

const browserShortcuts: ShortcutDefinition[] = [
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
    id: 'move',
    action: 'Move selected item',
    shortcuts: [['Ctrl/Cmd', 'Shift', 'M']],
    Icon: ArrowRightLeft,
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

const filterHelpEntries: FilterHelpEntry[] = [
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

const nameCollator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
});

const OVERVIEW_COLUMNS_STORAGE_KEY = 'browser-overview-columns';
const BREADCRUMB_HINTS_STORAGE_KEY = 'browser-breadcrumb-hints';

const defaultOverviewColumnVisibility: OverviewColumnVisibility = {
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

const overviewColumnDefinitions: OverviewColumnDefinition[] = [
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

const resolveInitialOverviewColumnVisibility = (): OverviewColumnVisibility => {
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

const resolveInitialBreadcrumbHintPaths = (): string[] => {
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

const formatDate = (value: string | null): string => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

const tokenizeFilterQuery = (input: string): string[] => {
  const tokens: string[] = [];
  const matcher = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|\S+/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(input)) !== null) {
    const token = (match[1] ?? match[2] ?? match[0] ?? '').trim();
    if (token.length > 0) {
      tokens.push(token);
    }
  }

  return tokens;
};

const parseSizeLiteralBytes = (value: string): number | null => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d+(?:\.\d+)?)(b|bytes?|kb|kib|mb|mib|gb|gib|tb|tib)?$/);
  if (!match) {
    return null;
  }

  const amount = Number.parseFloat(match[1] ?? '');
  if (!Number.isFinite(amount)) {
    return null;
  }

  const unit = match[2] ?? 'b';
  const multiplierByUnit: Record<string, number> = {
    b: 1,
    byte: 1,
    bytes: 1,
    kb: 1024,
    kib: 1024,
    mb: 1024 ** 2,
    mib: 1024 ** 2,
    gb: 1024 ** 3,
    gib: 1024 ** 3,
    tb: 1024 ** 4,
    tib: 1024 ** 4,
  };

  const multiplier = multiplierByUnit[unit];
  if (!multiplier) {
    return null;
  }

  return Math.round(amount * multiplier);
};

const parseFilterClauses = (query: string): QueryClause[] => {
  const tokens = tokenizeFilterQuery(query);

  return tokens.map<QueryClause>((token) => {
    const trimmed = token.trim();
    const negate = trimmed.startsWith('!') || trimmed.startsWith('-');
    const raw = negate ? trimmed.slice(1).trim() : trimmed;

    if (!raw) {
      return {
        kind: 'text',
        value: '',
        negate,
      };
    }

    const comparisonMatch = raw.match(/^([a-zA-Z][a-zA-Z0-9_.-]*)(<=|>=|=|<|>)(.+)$/);
    if (comparisonMatch) {
      const [, field, operator, value] = comparisonMatch;
      return {
        kind: 'field',
        field: field?.toLowerCase() ?? '',
        operator: (operator as QueryOperator) ?? ':',
        value: value?.trim() ?? '',
        negate,
      };
    }

    const colonIndex = raw.indexOf(':');
    if (colonIndex > 0) {
      const field = raw.slice(0, colonIndex).trim().toLowerCase();
      const value = raw.slice(colonIndex + 1).trim();
      if (field.length > 0) {
        return {
          kind: 'field',
          field,
          operator: ':',
          value,
          negate,
        };
      }
    }

    return {
      kind: 'text',
      value: raw,
      negate,
    };
  });
};

const normalizeFieldName = (field: string): string => field.replace(/[-_]/g, '').toLowerCase();

const normalizeText = (value: string): string => value.trim().toLowerCase();

const doesStringMatch = (actual: string, expected: string, operator: QueryOperator): boolean => {
  const normalizedActual = normalizeText(actual);
  const normalizedExpected = normalizeText(expected);
  if (!normalizedExpected) {
    return true;
  }

  if (operator === '=') {
    return normalizedActual === normalizedExpected;
  }

  return normalizedActual.includes(normalizedExpected);
};

export const BrowserPage = ({
  selectedPath,
  setSelectedPath,
  filterQuery,
  setFilterQuery,
  knownBucketNames,
  breadcrumbValidationMessage,
  canWrite,
  canDelete,
  isUploading,
  browse,
  selectedItems,
  selectedFiles,
  folderSizesByPath,
  folderSizeLoadingPaths,
  contextMenu,
  onBulkDownload,
  onBulkDelete,
  onUploadFiles,
  onUploadFolder,
  onClearSelection,
  onSelectItemOnly,
  onToggleItemSelection,
  onRowClick,
  onRowDoubleClick,
  onOpenContextMenu,
  onOpenItemContextMenu,
  onCloseContextMenu,
  onRename,
  onMove,
  onDownload,
  onCalculateFolderSize,
  onOpenProperties,
  onDeletePathItems,
  onViewFile,
  onEditFile,
  isShortcutsModalOpen: isShortcutsModalOpenProp,
  setIsShortcutsModalOpen: setIsShortcutsModalOpenProp,
  isFilterHelpModalOpen: isFilterHelpModalOpenProp,
  setIsFilterHelpModalOpen: setIsFilterHelpModalOpenProp,
}: BrowserPageProps) => {
  const isBrowseRefreshing = browse.isFetching ?? browse.isLoading;

  const [isBreadcrumbEditing, setIsBreadcrumbEditing] = useState(false);
  const [breadcrumbDraft, setBreadcrumbDraft] = useState(selectedPath ? `/${selectedPath}` : '/');
  const [cachedDirectoryHintPaths, setCachedDirectoryHintPaths] = useState<string[]>(
    resolveInitialBreadcrumbHintPaths
  );
  const [isFilterOpen, setIsFilterOpen] = useState(() => filterQuery.trim().length > 0);
  const [isFilterHelpModalOpenInternal, setIsFilterHelpModalOpenInternal] = useState(false);
  const [filterDraftQuery, setFilterDraftQuery] = useState(filterQuery);
  const [activeBreadcrumbHintIndex, setActiveBreadcrumbHintIndex] = useState(-1);
  const [isShortcutsModalOpenInternal, setIsShortcutsModalOpenInternal] = useState(false);
  const [isOverviewFieldsMenuOpen, setIsOverviewFieldsMenuOpen] = useState(false);
  const [overviewFieldsFilterQuery, setOverviewFieldsFilterQuery] = useState('');
  const [overviewColumnVisibility, setOverviewColumnVisibility] =
    useState<OverviewColumnVisibility>(resolveInitialOverviewColumnVisibility);
  const [propertiesByPath, setPropertiesByPath] = useState<
    Record<string, ObjectPropertiesResult | null>
  >({});
  const [propertiesLoadingPaths, setPropertiesLoadingPaths] = useState<Set<string>>(new Set());
  const [pendingFolderUploadFiles, setPendingFolderUploadFiles] = useState<File[]>([]);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [sortRules, setSortRules] = useState<SortRule[]>([
    { key: 'type', direction: 'asc' },
    { key: 'name', direction: 'asc' },
  ]);
  const isShortcutsModalOpen = isShortcutsModalOpenProp ?? isShortcutsModalOpenInternal;
  const setIsShortcutsModalOpen = useCallback(
    (isOpen: boolean) => {
      if (isShortcutsModalOpenProp === undefined) {
        setIsShortcutsModalOpenInternal(isOpen);
      }

      setIsShortcutsModalOpenProp?.(isOpen);
    },
    [isShortcutsModalOpenProp, setIsShortcutsModalOpenProp]
  );
  const isFilterHelpModalOpen = isFilterHelpModalOpenProp ?? isFilterHelpModalOpenInternal;
  const setIsFilterHelpModalOpen = useCallback(
    (isOpen: boolean) => {
      if (isFilterHelpModalOpenProp === undefined) {
        setIsFilterHelpModalOpenInternal(isOpen);
      }

      setIsFilterHelpModalOpenProp?.(isOpen);
    },
    [isFilterHelpModalOpenProp, setIsFilterHelpModalOpenProp]
  );
  const breadcrumbInputRef = useRef<HTMLInputElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const overviewFieldsMenuRef = useRef<HTMLDivElement>(null);
  const uploadFilesInputRef = useRef<HTMLInputElement>(null);
  const uploadFolderInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const contextMenuFocusRestoreRef = useRef<HTMLElement | null>(null);
  const wasContextMenuOpenRef = useRef(false);
  const wasBreadcrumbEditingRef = useRef(false);
  const folderInputAttributes = {
    directory: '',
    webkitdirectory: '',
  } as Record<string, string>;

  const commitBreadcrumbPath = (rawPath: string) => {
    const normalized = rawPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (normalized !== selectedPath) {
      setSelectedPath(normalized);
    }
  };

  const isBreadcrumbPathCommitAllowed = useCallback(
    (rawPath: string) => {
      const normalized = rawPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      if (!normalized) {
        return true;
      }

      if (knownBucketNames.length === 0) {
        return true;
      }

      const [bucketName = ''] = normalized.split('/');
      return knownBucketNames.includes(bucketName);
    },
    [knownBucketNames]
  );

  useEffect(() => {
    if (isBreadcrumbEditing) {
      return;
    }

    setBreadcrumbDraft(selectedPath ? `/${selectedPath}` : '/');
  }, [isBreadcrumbEditing, selectedPath]);

  useEffect(() => {
    if (!isBreadcrumbEditing) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (isBreadcrumbPathCommitAllowed(breadcrumbDraft)) {
        commitBreadcrumbPath(breadcrumbDraft);
      }
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    breadcrumbDraft,
    commitBreadcrumbPath,
    isBreadcrumbEditing,
    isBreadcrumbPathCommitAllowed,
    selectedPath,
  ]);

  useEffect(() => {
    if (!isBreadcrumbEditing) {
      return;
    }

    breadcrumbInputRef.current?.focus();
    breadcrumbInputRef.current?.select();
  }, [isBreadcrumbEditing]);

  useEffect(() => {
    const wasEditing = wasBreadcrumbEditingRef.current;
    if (isBreadcrumbEditing && !wasEditing) {
      setBreadcrumbDraft(selectedPath ? `/${selectedPath}` : '/');
      setActiveBreadcrumbHintIndex(-1);
    }

    wasBreadcrumbEditingRef.current = isBreadcrumbEditing;
  }, [isBreadcrumbEditing, selectedPath]);

  useEffect(() => {
    setCachedDirectoryHintPaths((previous) => {
      const next = new Set(previous);

      const rememberPath = (value: string) => {
        const normalized = value.trim().replace(/^\/+/, '').replace(/\/+$/, '');
        if (!normalized) {
          return;
        }

        next.add(normalized);
      };

      rememberPath(selectedPath);

      for (const crumb of browse.data?.breadcrumbs ?? []) {
        rememberPath(crumb.path);
      }

      for (const item of browse.data?.items ?? []) {
        if (item.type !== 'directory') {
          continue;
        }

        rememberPath(item.path);
      }

      if (next.size === previous.length) {
        return previous;
      }

      return Array.from(next).slice(-600);
    });
  }, [browse.data?.breadcrumbs, browse.data?.items, selectedPath]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      OVERVIEW_COLUMNS_STORAGE_KEY,
      JSON.stringify(overviewColumnVisibility)
    );
  }, [overviewColumnVisibility]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.setItem(
      BREADCRUMB_HINTS_STORAGE_KEY,
      JSON.stringify(cachedDirectoryHintPaths)
    );
  }, [cachedDirectoryHintPaths]);

  useEffect(() => {
    if (!isOverviewFieldsMenuOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (overviewFieldsMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOverviewFieldsMenuOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isOverviewFieldsMenuOpen]);

  useEffect(() => {
    if (!isFilterOpen) {
      return;
    }

    filterInputRef.current?.focus();
  }, [isFilterOpen]);

  useEffect(() => {
    setFilterDraftQuery(filterQuery);
    if (filterQuery.trim().length > 0) {
      setIsFilterOpen(true);
    }
  }, [filterQuery]);

  useEffect(() => {
    if (filterDraftQuery === filterQuery) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFilterQuery(filterDraftQuery);
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [filterDraftQuery, filterQuery, setFilterQuery]);

  const breadcrumbSegments = useMemo(() => {
    const normalized = selectedPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) {
      return [] as Array<{ label: string; path: string }>;
    }

    const segments = normalized.split('/');
    return segments.map((segment, index) => ({
      label: segment,
      path: segments.slice(0, index + 1).join('/'),
    }));
  }, [selectedPath]);

  const breadcrumbHintOptions = useMemo(() => {
    const draft = breadcrumbDraft.trim().replace(/^\/+/, '');
    const normalizedSelectedPath = selectedPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    const suggestions = new Set<string>();

    suggestions.add('/');

    const addSuggestion = (value: string) => {
      const normalized = value.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      if (!normalized) {
        suggestions.add('/');
        return;
      }

      suggestions.add(`/${normalized}`);
    };

    for (const crumb of browse.data?.breadcrumbs ?? []) {
      addSuggestion(crumb.path);
    }

    for (const bucketName of knownBucketNames) {
      addSuggestion(bucketName);
    }

    for (const cachedPath of cachedDirectoryHintPaths) {
      addSuggestion(cachedPath);
    }

    for (const item of browse.data?.items ?? []) {
      if (item.type !== 'directory') {
        continue;
      }

      addSuggestion(item.path);
    }

    const filtered = Array.from(suggestions).filter((value) => {
      if (!draft) {
        return true;
      }

      const normalizedValue = value.slice(1).toLowerCase();
      const normalizedDraft = draft.toLowerCase();

      if (normalizedValue.startsWith(normalizedDraft)) {
        return true;
      }

      if (draft.includes('/')) {
        return false;
      }

      const valueSegments = normalizedValue.split('/');
      const leafSegment = valueSegments[valueSegments.length - 1] ?? '';
      if (leafSegment.startsWith(normalizedDraft)) {
        return true;
      }

      if (!normalizedSelectedPath) {
        return false;
      }

      const selectedPrefix = `${normalizedSelectedPath.toLowerCase()}/`;
      if (!normalizedValue.startsWith(selectedPrefix)) {
        return false;
      }

      const relativeFromCurrent = normalizedValue.slice(selectedPrefix.length);
      return relativeFromCurrent.startsWith(normalizedDraft);
    });

    filtered.sort((left, right) => left.localeCompare(right));
    return filtered.slice(0, 12);
  }, [
    breadcrumbDraft,
    browse.data?.breadcrumbs,
    browse.data?.items,
    cachedDirectoryHintPaths,
    knownBucketNames,
    selectedPath,
  ]);

  useEffect(() => {
    if (!isBreadcrumbEditing) {
      setActiveBreadcrumbHintIndex(-1);
      return;
    }

    setActiveBreadcrumbHintIndex((previous) => {
      if (breadcrumbHintOptions.length === 0) {
        return -1;
      }

      if (previous < 0) {
        return -1;
      }

      return Math.min(previous, breadcrumbHintOptions.length - 1);
    });
  }, [breadcrumbHintOptions, isBreadcrumbEditing]);

  const isAnyPropertyBackedColumnVisible = useMemo(
    () =>
      overviewColumnDefinitions.some(
        (column) => column.requiresProperties && overviewColumnVisibility[column.key]
      ),
    [overviewColumnVisibility]
  );

  const parsedFilterClauses = useMemo(() => parseFilterClauses(filterQuery), [filterQuery]);

  const hasActiveAdvancedFilter = useMemo(
    () =>
      parsedFilterClauses.some((clause) =>
        clause.kind === 'text' ? clause.value.trim().length > 0 : clause.value.trim().length > 0
      ),
    [parsedFilterClauses]
  );

  const shouldLoadPropertiesForFiltering = hasActiveAdvancedFilter;

  useEffect(() => {
    if (!isAnyPropertyBackedColumnVisible && !shouldLoadPropertiesForFiltering) {
      return;
    }

    const missingPaths = (browse.data?.items ?? [])
      .filter((item) => item.type === 'file')
      .map((item) => item.path)
      .filter((path) => propertiesByPath[path] === undefined && !propertiesLoadingPaths.has(path));

    if (missingPaths.length === 0) {
      return;
    }

    const loadMissingProperties = async () => {
      await Promise.all(
        missingPaths.map(async (path) => {
          setPropertiesLoadingPaths((previous) => {
            if (previous.has(path)) {
              return previous;
            }

            const next = new Set(previous);
            next.add(path);
            return next;
          });

          try {
            const details = await trpcProxyClient.s3.getProperties.query({ path });

            setPropertiesByPath((previous) => {
              if (previous[path] !== undefined) {
                return previous;
              }

              return {
                ...previous,
                [path]: details,
              };
            });
          } catch {
            setPropertiesByPath((previous) => {
              if (previous[path] !== undefined) {
                return previous;
              }

              return {
                ...previous,
                [path]: null,
              };
            });
          } finally {
            setPropertiesLoadingPaths((previous) => {
              if (!previous.has(path)) {
                return previous;
              }

              const next = new Set(previous);
              next.delete(path);
              return next;
            });
          }
        })
      );
    };

    void loadMissingProperties();
  }, [
    browse.data?.items,
    isAnyPropertyBackedColumnVisible,
    shouldLoadPropertiesForFiltering,
    propertiesByPath,
    propertiesLoadingPaths,
  ]);

  const parentPath = useMemo(() => {
    const normalized = selectedPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) {
      return '';
    }

    const parts = normalized.split('/');
    return parts.slice(0, -1).join('/');
  }, [selectedPath]);

  const compareItems = useCallback(
    (left: BrowseItem, right: BrowseItem): number => {
      for (const rule of sortRules) {
        let result = 0;

        if (rule.key === 'name') {
          result = nameCollator.compare(left.name, right.name);
        }

        if (rule.key === 'type' && left.type !== right.type) {
          result = left.type === 'directory' ? -1 : 1;
        }

        if (rule.key === 'size') {
          const leftSize =
            left.type === 'directory' ? (folderSizesByPath[left.path] ?? null) : left.size;
          const rightSize =
            right.type === 'directory' ? (folderSizesByPath[right.path] ?? null) : right.size;

          if (leftSize === null && rightSize !== null) {
            result = 1;
          } else if (leftSize !== null && rightSize === null) {
            result = -1;
          } else if (leftSize !== null && rightSize !== null) {
            result = leftSize - rightSize;
          }
        }

        if (rule.key === 'modified') {
          const leftTime = left.lastModified ? Date.parse(left.lastModified) : Number.NaN;
          const rightTime = right.lastModified ? Date.parse(right.lastModified) : Number.NaN;
          const hasLeft = Number.isFinite(leftTime);
          const hasRight = Number.isFinite(rightTime);

          if (!hasLeft && hasRight) {
            result = 1;
          } else if (hasLeft && !hasRight) {
            result = -1;
          } else if (hasLeft && hasRight) {
            result = leftTime - rightTime;
          }
        }

        if (result !== 0) {
          return rule.direction === 'asc' ? result : -result;
        }
      }

      return nameCollator.compare(left.path, right.path);
    },
    [folderSizesByPath, sortRules]
  );

  const normalizedFilter = filterQuery.trim().toLowerCase();

  const renderedItems = useMemo(() => {
    const items = browse.data?.items ?? [];
    const compareNumber = (left: number, right: number, operator: QueryOperator): boolean => {
      if (operator === '>') {
        return left > right;
      }
      if (operator === '>=') {
        return left >= right;
      }
      if (operator === '<') {
        return left < right;
      }
      if (operator === '<=') {
        return left <= right;
      }
      if (operator === '=') {
        return left === right;
      }
      return String(left).includes(String(right));
    };

    const compareDate = (
      actualIso: string | null | undefined,
      expectedRaw: string,
      operator: QueryOperator
    ) => {
      if (!actualIso) {
        return false;
      }

      const actual = Date.parse(actualIso);
      const expected = Date.parse(expectedRaw);
      if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
        return false;
      }

      return compareNumber(actual, expected, operator);
    };

    const doesClauseMatch = (item: BrowseItem, clause: QueryClause): boolean => {
      const details = item.type === 'file' ? propertiesByPath[item.path] : undefined;
      const metadata = details && details !== null ? details.metadata : undefined;
      const metadataEntries = metadata ? Object.entries(metadata) : [];
      const extension = item.name.includes('.') ? (item.name.split('.').pop() ?? '') : '';

      if (clause.kind === 'text') {
        const textTokens: string[] = [item.name, item.path, item.type];
        if (item.type === 'file') {
          textTokens.push(String(item.size ?? ''));
          textTokens.push(item.lastModified ?? '');
          textTokens.push(item.etag ?? '');
          if (details && details !== null) {
            textTokens.push(details.key);
            textTokens.push(details.contentType);
            textTokens.push(details.storageClass);
            textTokens.push(details.cacheControl ?? '');
            textTokens.push(details.contentDisposition ?? '');
            textTokens.push(details.contentEncoding ?? '');
            textTokens.push(details.contentLanguage ?? '');
            textTokens.push(details.expires ?? '');
            textTokens.push(details.versionId ?? '');
            textTokens.push(details.serverSideEncryption ?? '');
          }

          for (const [key, value] of metadataEntries) {
            textTokens.push(key);
            textTokens.push(value);
            textTokens.push(`${key}:${value}`);
          }
        }

        const haystack = textTokens.join(' ').toLowerCase();
        return haystack.includes(clause.value.toLowerCase());
      }

      const normalizedField = normalizeFieldName(clause.field);
      const value = clause.value.trim();
      const numericValue = parseSizeLiteralBytes(value) ?? Number.parseFloat(value);

      const metadataMatch = (key: string): boolean => {
        if (!metadata) {
          return false;
        }

        const direct = metadata[key];
        if (typeof direct === 'string') {
          return doesStringMatch(direct, value, clause.operator);
        }

        const fallbackEntry = Object.entries(metadata).find(
          ([entryKey]) => normalizeText(entryKey) === normalizeText(key)
        );
        return fallbackEntry ? doesStringMatch(fallbackEntry[1], value, clause.operator) : false;
      };

      if (normalizedField === 'name') {
        return doesStringMatch(item.name, value, clause.operator);
      }
      if (normalizedField === 'path') {
        return doesStringMatch(item.path, value, clause.operator);
      }
      if (normalizedField === 'type' || normalizedField === 'kind' || normalizedField === 'is') {
        return doesStringMatch(item.type, value, '=');
      }
      if (normalizedField === 'ext' || normalizedField === 'extension') {
        return doesStringMatch(extension, value.replace(/^\./, ''), clause.operator);
      }
      if (normalizedField === 'size') {
        if (!Number.isFinite(numericValue) || item.size === null) {
          return false;
        }

        return compareNumber(item.size, numericValue, clause.operator);
      }
      if (normalizedField === 'modified' || normalizedField === 'lastmodified') {
        return compareDate(item.lastModified, value, clause.operator);
      }
      if (normalizedField === 'etag') {
        const etag = item.etag ?? (details && details !== null ? details.etag : null) ?? '';
        return doesStringMatch(etag, value, clause.operator);
      }
      if (normalizedField === 'key') {
        const objectKey =
          details && details !== null
            ? details.key
            : item.path.split('/').slice(1).join('/') || item.path;
        return doesStringMatch(objectKey, value, clause.operator);
      }
      if (normalizedField === 'contenttype') {
        return doesStringMatch(
          details && details !== null ? details.contentType : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'storageclass') {
        return doesStringMatch(
          details && details !== null ? details.storageClass : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'cachecontrol') {
        return doesStringMatch(
          details && details !== null ? (details.cacheControl ?? '') : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'contentdisposition') {
        return doesStringMatch(
          details && details !== null ? (details.contentDisposition ?? '') : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'contentencoding') {
        return doesStringMatch(
          details && details !== null ? (details.contentEncoding ?? '') : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'contentlanguage') {
        return doesStringMatch(
          details && details !== null ? (details.contentLanguage ?? '') : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'versionid') {
        return doesStringMatch(
          details && details !== null ? (details.versionId ?? '') : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'expires') {
        return compareDate(
          details && details !== null ? (details.expires ?? null) : null,
          value,
          clause.operator
        );
      }
      if (normalizedField === 'serversideencryption' || normalizedField === 'sse') {
        return doesStringMatch(
          details && details !== null ? (details.serverSideEncryption ?? '') : '',
          value,
          clause.operator
        );
      }
      if (normalizedField === 'meta' || normalizedField === 'metadata') {
        const allMetadata = metadataEntries
          .map(([key, metadataValue]) => `${key}:${metadataValue}`)
          .join(' ');
        return doesStringMatch(allMetadata, value, clause.operator);
      }
      if (normalizedField.startsWith('meta.')) {
        const metadataKey = normalizedField.slice('meta.'.length);
        return metadataMatch(metadataKey);
      }

      return metadataMatch(clause.field);
    };

    const filteredItems =
      normalizedFilter.length === 0
        ? items
        : items.filter((item) =>
            parsedFilterClauses.every((clause) => {
              const hasContent =
                clause.kind === 'text' ? clause.value.length > 0 : clause.value.length > 0;
              if (!hasContent) {
                return true;
              }

              const matched = doesClauseMatch(item, clause);
              return clause.negate ? !matched : matched;
            })
          );

    const sortedItems = [...filteredItems].sort(compareItems);

    if (!selectedPath) {
      return sortedItems.map((item) => ({ item, isParentNavigation: false }));
    }

    return [
      {
        item: {
          name: '..',
          type: 'directory' as const,
          path: parentPath,
          size: null,
          lastModified: null,
        },
        isParentNavigation: true,
      },
      ...sortedItems.map((item) => ({ item, isParentNavigation: false })),
    ];
  }, [
    browse.data?.items,
    compareItems,
    normalizedFilter,
    parentPath,
    parsedFilterClauses,
    propertiesByPath,
    selectedPath,
  ]);

  const setSortForColumn = (key: SortKey, additive: boolean) => {
    setSortRules((previous) => {
      const existing = previous.find((rule) => rule.key === key);
      const nextDirection: SortDirection = existing?.direction === 'asc' ? 'desc' : 'asc';

      if (!additive) {
        const next: SortRule[] = [{ key, direction: nextDirection }];
        if (key !== 'type') {
          next.push({ key: 'type', direction: 'asc' });
        }
        if (key !== 'name') {
          next.push({ key: 'name', direction: 'asc' });
        }
        return next;
      }

      if (existing) {
        return previous.map((rule) =>
          rule.key === key ? { ...rule, direction: nextDirection } : rule
        );
      }

      return [...previous, { key, direction: 'asc' }];
    });
  };

  const getSortIndicator = (key: SortKey): ReactNode => {
    const visibleSortRules = sortRules.filter((rule) => rule.key !== 'type');
    const visibleIndex = visibleSortRules.findIndex((rule) => rule.key === key);
    if (visibleIndex === -1) {
      return null;
    }
    const direction = visibleSortRules[visibleIndex]?.direction;
    return (
      <>
        {direction === 'asc' ? (
          <ChevronUp size={13} className={styles.sortIndicatorIcon} />
        ) : (
          <ChevronDown size={13} className={styles.sortIndicatorIcon} />
        )}
        {visibleSortRules.length > 1 ? <span>{visibleIndex + 1}</span> : null}
      </>
    );
  };

  const getSortLabel = (key: SortKey): string => {
    if (key === 'name') {
      return 'Name';
    }
    if (key === 'size') {
      return 'Size';
    }
    if (key === 'modified') {
      return 'Modified';
    }
    return 'Type';
  };

  const getSortTooltip = (key: SortKey): string => {
    const visibleSortRules = sortRules.filter((rule) => rule.key !== 'type');
    const visibleIndex = visibleSortRules.findIndex((rule) => rule.key === key);
    if (visibleIndex === -1) {
      return 'Click to sort. Shift+click to add this column as an extra compare level.';
    }

    const sequence = visibleSortRules
      .map((rule, ruleIndex) => {
        const directionLabel = rule.direction === 'asc' ? 'ascending' : 'descending';
        return `${ruleIndex + 1}. ${getSortLabel(rule.key)} (${directionLabel})`;
      })
      .join(' -> ');

    return `Number ${visibleIndex + 1} means compare priority. Current order: ${sequence}.`;
  };

  const selectedRecordsCount = selectedItems.size;
  const visibleOverviewColumns = overviewColumnDefinitions.filter(
    (column) => overviewColumnVisibility[column.key]
  );
  const visibleOverviewColumnsCount = visibleOverviewColumns.length;
  const allOverviewColumnsSelected =
    visibleOverviewColumnsCount === overviewColumnDefinitions.length;
  const normalizedOverviewFieldsFilterQuery = overviewFieldsFilterQuery.trim().toLowerCase();
  const filteredOverviewColumns = overviewColumnDefinitions.filter((column) =>
    column.label.toLowerCase().includes(normalizedOverviewFieldsFilterQuery)
  );
  const hasBucketContext = selectedPath.trim().replace(/^\/+/, '').length > 0;
  const uploadDisabled = isUploading || !hasBucketContext;
  const selectedBrowseItems = (browse.data?.items ?? []).filter((item) =>
    selectedItems.has(item.path)
  );
  const hasDeletableSelection = selectedBrowseItems.some(
    (item) => !(item.type === 'directory' && !item.path.includes('/'))
  );
  const formatItemSize = (item: BrowseItem): string => {
    if (item.type === 'directory') {
      if (folderSizeLoadingPaths.has(item.path)) {
        return 'Calculating...';
      }

      const folderSize = folderSizesByPath[item.path];
      return typeof folderSize === 'number' ? formatBytes(folderSize) : '-';
    }

    if (item.size === null) {
      return '-';
    }

    return formatBytes(item.size);
  };

  const getObjectKeyFromPath = (path: string): string => {
    const parts = path.split('/');
    return parts.slice(1).join('/') || path;
  };

  const getPropertiesForItem = (item: BrowseItem): ObjectPropertiesResult | null | undefined => {
    if (item.type !== 'file') {
      return undefined;
    }

    return propertiesByPath[item.path];
  };

  const resolveOverviewFieldValue = (
    item: BrowseItem,
    columnKey: OverviewColumnKey,
    isParentNavigation: boolean
  ): string => {
    if (isParentNavigation) {
      return '';
    }

    if (columnKey === 'showSize') {
      return formatItemSize(item);
    }

    if (columnKey === 'showModified') {
      return formatDate(item.lastModified);
    }

    if (item.type !== 'file') {
      return '-';
    }

    const details = getPropertiesForItem(item);
    const isLoading = propertiesLoadingPaths.has(item.path);

    if (columnKey === 'showKey') {
      return details?.key ?? getObjectKeyFromPath(item.path);
    }

    if (columnKey === 'showEtag') {
      return item.etag ?? details?.etag ?? (isLoading ? 'Loading...' : '-');
    }

    if (details === undefined) {
      return isLoading ? 'Loading...' : '-';
    }

    if (details === null) {
      return '-';
    }

    if (columnKey === 'showVersionId') {
      return details.versionId ?? '-';
    }
    if (columnKey === 'showServerSideEncryption') {
      return details.serverSideEncryption ?? '-';
    }
    if (columnKey === 'showContentType') {
      return details.contentType;
    }
    if (columnKey === 'showStorageClass') {
      return details.storageClass;
    }
    if (columnKey === 'showCacheControl') {
      return details.cacheControl ?? '-';
    }
    if (columnKey === 'showContentDisposition') {
      return details.contentDisposition ?? '-';
    }
    if (columnKey === 'showContentEncoding') {
      return details.contentEncoding ?? '-';
    }
    if (columnKey === 'showContentLanguage') {
      return details.contentLanguage ?? '-';
    }
    if (columnKey === 'showExpires') {
      return details.expires ? formatDate(details.expires) : '-';
    }
    return '-';
  };

  const isSortableColumn = (columnKey: OverviewColumnKey): boolean => {
    return columnKey === 'showSize' || columnKey === 'showModified';
  };

  const resolveSortKey = (columnKey: OverviewColumnKey): SortKey => {
    if (columnKey === 'showSize') {
      return 'size';
    }
    return 'modified';
  };

  const contextItemCapability = useMemo(() => {
    if (!contextMenu || contextMenu.item.type !== 'file') {
      return null;
    }

    return resolveFileCapability(contextMenu.item.path);
  }, [contextMenu]);

  const canDeleteContextItem =
    canDelete && !(contextMenu?.item.type === 'directory' && !contextMenu.item.path.includes('/'));

  const contextMenuActions = useMemo<ContextMenuAction[]>(() => {
    if (!contextMenu) {
      return [];
    }

    const actions: ContextMenuAction[] = [];
    if (contextMenu.item.type === 'directory') {
      actions.push({
        id: 'open',
        label: 'Open',
        hint: 'Enter',
        onSelect: () => {
          onCloseContextMenu();
          setSelectedPath(contextMenu.item.path);
        },
      });
      actions.push({
        id: 'calculate-size',
        label: 'Calculate Size',
        onSelect: () => {
          void onCalculateFolderSize(contextMenu.item.path);
        },
      });
    } else {
      if (contextItemCapability?.canView) {
        actions.push({
          id: 'view',
          label: 'View',
          onSelect: () => {
            onCloseContextMenu();
            void onViewFile(contextMenu.item.path);
          },
        });
      }

      if (canWrite && contextItemCapability?.canEditText) {
        actions.push({
          id: 'edit',
          label: 'Edit',
          onSelect: () => {
            onCloseContextMenu();
            void onEditFile(contextMenu.item.path);
          },
        });
      }

      actions.push({
        id: 'download',
        label: 'Download',
        hint: formatShortcutHint(['Ctrl/Cmd', 'D']),
        onSelect: () => {
          onCloseContextMenu();
          void onDownload(contextMenu.item.path);
        },
      });
      actions.push({
        id: 'properties',
        label: 'Properties',
        onSelect: () => {
          void onOpenProperties(contextMenu.item.path);
        },
      });
    }

    if (canWrite) {
      actions.push({
        id: 'rename',
        label: 'Rename',
        hint: 'F2',
        onSelect: () => {
          onCloseContextMenu();
          onRename(contextMenu.item.path, contextMenu.item.name);
        },
      });
      actions.push({
        id: 'move',
        label: 'Move',
        hint: formatShortcutHint(['Ctrl/Cmd', 'Shift', 'M']),
        onSelect: () => {
          onCloseContextMenu();
          onMove(contextMenu.item.path);
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
          onDeletePathItems([contextMenu.item]);
        },
      });
    }

    return actions;
  }, [
    canDeleteContextItem,
    canWrite,
    contextItemCapability,
    contextMenu,
    onCalculateFolderSize,
    onCloseContextMenu,
    onDeletePathItems,
    onDownload,
    onEditFile,
    onMove,
    onOpenProperties,
    onRename,
    onViewFile,
    setSelectedPath,
  ]);

  const openFilter = () => {
    if (isFilterOpen) {
      filterInputRef.current?.focus();
      return;
    }

    setIsFilterOpen(true);
  };

  const closeFilter = () => {
    setFilterDraftQuery('');
    setFilterQuery('');
    setIsFilterOpen(false);
  };

  const focusRowAtIndex = useCallback(
    (index: number) => {
      if (renderedItems.length === 0) {
        return;
      }

      const nextIndex = Math.max(0, Math.min(index, renderedItems.length - 1));
      setFocusedRowIndex(nextIndex);
      rowRefs.current[nextIndex]?.focus();
    },
    [renderedItems.length]
  );

  const defaultRowIndex = useMemo(() => {
    if (renderedItems.length === 0) {
      return -1;
    }
    if (renderedItems[0]?.isParentNavigation && renderedItems.length > 1) {
      return 1;
    }
    return 0;
  }, [renderedItems]);

  useEffect(() => {
    if (renderedItems.length === 0 || defaultRowIndex < 0) {
      setFocusedRowIndex(null);
      return;
    }

    if (
      isShortcutsModalOpen ||
      isFilterHelpModalOpen ||
      contextMenu !== null ||
      pendingFolderUploadFiles.length > 0 ||
      isBreadcrumbEditing ||
      isFilterOpen
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
    isBreadcrumbEditing,
    contextMenu,
    isFilterOpen,
    isFilterHelpModalOpen,
    isShortcutsModalOpen,
    pendingFolderUploadFiles.length,
    selectedPath,
    renderedItems,
  ]);

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

      if (isShortcutsModalOpen && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setIsShortcutsModalOpen(false);
        return;
      }

      if (isFilterHelpModalOpen && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setIsFilterHelpModalOpen(false);
        return;
      }

      if (isTypingInInput) {
        return;
      }

      if (contextMenu) {
        return;
      }

      const isExplorerRefreshShortcut =
        event.key === 'F5' && !event.ctrlKey && !event.metaKey && !event.altKey;

      if (isExplorerRefreshShortcut) {
        event.preventDefault();
        void browse.refetch();
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

      if (event.key === 'ArrowLeft' && selectedPath) {
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
    isFilterHelpModalOpen,
    isShortcutsModalOpen,
    openFilter,
    contextMenu,
    parentPath,
    browse,
    renderedItems.length,
    selectedPath,
    setSelectedPath,
  ]);

  useEffect(() => {
    if (!contextMenu || contextMenuActions.length === 0) {
      return;
    }

    contextMenuFocusRestoreRef.current = document.activeElement as HTMLElement | null;
    wasContextMenuOpenRef.current = true;
    contextMenuItemRefs.current[0]?.focus();
  }, [contextMenu, contextMenuActions]);

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

  const focusContextMenuItemAtIndex = useCallback((index: number) => {
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

  const handleContextMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCloseContextMenu();
      return;
    }

    const focusableItems = contextMenuItemRefs.current.filter(
      (item): item is HTMLButtonElement => item !== null
    );
    if (focusableItems.length === 0) {
      return;
    }

    const focusedItem = document.activeElement;
    const focusedIndex = focusableItems.findIndex((item) => item === focusedItem);
    const currentIndex = focusedIndex >= 0 ? focusedIndex : 0;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusContextMenuItemAtIndex(currentIndex + 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusContextMenuItemAtIndex(currentIndex - 1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focusContextMenuItemAtIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      focusContextMenuItemAtIndex(focusableItems.length - 1);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      focusContextMenuItemAtIndex(currentIndex + (event.shiftKey ? -1 : 1));
    }
  };

  const handleRowKeyDown = (
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    item: BrowseItem,
    renderedIndex: number,
    isParentNavigation: boolean
  ) => {
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

    if (event.key === 'Enter' || event.key === 'ArrowRight') {
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

  return (
    <>
      <div className={styles.browserToolbar}>
        <div className={styles.explorerChrome}>
          <div className={styles.browserControls}>
            <Button
              variant="muted"
              className={styles.iconButton}
              onClick={() => setSelectedPath(parentPath)}
              aria-label="Go back"
              title="Back"
              disabled={!selectedPath}
            >
              <Undo2 size={16} aria-hidden />
            </Button>
            <Button
              variant="muted"
              className={styles.iconButton}
              onClick={() => setSelectedPath('')}
              aria-label="Go to root"
              title="Go to root"
              disabled={!selectedPath}
            >
              <House size={16} aria-hidden />
            </Button>

            <div className={styles.breadcrumbField}>
              <div
                className={`${styles.breadcrumbTrail} ${
                  breadcrumbValidationMessage ? styles.breadcrumbTrailInvalid : ''
                }`.trim()}
                data-testid="breadcrumb-trail"
                onDoubleClick={() => setIsBreadcrumbEditing(true)}
                onClick={(event) => {
                  if (event.target === event.currentTarget) {
                    setIsBreadcrumbEditing(true);
                  }
                }}
              >
                {isBreadcrumbEditing ? (
                  <div className={styles.breadcrumbInputWrap}>
                    <Input
                      ref={breadcrumbInputRef}
                      className={styles.breadcrumbInput}
                      value={breadcrumbDraft}
                      onChange={(event) => {
                        setBreadcrumbDraft(event.target.value);
                        setActiveBreadcrumbHintIndex(-1);
                      }}
                      onBlur={(event) => {
                        if (isBreadcrumbPathCommitAllowed(event.target.value)) {
                          commitBreadcrumbPath(event.target.value);
                        }
                        setIsBreadcrumbEditing(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') {
                          if (breadcrumbHintOptions.length === 0) {
                            return;
                          }

                          event.preventDefault();
                          setActiveBreadcrumbHintIndex((previous) => {
                            if (previous < 0) {
                              return 0;
                            }

                            return Math.min(previous + 1, breadcrumbHintOptions.length - 1);
                          });
                          return;
                        }

                        if (event.key === 'ArrowUp') {
                          if (breadcrumbHintOptions.length === 0) {
                            return;
                          }

                          event.preventDefault();
                          setActiveBreadcrumbHintIndex((previous) => {
                            if (previous < 0) {
                              return breadcrumbHintOptions.length - 1;
                            }

                            return Math.max(previous - 1, 0);
                          });
                          return;
                        }

                        if (event.key === 'Enter') {
                          if (activeBreadcrumbHintIndex >= 0) {
                            const highlighted = breadcrumbHintOptions[activeBreadcrumbHintIndex];
                            if (highlighted) {
                              setBreadcrumbDraft(highlighted);
                              commitBreadcrumbPath(highlighted);
                              setIsBreadcrumbEditing(false);
                              return;
                            }
                          }

                          const enteredValue = (event.target as HTMLInputElement).value;
                          if (isBreadcrumbPathCommitAllowed(enteredValue)) {
                            commitBreadcrumbPath(enteredValue);
                          }
                          setIsBreadcrumbEditing(false);
                          return;
                        }

                        if (event.key === 'Tab' && activeBreadcrumbHintIndex >= 0) {
                          const highlighted = breadcrumbHintOptions[activeBreadcrumbHintIndex];
                          if (!highlighted) {
                            return;
                          }

                          event.preventDefault();
                          setBreadcrumbDraft(highlighted);
                          if (isBreadcrumbPathCommitAllowed(highlighted)) {
                            commitBreadcrumbPath(highlighted);
                          }
                          setIsBreadcrumbEditing(false);
                          return;
                        }

                        if (event.key === 'Escape') {
                          setBreadcrumbDraft(selectedPath ? `/${selectedPath}` : '/');
                          setIsBreadcrumbEditing(false);
                        }
                      }}
                      aria-label="Breadcrumb path"
                      placeholder="/bucket/folder"
                    />
                    {breadcrumbHintOptions.length > 0 ? (
                      <div
                        className={styles.breadcrumbHints}
                        data-testid="breadcrumb-hints"
                        role="listbox"
                      >
                        {breadcrumbHintOptions.map((hint, index) => (
                          <button
                            key={hint}
                            type="button"
                            role="option"
                            aria-selected={activeBreadcrumbHintIndex === index}
                            className={`${styles.breadcrumbHintButton} ${
                              activeBreadcrumbHintIndex === index
                                ? styles.breadcrumbHintButtonActive
                                : ''
                            }`.trim()}
                            onMouseDown={(event) => {
                              event.preventDefault();
                            }}
                            onClick={() => {
                              setBreadcrumbDraft(hint);
                              if (isBreadcrumbPathCommitAllowed(hint)) {
                                commitBreadcrumbPath(hint);
                              }
                              setIsBreadcrumbEditing(false);
                            }}
                          >
                            {hint}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <button className={styles.breadcrumbLink} onClick={() => setSelectedPath('')}>
                      /
                    </button>
                    {breadcrumbSegments.map((segment, index) => (
                      <span key={segment.path} className={styles.breadcrumbPart}>
                        {index > 0 ? <span className={styles.breadcrumbDivider}>/</span> : null}
                        <button
                          className={styles.breadcrumbLink}
                          onClick={() => setSelectedPath(segment.path)}
                        >
                          {segment.label}
                        </button>
                      </span>
                    ))}
                  </>
                )}
              </div>
              {breadcrumbValidationMessage ? (
                <p className={styles.breadcrumbValidationError}>{breadcrumbValidationMessage}</p>
              ) : null}
            </div>

            <div className={styles.browserFilterRow}>
              <Button
                variant="muted"
                className={`${styles.iconButton} ${isFilterOpen ? styles.filterToggleConnected : ''}`}
                onClick={openFilter}
                aria-label="Open filter"
                title="Open filter"
              >
                <Search size={16} aria-hidden />
              </Button>
              {isFilterOpen ? (
                <div className={styles.tableFilterWrap}>
                  <Input
                    ref={filterInputRef}
                    className={styles.tableFilterInput}
                    value={filterDraftQuery}
                    onChange={(event) => setFilterDraftQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        closeFilter();
                      }
                    }}
                    placeholder="Filter files and folders"
                    aria-label="Filter files and folders"
                  />
                  <button
                    className={styles.tableFilterClose}
                    type="button"
                    aria-label="Close filter"
                    onClick={closeFilter}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>

            <div className={styles.overviewFieldsWrap} ref={overviewFieldsMenuRef}>
              <Button
                variant="muted"
                className={styles.iconButton}
                onClick={() => setIsOverviewFieldsMenuOpen((previous) => !previous)}
                aria-label="Customize visible fields"
                title="Customize visible fields"
                aria-expanded={isOverviewFieldsMenuOpen}
              >
                <SlidersHorizontal size={16} aria-hidden />
              </Button>
              {isOverviewFieldsMenuOpen ? (
                <div
                  className={styles.overviewFieldsMenu}
                  role="menu"
                  aria-label="Visible fields menu"
                >
                  <div className={styles.overviewFieldsHeader}>
                    <p className={styles.overviewFieldsTitle}>Visible fields</p>
                    <Input
                      className={styles.overviewFieldsSearchInput}
                      value={overviewFieldsFilterQuery}
                      onChange={(event) => setOverviewFieldsFilterQuery(event.target.value)}
                      placeholder="Search fields"
                      aria-label="Search visible fields"
                    />
                    <div className={styles.overviewFieldsActions}>
                      <Button
                        variant="muted"
                        className={styles.overviewFieldsActionButton}
                        onClick={() => {
                          setOverviewColumnVisibility((previous) => {
                            const next = { ...previous };
                            for (const column of overviewColumnDefinitions) {
                              next[column.key] = !allOverviewColumnsSelected;
                            }
                            return next;
                          });
                        }}
                      >
                        {allOverviewColumnsSelected ? 'Toggle all off' : 'Toggle all on'}
                      </Button>
                    </div>
                  </div>
                  <div className={styles.overviewFieldsList}>
                    {filteredOverviewColumns.length === 0 ? (
                      <p className={styles.overviewFieldsEmptyState}>
                        No fields match this search.
                      </p>
                    ) : null}
                    {filteredOverviewColumns.map((column) => (
                      <label key={column.key} className={styles.overviewFieldsOption}>
                        <input
                          className={styles.overviewFieldsCheckbox}
                          type="checkbox"
                          checked={overviewColumnVisibility[column.key]}
                          onChange={(event) =>
                            setOverviewColumnVisibility((previous) => ({
                              ...previous,
                              [column.key]: event.target.checked,
                            }))
                          }
                        />
                        <span>{column.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {selectedRecordsCount > 0 ? (
              <>
                <span className={styles.selectionCount}>{selectedRecordsCount} selected</span>
                <Button
                  variant="muted"
                  onClick={() => void onBulkDownload()}
                  disabled={selectedFiles.length === 0}
                  title={
                    selectedFiles.length === 0
                      ? 'Select at least one file'
                      : 'Download selected files'
                  }
                >
                  Download
                </Button>
                {canDelete ? (
                  <Button
                    variant="danger"
                    onClick={() => void onBulkDelete()}
                    disabled={!hasDeletableSelection}
                    title={
                      !hasDeletableSelection
                        ? 'Bucket deletion is not supported'
                        : 'Delete selected items'
                    }
                  >
                    Delete
                  </Button>
                ) : null}
                <Button variant="muted" onClick={onClearSelection}>
                  Clear
                </Button>
              </>
            ) : null}

            {canWrite ? (
              <>
                <Button
                  variant="muted"
                  disabled={uploadDisabled}
                  onClick={() => uploadFilesInputRef.current?.click()}
                  title={
                    !hasBucketContext ? 'Navigate to a bucket before uploading' : 'Upload files'
                  }
                >
                  Upload Files
                </Button>
                <Button
                  variant="muted"
                  disabled={uploadDisabled}
                  onClick={() => uploadFolderInputRef.current?.click()}
                  title={
                    !hasBucketContext ? 'Navigate to a bucket before uploading' : 'Upload folder'
                  }
                >
                  Upload Folder
                </Button>
              </>
            ) : null}

            <Button
              variant="muted"
              className={`${styles.iconButton} ${styles.refreshButton} ${isBrowseRefreshing ? styles.refreshButtonBusy : ''}`}
              onClick={() => {
                void browse.refetch();
              }}
              aria-label="Refresh current location"
              title={isBrowseRefreshing ? 'Refreshing...' : 'Refresh'}
              aria-busy={isBrowseRefreshing}
            >
              <RefreshCw size={16} aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      {browse.isLoading ? <p className={styles.state}>Loading objects...</p> : null}
      {browse.isError ? (
        <p className={`${styles.state} ${styles.stateError}`}>Failed to load S3 path data.</p>
      ) : null}

      {browse.data ? (
        <>
          {isShortcutsModalOpen ? (
            <div
              className={styles.modalOverlay}
              role="dialog"
              aria-modal="true"
              aria-labelledby="shortcuts-modal-title"
              aria-describedby="shortcuts-modal-description"
              aria-label="Keyboard shortcuts"
            >
              <div className={`${styles.modalCard} ${styles.shortcutsModalCard}`}>
                <div className={styles.shortcutsModalHeader}>
                  <Keyboard size={16} aria-hidden />
                  <h3 id="shortcuts-modal-title">Keyboard shortcuts</h3>
                </div>
                <p id="shortcuts-modal-description" className={styles.shortcutsModalDescription}>
                  Quick commands available in the browser view.
                </p>
                <div className={styles.shortcutsGrid}>
                  <div className={styles.shortcutsTableHeader}>
                    <span className={styles.shortcutsTableHeaderAction}>Action</span>
                    <span className={styles.shortcutsTableHeaderKeys}>Shortcut</span>
                  </div>
                  {browserShortcuts.map(({ id, action, shortcuts, Icon }) => (
                    <div key={id} className={styles.shortcutItem}>
                      <span className={styles.shortcutIcon} aria-hidden>
                        <Icon size={14} />
                      </span>
                      <span className={styles.shortcutAction}>{action}</span>
                      <span className={styles.shortcutKeys}>
                        {shortcuts.map((shortcut, shortcutIndex) => (
                          <Fragment key={`${id}-${shortcut.join('+')}`}>
                            <span className={styles.shortcutOption}>
                              {shortcut.map((key, keyIndex) => (
                                <Fragment key={`${id}-${shortcutIndex}-${key}`}>
                                  {keyIndex > 0 ? (
                                    <span className={styles.shortcutJoin}>+</span>
                                  ) : null}
                                  <kbd className={styles.shortcutKeycap}>{key}</kbd>
                                </Fragment>
                              ))}
                            </span>
                            {shortcutIndex < shortcuts.length - 1 ? (
                              <span className={styles.shortcutOptionSeparator}>or</span>
                            ) : null}
                          </Fragment>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
                <div className={styles.modalActions}>
                  <Button variant="muted" onClick={() => setIsShortcutsModalOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {isFilterHelpModalOpen ? (
            <div
              className={styles.modalOverlay}
              role="dialog"
              aria-modal="true"
              aria-labelledby="filter-help-modal-title"
              aria-describedby="filter-help-modal-description"
              aria-label="Filter query help"
            >
              <div className={`${styles.modalCard} ${styles.shortcutsModalCard}`}>
                <div className={styles.shortcutsModalHeader}>
                  <BookOpenText size={16} aria-hidden />
                  <h3 id="filter-help-modal-title">Filter query help</h3>
                </div>
                <p id="filter-help-modal-description" className={styles.shortcutsModalDescription}>
                  Use plain text or field expressions in the filter input. Clauses are combined with
                  AND.
                </p>
                <div className={styles.filterHelpList}>
                  {filterHelpEntries.map((entry) => (
                    <article key={entry.id} className={styles.filterHelpCard}>
                      <p className={styles.filterHelpSectionLabel}>Query option</p>
                      <p className={styles.filterHelpQuery}>
                        <code>{entry.query}</code>
                      </p>
                      <p className={styles.filterHelpSectionLabel}>What it does</p>
                      <p className={styles.filterHelpBody}>{entry.whatItDoes}</p>
                      <p className={styles.filterHelpSectionLabel}>How it works</p>
                      <p className={styles.filterHelpBody}>{entry.howItWorks}</p>
                      <p className={styles.filterHelpSectionLabel}>Examples</p>
                      <p className={styles.filterHelpExamples}>
                        {entry.examples.map((example, index) => (
                          <Fragment key={`${entry.id}-${example}`}>
                            {index > 0 ? (
                              <span className={styles.filterHelpExampleSeparator}> | </span>
                            ) : null}
                            <code>{example}</code>
                          </Fragment>
                        ))}
                      </p>
                    </article>
                  ))}
                </div>
                <div className={styles.modalActions}>
                  <Button variant="muted" onClick={() => setIsFilterHelpModalOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <input
            ref={uploadFilesInputRef}
            className={styles.hiddenInput}
            type="file"
            multiple
            data-testid="upload-files-input"
            onChange={(event) => {
              const files = event.target.files;
              if (!files || files.length === 0) {
                return;
              }

              void onUploadFiles(files);
              event.target.value = '';
            }}
          />
          <input
            ref={uploadFolderInputRef}
            className={styles.hiddenInput}
            type="file"
            multiple
            data-testid="upload-folder-input"
            {...folderInputAttributes}
            onChange={(event) => {
              const files = event.target.files;
              if (!files || files.length === 0) {
                return;
              }

              setPendingFolderUploadFiles(Array.from(files));
              event.target.value = '';
            }}
          />
          {pendingFolderUploadFiles.length > 0 ? (
            <div
              className={styles.modalOverlay}
              role="dialog"
              aria-modal="true"
              aria-labelledby="folder-upload-modal-title"
              aria-describedby="folder-upload-modal-description"
              aria-label="Confirm folder upload"
            >
              <div className={styles.modalCard}>
                <h3 id="folder-upload-modal-title">Upload selected folder?</h3>
                <p id="folder-upload-modal-description">
                  Upload {pendingFolderUploadFiles.length} file(s) from the selected folder.
                </p>
                <div className={styles.modalActions}>
                  <Button
                    variant="muted"
                    onClick={() => {
                      setPendingFolderUploadFiles([]);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      void onUploadFolder(pendingFolderUploadFiles);
                      setPendingFolderUploadFiles([]);
                    }}
                  >
                    Upload Folder
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          {renderedItems.length === 0 ? (
            <div className={styles.emptyItemsState}>
              <p>No items in this location.</p>
              <span>Upload files to this path or navigate to another folder.</span>
            </div>
          ) : (
            <div className={styles.itemsTableWrap}>
              <table className={styles.itemsTable}>
                <thead>
                  <tr>
                    <th className={styles.nameColumn}>
                      <button
                        className={styles.sortHeaderButton}
                        type="button"
                        onClick={(event) => setSortForColumn('name', event.shiftKey)}
                        title={getSortTooltip('name')}
                      >
                        <span>Name</span>
                        <span className={styles.sortIndicator} aria-hidden>
                          {getSortIndicator('name')}
                        </span>
                      </button>
                    </th>
                    {visibleOverviewColumns.map((column) => {
                      const columnClassName =
                        column.key === 'showSize'
                          ? styles.sizeColumn
                          : column.key === 'showModified'
                            ? styles.modifiedColumn
                            : styles.propertyColumn;

                      if (!isSortableColumn(column.key)) {
                        return (
                          <th key={column.key} className={columnClassName}>
                            {column.label}
                          </th>
                        );
                      }

                      const sortKey = resolveSortKey(column.key);
                      return (
                        <th key={column.key} className={columnClassName}>
                          <button
                            className={styles.sortHeaderButton}
                            type="button"
                            onClick={(event) => setSortForColumn(sortKey, event.shiftKey)}
                            title={getSortTooltip(sortKey)}
                          >
                            <span>{column.label}</span>
                            <span className={styles.sortIndicator} aria-hidden>
                              {getSortIndicator(sortKey)}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {renderedItems.map(({ item, isParentNavigation }, index) => (
                    <tr
                      key={`${item.type}:${isParentNavigation ? '__parent__' : item.path}`}
                      ref={(element) => {
                        rowRefs.current[index] = element;
                      }}
                      tabIndex={focusedRowIndex === index ? 0 : -1}
                      data-focused={focusedRowIndex === index ? 'true' : 'false'}
                      onFocus={() => setFocusedRowIndex(index)}
                      className={
                        !isParentNavigation && selectedItems.has(item.path) ? styles.isSelected : ''
                      }
                      onClick={(event) => {
                        if (isParentNavigation) {
                          return;
                        }

                        onRowClick(item, index, event);
                      }}
                      onDoubleClick={() => {
                        if (isParentNavigation) {
                          setSelectedPath(parentPath);
                          return;
                        }

                        if (item.type === 'file') {
                          void onViewFile(item.path);
                          return;
                        }

                        onRowDoubleClick(item);
                      }}
                      onContextMenu={(event) => {
                        if (isParentNavigation) {
                          event.preventDefault();
                          return;
                        }

                        onOpenContextMenu(item, event);
                      }}
                      onKeyDown={(event) =>
                        handleRowKeyDown(event, item, index, isParentNavigation)
                      }
                    >
                      <td className={`${styles.nameCell} ${styles.nameColumn}`}>
                        <div className={styles.itemMainButton}>
                          <span className={styles.itemIcon} aria-hidden>
                            {item.type === 'directory' ? <Folder size={16} /> : <File size={16} />}
                          </span>
                          <strong>{item.name}</strong>
                        </div>
                      </td>
                      {visibleOverviewColumns.map((column) => {
                        const columnClassName =
                          column.key === 'showSize'
                            ? styles.sizeColumn
                            : column.key === 'showModified'
                              ? styles.modifiedColumn
                              : styles.propertyColumn;

                        return (
                          <td key={column.key} className={columnClassName}>
                            {resolveOverviewFieldValue(item, column.key, isParentNavigation)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {contextMenu ? (
            <div
              ref={contextMenuRef}
              className={styles.contextMenu}
              role="menu"
              aria-label="Item actions"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={handleContextMenuKeyDown}
            >
              {contextMenuActions.map((action, index) => {
                const previousAction = contextMenuActions[index - 1];
                const startsSecondarySection =
                  ['rename', 'move', 'delete'].includes(action.id) &&
                  previousAction &&
                  !['rename', 'move', 'delete'].includes(previousAction.id);

                return (
                  <Fragment key={action.id}>
                    {startsSecondarySection ? (
                      <div className={styles.contextMenuSeparator} />
                    ) : null}
                    <button
                      ref={(element) => {
                        contextMenuItemRefs.current[index] = element;
                      }}
                      role="menuitem"
                      className={`${styles.contextMenuItem} ${
                        action.isDanger ? styles.contextMenuItemDanger : ''
                      }`}
                      onClick={action.onSelect}
                    >
                      <span>{action.label}</span>
                      {action.hint ? (
                        <span className={styles.contextMenuHint}>{action.hint}</span>
                      ) : null}
                    </button>
                  </Fragment>
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
};
