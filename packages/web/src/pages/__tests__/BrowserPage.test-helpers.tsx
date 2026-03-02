import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { useState } from 'react';
import type { BrowseItem, ObjectPropertiesResult } from '@server/services/s3/types';
import { BrowserPage } from '@web/pages/BrowserPage';

export const OVERVIEW_COLUMNS_STORAGE_KEY = 'browser-overview-columns';
export const EXPLORER_ZOOM_STORAGE_KEY = 'browser-explorer-zoom';
export const ORIGINAL_DEVICE_PIXEL_RATIO = window.devicePixelRatio;

export const { getPropertiesQueryMock } = vi.hoisted(() => ({
  getPropertiesQueryMock: vi.fn(
    async ({ path }: { path: string }): Promise<ObjectPropertiesResult> => ({
      name: path.split('/').pop() ?? path,
      key: path.split('/').slice(1).join('/'),
      size: 0,
      contentType: 'application/octet-stream',
      lastModified: null,
      etag: null,
      storageClass: 'STANDARD',
      metadata: {},
    })
  ),
}));

export const createProps = () => {
  const setSelectedPath = vi.fn();

  return {
    setSelectedPath,
    props: {
      selectedPath: 'my-bucket/folder',
      setSelectedPath,
      filterQuery: '',
      setFilterQuery: vi.fn(),
      knownBucketNames: ['my-bucket', 'archive-bucket'],
      breadcrumbValidationMessage: undefined,
      canWrite: true,
      canDelete: true,
      isUploading: false,
      browse: {
        data: {
          breadcrumbs: [
            { name: 'my-bucket', path: 'my-bucket' },
            { name: 'folder', path: 'my-bucket/folder' },
          ],
          items: [] as BrowseItem[],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      },
      selectedItems: new Set<string>(),
      selectedFiles: [],
      folderSizesByPath: {},
      folderSizeLoadingPaths: new Set<string>(),
      contextMenu: null,
      onBulkDownload: vi.fn(async () => {}),
      onBulkDelete: vi.fn(async () => {}),
      onCreateFile: vi.fn(async () => {}),
      onCreateFolder: vi.fn(async () => {}),
      onUploadFiles: vi.fn(async () => {}),
      onUploadFolder: vi.fn(async () => {}),
      onClearSelection: vi.fn(),
      onSelectItemOnly: vi.fn(),
      onToggleItemSelection: vi.fn(),
      onRowClick: vi.fn(),
      onRowDoubleClick: vi.fn(),
      onOpenContextMenu: vi.fn(),
      onOpenItemContextMenu: vi.fn(),
      onCloseContextMenu: vi.fn(),
      onRename: vi.fn(),
      onMove: vi.fn(),
      onCopyItems: vi.fn(),
      onCopyTextToClipboard: vi.fn(async () => {}),
      onCutItems: vi.fn(),
      onPasteIntoPath: vi.fn(async () => {}),
      hasClipboardItems: false,
      clipboardMode: null as 'copy' | 'cut' | null,
      clipboardPaths: new Set<string>(),
      onDownload: vi.fn(async () => {}),
      onCalculateFolderSize: vi.fn(async () => {}),
      onOpenProperties: vi.fn(async () => {}),
      onDeletePathItems: vi.fn(),
      onViewFile: vi.fn(async () => {}),
      onEditFile: vi.fn(async () => {}),
      isShortcutsModalOpen: false,
      setIsShortcutsModalOpen: vi.fn(),
      isFilterHelpModalOpen: false,
      setIsFilterHelpModalOpen: vi.fn(),
    },
  };
};

export const renderWithFilterState = (props: ReturnType<typeof createProps>['props']) => {
  const ControlledBrowserPage = () => {
    const [filterQuery, setFilterQuery] = useState(props.filterQuery);
    return <BrowserPage {...props} filterQuery={filterQuery} setFilterQuery={setFilterQuery} />;
  };

  return render(<ControlledBrowserPage />);
};

export const setupTestEnvironment = () => {
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    value: ORIGINAL_DEVICE_PIXEL_RATIO,
  });
  window.localStorage.clear();
  window.sessionStorage.clear();
  getPropertiesQueryMock.mockClear();
  getPropertiesQueryMock.mockImplementation(
    async ({ path }: { path: string }): Promise<ObjectPropertiesResult> => ({
      name: path.split('/').pop() ?? path,
      key: path.split('/').slice(1).join('/'),
      size: 0,
      contentType: 'application/octet-stream',
      lastModified: null,
      etag: null,
      storageClass: 'STANDARD',
      metadata: {},
    })
  );
};
