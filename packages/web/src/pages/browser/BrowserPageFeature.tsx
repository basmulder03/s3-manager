import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  ReactNode,
} from 'react';
import {
  ChevronDown,
  ChevronUp,
  House,
  MoreVertical,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Undo2,
  X,
} from 'lucide-react';
import { Button, Input } from '@web/components/ui';
import { useModalFocusTrapEffect } from '@web/hooks/useModalFocusTrapEffect';
import { trpcProxyClient } from '@web/trpc/client';
import type { BrowseItem, ObjectPropertiesResult } from '@server/services/s3/types';
import { resolveFileCapability } from '@web/utils/fileCapabilities';
import { formatBytes } from '@web/utils/formatBytes';
import {
  BREADCRUMB_HINTS_STORAGE_KEY,
  EXPLORER_GRID_VIEW_MIN_ZOOM,
  EXPLORER_ZOOM_DEFAULT_LEVEL,
  EXPLORER_ZOOM_EVENT_NAME,
  EXPLORER_ZOOM_LEVELS,
  EXPLORER_ZOOM_STORAGE_KEY,
  formatShortcutHint,
  nameCollator,
  overviewColumnDefinitions,
  overviewColumnSortKeyByColumn,
  OVERVIEW_COLUMNS_STORAGE_KEY,
  resolveInitialBreadcrumbHintPaths,
  resolveInitialExplorerZoomLevel,
  resolveInitialOverviewColumnVisibility,
  resolveNearestExplorerZoomLevel,
  resolveNextExplorerZoomLevel,
} from '@web/pages/browser/constants';
import {
  cloneDroppedFile,
  extractFilesFromDroppedEntries,
  FileWithRelativePath,
  INTERNAL_MOVE_DRAG_TYPE,
} from '@web/pages/browser/dragDrop';
import { ModalPortal } from '@web/components/modals/ModalPortal';
import {
  doesStringMatch,
  normalizeFieldName,
  normalizeText,
  parseFilterClauses,
  parseSizeLiteralBytes,
} from '@web/pages/browser/filterQuery';
import { renderBrowseItemIcon } from '@web/pages/browser/fileIcons';
import { BrowserContextMenu } from '@web/pages/browser/components/BrowserContextMenu';
import { BrowserInfoModals } from '@web/pages/browser/components/BrowserInfoModals';
import type {
  ContextMenuAction,
  OverviewColumnKey,
  OverviewColumnVisibility,
  QueryClause,
  QueryOperator,
  SortDirection,
  SortKey,
  SortRule,
} from '@web/pages/browser/types';
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
  onCreateFile: (fileName: string) => Promise<void>;
  onCreateFolder: (folderName: string) => Promise<void>;
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
  onMove: (path: string, destinationPath?: string) => void;
  onCopyItems: (items: BrowseItem[]) => void;
  onCopyTextToClipboard: (value: string, label: string) => Promise<void>;
  onCutItems: (items: BrowseItem[]) => void;
  onPasteIntoPath: (destinationPath: string) => Promise<void>;
  hasClipboardItems: boolean;
  clipboardMode?: 'copy' | 'cut' | null;
  clipboardPaths?: Set<string>;
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

