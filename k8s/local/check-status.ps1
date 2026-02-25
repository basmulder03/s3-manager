# Simple script to check the status of the S3 Manager deployment

Write-Host "=== Checking Envoy Gateway ===" -ForegroundColor Cyan
kubectl get pods -n envoy-gateway-system 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "Envoy Gateway namespace not found" -ForegroundColor Yellow }
Write-Host ""

Write-Host "=== Checking Keycloak ===" -ForegroundColor Cyan
kubectl get pods -n keycloak 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "Keycloak namespace not found" -ForegroundColor Yellow }
Write-Host ""

Write-Host "=== Checking Rook-Ceph Operator ===" -ForegroundColor Cyan
kubectl get pods -n rook-ceph 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "Rook-Ceph namespace not found" -ForegroundColor Yellow }
Write-Host ""

Write-Host "=== Checking Ceph Cluster Status ===" -ForegroundColor Cyan
kubectl get cephcluster -n rook-ceph 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "No CephCluster found" -ForegroundColor Yellow }
Write-Host ""

Write-Host "=== Checking Ceph Object Store ===" -ForegroundColor Cyan
kubectl get cephobjectstore -n rook-ceph 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "No CephObjectStore found" -ForegroundColor Yellow }
Write-Host ""

Write-Host "=== Checking S3 Manager ===" -ForegroundColor Cyan
kubectl get pods -n test-deployment 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "Test deployment namespace not found" -ForegroundColor Yellow }
Write-Host ""

Write-Host "=== Checking Gateway and HTTPRoutes ===" -ForegroundColor Cyan
kubectl get gateway -n test-deployment 2>$null
kubectl get httproute -n test-deployment 2>$null
Write-Host ""

Write-Host "=== Checking SecurityPolicy ===" -ForegroundColor Cyan
kubectl get securitypolicy -n test-deployment 2>$null
Write-Host ""

Write-Host "=== Summary ===" -ForegroundColor Green
Write-Host "For detailed logs, use:"
Write-Host "  kubectl logs -n <namespace> <pod-name>"
Write-Host ""
Write-Host "To watch Ceph cluster health:"
Write-Host "  kubectl -n rook-ceph get cephcluster -w"
