# Scripts

This directory contains configuration files for S3 Manager.

## Files

### `keycloak-realm.json`

Pre-configured Keycloak realm for S3 Manager with:
- Realm: `s3-manager`
- Client: `s3-manager-client` (secret: `dev-client-secret-12345`)
- Users: admin, editor, viewer (all with password123)
- Roles: S3-Admin, S3-Editor, S3-Viewer
- Protocol mappers for realm roles and groups

Used by:
- `docker-compose.yml` for local development
- `k8s/keycloak/keycloak-local.yaml` for local Kubernetes

## Deployment

For deploying S3 Manager locally with Kubernetes:
- [Local Kubernetes Setup Guide](../docs/LOCAL_K8S_SETUP.md) - Quick deployment instructions
- [Kubernetes Manifests](../k8s/) - Ready-to-deploy manifests with Kustomize

For other deployment options:
- [OIDC Setup Guide](../docs/OIDC_SETUP.md) - OIDC provider configuration  
- [Ingress Setup Guide](../docs/INGRESS_SETUP.md) - Production Kubernetes deployment
