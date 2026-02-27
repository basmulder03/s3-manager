import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('navigates to logout endpoint when logout is clicked', () => {
    const navigateTo = vi.fn();

    render(<AuthActions authenticated navigateTo={navigateTo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    expect(navigateTo).toHaveBeenCalledWith('http://localhost:3000/auth/logout?returnTo=%2F');
  });
});
