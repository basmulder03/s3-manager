import type { Permission } from '@/trpc';
import { config } from '@/config';
import { getLogger } from '@/telemetry';
import { safeVerifyAccessToken } from '@/auth/jwt';
import { localDevPermissions, mapRolesAndGroupIdsToPermissions } from '@/auth/permissions';
import { providerName } from '@/auth/provider';
import type { AuthUser } from '@/auth/types';

const authLogger = () => getLogger('Auth');

export const ACCESS_TOKEN_COOKIE = 's3_access_token';
export const ID_TOKEN_COOKIE = 's3_id_token';
export const REFRESH_TOKEN_COOKIE = 's3_refresh_token';

const parseCookies = (cookieHeader: string | null): Record<string, string> => {
  if (!cookieHeader) {
    return {};
  }

  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(';');

  for (const pair of pairs) {
    const [rawKey, ...rawValue] = pair.split('=');
    const key = rawKey?.trim();
    const value = rawValue.join('=').trim();

    if (!key || value.length === 0) {
      continue;
    }

    cookies[key] = decodeURIComponent(value);
  }

  return cookies;
};

const extractBearerToken = (authorization: string | null): string | null => {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(' ');
  if (!scheme || !token) {
    return null;
  }

  if (scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  return token.trim().length > 0 ? token.trim() : null;
};

const localDevUser = (): AuthUser => {
  const role = config.defaultRole;
  const permissions = localDevPermissions();
  return {
    id: 'local-dev-user',
    email: 'dev@localhost',
    name: 'Local Developer',
    roles: [role],
    permissions,
    provider: 'local-dev',
    token: 'local-dev-token',
  };
};

export const resolveAuthUser = async (req: Request): Promise<AuthUser | null> => {
  if (config.localDevMode) {
    return localDevUser();
  }

  const tokenFromHeader = extractBearerToken(req.headers.get('authorization'));
  const cookies = parseCookies(req.headers.get('cookie'));
  const tokenFromCookie = cookies[ACCESS_TOKEN_COOKIE] ?? null;
  const token = tokenFromHeader ?? tokenFromCookie;
  if (!token) {
    return null;
  }

  const verified = await safeVerifyAccessToken(token);
  if (!verified) {
    return null;
  }

  const permissions = mapRolesAndGroupIdsToPermissions(verified.roles, verified.groups);

  return {
    id: verified.subject,
    email: verified.email,
    name: verified.name,
    roles: verified.roles,
    permissions,
    provider: providerName(),
    token,
  };
};

export const resolvePermissions = (user: AuthUser | null, req: Request): Permission[] => {
  if (user) {
    return user.permissions;
  }

  if (config.localDevMode) {
    return localDevPermissions();
  }

  if (config.auth.required) {
    return [];
  }

  const fromHeader = req.headers.get('x-user-permissions');
  if (fromHeader) {
    const values = fromHeader
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(
        (value): value is Permission =>
          value === 'view' ||
          value === 'write' ||
          value === 'delete' ||
          value === 'manage_properties'
      );

    if (values.length > 0) {
      return Array.from(new Set(values));
    }
  }

  return ['view'];
};

export const shouldRequireAuth = (): boolean => {
  if (config.localDevMode) {
    return false;
  }
  return config.auth.required;
};

export const logAuthResolution = (user: AuthUser | null): void => {
  if (!user) {
    authLogger().debug('No authenticated user resolved for request context');
    return;
  }

  authLogger().debug(
    {
      subject: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      provider: user.provider,
    },
    'Authenticated user resolved for request context'
  );
};
