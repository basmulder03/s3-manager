import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { BrowseItem, ObjectPropertiesResult } from '@server/services/s3/types';
import { BrowserPage } from '@web/pages/BrowserPage';

const OVERVIEW_COLUMNS_STORAGE_KEY = 'browser-overview-columns';

const { getPropertiesQueryMock } = vi.hoisted(() => ({
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

vi.mock('@web/trpc/client', () => ({
  trpcProxyClient: {
    s3: {
      getProperties: {
        query: getPropertiesQueryMock,
      },
    },
  },
}));

const createProps = () => {
  const setSelectedPath = vi.fn();

  return {
    setSelectedPath,
    props: {
      selectedPath: 'my-bucket/folder',
      setSelectedPath,
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
          items: [],
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
      onDownload: vi.fn(async () => {}),
      onCalculateFolderSize: vi.fn(async () => {}),
      onOpenProperties: vi.fn(async () => {}),
      onDeletePathItems: vi.fn(),
      onViewFile: vi.fn(async () => {}),
      onEditFile: vi.fn(async () => {}),
    },
  };
};

beforeEach(() => {
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
});

describe('BrowserPage breadcrumb editing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('buffers breadcrumb typing before changing location', () => {
    const { props, setSelectedPath } = createProps();
    render(<BrowserPage {...props} />);

    fireEvent.click(screen.getByTestId('breadcrumb-trail'));

    const breadcrumbInput = screen.getByRole('textbox', { name: 'Breadcrumb path' });
    expect(breadcrumbInput).toHaveValue('/my-bucket/folder');

    fireEvent.change(breadcrumbInput, { target: { value: '/my-bucket/folder/docs/' } });

    vi.advanceTimersByTime(319);
    expect(setSelectedPath).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(setSelectedPath).toHaveBeenCalledWith('my-bucket/folder/docs');
  });

  it('commits breadcrumb input immediately on Enter', () => {
    const { props, setSelectedPath } = createProps();
    render(<BrowserPage {...props} />);

    fireEvent.click(screen.getByTestId('breadcrumb-trail'));

    const breadcrumbInput = screen.getByRole('textbox', { name: 'Breadcrumb path' });
    fireEvent.change(breadcrumbInput, { target: { value: '/my-bucket/next' } });
    fireEvent.keyDown(breadcrumbInput, { key: 'Enter' });

    expect(setSelectedPath).toHaveBeenCalledWith('my-bucket/next');
  });

  it('shows breadcrumb auto-complete hints while typing', () => {
    const { props } = createProps();
    const items: BrowseItem[] = [
      {
        name: 'docs',
        type: 'directory',
        path: 'my-bucket/folder/docs',
        size: null,
        lastModified: null,
      },
    ];

    render(
      <BrowserPage
        {...props}
        browse={{ ...props.browse, data: { ...props.browse.data!, items } }}
      />
    );

    fireEvent.click(screen.getByTestId('breadcrumb-trail'));
    const breadcrumbInput = screen.getByRole('textbox', { name: 'Breadcrumb path' });
    fireEvent.change(breadcrumbInput, { target: { value: '/my-bucket/folder/d' } });

    const hints = screen.getByTestId('breadcrumb-hints');
    expect(hints).toHaveTextContent('/my-bucket/folder/docs');
  });

  it('accepts highlighted breadcrumb hint with Tab', () => {
    const { props, setSelectedPath } = createProps();
    const items: BrowseItem[] = [
      {
        name: 'docs',
        type: 'directory',
        path: 'my-bucket/folder/docs',
        size: null,
        lastModified: null,
      },
    ];

    render(
      <BrowserPage
        {...props}
        browse={{ ...props.browse, data: { ...props.browse.data!, items } }}
      />
    );

    fireEvent.click(screen.getByTestId('breadcrumb-trail'));
    const breadcrumbInput = screen.getByRole('textbox', { name: 'Breadcrumb path' });
    fireEvent.change(breadcrumbInput, { target: { value: '/my-bucket/folder/d' } });
    fireEvent.keyDown(breadcrumbInput, { key: 'ArrowDown' });
    fireEvent.keyDown(breadcrumbInput, { key: 'Tab' });

    expect(setSelectedPath).toHaveBeenCalledWith('my-bucket/folder/docs');
  });

  it('resets breadcrumb draft and hints when re-entering edit mode', () => {
    const { props } = createProps();
    const items: BrowseItem[] = [
      {
        name: 'docs',
        type: 'directory',
        path: 'my-bucket/folder/docs',
        size: null,
        lastModified: null,
      },
      {
        name: 'images',
        type: 'directory',
        path: 'my-bucket/folder/images',
        size: null,
        lastModified: null,
      },
    ];

    render(
      <BrowserPage
        {...props}
        browse={{ ...props.browse, data: { ...props.browse.data!, items } }}
      />
    );

    fireEvent.click(screen.getByTestId('breadcrumb-trail'));
    const breadcrumbInput = screen.getByRole('textbox', { name: 'Breadcrumb path' });
    fireEvent.change(breadcrumbInput, { target: { value: '/my-bucket/folder/do' } });
    fireEvent.blur(breadcrumbInput);

    fireEvent.click(screen.getByTestId('breadcrumb-trail'));
    const reopenedInput = screen.getByRole('textbox', { name: 'Breadcrumb path' });
    expect(reopenedInput).toHaveValue('/my-bucket/folder');

    const hints = screen.getByTestId('breadcrumb-hints');
    expect(hints).toHaveTextContent('/my-bucket/folder/docs');
    expect(hints).toHaveTextContent('/my-bucket/folder/images');
  });

  it('shows current directory options when typing only a folder fragment', () => {
    const { props } = createProps();
    const items: BrowseItem[] = [
      {
        name: 'assets',
        type: 'directory',
        path: 'my-bucket/folder/assets',
        size: null,
        lastModified: null,
      },
      {
        name: 'archive',
        type: 'directory',
        path: 'my-bucket/folder/archive',
        size: null,
        lastModified: null,
      },
    ];

    render(
      <BrowserPage
        {...props}
        browse={{ ...props.browse, data: { ...props.browse.data!, items } }}
      />
    );

    fireEvent.click(screen.getByTestId('breadcrumb-trail'));
    const breadcrumbInput = screen.getByRole('textbox', { name: 'Breadcrumb path' });
    fireEvent.change(breadcrumbInput, { target: { value: 'ass' } });

    const hints = screen.getByTestId('breadcrumb-hints');
    expect(hints).toHaveTextContent('/my-bucket/folder/assets');
    expect(hints).not.toHaveTextContent('/my-bucket/folder/archive');
  });

  it('keeps previously discovered directory hints after refocus', () => {
    const { props } = createProps();
    const firstItems: BrowseItem[] = [
      {
        name: 'assets',
        type: 'directory',
        path: 'my-bucket/assets',
        size: null,
        lastModified: null,
      },
    ];

    const { rerender } = render(
      <BrowserPage
        {...props}
        selectedPath="my-bucket"
        browse={{ ...props.browse, data: { ...props.browse.data!, items: firstItems } }}
      />
    );

    fireEvent.click(screen.getByTestId('breadcrumb-trail'));
    const breadcrumbInput = screen.getByRole('textbox', { name: 'Breadcrumb path' });
    fireEvent.change(breadcrumbInput, { target: { value: '/my-bucket/as' } });
    fireEvent.blur(breadcrumbInput);

    rerender(
      <BrowserPage
        {...props}
        selectedPath="my-bucket/as"
        browse={{ ...props.browse, data: { ...props.browse.data!, items: [] } }}
      />
    );

    fireEvent.click(screen.getByTestId('breadcrumb-trail'));
    const reopenedInput = screen.getByRole('textbox', { name: 'Breadcrumb path' });
    fireEvent.change(reopenedInput, { target: { value: '/my-bucket/as' } });

    const hints = screen.getByTestId('breadcrumb-hints');
    expect(hints).toHaveTextContent('/my-bucket/assets');
  });
});

