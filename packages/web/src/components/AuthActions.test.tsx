import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthActions } from '@web/components/AuthActions';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AuthActions', () => {
  it('renders login button when unauthenticated', () => {
    render(<AuthActions authenticated={false} />);

    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
  });

  it('renders logout action when authenticated', () => {
    render(<AuthActions authenticated />);

    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Login' })).not.toBeInTheDocument();
  });

  it('navigates to login endpoint when login is clicked', () => {
    const navigateTo = vi.fn();

    render(<AuthActions authenticated={false} navigateTo={navigateTo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(navigateTo).toHaveBeenCalledWith('http://localhost:3000/auth/login?returnTo=%2F');
  });

  it('requests logout URL and navigates when logout is clicked', async () => {
    const navigateTo = vi.fn();
    const logoutRequest = vi.fn(async () => 'http://localhost:3000/provider-logout');

    render(<AuthActions authenticated navigateTo={navigateTo} logoutRequest={logoutRequest} />);
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => {
      expect(logoutRequest).toHaveBeenCalledWith('http://localhost:3000/auth/logout?returnTo=%2F');
      expect(navigateTo).toHaveBeenCalledWith('http://localhost:3000/provider-logout');
    });
  });

  it('falls back to current path when logout request fails', async () => {
    const navigateTo = vi.fn();
    const logoutRequest = vi.fn(async () => {
      throw new Error('failed');
    });

    render(<AuthActions authenticated navigateTo={navigateTo} logoutRequest={logoutRequest} />);
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => {
      expect(navigateTo).toHaveBeenCalledWith('/');
    });
  });
});
