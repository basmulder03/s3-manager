# Scripts

This directory contains configuration and initialization scripts for S3 Manager.

## Files

### `keycloak-realm.json`

Pre-configured Keycloak realm for S3 Manager with:

- Realm: `s3-manager`
- Client: `s3-manager-client` (secret: `dev-client-secret-12345`)
- Users: admin, editor, viewer (all with password matching username + "123")
- Roles: S3-Admin, S3-Editor, S3-Viewer
- Protocol mappers for realm roles and groups

Used by:

- `docker-compose.local-dev.yml` for local infrastructure
- `k8s/local/keycloak/` for local Kubernetes

### `localstack-init.sh`

Initialization script for LocalStack that creates test S3 buckets:

- `test-bucket` - Empty bucket for testing
- `demo-bucket` - Contains seeded sample files/folders for local testing
- `uploads` - Empty bucket for upload testing

Sample demo objects include multiple file types for UI/API checks:

- `txt`, `html`, `svg`, `png`, `mp4` (placeholder)

Also configures bucket CORS for local browser uploads from:

- `http://localhost:5173`
- `http://127.0.0.1:5173`

Used by:

- `docker-compose.local-dev.yml` via volume mount
- LocalStack container startup

## Related Documentation

- [Local Development Guide](../docs/getting-started/local-development.md) - Local setup instructions
- [OIDC Setup Guide](../docs/getting-started/oidc-providers.md) - OIDC provider configuration
- [Ingress Setup Guide](../docs/deployment/ingress.md) - Production Kubernetes deployment
- [Local Kubernetes Guide](../docs/deployment/local-k8s.md) - Local K8s with full stack
