import type { StoredRequest, ElevationRequestView } from './types';

const requestStore = new Map<string, StoredRequest>();

export const getRequest = (id: string): StoredRequest | undefined => {
  return requestStore.get(id);
};

export const setRequest = (id: string, request: StoredRequest): void => {
  requestStore.set(id, request);
};

export const getAllRequests = (): StoredRequest[] => {
  return Array.from(requestStore.values());
};

export const clearStore = (): void => {
  requestStore.clear();
};

export const isRequestActive = (request: StoredRequest): boolean => {
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

export const toView = (entry: StoredRequest): ElevationRequestView => {
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
