import { config } from '../config';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const keycloakIssuer = (): string => {
  const server = trimTrailingSlash(config.keycloak.serverUrl);
  return `${server}/realms/${config.keycloak.realm}`;
};

const azureIssuer = (): string | undefined => {
  if (!config.azure.tenantId) {
    return undefined;
  }
  return `https://login.microsoftonline.com/${config.azure.tenantId}/v2.0`;
};

const googleIssuer = (): string => 'https://accounts.google.com';

export const resolveIssuer = (): string | undefined => {
  if (config.auth.issuer) {
    return trimTrailingSlash(config.auth.issuer);
  }

  switch (config.oidcProvider) {
    case 'keycloak':
      return keycloakIssuer();
    case 'azure':
    case 'azuread':
      return azureIssuer();
    case 'google':
      return googleIssuer();
    default:
      return undefined;
  }
};

export const resolveAudience = (): string | undefined => {
  if (config.auth.audience) {
    return config.auth.audience;
  }

  switch (config.oidcProvider) {
    case 'keycloak':
      return config.keycloak.clientId;
    case 'azure':
    case 'azuread':
      return config.azure.clientId || undefined;
    case 'google':
      return config.google.clientId || undefined;
    default:
      return undefined;
  }
};

export const providerName = (): string => config.oidcProvider;
