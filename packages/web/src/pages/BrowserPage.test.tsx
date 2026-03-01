import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { BrowseItem } from '@server/services/s3/types';
import { BrowserPage } from '@web/pages/BrowserPage';

const createProps = () => {
  const setSelectedPath = vi.fn();

  return {
    setSelectedPath,
    props: {
      selectedPath: 'my-bucket/folder',
      setSelectedPath,
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
      onRowClick: vi.fn(),
      onRowDoubleClick: vi.fn(),
      onOpenContextMenu: vi.fn(),
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
});

describe('BrowserPage sorting and filtering', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows an overview of available keyboard shortcuts', () => {
    const { props } = createProps();
    render(<BrowserPage {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open keyboard shortcuts' }));

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Select all visible items')).toBeInTheDocument();
    expect(screen.getByText('Download selected files')).toBeInTheDocument();
    expect(screen.getByText('Rename selected item')).toBeInTheDocument();
    expect(screen.getByText('Move selected item')).toBeInTheDocument();
    expect(screen.getByText('Delete selected items')).toBeInTheDocument();
    expect(screen.getByText('Clear selection or close dialogs')).toBeInTheDocument();
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
});