const MIN_BROWSER_ZOOM_FACTOR = 0.5;
const MAX_BROWSER_ZOOM_FACTOR = 3;

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
  onCreateFile,
  onCreateFolder,
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
  onCopyItems,
  onCopyTextToClipboard,
  onCutItems,
  onPasteIntoPath,
  hasClipboardItems,
  clipboardMode = null,
  clipboardPaths = new Set<string>(),
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
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [overviewFieldsFilterQuery, setOverviewFieldsFilterQuery] = useState('');
  const [overviewColumnVisibility, setOverviewColumnVisibility] =
    useState<OverviewColumnVisibility>(resolveInitialOverviewColumnVisibility);
  const [manualExplorerZoomLevel, setManualExplorerZoomLevel] = useState<number>(
    resolveInitialExplorerZoomLevel
  );
  const [browserZoomFactor, setBrowserZoomFactor] = useState(1);
  const [propertiesByPath, setPropertiesByPath] = useState<
    Record<string, ObjectPropertiesResult | null>
  >({});
  const [propertiesLoadingPaths, setPropertiesLoadingPaths] = useState<Set<string>>(new Set());
  const [pendingFileUploadFiles, setPendingFileUploadFiles] = useState<File[]>([]);
  const [pendingFolderUploadFiles, setPendingFolderUploadFiles] = useState<File[]>([]);
  const [isUploadDropActive, setIsUploadDropActive] = useState(false);
  const [draggedMovePath, setDraggedMovePath] = useState<string | null>(null);
  const [moveDropTargetPath, setMoveDropTargetPath] = useState<string | null>(null);
  const [createEntryModal, setCreateEntryModal] = useState<{
    kind: 'file' | 'folder';
    value: string;
  } | null>(null);
  const [createEntryError, setCreateEntryError] = useState('');
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [sortRules, setSortRules] = useState<SortRule[]>([
    { key: 'type', direction: 'asc' },
    { key: 'name', direction: 'asc' },
  ]);
  const [openSubmenuActionId, setOpenSubmenuActionId] = useState<string | null>(null);
  const [overviewFieldsMenuStyle, setOverviewFieldsMenuStyle] = useState<CSSProperties>({});
  const [contextSubmenuSide, setContextSubmenuSide] = useState<'left' | 'right'>('right');
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
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const overviewFieldsMenuRef = useRef<HTMLDivElement>(null);
  const uploadFilesInputRef = useRef<HTMLInputElement>(null);
  const uploadFolderInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const contextSubmenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const contextSubmenuRef = useRef<HTMLDivElement>(null);
  const overviewFieldsPanelRef = useRef<HTMLDivElement>(null);
  const contextMenuFocusRestoreRef = useRef<HTMLElement | null>(null);
  const wasContextMenuOpenRef = useRef(false);
  const wasBreadcrumbEditingRef = useRef(false);
  const uploadDropEnterDepthRef = useRef(0);
  const initialDevicePixelRatioRef = useRef<number | null>(null);
  const activeModalRef = useRef<HTMLDivElement>(null);
  const folderInputAttributes = {
    directory: '',
    webkitdirectory: '',
  } as Record<string, string>;
  const explorerZoomLevel = useMemo(
    () => resolveNearestExplorerZoomLevel(manualExplorerZoomLevel * browserZoomFactor),
    [browserZoomFactor, manualExplorerZoomLevel]
  );
  const isExplorerGridView = explorerZoomLevel >= EXPLORER_GRID_VIEW_MIN_ZOOM;
  const explorerViewportScale = useMemo(() => {
    const normalizedBrowserZoom = Math.max(
      MIN_BROWSER_ZOOM_FACTOR,
      Math.min(MAX_BROWSER_ZOOM_FACTOR, browserZoomFactor)
    );
    const ratio = explorerZoomLevel / (EXPLORER_ZOOM_DEFAULT_LEVEL * normalizedBrowserZoom);
    return Math.max(0.7, Math.min(2.4, ratio));
  }, [browserZoomFactor, explorerZoomLevel]);
  const explorerZoomStyle = useMemo(
    () =>
      ({
        zoom: explorerViewportScale,
      }) as CSSProperties,
    [explorerViewportScale]
  );

  const commitBreadcrumbPath = (rawPath: string) => {
    const normalized = rawPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (normalized !== selectedPath) {
      setSelectedPath(normalized);
    }
  };

  const resetExplorerZoom = useCallback(() => {
    setManualExplorerZoomLevel(EXPLORER_ZOOM_DEFAULT_LEVEL);
  }, []);

  const nudgeExplorerZoom = useCallback(
    (direction: 1 | -1) => {
      setManualExplorerZoomLevel((previousManualZoomLevel) => {
        const effectiveLevel = resolveNearestExplorerZoomLevel(
          previousManualZoomLevel * browserZoomFactor
        );
        const nextEffectiveLevel = resolveNextExplorerZoomLevel(effectiveLevel, direction);
        const nextManualLevel = nextEffectiveLevel / Math.max(browserZoomFactor, 0.01);
        return Math.max(
          EXPLORER_ZOOM_LEVELS[0],
          Math.min(EXPLORER_ZOOM_LEVELS.at(-1) ?? 200, nextManualLevel)
        );
      });
    },
    [browserZoomFactor]
  );

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

    window.localStorage.setItem(EXPLORER_ZOOM_STORAGE_KEY, String(manualExplorerZoomLevel));
    window.dispatchEvent(
      new CustomEvent(EXPLORER_ZOOM_EVENT_NAME, {
        detail: { manualExplorerZoomLevel },
      })
    );
  }, [manualExplorerZoomLevel]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const baseDevicePixelRatio =
      initialDevicePixelRatioRef.current ?? Math.max(window.devicePixelRatio || 1, 0.01);
    initialDevicePixelRatioRef.current = baseDevicePixelRatio;

    const syncBrowserZoomFactor = () => {
      const currentRatio = Math.max(window.devicePixelRatio || 1, 0.01);
      const nextFactor = Math.max(
        MIN_BROWSER_ZOOM_FACTOR,
        Math.min(MAX_BROWSER_ZOOM_FACTOR, currentRatio / baseDevicePixelRatio)
      );

      setBrowserZoomFactor((previous) =>
        Math.abs(previous - nextFactor) < 0.01 ? previous : nextFactor
      );
    };

    syncBrowserZoomFactor();

    window.addEventListener('resize', syncBrowserZoomFactor);
    window.visualViewport?.addEventListener('resize', syncBrowserZoomFactor);
    return () => {
      window.removeEventListener('resize', syncBrowserZoomFactor);
      window.visualViewport?.removeEventListener('resize', syncBrowserZoomFactor);
    };
  }, []);

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
    if (!isActionsMenuOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (actionsMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsActionsMenuOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isActionsMenuOpen]);

  useEffect(() => {
    if (!isOverviewFieldsMenuOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (overviewFieldsMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      if (overviewFieldsPanelRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOverviewFieldsMenuOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isOverviewFieldsMenuOpen]);

  const positionOverviewFieldsMenu = useCallback(() => {
    if (!isOverviewFieldsMenuOpen) {
      return;
    }

    const anchor = overviewFieldsMenuRef.current;
    const menu = overviewFieldsPanelRef.current;
    if (!anchor || !menu) {
      return;
    }

    const viewportPadding = 8;
    const gap = 6;
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const menuWidth = menuRect.width || 240;
    const menuHeight = menuRect.height || 320;

    let left = anchorRect.right - menuWidth;
    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - menuWidth - viewportPadding)
    );

    const spaceBelow = window.innerHeight - anchorRect.bottom - gap - viewportPadding;
    const spaceAbove = anchorRect.top - gap - viewportPadding;

    let top = anchorRect.bottom + gap;
    let maxHeight = Math.max(160, spaceBelow);
    if (spaceBelow < 220 && spaceAbove > spaceBelow) {
      top = Math.max(viewportPadding, anchorRect.top - gap - Math.min(menuHeight, spaceAbove));
      maxHeight = Math.max(160, spaceAbove);
    }

    setOverviewFieldsMenuStyle({
      position: 'fixed',
      left,
      top,
      right: 'auto',
      bottom: 'auto',
      maxHeight: `${Math.floor(maxHeight)}px`,
      visibility: 'visible',
    });
  }, [isOverviewFieldsMenuOpen]);

  useLayoutEffect(() => {
    if (!isOverviewFieldsMenuOpen) {
      setOverviewFieldsMenuStyle({});
      return;
    }

    positionOverviewFieldsMenu();

    const frameId = window.requestAnimationFrame(positionOverviewFieldsMenu);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isOverviewFieldsMenuOpen, overviewFieldsFilterQuery, positionOverviewFieldsMenu]);

  useEffect(() => {
    if (!isOverviewFieldsMenuOpen) {
      return;
    }

    const reposition = () => {
      positionOverviewFieldsMenu();
    };

    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [isOverviewFieldsMenuOpen, positionOverviewFieldsMenu]);

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
      const compareNullableString = (
        leftValue: string | null,
        rightValue: string | null
      ): number => {
        const hasLeft = leftValue !== null;
        const hasRight = rightValue !== null;

        if (!hasLeft && hasRight) {
          return 1;
        }
        if (hasLeft && !hasRight) {
          return -1;
        }
        if (!hasLeft || !hasRight) {
          return 0;
        }

        return nameCollator.compare(leftValue, rightValue);
      };

      const resolveStringSortValue = (item: BrowseItem, key: SortKey): string | null => {
        if (item.type !== 'file') {
          return null;
        }

        const details = propertiesByPath[item.path];
        if (key === 'key') {
          return (details?.key ?? item.path.split('/').slice(1).join('/')) || item.path;
        }
        if (key === 'etag') {
          return item.etag ?? details?.etag ?? null;
        }
        if (key === 'versionId') {
          return details?.versionId ?? null;
        }
        if (key === 'serverSideEncryption') {
          return details?.serverSideEncryption ?? null;
        }
        if (key === 'contentType') {
          return details?.contentType ?? null;
        }
        if (key === 'storageClass') {
          return details?.storageClass ?? null;
        }
        if (key === 'cacheControl') {
          return details?.cacheControl ?? null;
        }
        if (key === 'contentDisposition') {
          return details?.contentDisposition ?? null;
        }
        if (key === 'contentEncoding') {
          return details?.contentEncoding ?? null;
        }
        if (key === 'contentLanguage') {
          return details?.contentLanguage ?? null;
        }
        if (key === 'expires') {
          return details?.expires ?? null;
        }

        return null;
      };

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

        if (rule.key === 'expires') {
          const leftExpires = resolveStringSortValue(left, rule.key);
          const rightExpires = resolveStringSortValue(right, rule.key);
          const leftTime = leftExpires ? Date.parse(leftExpires) : Number.NaN;
          const rightTime = rightExpires ? Date.parse(rightExpires) : Number.NaN;
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

        if (
          rule.key === 'key' ||
          rule.key === 'etag' ||
          rule.key === 'versionId' ||
          rule.key === 'serverSideEncryption' ||
          rule.key === 'contentType' ||
          rule.key === 'storageClass' ||
          rule.key === 'cacheControl' ||
          rule.key === 'contentDisposition' ||
          rule.key === 'contentEncoding' ||
          rule.key === 'contentLanguage'
        ) {
          result = compareNullableString(
            resolveStringSortValue(left, rule.key),
            resolveStringSortValue(right, rule.key)
          );
        }

        if (result !== 0) {
          return rule.direction === 'asc' ? result : -result;
        }
      }

      return nameCollator.compare(left.path, right.path);
    },
    [folderSizesByPath, propertiesByPath, sortRules]
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
    if (key === 'key') {
      return 'Key';
    }
    if (key === 'etag') {
      return 'ETag';
    }
    if (key === 'versionId') {
      return 'Version Id';
    }
    if (key === 'serverSideEncryption') {
      return 'Server-side encryption';
    }
    if (key === 'contentType') {
      return 'Content Type';
    }
    if (key === 'storageClass') {
      return 'Storage Class';
    }
    if (key === 'cacheControl') {
      return 'Cache Control';
    }
    if (key === 'contentDisposition') {
      return 'Content Disposition';
    }
    if (key === 'contentEncoding') {
      return 'Content Encoding';
    }
    if (key === 'contentLanguage') {
      return 'Content Language';
    }
    if (key === 'expires') {
      return 'Expires';
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
  const uploadDisabled = !hasBucketContext;

  const getParentDirectoryPath = useCallback((path: string): string => {
    const normalized = path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) {
      return '';
    }

    const parts = normalized.split('/');
    return parts.slice(0, -1).join('/');
  }, []);

  const clearUploadDropState = useCallback(() => {
    uploadDropEnterDepthRef.current = 0;
    setIsUploadDropActive(false);
  }, []);

  const isInternalMoveDrag = useCallback((dataTransfer: DataTransfer | null): boolean => {
    if (!dataTransfer) {
      return false;
    }

    return Array.from(dataTransfer.types).includes(INTERNAL_MOVE_DRAG_TYPE);
  }, []);

  const hasFileDropPayload = useCallback((dataTransfer: DataTransfer | null): boolean => {
    if (!dataTransfer) {
      return false;
    }

    return Array.from(dataTransfer.types).includes('Files');
  }, []);

  const getDraggedMovePath = useCallback(
    (dataTransfer: DataTransfer | null): string => {
      if (draggedMovePath) {
        return draggedMovePath;
      }

      if (!dataTransfer) {
        return '';
      }

      const payload = dataTransfer.getData(INTERNAL_MOVE_DRAG_TYPE);
      return payload.trim();
    },
    [draggedMovePath]
  );

  const canMoveToDestination = useCallback(
    (sourcePath: string, destinationPath: string): boolean => {
      const normalizedSource = sourcePath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      const normalizedDestination = destinationPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      if (!normalizedSource || !normalizedDestination) {
        return false;
      }

      if (normalizedSource === normalizedDestination) {
        return false;
      }

      if (normalizedDestination.startsWith(`${normalizedSource}/`)) {
        return false;
      }

      return getParentDirectoryPath(normalizedSource) !== normalizedDestination;
    },
    [getParentDirectoryPath]
  );

  const handleDroppedUploadFiles = useCallback(
    (files: FileList | File[]) => {
      if (uploadDisabled) {
        return;
      }

      const droppedFiles = Array.from(files);
      if (droppedFiles.length === 0) {
        return;
      }

      const folderFiles = droppedFiles.filter((file) => {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        return typeof relativePath === 'string' && relativePath.includes('/');
      });

      const folderFileSet = new Set(folderFiles);
      const standaloneFiles = droppedFiles
        .filter((file) => !folderFileSet.has(file))
        .map((file) => cloneDroppedFile(file));

      if (standaloneFiles.length > 0) {
        setPendingFileUploadFiles(standaloneFiles);
      }

      if (folderFiles.length > 0) {
        setPendingFolderUploadFiles(folderFiles);
      }
    },
    [uploadDisabled]
  );

  const handleDroppedUploadDataTransfer = useCallback(
    async (dataTransfer: DataTransfer) => {
      const droppedFiles = Array.from(dataTransfer.files);
      const hasRelativePaths = droppedFiles.some((file) => {
        const relativePath = (file as FileWithRelativePath).webkitRelativePath;
        return typeof relativePath === 'string' && relativePath.includes('/');
      });
      const hasDirectoryItem = Array.from(dataTransfer.items ?? []).some((item) => {
        const entry = (
          item as DataTransferItem & {
            webkitGetAsEntry?: () => { isDirectory?: boolean } | null;
          }
        ).webkitGetAsEntry?.();
        return Boolean(entry?.isDirectory);
      });

      if (hasDirectoryItem) {
        try {
          const { files: entryFiles } = await extractFilesFromDroppedEntries(dataTransfer);
          if (entryFiles.length > 0) {
            handleDroppedUploadFiles(entryFiles);
            return;
          }
        } catch {
          // ignore entry API issues and continue with fallback heuristics
        }

        const droppedFolderFiles = droppedFiles.filter((file) => {
          const relativePath = (file as FileWithRelativePath).webkitRelativePath;
          return typeof relativePath === 'string' && relativePath.includes('/');
        });
        if (droppedFolderFiles.length > 0) {
          handleDroppedUploadFiles(droppedFolderFiles);
        }
        return;
      }

      if (hasRelativePaths || droppedFiles.length > 0) {
        handleDroppedUploadFiles(droppedFiles);
        return;
      }

      try {
        const { files: entryFiles } = await extractFilesFromDroppedEntries(dataTransfer);
        if (entryFiles.length > 0) {
          handleDroppedUploadFiles(entryFiles);
          return;
        }
      } catch {
        // ignore entry API issues and fall back below
      }

      handleDroppedUploadFiles(dataTransfer.files);
    },
    [handleDroppedUploadFiles]
  );

  const handleUploadDropEnter = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (uploadDisabled) {
        return;
      }

      if (isInternalMoveDrag(event.dataTransfer) || !hasFileDropPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      uploadDropEnterDepthRef.current += 1;
      setIsUploadDropActive(true);
    },
    [hasFileDropPayload, isInternalMoveDrag, uploadDisabled]
  );

  const handleUploadDropOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (uploadDisabled) {
        return;
      }

      if (isInternalMoveDrag(event.dataTransfer) || !hasFileDropPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    [hasFileDropPayload, isInternalMoveDrag, uploadDisabled]
  );

  const handleUploadDropLeave = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (uploadDisabled) {
        return;
      }

      if (isInternalMoveDrag(event.dataTransfer) || !hasFileDropPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      uploadDropEnterDepthRef.current = Math.max(0, uploadDropEnterDepthRef.current - 1);
      if (uploadDropEnterDepthRef.current === 0) {
        setIsUploadDropActive(false);
      }
    },
    [hasFileDropPayload, isInternalMoveDrag, uploadDisabled]
  );

  const handleUploadDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (uploadDisabled) {
        return;
      }

      if (isInternalMoveDrag(event.dataTransfer) || !hasFileDropPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      clearUploadDropState();
      void handleDroppedUploadDataTransfer(event.dataTransfer);
    },
    [
      clearUploadDropState,
      handleDroppedUploadDataTransfer,
      hasFileDropPayload,
      isInternalMoveDrag,
      uploadDisabled,
    ]
  );

  const openCreateEntryModal = (kind: 'file' | 'folder') => {
    setCreateEntryError('');
    setCreateEntryModal({ kind, value: '' });
  };

  const closeCreateEntryModal = () => {
    setCreateEntryError('');
    setCreateEntryModal(null);
  };

  const submitCreateEntryModal = async () => {
    if (!createEntryModal) {
      return;
    }

    const value = createEntryModal.value.trim();
    if (!value) {
      setCreateEntryError(
        createEntryModal.kind === 'file' ? 'File name is required.' : 'Folder name is required.'
      );
      return;
    }

    if (createEntryModal.kind === 'file') {
      await onCreateFile(value);
    } else {
      await onCreateFolder(value);
    }

    closeCreateEntryModal();
  };

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
    return Object.hasOwn(overviewColumnSortKeyByColumn, columnKey);
  };

  const resolveSortKey = (columnKey: OverviewColumnKey): SortKey => {
    return overviewColumnSortKeyByColumn[columnKey];
  };

  const contextItemCapability = useMemo(() => {
    if (!contextMenu || contextMenu.item.type !== 'file') {
      return null;
    }

    return resolveFileCapability(contextMenu.item.path);
  }, [contextMenu]);

  const canDeleteContextItem =
    canDelete && !(contextMenu?.item.type === 'directory' && !contextMenu.item.path.includes('/'));

  useEffect(() => {
    if (!contextMenu || contextMenu.item.type !== 'file') {
      return;
    }

    const targetPath = contextMenu.item.path;
    if (propertiesByPath[targetPath] !== undefined || propertiesLoadingPaths.has(targetPath)) {
      return;
    }

    setPropertiesLoadingPaths((previous) => {
      if (previous.has(targetPath)) {
        return previous;
      }

      const next = new Set(previous);
      next.add(targetPath);
      return next;
    });

    let cancelled = false;
    const loadProperties = async () => {
      try {
        const details = await trpcProxyClient.s3.getProperties.query({ path: targetPath });
        if (cancelled) {
          return;
        }

        setPropertiesByPath((previous) => {
          if (previous[targetPath] !== undefined) {
            return previous;
          }

          return {
            ...previous,
            [targetPath]: details,
          };
        });
      } catch {
        if (cancelled) {
          return;
        }

        setPropertiesByPath((previous) => {
          if (previous[targetPath] !== undefined) {
            return previous;
          }

          return {
            ...previous,
            [targetPath]: null,
          };
        });
      } finally {
        setPropertiesLoadingPaths((previous) => {
          if (!previous.has(targetPath)) {
            return previous;
          }

          const next = new Set(previous);
          next.delete(targetPath);
          return next;
        });
      }
    };

    void loadProperties();

    return () => {
      cancelled = true;
    };
  }, [contextMenu, propertiesByPath, propertiesLoadingPaths]);

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
        hint: formatShortcutHint(['Ctrl/Cmd', 'Shift', 'S']),
        onSelect: () => {
          void onCalculateFolderSize(contextMenu.item.path);
        },
      });

      if (hasBucketContext && hasClipboardItems && canWrite) {
        actions.push({
          id: 'paste',
          label: 'Paste into Folder',
          hint: formatShortcutHint(['Ctrl/Cmd', 'V']),
          onSelect: () => {
            onCloseContextMenu();
            void onPasteIntoPath(contextMenu.item.path);
          },
        });
      }
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
        hint: formatShortcutHint(['Alt', 'Enter']),
        onSelect: () => {
          void onOpenProperties(contextMenu.item.path);
        },
      });

      const details = propertiesByPath[contextMenu.item.path];
      const isLoadingDetails = propertiesLoadingPaths.has(contextMenu.item.path);
      const copyDetailActions: ContextMenuAction[] = [];
      const pushCopyDetailAction = (
        id: string,
        label: string,
        value: string | null | undefined
      ) => {
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

      pushCopyDetailAction('copy-detail-name', 'Name', contextMenu.item.name);
      pushCopyDetailAction('copy-detail-path', 'Path', contextMenu.item.path);
      pushCopyDetailAction(
        'copy-detail-key',
        'Object key',
        details?.key ?? contextMenu.item.path.split('/').slice(1).join('/')
      );
      pushCopyDetailAction('copy-detail-size', 'Size', contextMenu.item.size?.toString());
      pushCopyDetailAction(
        'copy-detail-last-modified',
        'Last modified',
        contextMenu.item.lastModified ?? details?.lastModified
      );
      pushCopyDetailAction('copy-detail-etag', 'ETag', contextMenu.item.etag ?? details?.etag);
      pushCopyDetailAction('copy-detail-content-type', 'Content type', details?.contentType);
      pushCopyDetailAction('copy-detail-storage-class', 'Storage class', details?.storageClass);
      pushCopyDetailAction('copy-detail-version-id', 'Version ID', details?.versionId);

      const metadataEntries = details ? Object.entries(details.metadata) : [];
      for (const [metadataKey, metadataValue] of metadataEntries) {
        const metadataActionId = `copy-detail-metadata-${metadataKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        pushCopyDetailAction(metadataActionId, `Metadata: ${metadataKey}`, metadataValue);
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

      actions.push({
        id: 'copy-details',
        label: 'Copy details',
        hint: 'ArrowRight',
        submenuActions: copyDetailActions,
        onSelect: () => {},
      });
    }

    const hasWritableItemContext = hasBucketContext || contextMenu.item.type === 'file';

    if (hasWritableItemContext) {
      actions.push({
        id: 'copy',
        label: 'Copy',
        hint: formatShortcutHint(['Ctrl/Cmd', 'C']),
        onSelect: () => {
          onCloseContextMenu();
          onCopyItems([contextMenu.item]);
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
          onCutItems([contextMenu.item]);
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
    hasBucketContext,
    hasClipboardItems,
    canWrite,
    contextItemCapability,
    contextMenu,
    onCalculateFolderSize,
    onCloseContextMenu,
    onCopyItems,
    onCopyTextToClipboard,
    onCutItems,
    onDeletePathItems,
    onDownload,
    onEditFile,
    onMove,
    onOpenProperties,
    onPasteIntoPath,
    onRename,
    onViewFile,
    propertiesByPath,
    propertiesLoadingPaths,
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

  const attachRelativePathToFile = (file: File, relativePath: string): File => {
    try {
      Object.defineProperty(file, 'webkitRelativePath', {
        configurable: true,
        value: relativePath,
      });
      return file;
    } catch {
      return file;
    }
  };

  const collectFilesFromDirectoryHandle = async (
    directoryHandle: { values: () => AsyncIterable<unknown> },
    parentPath = ''
  ): Promise<File[]> => {
    const files: File[] = [];

    for await (const entry of directoryHandle.values()) {
      const entryRecord = entry as {
        kind?: string;
        name?: string;
        getFile?: () => Promise<File>;
        values?: () => AsyncIterable<unknown>;
      };

      if (entryRecord.kind === 'file' && typeof entryRecord.getFile === 'function') {
        const file = await entryRecord.getFile();
        const relativePath = parentPath
          ? `${parentPath}/${entryRecord.name ?? file.name}`
          : (entryRecord.name ?? file.name);
        files.push(attachRelativePathToFile(file, relativePath));
        continue;
      }

      if (entryRecord.kind === 'directory' && typeof entryRecord.values === 'function') {
        const nextParentPath = parentPath
          ? `${parentPath}/${entryRecord.name ?? ''}`
          : (entryRecord.name ?? '');
        const nestedFiles = await collectFilesFromDirectoryHandle(
          { values: entryRecord.values.bind(entryRecord) },
          nextParentPath
        );
        files.push(...nestedFiles);
      }
    }

    return files;
  };

  const onSelectFolderForUpload = async () => {
    const directoryPicker = (
      window as Window & {
        showDirectoryPicker?: () => Promise<{ values: () => AsyncIterable<unknown> }>;
      }
    ).showDirectoryPicker;

    if (!directoryPicker) {
      uploadFolderInputRef.current?.click();
      return;
    }

    try {
      const directoryHandle = await directoryPicker();
      const files = await collectFilesFromDirectoryHandle(directoryHandle);
      if (files.length === 0) {
        return;
      }

      setPendingFolderUploadFiles(files);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      uploadFolderInputRef.current?.click();
    }
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
  }, [renderedItems.length]);

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

  const defaultRowIndex = useMemo(() => {
    if (renderedItems.length === 0) {
      return -1;
    }
    if (renderedItems[0]?.isParentNavigation && renderedItems.length > 1) {
      return 1;
    }
    return 0;
  }, [renderedItems]);

  const isModalNavigationBlocked =
    isShortcutsModalOpen ||
    isFilterHelpModalOpen ||
    pendingFileUploadFiles.length > 0 ||
    pendingFolderUploadFiles.length > 0 ||
    createEntryModal !== null;

  const hasOpenModalDialog = () =>
    document.querySelector('[role="dialog"][aria-modal="true"]') !== null;

  useModalFocusTrapEffect(isModalNavigationBlocked, activeModalRef);

  useEffect(() => {
    if (renderedItems.length === 0 || defaultRowIndex < 0) {
      setFocusedRowIndex(null);
      return;
    }

    if (isModalNavigationBlocked || contextMenu !== null || isBreadcrumbEditing || isFilterOpen) {
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
    isModalNavigationBlocked,
    isBreadcrumbEditing,
    contextMenu,
    isFilterOpen,
    isFilterHelpModalOpen,
    isShortcutsModalOpen,
    pendingFileUploadFiles.length,
    pendingFolderUploadFiles.length,
    createEntryModal,
    selectedPath,
    renderedItems,
  ]);

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      if (event.deltaY === 0) {
        return;
      }

      nudgeExplorerZoom(event.deltaY < 0 ? 1 : -1);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', onWheel);
    };
  }, [nudgeExplorerZoom]);

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

      if (isActionsMenuOpen && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setIsActionsMenuOpen(false);
        return;
      }

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
    isFilterHelpModalOpen,
    isModalNavigationBlocked,
    isActionsMenuOpen,
    isShortcutsModalOpen,
    openFilter,
    contextMenu,
    isExplorerGridView,
    parentPath,
    browse,
    renderedItems.length,
    selectedPath,
    setSelectedPath,
    nudgeExplorerZoom,
    resetExplorerZoom,
  ]);

  useEffect(() => {
    if (!contextMenu || contextMenuActions.length === 0) {
      return;
    }

    contextMenuFocusRestoreRef.current = document.activeElement as HTMLElement | null;
    wasContextMenuOpenRef.current = true;
    setOpenSubmenuActionId(null);
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

  useEffect(() => {
    contextSubmenuItemRefs.current = [];
  }, [openSubmenuActionId]);

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

  const handleContextMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
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
  };

  const handleRowKeyDown = (
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    item: BrowseItem,
    renderedIndex: number,
    isParentNavigation: boolean
  ) => {
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

  return (
    <>
      <div
        className={`${styles.browserToolbar} ${isExplorerGridView ? styles.browserToolbarGridView : ''}`}
        style={explorerZoomStyle}
        data-explorer-zoom={explorerZoomLevel}
      >
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
                  isBrowseRefreshing ? styles.breadcrumbTrailRefreshing : ''
                } ${breadcrumbValidationMessage ? styles.breadcrumbTrailInvalid : ''}`.trim()}
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
              {isOverviewFieldsMenuOpen
                ? createPortal(
                    <div
                      ref={overviewFieldsPanelRef}
                      className={styles.overviewFieldsMenu}
                      role="menu"
                      aria-label="Visible fields menu"
                      style={{ ...overviewFieldsMenuStyle, ...explorerZoomStyle }}
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
                    </div>,
                    document.body
                  )
                : null}
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

            <div className={styles.zoomControls} role="group" aria-label="Explorer zoom controls">
              <Button
                variant="muted"
                className={styles.iconButton}
                onClick={() => nudgeExplorerZoom(-1)}
                aria-label="Zoom out explorer"
                title="Zoom out (Ctrl/Cmd + -)"
              >
                -
              </Button>
              <Button
                variant="muted"
                onClick={resetExplorerZoom}
                aria-label="Reset explorer zoom"
                title="Reset zoom (Ctrl/Cmd + 0)"
                className={styles.zoomResetButton}
              >
                {explorerZoomLevel}%
              </Button>
              <Button
                variant="muted"
                className={styles.iconButton}
                onClick={() => nudgeExplorerZoom(1)}
                aria-label="Zoom in explorer"
                title="Zoom in (Ctrl/Cmd + +)"
              >
                +
              </Button>
            </div>

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

            {canWrite ? (
              <div className={styles.actionsMenuWrap} ref={actionsMenuRef}>
                <Button
                  variant="muted"
                  className={styles.actionsMenuTrigger}
                  disabled={!hasBucketContext}
                  onClick={() => setIsActionsMenuOpen((previous) => !previous)}
                  aria-haspopup="menu"
                  aria-expanded={isActionsMenuOpen}
                  aria-label="Open actions menu"
                  title={
                    !hasBucketContext
                      ? 'Navigate to a bucket before using file actions'
                      : 'Open actions menu'
                  }
                >
                  <MoreVertical size={14} aria-hidden />
                </Button>
                {isActionsMenuOpen ? (
                  <div
                    className={styles.actionsMenuPanel}
                    role="menu"
                    aria-label="File and folder actions"
                  >
                    <button
                      className={styles.actionsMenuItem}
                      type="button"
                      role="menuitem"
                      disabled={!hasBucketContext}
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        openCreateEntryModal('file');
                      }}
                      title={
                        !hasBucketContext
                          ? 'Navigate to a bucket before creating files'
                          : 'Create file'
                      }
                    >
                      Create File
                    </button>
                    <button
                      className={styles.actionsMenuItem}
                      type="button"
                      role="menuitem"
                      disabled={!hasBucketContext}
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        openCreateEntryModal('folder');
                      }}
                      title={
                        !hasBucketContext
                          ? 'Navigate to a bucket before creating folders'
                          : 'Create folder'
                      }
                    >
                      Create Folder
                    </button>
                    <button
                      className={styles.actionsMenuItem}
                      type="button"
                      role="menuitem"
                      disabled={uploadDisabled}
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        uploadFilesInputRef.current?.click();
                      }}
                      title={
                        !hasBucketContext ? 'Navigate to a bucket before uploading' : 'Upload files'
                      }
                    >
                      Upload Files
                    </button>
                    <button
                      className={styles.actionsMenuItem}
                      type="button"
                      role="menuitem"
                      disabled={uploadDisabled}
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        void onSelectFolderForUpload();
                      }}
                      title={
                        !hasBucketContext
                          ? 'Navigate to a bucket before uploading'
                          : 'Upload folder'
                      }
                    >
                      Upload Folder
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {browse.isLoading ? (
        <p className={`${styles.state} ${styles.loadingState}`}>Loading objects...</p>
      ) : null}
      {browse.isError ? (
        <p className={`${styles.state} ${styles.stateError}`}>Failed to load S3 path data.</p>
      ) : null}

      {browse.data ? (
        <>
          <BrowserInfoModals
            isShortcutsModalOpen={isShortcutsModalOpen}
            setIsShortcutsModalOpen={setIsShortcutsModalOpen}
            isFilterHelpModalOpen={isFilterHelpModalOpen}
            setIsFilterHelpModalOpen={setIsFilterHelpModalOpen}
            activeModalRef={activeModalRef}
          />

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

              setPendingFileUploadFiles(Array.from(files));
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
          {pendingFileUploadFiles.length > 0 ? (
            <ModalPortal>
              <div
                className={styles.modalOverlay}
                role="dialog"
                aria-modal="true"
                aria-labelledby="file-upload-modal-title"
                aria-describedby="file-upload-modal-description"
                aria-label="Upload selected files?"
              >
                <div className={styles.modalCard} ref={activeModalRef} style={explorerZoomStyle}>
                  <h3 id="file-upload-modal-title">Upload selected files?</h3>
                  <p id="file-upload-modal-description">
                    Upload {pendingFileUploadFiles.length} selected file(s) to this location.
                  </p>
                  <div className={styles.modalActions}>
                    <Button
                      variant="muted"
                      onClick={() => {
                        setPendingFileUploadFiles([]);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        void onUploadFiles(pendingFileUploadFiles);
                        setPendingFileUploadFiles([]);
                      }}
                    >
                      Upload Files
                    </Button>
                  </div>
                </div>
              </div>
            </ModalPortal>
          ) : null}
          {pendingFileUploadFiles.length === 0 && pendingFolderUploadFiles.length > 0 ? (
            <ModalPortal>
              <div
                className={styles.modalOverlay}
                role="dialog"
                aria-modal="true"
                aria-labelledby="folder-upload-modal-title"
                aria-describedby="folder-upload-modal-description"
                aria-label="Confirm folder upload"
              >
                <div className={styles.modalCard} ref={activeModalRef}>
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
            </ModalPortal>
          ) : null}
          {createEntryModal ? (
            <ModalPortal>
              <div
                className={styles.modalOverlay}
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-entry-modal-title"
                aria-describedby="create-entry-modal-description"
                aria-label={createEntryModal.kind === 'file' ? 'Create file' : 'Create folder'}
              >
                <div className={styles.modalCard} ref={activeModalRef}>
                  <h3 id="create-entry-modal-title">
                    {createEntryModal.kind === 'file' ? 'Create file' : 'Create folder'}
                  </h3>
                  <p id="create-entry-modal-description">
                    {createEntryModal.kind === 'file'
                      ? 'Enter a file name to create an empty object in this location.'
                      : 'Enter a folder name to create a virtual folder in this location.'}
                  </p>
                  <Input
                    autoFocus
                    value={createEntryModal.value}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setCreateEntryModal((previous) =>
                        previous ? { ...previous, value: nextValue } : previous
                      );
                      if (createEntryError) {
                        setCreateEntryError('');
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void submitCreateEntryModal();
                      }
                    }}
                    placeholder={createEntryModal.kind === 'file' ? 'notes.txt' : 'assets'}
                    aria-label={createEntryModal.kind === 'file' ? 'File name' : 'Folder name'}
                  />
                  {createEntryError ? (
                    <p className={styles.modalError}>{createEntryError}</p>
                  ) : null}
                  <div className={styles.modalActions}>
                    <Button variant="muted" onClick={closeCreateEntryModal}>
                      Cancel
                    </Button>
                    <Button onClick={() => void submitCreateEntryModal()}>
                      {createEntryModal.kind === 'file' ? 'Create File' : 'Create Folder'}
                    </Button>
                  </div>
                </div>
              </div>
            </ModalPortal>
          ) : null}
          <div
            className={`${styles.itemsDropZone} ${isUploadDropActive ? styles.itemsDropZoneActive : ''}`}
            data-testid="browser-drop-zone"
            style={explorerZoomStyle}
            onDragEnter={handleUploadDropEnter}
            onDragOver={handleUploadDropOver}
            onDragLeave={handleUploadDropLeave}
            onDrop={handleUploadDrop}
          >
            {renderedItems.length === 0 ? (
              <div className={styles.emptyItemsState}>
                <p>No items in this location.</p>
                <span>Upload files to this path or navigate to another folder.</span>
              </div>
            ) : (
              <div
                className={`${styles.itemsTableWrap} ${
                  isExplorerGridView ? styles.itemsTableWrapGrid : ''
                }`.trim()}
                data-view-mode={isExplorerGridView ? 'grid' : 'row'}
                data-testid="items-view-container"
              >
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
                        draggable={canWrite && !isParentNavigation}
                        tabIndex={focusedRowIndex === index ? 0 : -1}
                        data-focused={focusedRowIndex === index ? 'true' : 'false'}
                        onFocus={() => setFocusedRowIndex(index)}
                        className={(() => {
                          if (isParentNavigation) {
                            return '';
                          }

                          const classNames: string[] = [];
                          if (selectedItems.has(item.path)) {
                            if (styles.isSelected) {
                              classNames.push(styles.isSelected);
                            }
                          }

                          if (clipboardPaths.has(item.path)) {
                            const clipboardClass =
                              clipboardMode === 'cut'
                                ? styles.isClipboardCut
                                : styles.isClipboardCopy;
                            if (clipboardClass) {
                              classNames.push(clipboardClass);
                            }
                          }

                          if (moveDropTargetPath === item.path) {
                            if (styles.isDragMoveTarget) {
                              classNames.push(styles.isDragMoveTarget);
                            }
                          }

                          return classNames.join(' ');
                        })()}
                        onDragStart={(event) => {
                          if (isParentNavigation || !canWrite) {
                            event.preventDefault();
                            return;
                          }

                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData(INTERNAL_MOVE_DRAG_TYPE, item.path);
                          setDraggedMovePath(item.path);
                          setMoveDropTargetPath(null);
                        }}
                        onDragOver={(event) => {
                          if (
                            isParentNavigation ||
                            item.type !== 'directory' ||
                            !canWrite ||
                            !isInternalMoveDrag(event.dataTransfer)
                          ) {
                            return;
                          }

                          const sourcePath = getDraggedMovePath(event.dataTransfer);
                          if (!canMoveToDestination(sourcePath, item.path)) {
                            if (moveDropTargetPath === item.path) {
                              setMoveDropTargetPath(null);
                            }
                            return;
                          }

                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                          if (moveDropTargetPath !== item.path) {
                            setMoveDropTargetPath(item.path);
                          }
                        }}
                        onDragLeave={(event) => {
                          if (moveDropTargetPath !== item.path) {
                            return;
                          }

                          const nextTarget = event.relatedTarget;
                          if (
                            nextTarget instanceof Node &&
                            event.currentTarget.contains(nextTarget)
                          ) {
                            return;
                          }

                          setMoveDropTargetPath(null);
                        }}
                        onDrop={(event) => {
                          if (
                            isParentNavigation ||
                            item.type !== 'directory' ||
                            !canWrite ||
                            !isInternalMoveDrag(event.dataTransfer)
                          ) {
                            return;
                          }

                          event.preventDefault();
                          const sourcePath = getDraggedMovePath(event.dataTransfer);
                          setMoveDropTargetPath(null);
                          if (!canMoveToDestination(sourcePath, item.path)) {
                            return;
                          }

                          onMove(sourcePath, item.path);
                          setDraggedMovePath(null);
                        }}
                        onDragEnd={() => {
                          setDraggedMovePath(null);
                          setMoveDropTargetPath(null);
                        }}
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
                              {renderBrowseItemIcon(item)}
                            </span>
                            <strong>{item.name}</strong>
                            <span className={styles.itemGridMeta}>
                              {isParentNavigation
                                ? 'Open parent folder'
                                : item.type === 'directory'
                                  ? 'Folder'
                                  : `${item.size === null ? '-' : formatBytes(item.size)}${
                                      item.lastModified ? ` • ${formatDate(item.lastModified)}` : ''
                                    }`}
                            </span>
                            {!isParentNavigation && clipboardPaths.has(item.path) ? (
                              <span className={styles.clipboardTag}>
                                {clipboardMode === 'cut' ? 'Cut' : 'Copy'}
                              </span>
                            ) : null}
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
            {isUploadDropActive ? (
              <div className={styles.uploadDropOverlay} aria-live="polite">
                <p className={styles.uploadDropOverlayTitle}>DROP TO START UPLOAD</p>
                <p className={styles.uploadDropOverlayBody}>
                  {isUploading
                    ? 'Uploads are in progress. You can drop more files or folders to queue another upload.'
                    : 'Review dropped files or folders, then confirm to start upload.'}
                </p>
              </div>
            ) : null}
          </div>

          <BrowserContextMenu
            contextMenu={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
            contextMenuRef={contextMenuRef}
            contextSubmenuRef={contextSubmenuRef}
            contextMenuItemRefs={contextMenuItemRefs}
            contextSubmenuItemRefs={contextSubmenuItemRefs}
            contextSubmenuSide={contextSubmenuSide}
            contextMenuActions={contextMenuActions}
            openSubmenuActionId={openSubmenuActionId}
            setOpenSubmenuActionId={setOpenSubmenuActionId}
            handleContextMenuKeyDown={handleContextMenuKeyDown}
          />
        </>
      ) : null}
    </>
  );
};
