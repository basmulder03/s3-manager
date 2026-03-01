import { config } from '@/config';
import { getLogger } from '@/telemetry';
import type { AuthUser, ElevationSource } from '@/auth/types';
import type { Permission } from '@/trpc';

const authLogger = () => getLogger('AuthElevation');

type SupportedElevationProvider = 'azure' | 'google';
type ElevationRequestStatus = 'pending' | 'granted' | 'denied' | 'error';

interface ProviderRequestResult {
  providerRequestId: string;
  status: ElevationRequestStatus;
  message?: string;
  expiresAt?: string;
}

interface StoredRequest {
  id: string;
  userId: string;
  userEmail: string;
  entitlementKey: string;
  provider: SupportedElevationProvider;
  target: string;
  permissions: Permission[];
  durationMinutes: number;
  requestedAt: string;
  justification?: string;
  providerRequestId?: string;
  status: ElevationRequestStatus;
  message?: string;
  expiresAt?: string;
}

export interface ElevationEntitlementView {
  key: string;
  provider: SupportedElevationProvider;
  target: string;
  maxDurationMinutes: number;
  permissions: Permission[];
  requiresJustification: boolean;
}

export interface ElevationRequestView {
  id: string;
  entitlementKey: string;
  provider: SupportedElevationProvider;
  target: string;
  permissions: Permission[];
  durationMinutes: number;
  requestedAt: string;
  status: ElevationRequestStatus;
  message?: string;
  expiresAt?: string;
}

export interface MockElevationState {
  permissions: Permission[];
  elevationSources: ElevationSource[];
}

class ElevationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ElevationError';
    this.status = status;
  }
}

const requestStore = new Map<string, StoredRequest>();

const dedupePermissions = (permissions: Permission[]): Permission[] => {
  return Array.from(new Set(permissions));
};

const dedupeElevationSources = (sources: ElevationSource[]): ElevationSource[] => {
  const merged = new Map<string, ElevationSource>();

  for (const source of sources) {
    const key = `${source.entitlementKey}:${source.provider}:${source.target}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...source,
        permissions: dedupePermissions(source.permissions),
      });
      continue;
    }

    existing.permissions = dedupePermissions([...existing.permissions, ...source.permissions]);
  }

  return Array.from(merged.values());
};

const isRequestActive = (request: StoredRequest): boolean => {
  if (request.status === 'pending') {
    return true;
  }

  if (request.status !== 'granted') {
    return false;
  }

  if (!request.expiresAt) {
    return true;
  }

  const expiresAt = Date.parse(request.expiresAt);
  return Number.isNaN(expiresAt) || expiresAt > Date.now();
};

const currentProvider = (): SupportedElevationProvider => {
  if (config.oidcProvider === 'azure' || config.oidcProvider === 'azuread') {
    return 'azure';
  }

  if (config.oidcProvider === 'google') {
    return 'google';
  }

  throw new ElevationError(
    400,
    `Elevation is only supported for Azure AD and Google providers (current: ${config.oidcProvider})`
  );
};

const toView = (entry: StoredRequest): ElevationRequestView => {
  return {
    id: entry.id,
    entitlementKey: entry.entitlementKey,
    provider: entry.provider,
    target: entry.target,
    permissions: entry.permissions,
    durationMinutes: entry.durationMinutes,
    requestedAt: entry.requestedAt,
    status: entry.status,
    message: entry.message,
    expiresAt: entry.expiresAt,
  };
};

const parseStatus = (value: string | undefined): ElevationRequestStatus => {
  const normalized = value?.toLowerCase();

  if (!normalized) {
    return 'pending';
  }

  if (
    normalized === 'granted' ||
    normalized === 'approved' ||
    normalized === 'provisioned' ||
    normalized === 'active'
  ) {
    return 'granted';
  }

  if (
    normalized === 'denied' ||
    normalized === 'rejected' ||
    normalized === 'revoked' ||
    normalized === 'canceled' ||
    normalized === 'cancelled'
  ) {
    return 'denied';
  }

  if (normalized === 'failed' || normalized === 'error') {
    return 'error';
  }

  return 'pending';
};

const ensureProviderToken = (token: string): void => {
  if (!token || token.trim().length === 0) {
    throw new ElevationError(401, 'Provider access token is required for elevation request');
  }
};

const ensureAzureEligibility = async (params: {
  token: string;
  principalId: string;
  groupId: string;
}): Promise<void> => {
  const filter = `principalId eq '${params.principalId}' and groupId eq '${params.groupId}'`;
  const url = new URL(config.pim.azure.eligibilityScheduleApi);
  url.searchParams.set('$filter', filter);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ElevationError(
      502,
      `Failed to verify Azure PIM eligibility (${response.status}): ${body || 'unknown error'}`
    );
  }

  const payload = (await response.json()) as {
    value?: Array<Record<string, unknown>>;
  };

  if (!payload.value || payload.value.length === 0) {
    throw new ElevationError(403, 'User is not eligible for this Azure PIM entitlement');
  }
};

const requestAzureElevation = async (params: {
  token: string;
  user: AuthUser;
  groupId: string;
  justification?: string;
  durationMinutes: number;
}): Promise<ProviderRequestResult> => {
  ensureProviderToken(params.token);
  await ensureAzureEligibility({
    token: params.token,
    principalId: params.user.id,
    groupId: params.groupId,
  });

  const scheduleInfo = {
    startDateTime: new Date().toISOString(),
    expiration: {
      type: 'afterDuration',
      duration: `PT${params.durationMinutes}M`,
    },
  };

  const response = await fetch(config.pim.azure.assignmentScheduleRequestApi, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      action: 'selfActivate',
      principalId: params.user.id,
      groupId: params.groupId,
      accessId: 'member',
      justification: params.justification,
      scheduleInfo,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ElevationError(
      502,
      `Azure PIM elevation request failed (${response.status}): ${body || 'unknown error'}`
    );
  }

  const payload = (await response.json()) as {
    id?: string;
    status?: string;
    scheduleInfo?: {
      expiration?: {
        endDateTime?: string;
      };
    };
  };

  return {
    providerRequestId: payload.id ?? crypto.randomUUID(),
    status: parseStatus(payload.status),
    expiresAt: payload.scheduleInfo?.expiration?.endDateTime,
    message: payload.status ? `Azure request status: ${payload.status}` : undefined,
  };
};

const requestGoogleElevation = async (params: {
  token: string;
  user: AuthUser;
  groupResourceName: string;
  durationMinutes: number;
}): Promise<ProviderRequestResult> => {
  ensureProviderToken(params.token);

  const expiration = new Date(Date.now() + params.durationMinutes * 60_000).toISOString();
  const target = params.groupResourceName;
  const endpoint = `${config.pim.google.membershipsApiBase}/${target}/memberships`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      preferredMemberKey: {
        id: params.user.email,
      },
      roles: [
        {
          name: 'MEMBER',
          expiryDetail: {
            expireTime: expiration,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ElevationError(
      502,
      `Google Cloud Identity elevation request failed (${response.status}): ${body || 'unknown error'}`
    );
  }

  const payload = (await response.json()) as {
    name?: string;
    done?: boolean;
    error?: {
      message?: string;
    };
  };

  if (payload.error?.message) {
    return {
      providerRequestId: payload.name ?? crypto.randomUUID(),
      status: 'error',
      message: payload.error.message,
      expiresAt: expiration,
    };
  }

  return {
    providerRequestId: payload.name ?? crypto.randomUUID(),
    status: payload.done ? 'granted' : 'pending',
    expiresAt: expiration,
  };
};

const fetchAzureStatus = async (params: {
  token: string;
  providerRequestId: string;
}): Promise<ProviderRequestResult> => {
  const response = await fetch(
    `${config.pim.azure.assignmentScheduleRequestApi}/${encodeURIComponent(params.providerRequestId)}`,
    {
      headers: {
        Authorization: `Bearer ${params.token}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new ElevationError(
      502,
      `Failed to fetch Azure PIM request status (${response.status}): ${body || 'unknown error'}`
    );
  }

  const payload = (await response.json()) as {
    id?: string;
    status?: string;
    scheduleInfo?: {
      expiration?: {
        endDateTime?: string;
      };
    };
  };

  return {
    providerRequestId: payload.id ?? params.providerRequestId,
    status: parseStatus(payload.status),
    expiresAt: payload.scheduleInfo?.expiration?.endDateTime,
    message: payload.status ? `Azure request status: ${payload.status}` : undefined,
  };
};

