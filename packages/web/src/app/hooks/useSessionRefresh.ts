import { useEffect, useRef } from 'react';
import { SESSION_REFRESH_INTERVAL_MS } from '@web/constants';

export interface UseSessionRefreshOptions {
  authenticated: boolean;
  refreshSession: () => Promise<boolean>;
  elevationSources: Array<{ expiresAt?: string }>;
  refreshAuthState: () => void;
  onElevationExpired?: () => void;
}

export interface UseSessionRefreshResult {
  /** Suppress the next elevation drop notification (used when user manually revokes) */
  suppressNextElevationNotice: () => void;
}

/**
 * Hook for managing session refresh and elevation tracking
 *
 * Features:
 * - Automatic session refresh every 5 minutes
 * - Manual refresh via Shift+Cmd/Ctrl+R shortcut
 * - Elevation expiration notifications
 * - Automatic auth refresh when elevation expires
 */
export function useSessionRefresh(options: UseSessionRefreshOptions): UseSessionRefreshResult {
  const { authenticated, refreshSession, elevationSources, refreshAuthState, onElevationExpired } =
    options;

  const hadElevationRef = useRef(false);
  const suppressNextElevationDropNoticeRef = useRef(false);

  // Periodic session refresh (every 5 minutes)
  useEffect(() => {
    if (!authenticated) {
      return;
    }

    let inFlight = false;
    const intervalId = window.setInterval(() => {
      if (inFlight) {
        return;
      }

      inFlight = true;
      void refreshSession()
        .then((refreshed) => {
          if (!refreshed) {
            window.clearInterval(intervalId);
          }
        })
        .finally(() => {
          inFlight = false;
        });
    }, SESSION_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [authenticated, refreshSession]);

  // Manual session refresh keyboard shortcut (Shift+Cmd/Ctrl+R)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!authenticated) {
        return;
      }

      const isManualRefreshShortcut =
        event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r';

      if (!isManualRefreshShortcut) {
        return;
      }

      event.preventDefault();
      void refreshSession();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [authenticated, refreshSession]);

  // Elevation drop notification
  useEffect(() => {
    const hasElevation = authenticated && elevationSources.length > 0;
    const previouslyElevated = hadElevationRef.current;

    if (previouslyElevated && !hasElevation) {
      if (suppressNextElevationDropNoticeRef.current) {
        suppressNextElevationDropNoticeRef.current = false;
      } else if (onElevationExpired) {
        onElevationExpired();
      }
    }

    hadElevationRef.current = hasElevation;
  }, [authenticated, elevationSources, onElevationExpired]);

  // Schedule auth refresh on elevation expiry
  useEffect(() => {
    if (!authenticated || elevationSources.length === 0) {
      return;
    }

    const now = Date.now();
    const expiryTimes = elevationSources
      .map((source) => source.expiresAt)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map((value) => Date.parse(value))
      .filter((value) => !Number.isNaN(value) && value > now);

    if (expiryTimes.length === 0) {
      return;
    }

    const nearestExpiry = Math.min(...expiryTimes);
    const delayMs = Math.max(1_000, nearestExpiry - now + 1_000);
    const timerId = window.setTimeout(() => {
      refreshAuthState();
    }, delayMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [authenticated, elevationSources, refreshAuthState]);

  return {
    suppressNextElevationNotice: () => {
      suppressNextElevationDropNoticeRef.current = true;
    },
  };
}
