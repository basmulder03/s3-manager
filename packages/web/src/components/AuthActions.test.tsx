import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AuthActions } from '@web/components/AuthActions';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AuthActions', () => {
  it('renders login button when unauthenticated', () => {
    render(<AuthActions authenticated={false} onAfterRefresh={() => {}} />);

    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
  });

  it('renders refresh and logout actions when authenticated', () => {
    render(<AuthActions authenticated onAfterRefresh={() => {}} />);

    expect(screen.getByRole('button', { name: 'Refresh Session' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Login' })).not.toBeInTheDocument();
  });

  it('calls onAfterRefresh after refresh request', async () => {
    const onAfterRefresh = vi.fn();
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthActions authenticated onAfterRefresh={onAfterRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Session' }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(onAfterRefresh).toHaveBeenCalledTimes(1);
    });

  });
});