describe('BrowserPage sorting and filtering', () => {
  beforeEach(() => {
    window.localStorage.removeItem(OVERVIEW_COLUMNS_STORAGE_KEY);
  });

  afterEach(() => {
    cleanup();
  });

  it('shows an overview of available keyboard shortcuts', () => {
    const { props } = createProps();
    render(<BrowserPage {...props} isShortcutsModalOpen />);

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Select all visible items')).toBeInTheDocument();
    expect(screen.getByText('Refresh explorer contents')).toBeInTheDocument();
    expect(screen.getByText('Download selected files')).toBeInTheDocument();
    expect(screen.getByText('Rename selected item')).toBeInTheDocument();
    expect(screen.getByText('Move selected item')).toBeInTheDocument();
    expect(screen.getByText('Delete selected items')).toBeInTheDocument();
    expect(screen.getByText('Clear selection or close dialogs')).toBeInTheDocument();
  });

  it('renders keyboard shortcut combinations and alternatives clearly', () => {
    const { props } = createProps();
    render(<BrowserPage {...props} isShortcutsModalOpen />);

    const parentShortcutRow = screen.getByText('Go to parent folder').closest('div');
    expect(parentShortcutRow).not.toBeNull();
    if (!parentShortcutRow) {
      return;
    }
    expect(within(parentShortcutRow).getByText('ArrowLeft')).toBeInTheDocument();
    expect(within(parentShortcutRow).getByText('Backspace')).toBeInTheDocument();
    expect(within(parentShortcutRow).getByText('Alt')).toBeInTheDocument();
    expect(within(parentShortcutRow).getByText('ArrowUp')).toBeInTheDocument();
    expect(within(parentShortcutRow).getAllByText('or')).toHaveLength(2);

    const moveShortcutRow = screen.getByText('Move selected item').closest('div');
    expect(moveShortcutRow).not.toBeNull();
    if (!moveShortcutRow) {
      return;
    }
    expect(within(moveShortcutRow).getAllByText('+')).toHaveLength(2);
  });

  it('opens and closes shortcuts modal with keyboard keys', () => {
    const { props } = createProps();
    render(<BrowserPage {...props} />);

    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();
  });

  it('refreshes explorer contents on F5', () => {
    const { props } = createProps();
    render(<BrowserPage {...props} />);

    const dispatchResult = window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F5', bubbles: true, cancelable: true })
    );

    expect(dispatchResult).toBe(false);
    expect(props.browse.refetch).toHaveBeenCalledTimes(1);
  });

  it('does not intercept Ctrl+F5 browser refresh', () => {
    const { props } = createProps();
    render(<BrowserPage {...props} />);

    const dispatchResult = window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F5', ctrlKey: true, bubbles: true, cancelable: true })
    );

    expect(dispatchResult).toBe(true);
    expect(props.browse.refetch).not.toHaveBeenCalled();
  });

  it('supports keyboard row selection and context menu trigger', () => {
    const { props } = createProps();
    const items: BrowseItem[] = [
      {
        name: 'alpha.txt',
        type: 'file',
        path: 'my-bucket/alpha.txt',
        size: 4,
        lastModified: null,
      },
    ];

    render(
      <BrowserPage
        {...props}
        selectedPath=""
        browse={{ ...props.browse, data: { ...props.browse.data!, items } }}
      />
    );

    const firstDataRow = screen.getByText('alpha.txt').closest('tr');
    expect(firstDataRow).not.toBeNull();
    if (!firstDataRow) {
      return;
    }
    firstDataRow.focus();

    fireEvent.keyDown(firstDataRow, { key: ' ' });
    expect(props.onSelectItemOnly).toHaveBeenCalledWith('my-bucket/alpha.txt', 0);

    fireEvent.keyDown(firstDataRow, { key: 'F10', shiftKey: true });
    expect(props.onOpenItemContextMenu).toHaveBeenCalledWith(items[0]);
  });

  it('supports keyboard navigation inside the context menu', async () => {
    const { props } = createProps();
    const selectedItem: BrowseItem = {
      name: 'alpha.txt',
      type: 'file',
      path: 'my-bucket/alpha.txt',
      size: 4,
      lastModified: null,
    };

    render(
      <BrowserPage
        {...props}
        contextMenu={{ x: 120, y: 60, item: selectedItem }}
        selectedPath=""
        browse={{ ...props.browse, data: { ...props.browse.data!, items: [selectedItem] } }}
      />
    );

    const menu = screen.getByRole('menu', { name: 'Item actions' });
    const viewItem = screen.getByRole('menuitem', { name: 'View' });
    const editItem = screen.getByRole('menuitem', { name: 'Edit' });

    await waitFor(() => {
      expect(viewItem).toHaveFocus();
    });

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(editItem).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(viewItem).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(props.onCloseContextMenu).toHaveBeenCalledTimes(1);
  });

  it('moves focus into explorer rows when arrow key is pressed globally', () => {
    const { props } = createProps();
    const items: BrowseItem[] = [
      {
        name: 'alpha.txt',
        type: 'file',
        path: 'my-bucket/alpha.txt',
        size: 4,
        lastModified: null,
      },
    ];

    render(
      <BrowserPage
        {...props}
        selectedPath=""
        browse={{ ...props.browse, data: { ...props.browse.data!, items } }}
      />
    );

    const firstDataRow = screen.getByText('alpha.txt').closest('tr');
    expect(firstDataRow).not.toBeNull();
    if (!firstDataRow) {
      return;
    }

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(firstDataRow).toHaveFocus();
  });

  it('navigates to parent on Backspace key', () => {
    const { props, setSelectedPath } = createProps();
    render(<BrowserPage {...props} />);

    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(setSelectedPath).toHaveBeenCalledWith('my-bucket');
  });

  it('opens focused directory with ArrowRight and navigates parent with ArrowLeft', () => {
    const { props, setSelectedPath } = createProps();
    const items: BrowseItem[] = [
      {
        name: 'reports',
        type: 'directory',
        path: 'my-bucket/folder/reports',
        size: null,
        lastModified: null,
      },
    ];

    render(
      <BrowserPage
        {...props}
        browse={{ ...props.browse, data: { ...props.browse.data!, items } }}
      />
    );

    const directoryRow = screen.getByText('reports').closest('tr');
    expect(directoryRow).not.toBeNull();
    if (!directoryRow) {
      return;
    }

    directoryRow.focus();
    fireEvent.keyDown(directoryRow, { key: 'ArrowRight' });
    expect(props.onRowDoubleClick).toHaveBeenCalledWith(items[0]);

    fireEvent.keyDown(directoryRow, { key: 'ArrowLeft' });
    expect(setSelectedPath).toHaveBeenCalledWith('my-bucket');
  });

  it('uses numeric-aware string sorting for names', () => {
    const { props } = createProps();
    const items: BrowseItem[] = [
      {
        name: 'file10.txt',
        type: 'file',
        path: 'my-bucket/file10.txt',
        size: 10,
        lastModified: '2026-01-03T00:00:00.000Z',
      },
      {
        name: 'file2.txt',
        type: 'file',
        path: 'my-bucket/file2.txt',
        size: 2,
        lastModified: '2026-01-02T00:00:00.000Z',
      },
      {
        name: 'file1.txt',
        type: 'file',
        path: 'my-bucket/file1.txt',
        size: 1,
        lastModified: '2026-01-01T00:00:00.000Z',
      },
    ];

    render(
      <BrowserPage
        {...props}
        selectedPath=""
        browse={{ ...props.browse, data: { ...props.browse.data!, items } }}
      />
    );

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('file1.txt');
    expect(rows[1]).toHaveTextContent('file2.txt');
    expect(rows[2]).toHaveTextContent('file10.txt');
  });

  it('filters visible files and folders by query', () => {
    const { props } = createProps();
    const items: BrowseItem[] = [
      {
        name: 'invoice-1.pdf',
        type: 'file',
        path: 'my-bucket/invoice-1.pdf',
        size: 10,
        lastModified: null,
      },
      {
        name: 'invoice-2.pdf',
        type: 'file',
        path: 'my-bucket/invoice-2.pdf',
        size: 20,
        lastModified: null,
      },
      {
        name: 'photos',
        type: 'directory',
        path: 'my-bucket/photos',
        size: null,
        lastModified: null,
      },
    ];

    render(
      <BrowserPage
        {...props}
        selectedPath=""
        browse={{ ...props.browse, data: { ...props.browse.data!, items } }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open filter' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Filter files and folders' }), {
      target: { value: 'invoice-2' },
    });

    expect(screen.getByText('invoice-2.pdf')).toBeInTheDocument();
    expect(screen.queryByText('invoice-1.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('photos')).not.toBeInTheDocument();
  });

  it('supports advanced metadata filter queries in the filter input', async () => {
    const { props } = createProps();
    const items: BrowseItem[] = [
      {
        name: 'report-a.json',
        type: 'file',
        path: 'my-bucket/report-a.json',
        size: 10,
        lastModified: '2026-01-03T00:00:00.000Z',
      },
      {
        name: 'report-b.json',
        type: 'file',
        path: 'my-bucket/report-b.json',
        size: 10,
        lastModified: '2026-01-03T00:00:00.000Z',
      },
    ];

    getPropertiesQueryMock.mockImplementation(
      async ({ path }: { path: string }): Promise<ObjectPropertiesResult> => ({
        name: path.split('/').pop() ?? path,
        key: path.split('/').slice(1).join('/'),
        size: 10,
        contentType: 'application/json',
        lastModified: '2026-01-03T00:00:00.000Z',
        etag: null,
        storageClass: 'STANDARD',
        metadata: path.includes('report-a') ? { owner: 'alice' } : { owner: 'bob' },
      })
    );

    render(
      <BrowserPage
        {...props}
        selectedPath=""
        browse={{ ...props.browse, data: { ...props.browse.data!, items } }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open filter' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter files and folders' }), {
      target: { value: 'meta.owner:alice' },
    });

    await waitFor(() => {
      expect(screen.getByText('report-a.json')).toBeInTheDocument();
      expect(screen.queryByText('report-b.json')).not.toBeInTheDocument();
    });
  });

  it('supports advanced numeric comparisons in the filter input', () => {
    const { props } = createProps();
    const items: BrowseItem[] = [
      {
        name: 'small.bin',
        type: 'file',
        path: 'my-bucket/small.bin',
        size: 1024,
        lastModified: null,
      },
      {
        name: 'large.bin',
        type: 'file',
        path: 'my-bucket/large.bin',
        size: 3 * 1024 * 1024,
        lastModified: null,
      },
    ];

    render(
      <BrowserPage
        {...props}
        selectedPath=""
        browse={{ ...props.browse, data: { ...props.browse.data!, items } }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open filter' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter files and folders' }), {
      target: { value: 'size>=1mb' },
    });

    expect(screen.queryByText('small.bin')).not.toBeInTheDocument();
    expect(screen.getByText('large.bin')).toBeInTheDocument();
  });

  it('renders filter query help modal when opened from header controls', () => {
    const { props } = createProps();
    render(<BrowserPage {...props} isFilterHelpModalOpen />);

    expect(
      screen.queryByRole('button', { name: 'Open filter query help' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open keyboard shortcuts' })
    ).not.toBeInTheDocument();

    expect(screen.getByRole('dialog', { name: 'Filter query help' })).toBeInTheDocument();
    expect(screen.getByText('meta.owner:alice')).toBeInTheDocument();
    expect(screen.getByText('size>=10mb')).toBeInTheDocument();
  });

  it('triggers file and folder upload handlers', () => {
    const { props } = createProps();
    render(<BrowserPage {...props} selectedPath="" />);

    const uploadFile = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const folderFile = new File(['world'], 'inside.txt', { type: 'text/plain' });
    Object.defineProperty(folderFile, 'webkitRelativePath', {
      configurable: true,
      value: 'my-folder/inside.txt',
    });

    fireEvent.change(screen.getByTestId('upload-files-input'), {
      target: { files: [uploadFile] },
    });
    fireEvent.change(screen.getByTestId('upload-folder-input'), {
      target: { files: [folderFile] },
    });

    const dialog = screen.getByRole('dialog', { name: 'Upload selected folder?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Upload Folder' }));

    expect(props.onUploadFiles).toHaveBeenCalledTimes(1);
    expect(props.onUploadFolder).toHaveBeenCalledTimes(1);
  });

  it('disables upload buttons when not inside a bucket', () => {
    const { props } = createProps();
    render(<BrowserPage {...props} selectedPath="" />);

    expect(screen.getByRole('button', { name: 'Upload Files' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Upload Folder' })).toBeDisabled();
  });

  it('opens files in view mode on double click', () => {
    const { props } = createProps();
    const items: BrowseItem[] = [
      {
        name: 'notes.txt',
        type: 'file',
        path: 'my-bucket/notes.txt',
        size: 10,
        lastModified: null,
      },
    ];

    render(
      <BrowserPage
        {...props}
        selectedPath=""
        browse={{ ...props.browse, data: { ...props.browse.data!, items } }}
      />
    );

    fireEvent.doubleClick(screen.getByText('notes.txt'));

    expect(props.onViewFile).toHaveBeenCalledWith('my-bucket/notes.txt');
  });

  it('persists file overview fields visibility for the explorer table', () => {
    const { props } = createProps();
    const items: BrowseItem[] = [
      {
        name: 'notes.txt',
        type: 'file',
        path: 'my-bucket/notes.txt',
        size: 10,
        lastModified: null,
      },
    ];

    const { unmount } = render(
      <BrowserPage
        {...props}
        selectedPath=""
        browse={{ ...props.browse, data: { ...props.browse.data!, items } }}
      />
    );

    expect(screen.getByRole('columnheader', { name: 'Size' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Customize visible fields' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Size' }));

    expect(screen.queryByRole('columnheader', { name: 'Size' })).not.toBeInTheDocument();
    const storedColumns = window.localStorage.getItem(OVERVIEW_COLUMNS_STORAGE_KEY);
    expect(storedColumns).not.toBeNull();
    const parsedColumns = JSON.parse(storedColumns ?? '{}') as Record<string, unknown>;
    expect(parsedColumns.showName).toBe(true);
    expect(parsedColumns.showSize).toBe(false);
    expect(parsedColumns.showModified).toBe(true);

    expect(screen.getByRole('checkbox', { name: 'Content Type' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Storage Class' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Metadata' })).not.toBeInTheDocument();

    unmount();

    render(
      <BrowserPage
        {...props}
        selectedPath=""
        browse={{ ...props.browse, data: { ...props.browse.data!, items } }}
      />
    );

    expect(screen.queryByRole('columnheader', { name: 'Size' })).not.toBeInTheDocument();
  });

  it('supports toggling all fields and filtering the fields list', () => {
    const { props } = createProps();
    const items: BrowseItem[] = [
      {
        name: 'notes.txt',
        type: 'file',
        path: 'my-bucket/notes.txt',
        size: 10,
        lastModified: null,
      },
    ];

    render(
      <BrowserPage
        {...props}
        selectedPath=""
        browse={{ ...props.browse, data: { ...props.browse.data!, items } }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Customize visible fields' }));

    fireEvent.click(screen.getByRole('button', { name: 'Toggle all on' }));
    expect(screen.getByRole('button', { name: 'Toggle all off' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle all off' }));
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Size' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle all on' }));
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search visible fields' }), {
      target: { value: 'content' },
    });
    expect(screen.getByRole('checkbox', { name: 'Content Type' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Storage Class' })).not.toBeInTheDocument();
  });
});
