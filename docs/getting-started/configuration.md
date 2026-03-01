# S3 Manager Configuration Guide

This guide explains all configuration options available in S3 Manager.

## Table of Contents

1. [Application Configuration](#application-configuration)
2. [Authentication Configuration](#authentication-configuration)
3. [S3/Rook-Ceph Configuration](#s3rook-ceph-configuration)
4. [Role and Permission Configuration](#role-and-permission-configuration)
5. [PIM Configuration](#pim-configuration)
6. [Kubernetes Configuration](#kubernetes-configuration)

## Application Configuration

### Environment Variables

#### SECRET_KEY

**Required**: Yes  
**Type**: String  
**Description**: Secret key used for session encryption  
**Example**: `SECRET_KEY=your-super-secret-key-change-this-in-production`

Generate a secure secret key:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

#### SESSION_COOKIE_SECURE

**Required**: No  
**Type**: Boolean  
**Default**: `false`  
**Description**: Enable secure cookies (HTTPS only)  
**Example**: `SESSION_COOKIE_SECURE=true`

**Note**: Set to `true` in production when using HTTPS.

## Authentication Configuration

### Microsoft Entra ID (Azure AD)

#### AZURE_AD_TENANT_ID

**Required**: Yes  
**Type**: String (UUID)  
**Description**: Azure AD tenant ID  
**Example**: `AZURE_AD_TENANT_ID=12345678-1234-1234-1234-123456789012`

Find your tenant ID:

```bash
az account show --query tenantId -o tsv
```

#### AZURE_AD_CLIENT_ID

**Required**: Yes  
**Type**: String (UUID)  
**Description**: Azure AD application (client) ID  
**Example**: `AZURE_AD_CLIENT_ID=87654321-4321-4321-4321-210987654321`

Get from Azure Portal → App registrations → Your app → Overview

#### AZURE_AD_CLIENT_SECRET

**Required**: Yes  
**Type**: String  
**Description**: Azure AD client secret  
**Example**: `AZURE_AD_CLIENT_SECRET=your-client-secret-value`

Generate from Azure Portal → App registrations → Your app → Certificates & secrets

### App Registration Setup

1. **Redirect URI**: Must be set to `https://your-domain.com/auth/callback`
2. **API Permissions**:
   - Microsoft Graph → User.Read (Delegated)
   - Microsoft Graph → GroupMember.Read.All (Delegated)
3. **Grant admin consent** for all permissions

## S3/Rook-Ceph Configuration

#### S3_ENDPOINT

**Required**: Yes  
**Type**: String (URL)  
**Description**: S3 endpoint URL  
**Example**: `S3_ENDPOINT=http://rook-ceph-rgw.rook-ceph.svc.cluster.local:8080`

For external access:

```bash
# Port-forward (dev/test)
kubectl port-forward -n rook-ceph svc/rook-ceph-rgw-my-store 8080:8080
# Then use: http://localhost:8080
```

#### S3_ACCESS_KEY

**Required**: Yes  
**Type**: String  
**Description**: S3 access key ID  
**Example**: `S3_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE`

Get from Rook-Ceph secret:

```bash
kubectl get secret -n rook-ceph rook-ceph-object-user-my-store-my-user \
  -o jsonpath='{.data.AccessKey}' | base64 -d
```

#### S3_SECRET_KEY

**Required**: Yes  
**Type**: String  
**Description**: S3 secret access key  
**Example**: `S3_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`

Get from Rook-Ceph secret:

```bash
kubectl get secret -n rook-ceph rook-ceph-object-user-my-store-my-user \
  -o jsonpath='{.data.SecretKey}' | base64 -d
```

#### S3_REGION

**Required**: No  
**Type**: String  
**Default**: `us-east-1`  
**Description**: S3 region name  
**Example**: `S3_REGION=us-east-1`

#### S3_USE_SSL

**Required**: No  
**Type**: Boolean  
**Default**: `false`  
**Description**: Use SSL/TLS for S3 connections  
**Example**: `S3_USE_SSL=false`

#### S3_VERIFY_SSL

**Required**: No  
**Type**: Boolean  
**Default**: `false`  
**Description**: Verify SSL certificates  
**Example**: `S3_VERIFY_SSL=false`

Set to `false` for self-signed certificates.

## Role and Permission Configuration

### Default Role

#### DEFAULT_ROLE

**Required**: No  
**Type**: String  
**Default**: `S3-Viewer`  
**Description**: Default role for authenticated users  
**Example**: `DEFAULT_ROLE=S3-Viewer`

### Role Permissions

Roles are mapped to Azure AD security groups. The group display name must match the role name.

#### Available Permissions

- `view`: Read-only access (list buckets, list objects, download)
- `write`: Upload objects
- `delete`: Delete objects
- `manage_properties`: Edit object properties and metadata (high impact; requires `write` and recommend elevated role only)

#### Predefined Roles

1. **S3-Viewer**
   - Permissions: `view`
   - Use case: Users who need to browse and download files

2. **S3-Editor**
   - Permissions: `view`, `write`
   - Use case: Users who need to upload files

3. **S3-Admin**
   - Permissions: `view`, `write`, `delete`
   - Use case: Administrators who need full access

4. **S3-Property-Admin** (recommended as elevated role)
   - Permissions: `view`, `write`, `manage_properties`
   - Use case: Temporary elevated access for editing object headers/metadata

### Helm Configuration Example

```yaml
config:
  rolePermissions:
    S3-Viewer:
      - view
    S3-Editor:
      - view
      - write
    S3-Admin:
      - view
      - write
      - delete
    S3-Property-Admin:
      - view
      - write
      - manage_properties
    Custom-Role:
      - view
      - write
  defaultRole: 'S3-Viewer'
```

### Creating Azure AD Groups

```bash
# Using Azure CLI
az ad group create \
  --display-name "S3-Viewer" \
  --mail-nickname "S3-Viewer"

az ad group create \
  --display-name "S3-Editor" \
  --mail-nickname "S3-Editor"

az ad group create \
  --display-name "S3-Admin" \
  --mail-nickname "S3-Admin"

az ad group create \
  --display-name "S3-Property-Admin" \
  --mail-nickname "S3-Property-Admin"
```

### Assigning Users to Groups

Via Azure Portal:

1. Go to Azure Active Directory → Groups
2. Select the group
3. Click Members → Add members
4. Search and select users

Via Azure CLI:

```bash
az ad group member add \
  --group "S3-Viewer" \
  --member-id <user-object-id>
```

## PIM Configuration

### Enable PIM

#### PIM_ENABLED

**Required**: No  
**Type**: Boolean  
**Default**: `false`  
**Description**: Enable Privileged Identity Management integration  
**Example**: `PIM_ENABLED=true`

### PIM Setup Requirements

1. **Azure AD Premium P2 license**: Required for PIM
2. **Privileged Role Administrator**: Setup role assignments
3. **Configure eligible roles**: Set up roles that can be activated

### Development Mock Mode

Set `PIM_DEV_MOCK_ENABLED=true` to simulate elevation in non-production environments without calling Azure/Google APIs.

- Requests are granted immediately with an expiry based on entitlement duration
- Effective permissions are merged from active mock elevation requests
- Intended for local/dev testing only
- Blocked automatically in production

### API Endpoints

#### PIM_AZURE_ASSIGNMENT_SCHEDULE_REQUEST_API

**Required**: No  
**Type**: URL  
**Default**: `https://graph.microsoft.com/v1.0/identityGovernance/privilegedAccess/group/assignmentScheduleRequests`  
**Description**: Azure endpoint used to submit and inspect self-activation requests for privileged access groups

#### PIM_AZURE_ELIGIBILITY_SCHEDULE_API

**Required**: No  
**Type**: URL  
**Default**: `https://graph.microsoft.com/v1.0/identityGovernance/privilegedAccess/group/eligibilityScheduleInstances`  
**Description**: Azure endpoint used to verify that a user is eligible before elevation is requested

#### PIM_GOOGLE_MEMBERSHIPS_API_BASE

**Required**: No  
**Type**: URL  
**Default**: `https://cloudidentity.googleapis.com/v1/groups`  
**Description**: Google Cloud Identity groups API base used for temporary membership elevation

#### PIM_GOOGLE_OPERATIONS_API_BASE

**Required**: No  
**Type**: URL  
**Default**: `https://cloudidentity.googleapis.com/v1`  
**Description**: Google long-running operations API base used to poll elevation status

### Entitlement Configuration (env-driven)

Entitlements are the only escalation targets that users can request. They are configured with indexed variables and mapped directly to app permissions.

For each entitlement index `N`:

- `ELEVATION_N_KEY`: Unique entitlement key used by API/UI (`property-admin-temp`)
- `ELEVATION_N_PROVIDER`: `azure` or `google`
- `ELEVATION_N_TARGET`: Provider target ID (`groupId` for Azure PIM group, `groups/<id-or-email>` for Google)
- `ELEVATION_N_PERMISSION_BUNDLE`: Comma-separated app permissions (`view,write,manage_properties`)
- `ELEVATION_N_MAX_DURATION_MINUTES`: Maximum requested duration (1-1440)
- `ELEVATION_N_REQUIRE_JUSTIFICATION`: `true`/`false`

Example:

```bash
PIM_ENABLED=true

ELEVATION_0_KEY=property-admin-temp
ELEVATION_0_PROVIDER=azure
ELEVATION_0_TARGET=00000000-0000-0000-0000-000000000000
ELEVATION_0_PERMISSION_BUNDLE=view,write,manage_properties
ELEVATION_0_MAX_DURATION_MINUTES=60
ELEVATION_0_REQUIRE_JUSTIFICATION=true
```

### PIM Role Configuration

1. Go to Azure AD → Privileged Identity Management
2. Select Azure AD roles or Azure resources
3. Add eligible role assignments:
   - Select role (e.g., S3-Admin)
   - Select users/groups
   - Set activation duration
   - Configure approval requirements

### Using PIM in Application

1. User authenticates with base role/group membership
2. App calls `GET /auth/elevation/entitlements` and displays requestable options
3. User submits `POST /auth/elevation/request` with `entitlementKey`
4. Backend validates:
   - Entitlement exists in env allowlist
   - Provider matches current OIDC provider
   - User is eligible (Azure eligibility check for group PIM)
5. App polls `GET /auth/elevation/status/{requestId}` until granted/denied
6. Session is refreshed and new permissions become active in app

### Group Claim Mapping

When using group-based temporary elevation (for example Azure privileged access groups), ensure your token includes the group claim consumed by the app.

- `AUTH_GROUPS_CLAIM`: claim name containing group IDs (default: `groups`)

Entitlement `ELEVATION_N_TARGET` values are matched against this claim so temporary group activation can grant the configured app permissions.

### PIM Activation Duration

Configure in Azure AD PIM settings:

- Minimum: 30 minutes
- Maximum: 24 hours
- Default: 8 hours

## Kubernetes Configuration

### Helm Values

#### Replica Count

```yaml
replicaCount: 2
```

Recommended: 2+ for high availability

#### Resources

```yaml
resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 128Mi
```

Adjust based on usage:

- Light usage: 100m CPU, 128Mi memory
- Medium usage: 250m CPU, 256Mi memory
- Heavy usage: 500m CPU, 512Mi memory

#### Auto-scaling

```yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 5
  targetCPUUtilizationPercentage: 80
  targetMemoryUtilizationPercentage: 80
```

#### Ingress

```yaml
ingress:
  enabled: true
  className: 'nginx'
  annotations:
    cert-manager.io/cluster-issuer: 'letsencrypt-prod'
    nginx.ingress.kubernetes.io/force-ssl-redirect: 'true'
  hosts:
    - host: s3-manager.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: s3-manager-tls
      hosts:
        - s3-manager.example.com
```

#### Security Context

```yaml
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000

securityContext:
  capabilities:
    drop:
      - ALL
  readOnlyRootFilesystem: false
  allowPrivilegeEscalation: false
```

## Configuration Examples

### Development Configuration

```bash
# .env file for local development
SECRET_KEY=dev-secret-key-not-for-production
AZURE_AD_TENANT_ID=your-tenant-id
AZURE_AD_CLIENT_ID=your-client-id
AZURE_AD_CLIENT_SECRET=your-client-secret
PIM_ENABLED=false
DEFAULT_ROLE=S3-Admin
S3_ENDPOINT=http://localhost:8080
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=us-east-1
S3_USE_SSL=false
S3_VERIFY_SSL=false
SESSION_COOKIE_SECURE=false
```

### Production Helm Values

```yaml
replicaCount: 3

image:
  repository: your-registry.azurecr.io/s3-manager
  tag: '1.0.0'
  pullPolicy: Always

ingress:
  enabled: true
  className: 'nginx'
  annotations:
    cert-manager.io/cluster-issuer: 'letsencrypt-prod'
    nginx.ingress.kubernetes.io/force-ssl-redirect: 'true'
    nginx.ingress.kubernetes.io/rate-limit: '100'
  hosts:
    - host: s3.company.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: s3-manager-tls
      hosts:
        - s3.company.com

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 250m
    memory: 256Mi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

config:
  secretKey: 'production-secret-key-use-external-secret'
  sessionCookieSecure: true

  azureAd:
    tenantId: 'production-tenant-id'
    clientId: 'production-client-id'
    clientSecret: 'production-client-secret'

  pim:
    enabled: true

  rolePermissions:
    S3-Viewer:
      - view
    S3-Editor:
      - view
      - write
    S3-Admin:
      - view
      - write
      - delete

  defaultRole: 'S3-Viewer'

  s3:
    endpoint: 'https://s3.internal.company.com'
    accessKey: 'production-access-key'
    secretKey: 'production-secret-key'
    region: 'us-east-1'
    useSSL: true
    verifySSL: true

nodeSelector:
  workload: web

affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchExpressions:
              - key: app.kubernetes.io/name
                operator: In
                values:
                  - s3-manager
          topologyKey: kubernetes.io/hostname
```

## Validation

### Validate Helm Configuration

```bash
# Lint chart
helm lint ./helm/s3-manager -f values.yaml

# Template rendering
helm template s3-manager ./helm/s3-manager -f values.yaml

# Dry run
helm install s3-manager ./helm/s3-manager -f values.yaml --dry-run
```

### Test Configuration

```bash
# Test Azure AD configuration
curl -X GET "https://login.microsoftonline.com/${AZURE_AD_TENANT_ID}/.well-known/openid-configuration"

# Test S3 connection
aws s3 ls \
  --endpoint-url=${S3_ENDPOINT} \
  --access-key-id=${S3_ACCESS_KEY} \
  --secret-access-key=${S3_SECRET_KEY}
```

## Troubleshooting

### Configuration Not Loading

Check environment variables are set:

```bash
kubectl exec -n s3-manager deployment/s3-manager -- env | grep -E "AZURE|S3"
```

### Authentication Issues

Verify Azure AD configuration:

```bash
# Check redirect URI
kubectl get ingress -n s3-manager -o jsonpath='{.items[0].spec.rules[0].host}'
# Should match Azure AD redirect URI
```

### S3 Connection Issues

Test from within pod:

```bash
kubectl exec -n s3-manager -it deployment/s3-manager -- python3 -c "
import boto3
s3 = boto3.client('s3',
    endpoint_url='$S3_ENDPOINT',
    aws_access_key_id='$S3_ACCESS_KEY',
    aws_secret_access_key='$S3_SECRET_KEY')
print(s3.list_buckets())
"
```

## Best Practices

1. **Use External Secrets**: Store sensitive data in Azure Key Vault or HashiCorp Vault
2. **Rotate Credentials**: Regularly rotate secrets and access keys
3. **Enable TLS**: Always use HTTPS in production
4. **Least Privilege**: Assign minimum necessary permissions
5. **Monitor Access**: Enable audit logging and monitoring
6. **Regular Updates**: Keep dependencies and images updated
7. **Backup Configuration**: Store Helm values in version control (without secrets)
