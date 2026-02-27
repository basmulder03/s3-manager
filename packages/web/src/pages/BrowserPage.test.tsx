import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
      browserMessage: '',
      contextMenu: null,
      onBulkDownload: vi.fn(async () => {}),
      onBulkDelete: vi.fn(async () => {}),
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
