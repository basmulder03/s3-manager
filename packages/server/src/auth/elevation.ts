import { config } from '@/config';
import { getLogger } from '@/telemetry';
import type { AuthUser } from '@/auth/types';

// Re-export all public types
export type {
  SupportedElevationProvider,
  ElevationRequestStatus,
  ElevationEntitlementView,
  ElevationRequestView,
  MockElevationState,
} from './elevation/types';

// Re-export error utilities
export { isElevationError } from './elevation/error';

// Internal imports
import type { StoredRequest, ProviderRequestResult } from './elevation/types';
import { ElevationError } from './elevation/error';
import {
  getRequest,
  setRequest,
  getAllRequests,
  clearStore,
  isRequestActive,
  toView,
} from './elevation/store';
import { currentProvider, dedupePermissions, dedupeElevationSources } from './elevation/utils';
import { requestElevation, fetchStatus } from './elevation/providers';

const authLogger = () => getLogger('AuthElevation');

export const listElevationEntitlements = () => {
  if (config.pim.devMockEnabled || config.localDevMode) {
    return config.pim.entitlements.map((entry) => ({
      key: entry.key,
      provider: entry.provider,
      target: entry.target,
      maxDurationMinutes: entry.maxDurationMinutes,
      permissions: entry.permissions,
      requiresJustification: entry.requireJustification,
    }));
  }

  const provider = currentProvider();

  return config.pim.entitlements
    .filter((entry) => entry.provider === provider)
    .map((entry) => ({
      key: entry.key,
      provider: entry.provider,
      target: entry.target,
      maxDurationMinutes: entry.maxDurationMinutes,
      permissions: entry.permissions,
      requiresJustification: entry.requireJustification,
    }));
};

export const submitElevationRequest = async (params: {
  user: AuthUser;
  entitlementKey: string;
  justification?: string;
  durationMinutes?: number;
}) => {
  if (!config.pim.enabled) {
    throw new ElevationError(400, 'Elevation is not enabled');
  }

  const entitlement = config.pim.entitlements.find((entry) => entry.key === params.entitlementKey);
  if (!entitlement) {
    throw new ElevationError(400, `Unknown entitlement '${params.entitlementKey}'`);
  }

  const provider =
    config.pim.devMockEnabled || config.localDevMode ? entitlement.provider : currentProvider();

  if (!config.pim.devMockEnabled && !config.localDevMode && entitlement.provider !== provider) {
    throw new ElevationError(
      400,
      `Entitlement '${params.entitlementKey}' requires provider '${entitlement.provider}'`
    );
  }

  const justification = params.justification?.trim();
  if (!justification) {
    throw new ElevationError(400, 'Justification is required');
  }

  const requested = params.durationMinutes ?? entitlement.maxDurationMinutes;
  const durationMinutes = Math.max(1, Math.min(requested, entitlement.maxDurationMinutes));

  const alreadyActive = getAllRequests().some(
    (request) =>
      request.userId === params.user.id &&
      request.entitlementKey === entitlement.key &&
      isRequestActive(request)
  );

  if (alreadyActive) {
    throw new ElevationError(409, `Entitlement '${entitlement.key}' is already active or pending`);
  }

  let providerResult: ProviderRequestResult;
  if (config.pim.devMockEnabled || config.localDevMode) {
    providerResult = {
      providerRequestId: `mock-${crypto.randomUUID()}`,
      status: 'granted',
      expiresAt: new Date(Date.now() + durationMinutes * 60_000).toISOString(),
      message: 'Granted by mock PIM provider',
    };
  } else {
    providerResult = await requestElevation({
      provider,
      token: params.user.token,
      user: params.user,
      target: entitlement.target,
      durationMinutes,
      justification,
    });
  }

  const id = crypto.randomUUID();
  const requestedAt = new Date().toISOString();
  const request: StoredRequest = {
    id,
    userId: params.user.id,
    userEmail: params.user.email,
    entitlementKey: entitlement.key,
    provider,
    target: entitlement.target,
    permissions: entitlement.permissions,
    durationMinutes,
    requestedAt,
    justification,
    providerRequestId: providerResult.providerRequestId,
    status: providerResult.status,
    message: providerResult.message,
    expiresAt: providerResult.expiresAt,
  };

  setRequest(id, request);

  authLogger().info(
    {
      userId: request.userId,
      userEmail: request.userEmail,
      entitlementKey: request.entitlementKey,
      provider: request.provider,
      providerRequestId: request.providerRequestId,
      status: request.status,
      expiresAt: request.expiresAt,
    },
    'Elevation request submitted'
  );

  return toView(request);
};

