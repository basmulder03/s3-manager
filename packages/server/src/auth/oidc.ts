import { config } from '../config';
import { providerName, resolveAudience, resolveIssuer } from './provider';

interface OidcDiscoveryDocument {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
  introspection_endpoint?: string;
}

interface OidcTokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

const discoveryCache = new Map<string, OidcDiscoveryDocument>();

const ensureTokenResponse = (tokenResponse: Partial<OidcTokenResponse>): OidcTokenResponse => {
  if (!tokenResponse.access_token) {
    throw new Error('Token response is missing access_token');
  }

  return {
    access_token: tokenResponse.access_token,
    id_token: tokenResponse.id_token,
    refresh_token: tokenResponse.refresh_token,
    expires_in: tokenResponse.expires_in,
    token_type: tokenResponse.token_type,
  };
};

const scopesByProvider = (): string => {
  switch (providerName()) {
    case 'keycloak':
      return config.keycloak.scopes;
    case 'azure':
    case 'azuread':
      return config.azure.scopes.join(' ');
    case 'google':
      return config.google.scopes;
    default:
      return 'openid profile email';
  }
};

const clientCredentials = (): { clientId: string; clientSecret: string } => {
  switch (providerName()) {
    case 'keycloak':
      return {
        clientId: config.keycloak.clientId,
        clientSecret: config.keycloak.clientSecret,
      };
    case 'azure':
    case 'azuread':
      return {
        clientId: config.azure.clientId,
        clientSecret: config.azure.clientSecret,
      };
    case 'google':
      return {
        clientId: config.google.clientId,
        clientSecret: config.google.clientSecret,
      };
    default:
      throw new Error(`Unsupported provider '${providerName()}'`);
  }
};

export const discoverOidcConfig = async (): Promise<OidcDiscoveryDocument> => {
  const issuer = resolveIssuer();
  if (!issuer) {
    throw new Error('OIDC issuer is not configured');
  }

  const cached = discoveryCache.get(issuer);
  if (cached) {
    return cached;
  }

  const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
  const response = await fetch(discoveryUrl);
  if (!response.ok) {
    throw new Error(`Failed to discover OIDC configuration (${response.status})`);
  }

  const json = (await response.json()) as Partial<OidcDiscoveryDocument>;
  if (!json.authorization_endpoint || !json.token_endpoint) {
    throw new Error('OIDC discovery document is missing required endpoints');
  }

  const document: OidcDiscoveryDocument = {
    authorization_endpoint: json.authorization_endpoint,
    token_endpoint: json.token_endpoint,
    userinfo_endpoint: json.userinfo_endpoint,
    end_session_endpoint: json.end_session_endpoint,
    revocation_endpoint: json.revocation_endpoint,
    introspection_endpoint: json.introspection_endpoint,
  };

  discoveryCache.set(issuer, document);
  return document;
};

export const buildAuthorizationUrl = async (params: {
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): Promise<string> => {
  const discovery = await discoverOidcConfig();
  const audience = resolveAudience();
  const { clientId } = clientCredentials();

  const query = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: params.redirectUri,
    scope: scopesByProvider(),
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
  });

  if (audience && providerName() === 'azure') {
    query.set('resource', audience);
  }

  return `${discovery.authorization_endpoint}?${query.toString()}`;
};

export const exchangeAuthorizationCode = async (params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<OidcTokenResponse> => {
  const discovery = await discoverOidcConfig();
  const { clientId, clientSecret } = clientCredentials();

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: params.codeVerifier,
  });

  const response = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${body}`);
  }

  const tokenResponse = (await response.json()) as Partial<OidcTokenResponse>;
  return ensureTokenResponse(tokenResponse);
};

export const refreshAccessToken = async (params: {
  refreshToken: string;
}): Promise<OidcTokenResponse> => {
  const discovery = await discoverOidcConfig();
  const { clientId, clientSecret } = clientCredentials();

  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${body}`);
  }

  const tokenResponse = (await response.json()) as Partial<OidcTokenResponse>;
  return ensureTokenResponse(tokenResponse);
};

export const buildLogoutUrl = async (params: {
  postLogoutRedirectUri: string;
  idTokenHint?: string;
}): Promise<string | null> => {
  const discovery = await discoverOidcConfig();
  if (discovery.end_session_endpoint) {
    const { clientId } = clientCredentials();
    const query = new URLSearchParams({
      post_logout_redirect_uri: params.postLogoutRedirectUri,
      client_id: clientId,
    });

    if (params.idTokenHint) {
      query.set('id_token_hint', params.idTokenHint);
    }

    return `${discovery.end_session_endpoint}?${query.toString()}`;
  }

  if (providerName() === 'azure' || providerName() === 'azuread') {
    if (!config.azure.tenantId) {
      return params.postLogoutRedirectUri;
    }

    const query = new URLSearchParams({
      post_logout_redirect_uri: params.postLogoutRedirectUri,
    });

    return `https://login.microsoftonline.com/${config.azure.tenantId}/oauth2/v2.0/logout?${query.toString()}`;
  }

  if (providerName() === 'google') {
    const query = new URLSearchParams({
      continue: params.postLogoutRedirectUri,
    });

    return `https://accounts.google.com/Logout?${query.toString()}`;
  }

  const issuer = resolveIssuer();
  return issuer ? `${issuer}/logout` : null;
};

export const revokeToken = async (params: {
  token: string;
  tokenTypeHint?: 'access_token' | 'refresh_token';
}): Promise<boolean> => {
  const discovery = await discoverOidcConfig();
  if (!discovery.revocation_endpoint) {
    return false;
  }

  const { clientId, clientSecret } = clientCredentials();
  const form = new URLSearchParams({
    token: params.token,
    client_id: clientId,
    client_secret: clientSecret,
  });

  if (params.tokenTypeHint) {
    form.set('token_type_hint', params.tokenTypeHint);
  }

  const response = await fetch(discovery.revocation_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token revocation failed (${response.status})`);
  }

  return true;
};

export interface IntrospectionResult {
  active: boolean;
  scope?: string;
  username?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  aud?: string | string[];
  iss?: string;
}

export const introspectToken = async (params: {
  token: string;
}): Promise<IntrospectionResult | null> => {
  const discovery = await discoverOidcConfig();
  if (!discovery.introspection_endpoint) {
    return null;
  }

  const { clientId, clientSecret } = clientCredentials();
  const form = new URLSearchParams({
    token: params.token,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(discovery.introspection_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token introspection failed (${response.status})`);
  }

  const json = (await response.json()) as Partial<IntrospectionResult>;
  return {
    active: json.active === true,
    scope: json.scope,
    username: json.username,
    sub: json.sub,
    exp: json.exp,
    iat: json.iat,
    aud: json.aud,
    iss: json.iss,
  };
};
