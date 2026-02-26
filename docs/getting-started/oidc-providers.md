# OIDC Providers

S3 Manager supports these OIDC providers in the TypeScript backend:
- `keycloak`
- `azure` / `azuread`
- `google`

Configure provider values in `.env` / `.env.local`.

## Common Settings

```env
OIDC_PROVIDER=keycloak
AUTH_REQUIRED=true
AUTH_ROLES_CLAIM=roles
DEFAULT_ROLE=S3-Viewer
```

## Keycloak

```env
OIDC_PROVIDER=keycloak
KEYCLOAK_SERVER_URL=https://keycloak.example.com
KEYCLOAK_REALM=s3-manager
KEYCLOAK_CLIENT_ID=s3-manager-client
KEYCLOAK_CLIENT_SECRET=...
KEYCLOAK_SCOPES=openid profile email
```

## Azure AD / Entra ID

```env
OIDC_PROVIDER=azure
AZURE_AD_TENANT_ID=...
AZURE_AD_CLIENT_ID=...
AZURE_AD_CLIENT_SECRET=...
```

## Google

```env
OIDC_PROVIDER=google
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_SCOPES=openid profile email
```

## Local Development Mode

To bypass OIDC in local development:

```env
LOCAL_DEV_MODE=true
AUTH_REQUIRED=false
DEFAULT_ROLE=S3-Admin
```

## Notes

- Auth cookies and OIDC callback/logout routes are implemented under `packages/server/src/http/auth.ts`.
- Token verification and provider discovery are implemented under `packages/server/src/auth/`.
