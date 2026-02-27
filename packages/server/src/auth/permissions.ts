import type { Permission } from '@/trpc';
import { config } from '@/config';

const VALID_PERMISSIONS: Permission[] = ['view', 'write', 'delete', 'manage_properties'];

const dedupePermissions = (values: Permission[]): Permission[] => {
  return Array.from(new Set(values));
};

export const mapRolesToPermissions = (roles: string[]): Permission[] => {
  const permissions: Permission[] = [];

  for (const role of roles) {
    const mapped = config.rolePermissions[role] ?? [];
    for (const permission of mapped) {
      if (VALID_PERMISSIONS.includes(permission)) {
        permissions.push(permission);
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

export const localDevPermissions = (): Permission[] => {
  return mapRolesToPermissions([config.defaultRole]);
};
