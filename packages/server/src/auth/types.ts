import type { Permission } from '@/trpc';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: Permission[];
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
