import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '@web/App';

vi.mock('@web/components/UploadPanel', () => ({
  UploadPanel: () => <div>Upload Panel Mock</div>,
}));

let mockAuthRequired = false;
let mockAuthenticated = false;
let mockPermissions: Array<'view' | 'write' | 'delete' | 'manage_properties'> = [];
let mockElevationSources: Array<{
  entitlementKey: string;
  provider: 'azure' | 'google';
  target: string;
  permissions: string[];
}> = [];
const mockAuthStatusRefetch = vi.fn();
const mockAuthMeRefetch = vi.fn();
const { mockGetObjectMetadataQuery, mockGetObjectTextContentQuery } = vi.hoisted(() => ({
  mockGetObjectMetadataQuery: vi.fn(),
  mockGetObjectTextContentQuery: vi.fn(),
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
          refetch: mockAuthStatusRefetch,
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
                elevationSources: mockElevationSources,
              }
            : undefined,
          refetch: mockAuthMeRefetch,
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
        query: mockGetObjectMetadataQuery,
      },
      getObjectTextContent: {
        query: mockGetObjectTextContentQuery,
      },
      getProperties: {
        query: vi.fn(),
      },
      updateProperties: {
        mutate: vi.fn(),
      },
    },
  },
}));

describe('App routes', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  beforeEach(() => {
    mockAuthRequired = false;
    mockAuthenticated = false;
    mockPermissions = [];
    mockElevationSources = [];
    mockAuthStatusRefetch.mockReset();
    mockAuthMeRefetch.mockReset();
    mockGetObjectMetadataQuery.mockReset();
    mockGetObjectTextContentQuery.mockReset();

    mockGetObjectMetadataQuery.mockResolvedValue({
      contentType: 'text/plain',
      etag: 'etag-1',
      downloadUrl: 'https://example.com/test.txt',
    });
    mockGetObjectTextContentQuery.mockResolvedValue({
      contentType: 'text/plain',
      etag: 'etag-1',
      content: 'hello world',
    });
  });

  it('renders file browser by default route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByTestId('breadcrumb-trail')).toBeInTheDocument();
  });

  it('redirects unknown page routes to file browser', () => {
    mockAuthenticated = true;
    mockPermissions = ['view', 'write', 'delete'];

    render(
      <MemoryRouter initialEntries={['/upload']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByTestId('breadcrumb-trail')).toBeInTheDocument();
  });

  it('shows sign-in screen only when auth is required and user is signed out', () => {
    mockAuthRequired = true;
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.queryByTestId('breadcrumb-trail')).not.toBeInTheDocument();
  });

  it('refreshes the session automatically in the background while authenticated', async () => {
    vi.useFakeTimers();
    mockAuthenticated = true;
    mockPermissions = ['view', 'write', 'delete'];
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    expect(mockAuthStatusRefetch).toHaveBeenCalled();
    expect(mockAuthMeRefetch).toHaveBeenCalled();
  });

  it('does not run background refresh when user is signed out', async () => {
    vi.useFakeTimers();
    mockAuthRequired = true;
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('supports hidden manual fallback refresh via keyboard shortcut', async () => {
    mockAuthenticated = true;
    mockPermissions = ['view', 'write', 'delete'];
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    fireEvent.keyDown(window, { key: 'r', ctrlKey: true, shiftKey: true });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('shows active elevation source details in session panel', async () => {
    mockAuthenticated = true;
    mockPermissions = ['view', 'write', 'manage_properties'];
    mockElevationSources = [
      {
        entitlementKey: 'property-admin-temp',
        provider: 'azure',
        target: 'group-123',
        permissions: ['manage_properties'],
      },
    ];

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show session panel' }));

    expect(screen.getByText('Active Elevation')).toBeInTheDocument();
    expect(screen.getByText('property-admin-temp')).toBeInTheDocument();
    expect(screen.getByText('azure · group-123')).toBeInTheDocument();
  });

  it('closes file preview modal when close button is pressed', async () => {
    mockAuthenticated = true;
    mockPermissions = ['view', 'write', 'delete'];

    render(
      <MemoryRouter initialEntries={['/?path=my-bucket&file=my-bucket/test.txt&mode=view']}>
        <App />
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: 'View File' });

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await vi.waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'View File' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Edit File' })).not.toBeInTheDocument();
    });
  });

  it('switches text preview from view to edit mode when edit button is clicked', async () => {
    mockAuthenticated = true;
    mockPermissions = ['view', 'write', 'delete'];

    render(
      <MemoryRouter initialEntries={['/?path=my-bucket&file=my-bucket/test.txt&mode=view']}>
        <App />
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: 'View File' });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    await screen.findByRole('heading', { name: 'Edit File' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
