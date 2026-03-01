import { useEffect, useMemo, useRef, useState } from 'react';
import { API_ORIGIN } from '@web/trpc/client';
import { Button } from '@web/components/ui';
import styles from '@web/App.module.css';

interface FinderSidebarProps {
  provider: string | undefined;
  userEmail: string | undefined;
  selectedPath: string;
  permissions: string[];
  elevationSources: Array<{
    entitlementKey: string;
    provider: 'azure' | 'google';
    target: string;
    permissions: string[];
  }>;
  authenticated: boolean;
  onElevationGranted?: () => void;
}

interface ElevationEntitlement {
  key: string;
  provider: 'azure' | 'google';
  target: string;
  maxDurationMinutes: number;
  permissions: string[];
  requiresJustification: boolean;
}

interface ElevationRequest {
  id: string;
  entitlementKey: string;
  status: 'pending' | 'granted' | 'denied' | 'error';
  durationMinutes: number;
  requestedAt: string;
  message?: string;
  expiresAt?: string;
}

export const FinderSidebar = ({
  provider,
  userEmail,
  selectedPath,
  permissions,
  elevationSources,
  authenticated,
  onElevationGranted,
}: FinderSidebarProps) => {
  const [entitlements, setEntitlements] = useState<ElevationEntitlement[]>([]);
  const [entitlementsLoading, setEntitlementsLoading] = useState(false);
  const [entitlementsError, setEntitlementsError] = useState<string | null>(null);
  const [selectedEntitlementKey, setSelectedEntitlementKey] = useState('');
  const [justification, setJustification] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeRequest, setActiveRequest] = useState<ElevationRequest | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const lastGrantedRequestIdRef = useRef('');

  const selectedEntitlement = useMemo(
    () => entitlements.find((entry) => entry.key === selectedEntitlementKey) ?? null,
    [entitlements, selectedEntitlementKey]
  );

  useEffect(() => {
    if (!authenticated) {
      setEntitlements([]);
      setSelectedEntitlementKey('');
      setEntitlementsError(null);
      setActiveRequest(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setEntitlementsLoading(true);
      setEntitlementsError(null);

      try {
        const response = await fetch(`${API_ORIGIN}/auth/elevation/entitlements`, {
          credentials: 'include',
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? 'Failed to load elevation entitlements');
        }

        const payload = (await response.json()) as {
          entitlements?: ElevationEntitlement[];
        };
        if (cancelled) {
          return;
        }

        const next = payload.entitlements ?? [];
        setEntitlements(next);
        setSelectedEntitlementKey((previous) => {
          if (previous && next.some((entry) => entry.key === previous)) {
            return previous;
          }
          return next[0]?.key ?? '';
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setEntitlementsError(
          error instanceof Error ? error.message : 'Failed to load entitlements'
        );
      } finally {
        if (!cancelled) {
          setEntitlementsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  useEffect(() => {
    if (!activeRequest || activeRequest.status !== 'pending') {
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;

    const pollStatus = async () => {
      setIsPolling(true);
      try {
        const response = await fetch(
          `${API_ORIGIN}/auth/elevation/status/${encodeURIComponent(activeRequest.id)}`,
          {
            credentials: 'include',
          }
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { request?: ElevationRequest };
        if (cancelled || !payload.request) {
          return;
        }

        setActiveRequest(payload.request);
      } finally {
        if (!cancelled) {
          setIsPolling(false);
          timerId = window.setTimeout(() => {
            void pollStatus();
          }, 3500);
        }
      }
    };

    void pollStatus();

    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [activeRequest]);

  useEffect(() => {
    if (!activeRequest || activeRequest.status !== 'granted') {
      return;
    }

    if (lastGrantedRequestIdRef.current === activeRequest.id) {
      return;
    }

    lastGrantedRequestIdRef.current = activeRequest.id;
    onElevationGranted?.();
  }, [activeRequest, onElevationGranted]);

  const submitElevationRequest = async (): Promise<void> => {
    if (!selectedEntitlementKey || isSubmitting) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_ORIGIN}/auth/elevation/request`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          entitlementKey: selectedEntitlementKey,
          justification: justification.trim() || undefined,
          durationMinutes: selectedEntitlement?.maxDurationMinutes,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        request?: ElevationRequest;
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to submit elevation request');
      }

      if (payload?.request) {
        setActiveRequest(payload.request);
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <aside className={styles.finderSidebar} aria-label="Workspace sidebar">
      <section>
        <p className={styles.finderSidebarTitle}>Session</p>
        <div className={styles.finderMeta}>
          <span>Provider</span>
          <strong>{provider ?? '-'}</strong>
        </div>
        <div className={styles.finderMeta}>
          <span>User</span>
          <strong>{userEmail ?? 'Not signed in'}</strong>
        </div>
        <div className={styles.finderMeta}>
          <span>Path</span>
          <strong>{selectedPath || '/'}</strong>
        </div>
        <div className={styles.finderMeta}>
          <span>Active Elevation</span>
          {elevationSources.length === 0 ? (
            <strong>none</strong>
          ) : (
            <div className={styles.elevationSourceList}>
              {elevationSources.map((source) => (
                <p
                  key={`${source.entitlementKey}:${source.target}`}
                  className={styles.elevationSourceItem}
                >
                  <strong>{source.entitlementKey}</strong>
                  <span>
                    {source.provider} · {source.target}
                  </span>
                  <span>grants: {source.permissions.join(', ')}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <p className={styles.finderSidebarTitle}>Permissions</p>
        <div className={styles.permissionChips}>
          {permissions.length > 0 ? (
            permissions.map((permission) => (
              <span key={permission} className={styles.permissionChip}>
                {permission}
              </span>
            ))
          ) : (
            <span className={`${styles.permissionChip} ${styles.permissionChipEmpty}`}>none</span>
          )}
        </div>
      </section>

      <section>
        <p className={styles.finderSidebarTitle}>Temporary Access</p>
        {!authenticated ? (
          <p className={styles.state}>Sign in to request elevation.</p>
        ) : entitlementsLoading ? (
          <p className={styles.state}>Loading entitlements...</p>
        ) : entitlementsError ? (
          <p className={`${styles.state} ${styles.stateError}`}>{entitlementsError}</p>
        ) : entitlements.length === 0 ? (
          <p className={styles.state}>No requestable entitlements configured.</p>
        ) : (
          <div className={styles.elevationCard}>
            <label className={styles.elevationLabel} htmlFor="elevation-entitlement-select">
              Entitlement
            </label>
            <select
              id="elevation-entitlement-select"
              className={styles.elevationSelect}
              value={selectedEntitlementKey}
              onChange={(event) => {
                setSelectedEntitlementKey(event.target.value);
                setSubmitError(null);
              }}
            >
              {entitlements.map((entitlement) => (
                <option key={entitlement.key} value={entitlement.key}>
                  {entitlement.key}
                </option>
              ))}
            </select>

            <p className={styles.elevationHint}>
              Duration: up to {selectedEntitlement?.maxDurationMinutes ?? '-'} min
            </p>
            <p className={styles.elevationHint}>
              Grants: {selectedEntitlement?.permissions.join(', ') ?? '-'}
            </p>

            <label className={styles.elevationLabel} htmlFor="elevation-justification-input">
              Justification{' '}
              {selectedEntitlement?.requiresJustification ? '(required)' : '(optional)'}
            </label>
            <textarea
              id="elevation-justification-input"
              className={styles.elevationTextarea}
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              placeholder="Reason for temporary elevation"
              rows={3}
            />

            {submitError ? (
              <p className={`${styles.state} ${styles.stateError}`}>{submitError}</p>
            ) : null}

            <Button
              variant="muted"
              disabled={
                isSubmitting ||
                (selectedEntitlement?.requiresJustification && !justification.trim())
              }
              onClick={() => {
                void submitElevationRequest();
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Request Elevated Access'}
            </Button>

            {activeRequest ? (
              <div className={styles.elevationStatusCard}>
                <p className={styles.elevationStatusTitle}>Latest Request</p>
                <p className={styles.elevationHint}>Entitlement: {activeRequest.entitlementKey}</p>
                <p className={styles.elevationHint}>
                  Status:{' '}
                  <strong
                    className={
                      activeRequest.status === 'granted'
                        ? styles.elevationStatusGranted
                        : activeRequest.status === 'pending'
                          ? styles.elevationStatusPending
                          : styles.elevationStatusDenied
                    }
                  >
                    {activeRequest.status}
                  </strong>
                  {isPolling && activeRequest.status === 'pending' ? ' (refreshing...)' : ''}
                </p>
                {activeRequest.expiresAt ? (
                  <p className={styles.elevationHint}>
                    Expires: {new Date(activeRequest.expiresAt).toLocaleString()}
                  </p>
                ) : null}
                {activeRequest.message ? (
                  <p className={styles.elevationHint}>{activeRequest.message}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </section>
    </aside>
  );
};
