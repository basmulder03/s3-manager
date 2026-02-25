import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { config } from '@/config';
import { getLogger } from '@/telemetry';
import { providerName, resolveAudience, resolveIssuer } from '@/auth/provider';
import type { VerifiedToken } from '@/auth/types';

const authLogger = () => getLogger('Auth');

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const jwksUriByIssuer = new Map<string, string>();

const asString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  }

  if (typeof value === 'string' && value.length > 0) {
    return [value];
  }

  return [];
};

const extractRoles = (payload: JWTPayload): string[] => {
  const configuredClaim = config.auth.rolesClaim;
  const directRoles = asStringArray(payload[configuredClaim]);
  if (directRoles.length > 0) {
    return Array.from(new Set(directRoles));
  }

  const realmAccess = payload.realm_access;
  if (typeof realmAccess === 'object' && realmAccess !== null) {
    const realmRoles = asStringArray((realmAccess as Record<string, unknown>).roles);
    if (realmRoles.length > 0) {
      return Array.from(new Set(realmRoles));
    }
  }

  return [];
};

const extractAudience = (aud: JWTPayload['aud']): string[] => {
  if (Array.isArray(aud)) {
    return aud.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }

  if (typeof aud === 'string' && aud.length > 0) {
    return [aud];
  }

  return [];
};

const resolveJwksUri = async (issuer: string): Promise<string> => {
  const cached = jwksUriByIssuer.get(issuer);
  if (cached) {
    return cached;
  }

  const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
  const response = await fetch(discoveryUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch OIDC discovery document (${response.status})`);
  }

  const json = await response.json();
  const jwksUri = asString((json as Record<string, unknown>).jwks_uri);
  if (!jwksUri) {
    throw new Error('OIDC discovery document does not include jwks_uri');
  }

  jwksUriByIssuer.set(issuer, jwksUri);
  return jwksUri;
};

const getJwks = async (issuer: string) => {
  const existing = jwksByIssuer.get(issuer);
  if (existing) {
    return existing;
  }

  const jwksUri = await resolveJwksUri(issuer);
  const created = createRemoteJWKSet(new URL(jwksUri));
  jwksByIssuer.set(issuer, created);
  return created;
};

const ensureIssuerAndAudience = (): { issuer: string; audience: string } => {
  const issuer = resolveIssuer();
  const audience = resolveAudience();

  if (!issuer) {
    throw new Error('Auth issuer is not configured');
  }

  if (!audience) {
    throw new Error('Auth audience is not configured');
  }

  return {
    issuer,
    audience,
  };
};

export const verifyAccessToken = async (token: string): Promise<VerifiedToken> => {
  const { issuer, audience } = ensureIssuerAndAudience();
  const jwks = await getJwks(issuer);

  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience,
    clockTolerance: config.auth.clockToleranceSeconds,
  });

  const subject = asString(payload.sub);
  if (!subject) {
    throw new Error('Token missing subject (sub)');
  }

  const email = asString(payload.email) ?? asString(payload.preferred_username) ?? '';
  const name = (asString(payload.name) ?? email) || subject;
  const roles = extractRoles(payload);

  return {
    subject,
    issuer,
    audience: extractAudience(payload.aud),
    email,
    name,
    roles,
    claims: payload as Record<string, unknown>,
  };
};

export const safeVerifyAccessToken = async (token: string): Promise<VerifiedToken | null> => {
  try {
    return await verifyAccessToken(token);
  } catch (error) {
    authLogger().warn(
      {
        err: error,
        provider: providerName(),
      },
      'Access token verification failed'
    );
    return null;
  }
};
