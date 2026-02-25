# Kubernetes Deployment

This directory contains Kubernetes deployment configurations for S3 Manager.

## Directory Structure

```
k8s/
├── local/          # Local development with Envoy Gateway + Keycloak + Rook-Ceph
└── README.md       # This file
```

## Deployment Options

### Local Development (k8s/local/)

For local testing with a full authentication and storage stack:

- **Purpose**: Test S3 Manager with OIDC authentication and S3-compatible storage
- **Components**: Envoy Gateway, Keycloak, Rook-Ceph, S3 Manager
- **Cluster**: Single-node (minikube, kind, k3d)
- **Resources**: 8GB+ RAM, 4+ CPU cores
- **Documentation**: [k8s/local/README.md](./local/README.md)

```bash
# Quick start
kubectl apply -f https://raw.githubusercontent.com/rook/rook/release-1.19/deploy/examples/crds.yaml
kubectl apply -k k8s/local/
```

### Production Deployment

For production deployments, use the **Helm chart** instead of raw manifests:

```bash
# Production deployment with Helm
helm install s3-manager ./helm/s3-manager \
  --namespace s3-manager \
  --create-namespace \
  -f production-values.yaml
```

See the [Helm chart documentation](../helm/s3-manager/README.md) for:
- Production configuration examples
- Ingress setup with TLS
- OIDC integration with existing providers
- High availability configuration
- Resource limits and autoscaling
- Monitoring and observability

## Choosing the Right Option

| Use Case | Recommendation |
|----------|----------------|
| **Local testing with full stack** | Use `k8s/local/` |
| **Local testing with existing S3** | Use Helm with `k8s-helm-local/values-local.yaml` |
| **Production deployment** | Use Helm with custom values file |
| **CI/CD testing** | Use Helm with minimal test configuration |

## Additional Resources

- [Helm Chart Documentation](../helm/s3-manager/README.md)
- [Local Development Setup](../docs/deployment/local-k8s.md)
- [OIDC Configuration](../docs/getting-started/oidc-providers.md)
- [Ingress Configuration](../docs/deployment/ingress.md)
