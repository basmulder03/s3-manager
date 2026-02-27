import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '@web/App';

const createFolderMutate = vi.fn(async () => ({ path: 'my-bucket/new-folder/' }));
const renameMutate = vi.fn(async () => ({
  destinationPath: 'my-bucket/new-name',
  movedObjects: 1,
}));
const deleteObjectMutate = vi.fn(async () => ({ success: true }));
const deleteFolderMutate = vi.fn(async () => ({ deletedCount: 1 }));
const deleteMultipleMutate = vi.fn(async () => ({ message: 'Deleted 2 item(s)', deletedCount: 2 }));
const browseRefetch = vi.fn();
let mockAuthRequired = false;
let mockAuthenticated = false;
let mockPermissions: Array<'view' | 'write' | 'delete'> = [];

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
        useQuery: () => ({
          data: { authRequired: mockAuthRequired, provider: 'keycloak' },
          refetch: vi.fn(),
        }),
      },
      me: {
        useQuery: () => ({
          isSuccess: mockAuthenticated,
          isError: !mockAuthenticated,
          data: mockAuthenticated
            ? {
                name: 'Alice',
                email: 'alice@example.com',
                roles: ['S3-Admin'],
                permissions: mockPermissions,
              }
            : undefined,
          refetch: vi.fn(),
        }),
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
      deleteMultiple: {
        useMutation: () => ({ mutateAsync: deleteMultipleMutate }),
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
      getProperties: {
        query: vi.fn(async () => ({
          name: 'report.txt',
          key: 'folder/report.txt',
          size: 42,
          contentType: 'text/plain',
          lastModified: '2026-01-01T10:00:00.000Z',
          etag: 'abc123',
          storageClass: 'STANDARD',
          metadata: {},
        })),
      },
    },
  },
}));

describe('Browser parity interactions', () => {
  beforeEach(() => {
    mockAuthRequired = false;
    mockAuthenticated = false;
    mockPermissions = [];
    createFolderMutate.mockClear();
    renameMutate.mockClear();
    deleteObjectMutate.mockClear();
    deleteFolderMutate.mockClear();
    deleteMultipleMutate.mockClear();
    browseRefetch.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('supports ctrl/cmd+a selection and Delete shortcut bulk delete', async () => {
    render(
      <MemoryRouter initialEntries={['/browser']}>
        <App />
      </MemoryRouter>
    );

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    await screen.findByText('2 selected');

    fireEvent.keyDown(window, { key: 'Delete' });

    const dialog = await screen.findByRole('dialog', { name: 'Confirm Delete' });
    expect(await screen.findByText('Confirm Delete')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(deleteMultipleMutate).toHaveBeenCalledTimes(1);
    });
  });

  it('opens grouped context menu on right click', async () => {
    render(
      <MemoryRouter initialEntries={['/browser']}>
        <App />
      </MemoryRouter>
    );

    const fileCell = screen.getAllByText('report.txt')[0]!;
    fireEvent.contextMenu(fileCell);

    expect(await screen.findByText('Quick Actions')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Danger')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Rename' }).length).toBeGreaterThan(0);
  });

  it('hides write and delete actions when user only has view permission', async () => {
    mockAuthRequired = true;
    mockAuthenticated = true;
    mockPermissions = ['view'];

    render(
      <MemoryRouter initialEntries={['/browser']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: 'Create Folder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Selected' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });
});