export const getElevationRequestStatus = async (params: { user: AuthUser; requestId: string }) => {
  const request = getRequest(params.requestId);
  if (!request) {
    throw new ElevationError(404, 'Elevation request not found');
  }

  if (request.userId !== params.user.id) {
    throw new ElevationError(403, 'Not allowed to view this elevation request');
  }

  if (!request.providerRequestId) {
    return toView(request);
  }

  if (config.pim.devMockEnabled || config.localDevMode) {
    return toView(request);
  }

  if (request.status === 'granted' || request.status === 'denied' || request.status === 'error') {
    return toView(request);
  }

  const statusResult = await fetchStatus({
    provider: request.provider,
    token: params.user.token,
    providerRequestId: request.providerRequestId,
  });

  request.status = statusResult.status;
  request.message = statusResult.message;
  request.expiresAt = statusResult.expiresAt ?? request.expiresAt;

  authLogger().debug(
    {
      requestId: request.id,
      providerRequestId: request.providerRequestId,
      status: request.status,
      expiresAt: request.expiresAt,
    },
    'Updated elevation request status'
  );

  return toView(request);
};

export const deactivateElevation = async (params: {
  user: AuthUser;
  entitlementKey: string;
}): Promise<{ revoked: number }> => {
  const entitlementKey = params.entitlementKey.trim();
  if (!entitlementKey) {
    throw new ElevationError(400, 'entitlementKey is required');
  }

  if (!config.pim.devMockEnabled && !config.localDevMode) {
    throw new ElevationError(400, 'Manual deactivation is not supported for this provider mode');
  }

  let revoked = 0;
  for (const request of getAllRequests()) {
    if (request.userId !== params.user.id || request.entitlementKey !== entitlementKey) {
      continue;
    }

    if (!isRequestActive(request)) {
      continue;
    }

    request.status = 'denied';
    request.message = 'Revoked by user';
    request.expiresAt = new Date().toISOString();
    revoked += 1;
  }

  if (revoked === 0) {
    throw new ElevationError(404, 'No active elevation found for entitlement');
  }

  authLogger().info(
    {
      userId: params.user.id,
      userEmail: params.user.email,
      entitlementKey,
      revoked,
    },
    'Elevation revoked by user'
  );

  return { revoked };
};

export const resetElevationStoreForTests = (): void => {
  clearStore();
};

export const resolveMockElevationStateForUser = (userId: string) => {
  if (!config.pim.devMockEnabled && !config.localDevMode) {
    return {
      permissions: [],
      elevationSources: [],
    };
  }

  const now = Date.now();
  const active = getAllRequests().filter((request) => {
    if (request.userId !== userId || request.status !== 'granted') {
      return false;
    }

    if (!request.expiresAt) {
      return true;
    }

    const expiresAt = Date.parse(request.expiresAt);
    return Number.isNaN(expiresAt) || expiresAt > now;
  });

  if (active.length === 0) {
    return {
      permissions: [],
      elevationSources: [],
    };
  }

  const permissions = dedupePermissions(active.flatMap((request) => request.permissions));
  const elevationSources = dedupeElevationSources(
    active.map((request) => ({
      entitlementKey: request.entitlementKey,
      provider: request.provider,
      target: request.target,
      permissions: request.permissions,
      expiresAt: request.expiresAt,
    }))
  );

  return {
    permissions,
    elevationSources,
  };
};
