import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '@web/App';

const createFolderMutate = vi.fn(async () => ({ path: 'my-bucket/new-folder/' }));
const renameMutate = vi.fn(async () => ({ destinationPath: 'my-bucket/new-name', movedObjects: 1 }));
const deleteObjectMutate = vi.fn(async () => ({ success: true }));
const deleteFolderMutate = vi.fn(async () => ({ deletedCount: 1 }));
const browseRefetch = vi.fn();

vi.mock('@web/components/UploadPanel', () => ({
  UploadPanel: () => <div>Upload Panel Mock</div>,
}));

vi.mock('@web/trpc/client', () => ({
  trpc: {
    health: {
      info: {
        useQuery: () => ({ data: { app: 'S3 Manager', version: '2.0.0', env: 'test' } }),
      },
    },
    auth: {
      status: {
        useQuery: () => ({ data: { authRequired: false, provider: 'keycloak' }, refetch: vi.fn() }),
      },
      me: {
        useQuery: () => ({ isSuccess: false, isError: true, data: undefined, refetch: vi.fn() }),
      },
    },
    s3: {
      browse: {
        useQuery: () => ({
          isLoading: false,
          isError: false,
          data: {
            path: '/my-bucket/folder',
            breadcrumbs: [
              { name: 'Home', path: '' },
              { name: 'my-bucket', path: 'my-bucket' },
              { name: 'folder', path: 'my-bucket/folder' },
            ],
            items: [
              {
                name: 'docs',
                type: 'directory',
                path: 'my-bucket/folder/docs',
                size: null,
                lastModified: null,
              },
              {
                name: 'report.txt',
                type: 'file',
                path: 'my-bucket/folder/report.txt',
                size: 42,
                lastModified: '2026-01-01T10:00:00.000Z',
              },
            ],
          },
          refetch: browseRefetch,
        }),
      },
      createFolder: {
        useMutation: () => ({ mutateAsync: createFolderMutate }),
      },
      renameItem: {
        useMutation: () => ({ mutateAsync: renameMutate }),
      },
      deleteObject: {
        useMutation: () => ({ mutateAsync: deleteObjectMutate }),
      },
      deleteFolder: {
        useMutation: () => ({ mutateAsync: deleteFolderMutate }),
      },
    },
  },
  API_ORIGIN: 'http://localhost:3000',
  trpcProxyClient: {
    s3: {
      getObjectMetadata: {
        query: vi.fn(async () => ({
          key: 'my-bucket/folder/report.txt',
          size: 42,
          contentType: 'text/plain',
          lastModified: '2026-01-01T10:00:00.000Z',
          etag: null,
          downloadUrl: 'http://localhost:4566/download/mock',
        })),
      },
    },
  },
}));

describe('Stage 5 browser parity interactions', () => {
  beforeEach(() => {
    createFolderMutate.mockClear();
    renameMutate.mockClear();
    deleteObjectMutate.mockClear();
    deleteFolderMutate.mockClear();
    browseRefetch.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('supports ctrl/cmd+a selection and Delete shortcut bulk delete', async () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);

    render(
      <MemoryRouter initialEntries={['/browser']}>
        <App />
      </MemoryRouter>
    );

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    await screen.findByText('2 selected');

    fireEvent.keyDown(window, { key: 'Delete' });

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalled();
      expect(deleteObjectMutate).toHaveBeenCalledTimes(1);
      expect(deleteFolderMutate).toHaveBeenCalledTimes(1);
    });
  });

  it('opens grouped context menu on right click', async () => {
    render(
      <MemoryRouter initialEntries={['/browser']}>
        <App />
      </MemoryRouter>
    );

    const fileCell = screen.getAllByText('report.txt')[0];
    fireEvent.contextMenu(fileCell);

    expect(await screen.findByText('Quick Actions')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Danger')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Rename' }).length).toBeGreaterThan(0);
  });
});
