# Multi-Provider OIDC Authentication Setup

The S3 Manager now supports multiple OIDC providers for authentication. This guide explains how to configure and use different providers.

## Supported Providers

1. **Keycloak** - Recommended for local development (included in docker-compose)
2. **Microsoft Azure AD / Entra ID** - For enterprise environments
3. **Google OAuth** - For Google Workspace integration

## Quick Start (Local Development with Keycloak)

### 1. Start the Development Environment

```bash
docker-compose up -d
```

This starts:
- **Keycloak** on `http://localhost:8090`
- **LocalStack (S3)** on `http://localhost:4566`
- **S3 Manager** on `http://localhost:8080`

### 2. Access the Application

Navigate to `http://localhost:8080` and click "Login with Microsoft" (the button text will be updated to reflect the provider).

### 3. Test Users

Three pre-configured users are available in Keycloak:

| Username | Password   | Role       | Permissions           |
|----------|------------|------------|-----------------------|
| admin    | admin123   | S3-Admin   | view, write, delete   |
| editor   | editor123  | S3-Editor  | view, write           |
| viewer   | viewer123  | S3-Viewer  | view only             |

### 4. Access Keycloak Admin Console

- URL: `http://localhost:8090/admin`
- Username: `admin`
- Password: `admin`

From here you can:
- Create additional users
- Manage roles and permissions
- Configure client settings
- View user sessions

## Provider-Specific Configuration

### Keycloak (Local Development)

**Environment Variables:**
```bash
OIDC_PROVIDER=keycloak
KEYCLOAK_SERVER_URL=http://localhost:8090
KEYCLOAK_REALM=s3-manager
KEYCLOAK_CLIENT_ID=s3-manager-client
KEYCLOAK_CLIENT_SECRET=dev-client-secret-12345
KEYCLOAK_SCOPES=openid profile email
```

**How Roles Work:**
- Roles are defined in Keycloak as Realm Roles
- Users are assigned roles in Keycloak
- Roles are mapped to S3 Manager permissions in `config.py`:
  - `S3-Admin` → view, write, delete
  - `S3-Editor` → view, write
  - `S3-Viewer` → view

### Microsoft Azure AD / Entra ID

**Environment Variables:**
```bash
OIDC_PROVIDER=azure
AZURE_AD_TENANT_ID=your-tenant-id
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_CLIENT_SECRET=your-client-secret
```

**Azure AD App Registration Setup:**

1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App Registrations
2. Create a new registration:
   - Name: `S3 Manager`
   - Redirect URI: `http://localhost:8080/auth/callback` (or your production URL)
3. Copy the Application (client) ID and Directory (tenant) ID
4. Create a client secret under "Certificates & secrets"
5. Add API permissions:
   - Microsoft Graph → `User.Read` (Delegated)
   - Microsoft Graph → `GroupMember.Read.All` (Delegated) - for role mapping
6. Grant admin consent for the permissions

**How Roles Work:**
- Users' Azure AD group memberships are fetched via Microsoft Graph API
- Group display names are mapped to S3 Manager roles
- Example: Create Azure AD groups named `S3-Admin`, `S3-Editor`, `S3-Viewer`

### Google OAuth

**Environment Variables:**
```bash
OIDC_PROVIDER=google
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_SCOPES=openid profile email
```

**Google Cloud Console Setup:**

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Choose "Web application"
6. Add authorized redirect URIs:
   - `http://localhost:8080/auth/callback`
   - `https://yourdomain.com/auth/callback`
7. Copy the Client ID and Client Secret

**How Roles Work:**
- Google OAuth doesn't provide group/role information by default
- Roles are mapped based on email domain in `config.py`
- Example configuration in `config.py`:
  ```python
  GOOGLE_DOMAIN_ROLES = {
      'yourcompany.com': ['S3-Admin'],
      'contractors.yourcompany.com': ['S3-Viewer']
  }
  ```

## Local Development without OIDC (Mock Mode)

For quick local testing without any OIDC provider:

```bash
LOCAL_DEV_MODE=true
DEFAULT_ROLE=S3-Admin
```

This creates a mock user with the specified default role. **Not recommended for production!**

## Role and Permission Mapping

Roles are mapped to permissions in `config.py`:

```python
ROLE_PERMISSIONS = {
    'S3-Viewer': ['view'],
    'S3-Editor': ['view', 'write'],
    'S3-Admin': ['view', 'write', 'delete']
}
```

You can customize this mapping or add new roles as needed.

## Troubleshooting

### Keycloak Connection Issues

If the app can't connect to Keycloak:
1. Ensure Keycloak is healthy: `docker-compose ps`
2. Check Keycloak logs: `docker-compose logs keycloak`
3. Verify `KEYCLOAK_SERVER_URL` uses the correct hostname:
   - Inside Docker: `http://keycloak:8080`
   - From host: `http://localhost:8090`

### Redirect URI Mismatch

Error: "Invalid redirect URI"

**Solution:** Ensure the redirect URI in your OIDC provider matches exactly:
- Keycloak: Update in `scripts/keycloak-realm.json` or via admin console
- Azure AD: Update in App Registration → Authentication
- Google: Update in OAuth 2.0 Client

### No Roles Assigned

If a user logs in but has no permissions:
1. Check that the user has roles assigned in the OIDC provider
2. Verify role names match those in `ROLE_PERMISSIONS`
3. If no roles match, the `DEFAULT_ROLE` is used

### Token Verification Errors

For production deployments, you should implement proper token signature verification:
- Azure AD: Use Microsoft's public keys from JWKS endpoint
- Keycloak: Use Keycloak's JWKS endpoint
- Google: Use Google's public keys

Currently, the implementation uses `verify_signature=False` for development convenience.

## Production Considerations

1. **Use HTTPS**: Set `SESSION_COOKIE_SECURE=true`
2. **Strong Secrets**: Generate secure random secrets for `SECRET_KEY` and client secrets
3. **Token Verification**: Implement proper JWT signature verification
4. **Rate Limiting**: Add rate limiting to auth endpoints
5. **Session Management**: Configure appropriate session timeouts
6. **Audit Logging**: Log all authentication events
7. **Network Security**: Use firewalls and network policies to restrict access

## Adding a New OIDC Provider

To add support for a new OIDC provider:

1. Create a new provider class in `app/auth/oidc_providers.py`:
   ```python
   class MyProvider(OIDCProvider):
       def get_authorization_url(self, redirect_uri: str, state: str) -> str:
           # Implementation
       
       def exchange_code_for_token(self, code: str, redirect_uri: str) -> Dict[str, Any]:
           # Implementation
       
       # ... implement other abstract methods
   ```

2. Register the provider in the `get_oidc_provider()` factory function

3. Add configuration variables in `config.py`

4. Update `.env.example` with new provider settings

5. Test thoroughly with the new provider
