#!/bin/bash
# Simple script to check the status of the S3 Manager deployment

echo "=== Checking Envoy Gateway ==="
kubectl get pods -n envoy-gateway-system 2>/dev/null || echo "Envoy Gateway namespace not found"
echo ""

echo "=== Checking Keycloak ==="
kubectl get pods -n keycloak 2>/dev/null || echo "Keycloak namespace not found"
echo ""

echo "=== Checking Rook-Ceph Operator ==="
kubectl get pods -n rook-ceph 2>/dev/null || echo "Rook-Ceph namespace not found"
echo ""

echo "=== Checking Ceph Cluster Status ==="
kubectl get cephcluster -n rook-ceph 2>/dev/null || echo "No CephCluster found"
echo ""

echo "=== Checking Ceph Object Store ==="
kubectl get cephobjectstore -n rook-ceph 2>/dev/null || echo "No CephObjectStore found"
echo ""

echo "=== Checking S3 Manager ==="
kubectl get pods -n test-deployment 2>/dev/null || echo "Test deployment namespace not found"
echo ""

echo "=== Checking Gateway and HTTPRoutes ==="
kubectl get gateway -n test-deployment 2>/dev/null
kubectl get httproute -n test-deployment 2>/dev/null
echo ""

echo "=== Checking SecurityPolicy ==="
kubectl get securitypolicy -n test-deployment 2>/dev/null
echo ""

echo "=== Summary ==="
echo "For detailed logs, use:"
echo "  kubectl logs -n <namespace> <pod-name>"
echo ""
echo "To watch Ceph cluster health:"
echo "  kubectl -n rook-ceph get cephcluster -w"
