import type { Permission } from '@/trpc';

export interface ElevationSource {
  entitlementKey: string;
  provider: 'azure' | 'google';
  target: string;
  permissions: Permission[];
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: Permission[];
  elevationSources: ElevationSource[];
  provider: string;
  token: string;
}

export interface VerifiedToken {
  subject: string;
  issuer: string;
  audience: string[];
  email: string;
  name: string;
  roles: string[];
  groups: string[];
  claims: Record<string, unknown>;
}