const fetchGoogleStatus = async (params: {
  token: string;
  providerRequestId: string;
}): Promise<ProviderRequestResult> => {
  const endpoint = `${config.pim.google.operationsApiBase}/${params.providerRequestId}`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ElevationError(
      502,
      `Failed to fetch Google elevation status (${response.status}): ${body || 'unknown error'}`
    );
  }

  const payload = (await response.json()) as {
    name?: string;
    done?: boolean;
    error?: {
      message?: string;
    };
  };

  if (payload.error?.message) {
    return {
      providerRequestId: payload.name ?? params.providerRequestId,
      status: 'error',
      message: payload.error.message,
    };
  }

  return {
    providerRequestId: payload.name ?? params.providerRequestId,
    status: payload.done ? 'granted' : 'pending',
  };
};

export const listElevationEntitlements = (): ElevationEntitlementView[] => {
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
}): Promise<ElevationRequestView> => {
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

  const alreadyActive = Array.from(requestStore.values()).some(
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
    if (provider === 'azure') {
      providerResult = await requestAzureElevation({
        token: params.user.token,
        user: params.user,
        groupId: entitlement.target,
        durationMinutes,
        justification,
      });
    } else {
      providerResult = await requestGoogleElevation({
        token: params.user.token,
        user: params.user,
        groupResourceName: entitlement.target,
        durationMinutes,
      });
    }
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

  requestStore.set(id, request);

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

export const getElevationRequestStatus = async (params: {
  user: AuthUser;
  requestId: string;
}): Promise<ElevationRequestView> => {
  const request = requestStore.get(params.requestId);
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

  const statusResult =
    request.provider === 'azure'
      ? await fetchAzureStatus({
          token: params.user.token,
          providerRequestId: request.providerRequestId,
        })
      : await fetchGoogleStatus({
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
  for (const request of requestStore.values()) {
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

export const isElevationError = (error: unknown): error is ElevationError => {
  return error instanceof ElevationError;
};

export const resetElevationStoreForTests = (): void => {
  requestStore.clear();
};

export const resolveMockElevationStateForUser = (userId: string): MockElevationState => {
  if (!config.pim.devMockEnabled && !config.localDevMode) {
    return {
      permissions: [],
      elevationSources: [],
    };
  }

  const now = Date.now();
  const active = Array.from(requestStore.values()).filter((request) => {
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
