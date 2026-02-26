import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '@web/App';

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
          data: { breadcrumbs: [{ name: 'Home', path: '' }], items: [] },
          refetch: vi.fn(),
        }),
      },
      createFolder: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
      deleteObject: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
      deleteFolder: {
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
    },
  },
}));

describe('App routes', () => {
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
    render(
      <MemoryRouter initialEntries={['/upload']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Uploader')).toBeInTheDocument();
    expect(screen.getByText('Upload Panel Mock')).toBeInTheDocument();
  });
});
