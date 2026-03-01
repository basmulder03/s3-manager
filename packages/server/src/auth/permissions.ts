import type { Permission } from '@/trpc';
import { config } from '@/config';

const VALID_PERMISSIONS: Permission[] = ['view', 'write', 'delete', 'manage_properties'];

const dedupePermissions = (values: Permission[]): Permission[] => {
  return Array.from(new Set(values));
};

const normalize = (value: string): string => value.trim().toLowerCase();

const isProviderMatch = (entitlementProvider: 'azure' | 'google'): boolean => {
  if (entitlementProvider === 'azure') {
    return config.oidcProvider === 'azure' || config.oidcProvider === 'azuread';
  }

  return config.oidcProvider === 'google';
};

export const mapRolesAndGroupIdsToPermissions = (
  roles: string[],
  groupIds: string[] = []
): Permission[] => {
  const permissions: Permission[] = [];

  for (const role of roles) {
    const mapped = config.rolePermissions[role] ?? [];
    for (const permission of mapped) {
      if (VALID_PERMISSIONS.includes(permission)) {
        permissions.push(permission);
      }
    }
  }

  if (groupIds.length > 0 && config.pim.entitlements.length > 0) {
    const groupIdSet = new Set(groupIds.map(normalize));

    for (const entitlement of config.pim.entitlements) {
      if (!isProviderMatch(entitlement.provider)) {
        continue;
      }

      if (!groupIdSet.has(normalize(entitlement.target))) {
        continue;
      }

      for (const permission of entitlement.permissions) {
        if (VALID_PERMISSIONS.includes(permission)) {
          permissions.push(permission);
        }
      }
    }
  }

  if (permissions.length === 0) {
    const fallback = config.rolePermissions[config.defaultRole] ?? ['view'];
    for (const permission of fallback) {
      if (VALID_PERMISSIONS.includes(permission)) {
        permissions.push(permission);
      }
    }
  }

  return dedupePermissions(permissions);
};

export const mapRolesToPermissions = (roles: string[]): Permission[] => {
  return mapRolesAndGroupIdsToPermissions(roles, []);
};

export const localDevPermissions = (): Permission[] => {
  return mapRolesToPermissions([config.defaultRole]);
};
