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
    expiresAt?: string;
  }>;
  authenticated: boolean;
  showMockBadge: boolean;
  onElevationGranted?: (request: ElevationRequest) => void;
  onElevationRevoked?: (entitlementKey: string) => void;
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
  showMockBadge,
  onElevationGranted,
  onElevationRevoked,
}: FinderSidebarProps) => {
  const [entitlements, setEntitlements] = useState<ElevationEntitlement[]>([]);
  const [entitlementsLoading, setEntitlementsLoading] = useState(false);
  const [temporaryAccessSupported, setTemporaryAccessSupported] = useState(true);
  const [selectedEntitlementKey, setSelectedEntitlementKey] = useState('');
  const [justification, setJustification] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeRequest, setActiveRequest] = useState<ElevationRequest | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isElevationModalOpen, setIsElevationModalOpen] = useState(false);
  const [isRevokingEntitlementKey, setIsRevokingEntitlementKey] = useState('');
  const lastGrantedRequestIdRef = useRef('');

  const selectedEntitlement = useMemo(
    () => entitlements.find((entry) => entry.key === selectedEntitlementKey) ?? null,
    [entitlements, selectedEntitlementKey]
  );
  const selectedEntitlementAlreadyActive =
    selectedEntitlementKey.length > 0 &&
    elevationSources.some((entry) => entry.entitlementKey === selectedEntitlementKey);
  const selectedEntitlementPending =
    activeRequest?.status === 'pending' && activeRequest.entitlementKey === selectedEntitlementKey;

  useEffect(() => {
    if (!authenticated) {
      setEntitlements([]);
      setSelectedEntitlementKey('');
      setTemporaryAccessSupported(true);
      setActiveRequest(null);
      setIsElevationModalOpen(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setEntitlementsLoading(true);
      setTemporaryAccessSupported(true);

      try {
        const response = await fetch(`${API_ORIGIN}/auth/elevation/entitlements`, {
          credentials: 'include',
        });

        if (!response.ok) {
          if (cancelled) {
            return;
          }

          setEntitlements([]);
          setTemporaryAccessSupported(false);
          return;
        }

        const payload = (await response.json()) as {
          entitlements?: ElevationEntitlement[];
        };
        if (cancelled) {
          return;
        }

        const next = payload.entitlements ?? [];
        setEntitlements(next);
        setTemporaryAccessSupported(next.length > 0);
        setSelectedEntitlementKey((previous) => {
          if (previous && next.some((entry) => entry.key === previous)) {
            return previous;
          }
          return next[0]?.key ?? '';
        });
      } catch {
        if (cancelled) {
          return;
        }

        setEntitlements([]);
        setTemporaryAccessSupported(false);
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
    setIsElevationModalOpen(false);
    setSubmitError(null);
    onElevationGranted?.(activeRequest);
  }, [activeRequest, onElevationGranted]);

  const submitElevationRequest = async (): Promise<void> => {
    if (
      !selectedEntitlementKey ||
      isSubmitting ||
      selectedEntitlementAlreadyActive ||
      selectedEntitlementPending
    ) {
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

  const deactivateEntitlement = async (entitlementKey: string): Promise<void> => {
    if (isRevokingEntitlementKey.length > 0) {
      return;
    }

    setSubmitError(null);
    setIsRevokingEntitlementKey(entitlementKey);
    try {
      const response = await fetch(`${API_ORIGIN}/auth/elevation/deactivate`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ entitlementKey }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Failed to deactivate elevated access');
      }

      if (activeRequest?.entitlementKey === entitlementKey) {
        setActiveRequest(null);
      }

      onElevationRevoked?.(entitlementKey);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to deactivate elevated access'
      );
    } finally {
      setIsRevokingEntitlementKey('');
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
        {showMockBadge ? <p className={styles.devMockBadge}>Mock authz mode</p> : null}
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
                  {source.expiresAt ? (
                    <span>expires: {new Date(source.expiresAt).toLocaleString()}</span>
                  ) : null}
                  <Button
                    variant="muted"
                    className={styles.elevationRevokeButton}
                    disabled={isRevokingEntitlementKey.length > 0}
                    onClick={() => {
                      void deactivateEntitlement(source.entitlementKey);
                    }}
                  >
                    {isRevokingEntitlementKey === source.entitlementKey
                      ? 'Turning off...'
                      : 'Turn off'}
                  </Button>
                </p>
              ))}
            </div>
          )}
        </div>
        {authenticated && temporaryAccessSupported ? (
          <Button
            variant="muted"
            className={styles.requestAccessButton}
            onClick={() => setIsElevationModalOpen(true)}
          >
            Request Temporary Access
          </Button>
        ) : null}
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

      {isElevationModalOpen && authenticated && temporaryAccessSupported ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onClick={() => setIsElevationModalOpen(false)}
        >
          <section
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-label="Request temporary access"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Request Temporary Access</h3>
            {entitlementsLoading ? (
              <p className={styles.state}>Loading entitlements...</p>
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
                  Grants: {selectedEntitlement?.permissions.join(', ') ?? '-'}
                </p>

                <label className={styles.elevationLabel} htmlFor="elevation-justification-input">
                  Reason (required)
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

                {selectedEntitlementAlreadyActive ? (
                  <p className={styles.elevationHint}>This entitlement is already active.</p>
                ) : null}
                {selectedEntitlementPending ? (
                  <p className={styles.elevationHint}>
                    A request for this entitlement is still pending.
                  </p>
                ) : null}

                <div className={styles.modalActions}>
                  <Button variant="muted" onClick={() => setIsElevationModalOpen(false)}>
                    Close
                  </Button>
                  <Button
                    variant="default"
                    disabled={
                      isSubmitting ||
                      !justification.trim() ||
                      selectedEntitlementAlreadyActive ||
                      selectedEntitlementPending
                    }
                    onClick={() => {
                      void submitElevationRequest();
                    }}
                  >
                    {isSubmitting ? 'Submitting...' : 'Request Elevated Access'}
                  </Button>
                </div>

                {activeRequest ? (
                  <div className={styles.elevationStatusCard}>
                    <p className={styles.elevationStatusTitle}>Latest Request</p>
                    <p className={styles.elevationHint}>
                      Entitlement: {activeRequest.entitlementKey}
                    </p>
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
        </div>
      ) : null}
    </aside>
  );
};
