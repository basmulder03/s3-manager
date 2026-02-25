# Testing Guide

Comprehensive testing guide for the S3 Manager application covering backend API tests, frontend E2E tests, and CI/CD integration.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Setup](#setup)
- [Running Tests](#running-tests)
- [Test Categories](#test-categories)
- [Writing Tests](#writing-tests)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

## Overview

The S3 Manager test suite includes:

- **Backend API Tests** - Unit and integration tests for Flask endpoints
- **E2E UI Tests** - Browser-based tests using Playwright
- **Test Fixtures** - Shared fixtures for S3, Flask app, and browser setup
- **Markers** - Test categorization for selective execution

### Test Coverage

- ✅ Browse endpoint (root, buckets, folders, breadcrumbs)
- ✅ File upload operations
- ✅ Folder creation
- ✅ Delete operations (single, bulk, folders)
- ✅ Rename operations
- ✅ Multi-select functionality
- ✅ Navigation (breadcrumbs, browser history, deep links)
- ✅ Permission checks
- ✅ Error handling

## Test Structure

```
tests/
├── conftest.py                  # Shared fixtures and configuration
├── test_api_browse.py          # Backend browse endpoint tests
├── test_api_operations.py      # Backend file operation tests
├── test_e2e_navigation.py      # E2E navigation and browsing tests
└── test_e2e_operations.py      # E2E file operation tests
```

### Test Markers

Tests are organized with pytest markers:

- `@pytest.mark.unit` - Fast, isolated unit tests
- `@pytest.mark.integration` - Tests requiring LocalStack
- `@pytest.mark.e2e` - End-to-end browser tests
- `@pytest.mark.api` - Backend API tests
- `@pytest.mark.ui` - Frontend UI tests
- `@pytest.mark.slow` - Tests taking >1 second

## Setup

### 1. Install Dependencies

```bash
# Install test dependencies
pip install -r requirements-dev.txt

# Install Playwright browsers
playwright install chromium
```

### 2. Start LocalStack

Tests require LocalStack for S3 emulation.

**Using Docker Compose:**
```bash
docker-compose up -d localstack
```

**Using Podman Compose:**
```bash
podman compose up -d localstack
```

**Using Kubernetes (kind/minikube):**
```bash
kubectl apply -f k8s-helm-local/localstack.yaml
kubectl port-forward svc/localstack 4566:4566
```

### 3. Configure Environment

Create `.env.test` (optional):

```bash
S3_ENDPOINT=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_DEFAULT_REGION=us-east-1
LOCAL_DEV_MODE=true
FLASK_DEBUG=true
```

## Running Tests

### Run All Tests

```bash
pytest
```

### Run Specific Test Categories

```bash
# Backend API tests only
pytest -m api

# E2E UI tests only
pytest -m e2e

# Integration tests (require LocalStack)
pytest -m integration

# Unit tests only (fast, no external dependencies)
pytest -m unit
```

### Run Specific Test Files

```bash
# Browse endpoint tests
pytest tests/test_api_browse.py

# File operations tests
pytest tests/test_api_operations.py

# Navigation E2E tests
pytest tests/test_e2e_navigation.py

# Operations E2E tests
pytest tests/test_e2e_operations.py
```

### Run Specific Test Classes or Functions

```bash
# Specific class
pytest tests/test_api_browse.py::TestBrowseEndpoint

# Specific test
pytest tests/test_api_browse.py::TestBrowseEndpoint::test_browse_root_with_buckets
```

### Run Tests in Parallel

```bash
# Run with 4 workers
pytest -n 4

# Run with auto-detection
pytest -n auto
```

### Run with Coverage

```bash
# Generate coverage report
pytest --cov=app --cov-report=html

# View HTML report
open htmlcov/index.html  # macOS
xdg-open htmlcov/index.html  # Linux
start htmlcov/index.html  # Windows
```

### E2E Tests with Visible Browser

By default, E2E tests run headless. To see the browser:

```bash
# Run with headed browser
pytest tests/test_e2e_navigation.py --headed

# Run with slow motion (helps debugging)
pytest tests/test_e2e_navigation.py --headed --slowmo 1000
```

### Verbose Output

```bash
# Show test names as they run
pytest -v

# Show print statements
pytest -s

# Show full diff on failures
pytest -vv
```

## Test Categories

### Backend API Tests

**Location:** `tests/test_api_browse.py`, `tests/test_api_operations.py`

**What they test:**
- Flask endpoint responses
- S3 operations via boto3
- Permission checks
- Error handling
- Data validation

**Example:**
```python
def test_browse_bucket_root(authenticated_client, test_bucket_with_data):
    response = authenticated_client.get(f'/api/s3/browse/{test_bucket_with_data}')
    assert response.status_code == 200
    
    data = json.loads(response.data)
    assert 'folder1' in [item['name'] for item in data['items']]
```

**Run:**
```bash
pytest -m api
```

### E2E UI Tests

**Location:** `tests/test_e2e_navigation.py`, `tests/test_e2e_operations.py`

**What they test:**
- Full user workflows
- Browser interactions (clicks, typing, navigation)
- UI state and visibility
- JavaScript functionality
- Form submissions

**Example:**
```python
def test_create_folder_in_bucket(page: Page, base_url: str, test_bucket):
    page.goto(f"{base_url}#{test_bucket}")
    page.click("#new-folder-btn")
    page.fill("#folder-name-input", "test-folder")
    page.click("#create-folder-submit-btn")
    
    expect(page.locator(".file-item:has-text('test-folder')")).to_be_visible()
```

**Run:**
```bash
pytest -m e2e

# With visible browser
pytest -m e2e --headed
```

## Writing Tests

### Creating a New Backend Test

```python
import pytest
import json

@pytest.mark.api
@pytest.mark.integration
class TestMyFeature:
    def test_my_endpoint(self, authenticated_client, test_bucket):
        response = authenticated_client.get('/api/my-endpoint')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
```

### Creating a New E2E Test

```python
import pytest
from playwright.sync_api import Page, expect

@pytest.mark.e2e
@pytest.mark.ui
class TestMyUIFeature:
    def test_ui_interaction(self, page: Page, base_url: str):
        page.goto(base_url)
        
        # Click button
        page.click("#my-button")
        
        # Verify result
        expect(page.locator("#result")).to_have_text("Success")
```

### Using Fixtures

Available fixtures from `conftest.py`:

```python
def test_with_fixtures(
    authenticated_client,  # Authenticated Flask client
    test_bucket,           # Empty test bucket
    test_bucket_with_data, # Bucket with sample data
    s3_client,             # Boto3 S3 client
    page,                  # Playwright page
    base_url               # App base URL
):
    # Your test here
    pass
```

## CI/CD Integration

### GitHub Actions

The workflow in `.github/workflows/test.yml` is configured for **manual triggering**:

**To run tests:**
1. Go to your GitHub repository
2. Click **Actions** tab
3. Select **Tests** workflow from the left sidebar
4. Click **Run workflow** button
5. Choose which test suite to run:
   - `all` - Run all test suites (default)
   - `backend` - Backend API tests only
   - `e2e` - E2E UI tests only
   - `integration` - Integration tests only
   - `code-quality` - Code quality checks only
6. Click **Run workflow**

**Workflow jobs:**
- **Backend Tests** - API tests with LocalStack
- **E2E Tests** - UI tests with Playwright
- **Integration Tests** - Docker-based integration tests
- **Code Quality** - Black, Flake8, MyPy checks

**Features:**
- Coverage reporting to Codecov
- Test artifacts on failure (videos, screenshots, logs)
- Separate job for each test type
- Manual control over which tests to run

### Docker Test Environment

Create `docker-compose.test.yml`:

```yaml
version: '3.8'

services:
  localstack:
    image: localstack/localstack:latest
    environment:
      - SERVICES=s3
      - PERSISTENCE=1
    ports:
      - "4566:4566"
    volumes:
      - localstack-data:/var/lib/localstack
  
  test-runner:
    build:
      context: .
      dockerfile: Dockerfile.dev
    depends_on:
      - localstack
    environment:
      - S3_ENDPOINT=http://localstack:4566
      - LOCAL_DEV_MODE=true
    volumes:
      - .:/app
    command: pytest -v

volumes:
  localstack-data:
```

**Run tests:**
```bash
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

## Troubleshooting

### LocalStack Connection Issues

**Problem:** Tests fail with S3 connection errors

**Solution:**
```bash
# Check LocalStack is running
docker ps | grep localstack

# Check LocalStack health
curl http://localhost:4566/_localstack/health

# Restart LocalStack
docker-compose restart localstack

# Verify S3 endpoint
aws --endpoint-url=http://localhost:4566 s3 ls
```

### E2E Tests Timing Out

**Problem:** E2E tests timeout waiting for elements

**Solution:**
```python
# Increase timeout
page.wait_for_selector("#element", timeout=10000)  # 10 seconds

# Use explicit waits
expect(page.locator("#element")).to_be_visible(timeout=10000)

# Check if element exists
if page.locator("#element").count() > 0:
    page.click("#element")
```

### Test Isolation Issues

**Problem:** Tests pass individually but fail when run together

**Solution:**
```python
# Ensure proper cleanup in fixtures
@pytest.fixture
def my_fixture():
    # Setup
    resource = create_resource()
    yield resource
    # Teardown - CRITICAL!
    cleanup_resource(resource)

# Use function scope for most fixtures
@pytest.fixture(scope="function")  # New instance per test
```

### Coverage Not Accurate

**Problem:** Coverage report shows low coverage despite tests

**Solution:**
```bash
# Run with coverage tracking
pytest --cov=app --cov-report=html --cov-report=term-missing

# Check which lines are missing
cat htmlcov/index.html

# Exclude test files from coverage
pytest --cov=app --cov-report=html --omit="*/tests/*"
```

### Playwright Installation Issues

**Problem:** Playwright browsers not installing

**Solution:**
```bash
# Install with dependencies
playwright install --with-deps chromium

# Install system dependencies (Linux)
playwright install-deps

# Use Docker image with browsers pre-installed
docker run -it mcr.microsoft.com/playwright/python:v1.49.0-jammy
```

### Slow Test Execution

**Solution:**
```bash
# Run in parallel
pytest -n auto

# Run only fast tests
pytest -m "not slow"

# Profile slow tests
pytest --durations=10
```

## Best Practices

1. **Test Isolation** - Each test should be independent
2. **Use Fixtures** - Share setup code via fixtures
3. **Descriptive Names** - Test names should describe what they test
4. **One Assert Per Test** - Focus each test on one behavior
5. **Clean Up** - Always clean up resources in fixtures
6. **Mock External Services** - Don't call production APIs in tests
7. **Run Locally** - Tests should pass locally before CI
8. **Fast Feedback** - Keep unit tests fast (<1s each)
9. **Meaningful Markers** - Tag tests appropriately
10. **Document Complex Tests** - Add comments explaining "why"

## Resources

- [Pytest Documentation](https://docs.pytest.org/)
- [Playwright for Python](https://playwright.dev/python/)
- [LocalStack Documentation](https://docs.localstack.cloud/)
- [Coverage.py](https://coverage.readthedocs.io/)

## Contributing Tests

When adding new features:

1. Write backend API tests first (TDD)
2. Add E2E tests for user-facing features
3. Ensure tests are isolated and repeatable
4. Add appropriate markers
5. Update this documentation
6. Verify tests pass in CI

**Test Coverage Goals:**
- Backend endpoints: >90%
- Critical user flows: 100%
- Overall coverage: >80%
