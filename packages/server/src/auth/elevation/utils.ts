import { config } from '@/config';
import type { Permission } from '@/trpc';
import type { ElevationSource } from '@/auth/types';
import type { SupportedElevationProvider, ElevationRequestStatus } from './types';
import { ElevationError } from './error';

export const dedupePermissions = (permissions: Permission[]): Permission[] => {
  return Array.from(new Set(permissions));
};

export const dedupeElevationSources = (sources: ElevationSource[]): ElevationSource[] => {
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

export const parseStatus = (value: string | undefined): ElevationRequestStatus => {
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

export const ensureProviderToken = (token: string): void => {
  if (!token || token.trim().length === 0) {
    throw new ElevationError(401, 'Provider access token is required for elevation request');
  }
};

export const currentProvider = (): SupportedElevationProvider => {
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
