# Ingress Setup Guide

This guide covers deploying S3 Manager with ingress controllers in Kubernetes. We support two approaches:

1. **Envoy Gateway** (Recommended) - Modern, Kubernetes-native Gateway API with built-in OIDC support
2. **NGINX Ingress** (Legacy) - Traditional Ingress controller requiring external oauth2-proxy

## Table of Contents

- [Prerequisites](#prerequisites)
- [Architecture Comparison](#architecture-comparison)
- [Envoy Gateway Setup (Recommended)](#envoy-gateway-setup-recommended)
  - [Installation](#envoy-gateway-installation)
  - [Deployment with Keycloak](#deployment-with-keycloak)
  - [Deployment with Azure AD](#deployment-with-azure-ad)
  - [Deployment with Google OAuth](#deployment-with-google-oauth)
- [NGINX Ingress Setup (Legacy)](#nginx-ingress-setup-legacy)
  - [Installation](#nginx-ingress-installation)
  - [Deployment with oauth2-proxy](#deployment-with-oauth2-proxy)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Common Requirements

- Kubernetes cluster (v1.26+)
- kubectl configured to access your cluster
- Helm 3.x installed
- Domain name with DNS configured
- TLS certificate (or cert-manager for automatic certificates)

### For Envoy Gateway

- Gateway API CRDs v1.0.0+
- Envoy Gateway v1.0.0+

### For NGINX Ingress

- NGINX Ingress Controller v1.8.0+
- oauth2-proxy (for OIDC authentication)

---

## Architecture Comparison

### Envoy Gateway Architecture

```
Internet → Gateway (TLS) → HTTPRoute
                           ↓
            SecurityPolicy (OIDC Auth)
                           ↓
         BackendTrafficPolicy (Rate Limiting)
                           ↓
         ClientTrafficPolicy (Timeouts)
                           ↓
                    S3 Manager Service
```

**Advantages:**
- Native OIDC support (no external proxy needed)
- Declarative policy management
- Better observability with Gateway API
- Modern, actively developed standard
- Easier to configure and maintain

### NGINX Ingress Architecture

```
Internet → NGINX Ingress (TLS)
                ↓
          oauth2-proxy (OIDC Auth)
                ↓
           S3 Manager Service
```

**Disadvantages:**
- Requires separate oauth2-proxy deployment
- Configuration via annotations (less declarative)
- More complex setup
- Legacy approach being phased out

---

## Envoy Gateway Setup (Recommended)

### Envoy Gateway Installation

1. **Install Gateway API CRDs:**

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.0.0/standard-install.yaml
```

2. **Install Envoy Gateway:**

```bash
helm install eg oci://docker.io/envoyproxy/gateway-helm \
  --version v1.0.0 \
  --namespace envoy-gateway-system \
  --create-namespace
```

3. **Create a Gateway resource:**

```bash
kubectl apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: eg
  namespace: envoy-gateway-system
spec:
  gatewayClassName: eg
  listeners:
  - name: http
    protocol: HTTP
    port: 80
  - name: https
    protocol: HTTPS
    port: 443
    tls:
      mode: Terminate
      certificateRefs:
      - kind: Secret
        name: default-tls-cert
EOF
```

4. **Verify installation:**

```bash
kubectl get gateway -n envoy-gateway-system
kubectl get pods -n envoy-gateway-system
```

### Deployment with Keycloak

**Step 1: Configure Keycloak (if not using local dev instance)**

See [OIDC_SETUP.md](./OIDC_SETUP.md#keycloak) for Keycloak configuration details.

**Step 2: Create OIDC client secret:**

```bash
kubectl create secret generic s3-manager-oidc-secret \
  --from-literal=client-secret='your-keycloak-client-secret' \
  --namespace default
```

**Step 3: Deploy with Helm:**

```bash
# Option 1: Using the example values file
helm install s3-manager ./helm/s3-manager \
  -f ./helm/s3-manager/values-envoy-keycloak.yaml \
  --set oidcSecret.create=false \
  --set ingress.hostname=s3-manager.example.com \
  --set ingress.envoy.oidc.keycloak.issuerUrl=https://keycloak.example.com/realms/s3-manager

# Option 2: Using custom values
helm install s3-manager ./helm/s3-manager \
  --set ingress.enabled=true \
  --set ingress.type=envoy \
  --set ingress.hostname=s3-manager.example.com \
  --set ingress.envoy.oidc.enabled=true \
  --set ingress.envoy.oidc.provider=keycloak \
  --set ingress.envoy.oidc.keycloak.issuerUrl=https://keycloak.example.com/realms/s3-manager \
  --set ingress.envoy.oidc.keycloak.clientId=s3-manager-client \
  --set oidcSecret.create=false
```

**Step 4: Verify deployment:**

```bash
# Check HTTPRoute
kubectl get httproute

# Check SecurityPolicy (OIDC)
kubectl get securitypolicy

# Check BackendTrafficPolicy (Rate Limiting)
kubectl get backendtrafficpolicy

# Check ClientTrafficPolicy (Timeouts)
kubectl get clienttrafficpolicy

# Test access
curl -I https://s3-manager.example.com
# Should redirect to Keycloak login
```

### Deployment with Azure AD

**Step 1: Configure Azure AD App Registration**

See [OIDC_SETUP.md](./OIDC_SETUP.md#azure-ad) for Azure AD configuration details.

**Step 2: Create OIDC client secret:**

```bash
kubectl create secret generic s3-manager-oidc-secret \
  --from-literal=client-secret='your-azure-client-secret' \
  --namespace default
```

**Step 3: Deploy with Helm:**

```bash
helm install s3-manager ./helm/s3-manager \
  -f ./helm/s3-manager/values-envoy-azure.yaml \
  --set oidcSecret.create=false \
  --set ingress.hostname=s3-manager.example.com \
  --set ingress.envoy.oidc.azure.issuerUrl=https://login.microsoftonline.com/<tenant-id>/v2.0 \
  --set ingress.envoy.oidc.azure.clientId=<application-client-id> \
  --set config.azure.tenantId=<tenant-id> \
  --set config.azure.clientId=<application-client-id>
```

**Step 4: Configure role mappings:**

Update the `config.azure.roleMapping` in your values file with your Azure AD group Object IDs:

```yaml
config:
  azure:
    roleMapping:
      "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx":  # S3-Admin group ID
        - view
        - write
        - delete
      "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy":  # S3-Editor group ID
        - view
        - write
      "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz":  # S3-Viewer group ID
        - view
```

### Deployment with Google OAuth

**Step 1: Configure Google OAuth Client**

See [OIDC_SETUP.md](./OIDC_SETUP.md#google-oauth) for Google OAuth configuration details.

**Step 2: Create OIDC client secret:**

```bash
kubectl create secret generic s3-manager-oidc-secret \
  --from-literal=client-secret='your-google-client-secret' \
  --namespace default
```

**Step 3: Deploy with Helm:**

```bash
helm install s3-manager ./helm/s3-manager \
  --set ingress.enabled=true \
  --set ingress.type=envoy \
  --set ingress.hostname=s3-manager.example.com \
  --set ingress.envoy.oidc.enabled=true \
  --set ingress.envoy.oidc.provider=google \
  --set ingress.envoy.oidc.google.issuerUrl=https://accounts.google.com \
  --set ingress.envoy.oidc.google.clientId=<google-client-id> \
  --set config.oidcProvider=google \
  --set config.google.clientId=<google-client-id> \
  --set oidcSecret.create=false
```

---

## NGINX Ingress Setup (Legacy)

> **Note:** NGINX Ingress is considered legacy. We strongly recommend using Envoy Gateway for new deployments.

### NGINX Ingress Installation

1. **Install NGINX Ingress Controller:**

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install nginx-ingress ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=LoadBalancer
```

2. **Verify installation:**

```bash
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
```

### Deployment with oauth2-proxy

**Step 1: Install oauth2-proxy**

For Keycloak:

```bash
helm repo add oauth2-proxy https://oauth2-proxy.github.io/manifests
helm repo update

helm install oauth2-proxy oauth2-proxy/oauth2-proxy \
  --namespace auth-system \
  --create-namespace \
  --set config.clientID=s3-manager-client \
  --set config.clientSecret=<client-secret> \
  --set config.cookieSecret=$(openssl rand -base64 32) \
  --set extraArgs.provider=keycloak-oidc \
  --set extraArgs.oidc-issuer-url=https://keycloak.example.com/realms/s3-manager \
  --set extraArgs.redirect-url=https://s3-manager.example.com/oauth2/callback \
  --set extraArgs.email-domain=* \
  --set extraArgs.whitelist-domain=.example.com \
  --set extraArgs.cookie-domain=.example.com \
  --set extraArgs.cookie-secure=true \
  --set extraArgs.upstream=static://202
```

For Azure AD:

```bash
helm install oauth2-proxy oauth2-proxy/oauth2-proxy \
  --namespace auth-system \
  --create-namespace \
  --set config.clientID=<azure-client-id> \
  --set config.clientSecret=<azure-client-secret> \
  --set config.cookieSecret=$(openssl rand -base64 32) \
  --set extraArgs.provider=azure \
  --set extraArgs.azure-tenant=<tenant-id> \
  --set extraArgs.redirect-url=https://s3-manager.example.com/oauth2/callback \
  --set extraArgs.email-domain=* \
  --set extraArgs.cookie-domain=.example.com \
  --set extraArgs.cookie-secure=true \
  --set extraArgs.upstream=static://202
```

**Step 2: Deploy S3 Manager with NGINX Ingress**

```bash
# Create OIDC secret for the application
kubectl create secret generic s3-manager-oidc-secret \
  --from-literal=client-secret='<client-secret>' \
  --namespace default

# Deploy with Helm
helm install s3-manager ./helm/s3-manager \
  -f ./helm/s3-manager/values-nginx.yaml \
  --set oidcSecret.create=false \
  --set ingress.hostname=s3-manager.example.com \
  --set ingress.nginx.oauth2Proxy.url=http://oauth2-proxy.auth-system.svc.cluster.local
```

**Step 3: Verify deployment:**

```bash
# Check Ingress
kubectl get ingress

# Check oauth2-proxy
kubectl get pods -n auth-system

# Test access
curl -I https://s3-manager.example.com
# Should redirect to oauth2-proxy, then to OIDC provider
```

---

## Troubleshooting

### Common Issues

#### 1. OIDC Redirect Loop

**Symptoms:** Browser keeps redirecting between app and OIDC provider

**Causes:**
- Incorrect redirect URI configured
- Cookie domain mismatch
- HTTPS/TLS issues

**Solutions:**

For Envoy Gateway:
```bash
# Check SecurityPolicy
kubectl describe securitypolicy -n default

# Verify redirect URL matches OIDC provider configuration
kubectl get securitypolicy -o yaml | grep redirectUrl
```

For NGINX + oauth2-proxy:
```bash
# Check oauth2-proxy logs
kubectl logs -n auth-system -l app=oauth2-proxy

# Verify redirect URL
helm get values oauth2-proxy -n auth-system | grep redirect-url
```

#### 2. Rate Limiting Too Aggressive

**Symptoms:** Users getting 429 Too Many Requests errors

**Solutions:**

For Envoy Gateway:
```bash
# Update rate limiting in values.yaml
helm upgrade s3-manager ./helm/s3-manager \
  --set ingress.envoy.rateLimiting.requests=200 \
  --reuse-values
```

For NGINX:
```bash
# Update annotation in values.yaml
helm upgrade s3-manager ./helm/s3-manager \
  --set ingress.nginx.annotations."nginx\.ingress\.kubernetes\.io/limit-rps"="200" \
  --reuse-values
```

#### 3. TLS Certificate Issues

**Symptoms:** Browser shows certificate warnings, HTTPS not working

**Solutions:**

```bash
# Check cert-manager certificate
kubectl get certificate
kubectl describe certificate s3-manager-tls

# Check secret
kubectl get secret s3-manager-tls -o yaml

# Force certificate renewal
kubectl delete certificate s3-manager-tls
helm upgrade s3-manager ./helm/s3-manager --reuse-values
```

#### 4. Gateway/HTTPRoute Not Working

**Symptoms:** Gateway shows "NotReady", HTTPRoute shows "NotAccepted"

**Solutions:**

```bash
# Check Gateway status
kubectl describe gateway eg -n envoy-gateway-system

# Check HTTPRoute status
kubectl describe httproute

# Verify Gateway API CRDs installed
kubectl get crd | grep gateway

# Check Envoy Gateway logs
kubectl logs -n envoy-gateway-system -l control-plane=envoy-gateway
```

#### 5. OIDC Token Validation Fails

**Symptoms:** User can log in but gets "Unauthorized" after redirect

**Causes:**
- Token issuer mismatch
- Missing or incorrect audience claim
- Token expiration issues

**Solutions:**

```bash
# Check application logs
kubectl logs -l app=s3-manager

# Verify OIDC configuration in app
kubectl get configmap -o yaml | grep -A 20 OIDC

# Test OIDC discovery endpoint
curl https://keycloak.example.com/realms/s3-manager/.well-known/openid-configuration
```

### Debug Commands

```bash
# Check all ingress resources
kubectl get httproute,ingress,gateway,securitypolicy,backendtrafficpolicy,clienttrafficpolicy

# Check pod logs
kubectl logs -f -l app=s3-manager

# Check ingress controller logs (NGINX)
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx

# Check Envoy Gateway logs
kubectl logs -n envoy-gateway-system -l control-plane=envoy-gateway

# Describe SecurityPolicy for OIDC config
kubectl describe securitypolicy

# Test connectivity from pod
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- sh
# Inside pod: curl http://s3-manager:80/health
```

### Getting Help

If you encounter issues not covered here:

1. Check the [OIDC Setup Guide](./OIDC_SETUP.md) for authentication-specific issues
2. Review Helm chart values and templates in `helm/s3-manager/`
3. Enable debug logging in the application (set `LOG_LEVEL=DEBUG`)
4. Check [Envoy Gateway documentation](https://gateway.envoyproxy.io/)
5. Check [NGINX Ingress documentation](https://kubernetes.github.io/ingress-nginx/)

---

## Production Considerations

### Security

- **Always use TLS/HTTPS** - Never expose authentication flows over HTTP
- **Use strong cookie secrets** - Generate with `openssl rand -base64 32`
- **Rotate secrets regularly** - Update client secrets and cookie secrets periodically
- **Restrict CORS origins** - Only allow specific domains, not wildcards
- **Enable security headers** - CSP, HSTS, X-Frame-Options, etc.

### Performance

- **Enable autoscaling** - Set appropriate min/max replicas based on load
- **Configure resource limits** - Prevent resource exhaustion
- **Tune rate limiting** - Balance protection with user experience
- **Use CDN for static assets** - Reduce load on ingress/app

### Monitoring

- **Monitor ingress metrics** - Request rates, error rates, latencies
- **Set up alerts** - For high error rates, rate limiting, certificate expiration
- **Track OIDC auth failures** - Identify configuration issues early
- **Monitor resource usage** - CPU, memory, network

### High Availability

- **Run multiple replicas** - Minimum 2, ideally 3+ for production
- **Use pod anti-affinity** - Spread pods across nodes/zones
- **Configure pod disruption budgets** - Prevent total outages during maintenance
- **Use multiple ingress replicas** - For ingress controller redundancy

---

## Next Steps

- Review [OIDC Setup Guide](./OIDC_SETUP.md) for detailed OIDC provider configuration
- See [QUICKSTART.md](../QUICKSTART.md) for local development setup
- Explore example values files in `helm/s3-manager/values-*.yaml`
- Set up monitoring and alerting for production deployments
