import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '@web/App';

vi.mock('@web/components/UploadPanel', () => ({
  UploadPanel: () => <div>Upload Panel Mock</div>,
}));

let mockAuthRequired = false;
let mockAuthenticated = false;
let mockPermissions: Array<'view' | 'write' | 'delete'> = [];

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
          data: { breadcrumbs: [{ name: 'Home', path: '' }], items: [] },
          refetch: vi.fn(),
        }),
      },
      createFolder: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
      renameItem: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
      deleteObject: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
      deleteFolder: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
      deleteMultiple: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
    },
  },
  API_ORIGIN: 'http://localhost:3000',
  trpcProxyClient: {
    s3: {
      getObjectMetadata: {
        query: vi.fn(),
      },
      getProperties: {
        query: vi.fn(),
      },
    },
  },
}));

describe('App routes', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockAuthRequired = false;
    mockAuthenticated = false;
    mockPermissions = [];
  });

  it('renders overview by default redirect', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Server Status')).toBeInTheDocument();
    expect(screen.getByText('Current User')).toBeInTheDocument();
  });

  it('renders upload page route', () => {
    mockAuthenticated = true;
    mockPermissions = ['view', 'write', 'delete'];

    render(
      <MemoryRouter initialEntries={['/upload']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Uploader')).toBeInTheDocument();
    expect(screen.getByText('Upload Panel Mock')).toBeInTheDocument();
  });

  it('shows sign-in screen only when auth is required and user is signed out', () => {
    mockAuthRequired = true;
    render(
      <MemoryRouter initialEntries={['/browser']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.queryByText('S3 Browser')).not.toBeInTheDocument();
  });
});
