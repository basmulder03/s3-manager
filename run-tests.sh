#!/bin/bash
# Test runner script for S3 Manager
# Provides a simple interface to run different test suites

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

check_localstack() {
    echo "Checking LocalStack..."
    if curl -s http://localhost:4566/_localstack/health | grep -q "s3"; then
        print_success "LocalStack is running and S3 is available"
        return 0
    else
        print_error "LocalStack is not available at http://localhost:4566"
        return 1
    fi
}

start_localstack() {
    print_warning "Starting LocalStack..."
    if command -v docker-compose &> /dev/null; then
        docker-compose up -d localstack
    elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
        docker compose up -d localstack
    elif command -v podman-compose &> /dev/null; then
        podman-compose up -d localstack
    else
        print_error "No compose command found. Please start LocalStack manually."
        exit 1
    fi
    
    echo "Waiting for LocalStack to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:4566/_localstack/health | grep -q "s3"; then
            print_success "LocalStack is ready"
            return 0
        fi
        sleep 2
    done
    
    print_error "LocalStack failed to start"
    return 1
}

# Main script
case "${1:-all}" in
    backend|api)
        print_header "Running Backend API Tests"
        
        if ! check_localstack; then
            start_localstack || exit 1
        fi
        
        pytest tests/test_api_*.py -v "${@:2}"
        ;;
    
    e2e|ui)
        print_header "Running E2E UI Tests"
        
        if ! check_localstack; then
            start_localstack || exit 1
        fi
        
        # Check if app is running
        if ! curl -s http://localhost:8080 > /dev/null 2>&1; then
            print_warning "Application is not running. Please start it with 'make start' or 'python run.py'"
            exit 1
        fi
        
        # Check if Playwright is installed
        if ! playwright --version &> /dev/null; then
            print_warning "Installing Playwright browsers..."
            playwright install chromium
        fi
        
        pytest tests/test_e2e_*.py -v "${@:2}"
        ;;
    
    integration)
        print_header "Running Integration Tests"
        
        if ! check_localstack; then
            start_localstack || exit 1
        fi
        
        pytest -m integration -v "${@:2}"
        ;;
    
    unit)
        print_header "Running Unit Tests"
        pytest -m unit -v "${@:2}"
        ;;
    
    coverage|cov)
        print_header "Running Tests with Coverage"
        
        if ! check_localstack; then
            start_localstack || exit 1
        fi
        
        pytest --cov=app --cov-report=html --cov-report=term-missing -v "${@:2}"
        print_success "Coverage report generated in htmlcov/index.html"
        ;;
    
    docker)
        print_header "Running Tests in Docker"
        
        if command -v docker-compose &> /dev/null; then
            COMPOSE_CMD="docker-compose"
        elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
            COMPOSE_CMD="docker compose"
        elif command -v podman-compose &> /dev/null; then
            COMPOSE_CMD="podman-compose"
        else
            print_error "No compose command found"
            exit 1
        fi
        
        $COMPOSE_CMD -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test-runner
        $COMPOSE_CMD -f docker-compose.test.yml down -v
        ;;
    
    quick)
        print_header "Running Quick Smoke Test"
        pytest tests/test_api_browse.py::TestBrowseEndpoint::test_browse_root_no_buckets -v
        print_success "Quick smoke test passed!"
        ;;
    
    all)
        print_header "Running All Tests"
        
        if ! check_localstack; then
            start_localstack || exit 1
        fi
        
        pytest -v "${@:2}"
        ;;
    
    help|--help|-h)
        echo "S3 Manager Test Runner"
        echo ""
        echo "Usage: $0 [command] [pytest-args]"
        echo ""
        echo "Commands:"
        echo "  backend     Run backend API tests (requires LocalStack)"
        echo "  e2e         Run E2E UI tests (requires app + LocalStack)"
        echo "  integration Run integration tests (requires LocalStack)"
        echo "  unit        Run unit tests (no dependencies)"
        echo "  coverage    Run tests with coverage report"
        echo "  docker      Run tests in Docker containers"
        echo "  quick       Run quick smoke test"
        echo "  all         Run all tests (default)"
        echo "  help        Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 backend              # Run backend tests"
        echo "  $0 e2e --headed         # Run E2E tests with visible browser"
        echo "  $0 coverage             # Generate coverage report"
        echo "  $0 all -k test_upload   # Run all tests matching 'test_upload'"
        echo ""
        ;;
    
    *)
        print_error "Unknown command: $1"
        echo "Run '$0 help' for usage information"
        exit 1
        ;;
esac
