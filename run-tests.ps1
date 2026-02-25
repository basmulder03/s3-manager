# Test runner script for S3 Manager (Windows)
# Provides a simple interface to run different test suites

$ErrorActionPreference = "Stop"

# Colors
function Print-Header {
    param($Message)
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host $Message -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Green
}

function Print-Success {
    param($Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Print-Warning {
    param($Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Print-Error {
    param($Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Check-LocalStack {
    Write-Host "Checking LocalStack..."
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:4566/_localstack/health" -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.Content -match "s3") {
            Print-Success "LocalStack is running and S3 is available"
            return $true
        }
    } catch {
        Print-Error "LocalStack is not available at http://localhost:4566"
        return $false
    }
    return $false
}

function Start-LocalStack {
    Print-Warning "Starting LocalStack..."
    
    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        docker-compose up -d localstack
    } elseif (Get-Command docker -ErrorAction SilentlyContinue) {
        docker compose up -d localstack
    } else {
        Print-Error "Docker not found. Please start LocalStack manually."
        exit 1
    }
    
    Write-Host "Waiting for LocalStack to be ready..."
    for ($i = 1; $i -le 30; $i++) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:4566/_localstack/health" -UseBasicParsing -ErrorAction SilentlyContinue
            if ($response.Content -match "s3") {
                Print-Success "LocalStack is ready"
                return $true
            }
        } catch {}
        Start-Sleep -Seconds 2
    }
    
    Print-Error "LocalStack failed to start"
    return $false
}

# Main script
$command = if ($args.Count -gt 0) { $args[0] } else { "all" }
$additionalArgs = if ($args.Count -gt 1) { $args[1..($args.Count-1)] } else { @() }

switch ($command) {
    { $_ -in "backend", "api" } {
        Print-Header "Running Backend API Tests"
        
        if (-not (Check-LocalStack)) {
            if (-not (Start-LocalStack)) {
                exit 1
            }
        }
        
        pytest tests/test_api_*.py -v @additionalArgs
    }
    
    { $_ -in "e2e", "ui" } {
        Print-Header "Running E2E UI Tests"
        
        if (-not (Check-LocalStack)) {
            if (-not (Start-LocalStack)) {
                exit 1
            }
        }
        
        # Check if app is running
        try {
            Invoke-WebRequest -Uri "http://localhost:8080" -UseBasicParsing -ErrorAction Stop | Out-Null
        } catch {
            Print-Warning "Application is not running. Please start it with 'make start' or 'python run.py'"
            exit 1
        }
        
        # Check if Playwright is installed
        if (-not (Get-Command playwright -ErrorAction SilentlyContinue)) {
            Print-Warning "Installing Playwright browsers..."
            playwright install chromium
        }
        
        pytest tests/test_e2e_*.py -v @additionalArgs
    }
    
    "integration" {
        Print-Header "Running Integration Tests"
        
        if (-not (Check-LocalStack)) {
            if (-not (Start-LocalStack)) {
                exit 1
            }
        }
        
        pytest -m integration -v @additionalArgs
    }
    
    "unit" {
        Print-Header "Running Unit Tests"
        pytest -m unit -v @additionalArgs
    }
    
    { $_ -in "coverage", "cov" } {
        Print-Header "Running Tests with Coverage"
        
        if (-not (Check-LocalStack)) {
            if (-not (Start-LocalStack)) {
                exit 1
            }
        }
        
        pytest --cov=app --cov-report=html --cov-report=term-missing -v @additionalArgs
        Print-Success "Coverage report generated in htmlcov/index.html"
    }
    
    "docker" {
        Print-Header "Running Tests in Docker"
        
        if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
            $composeCmd = "docker-compose"
        } elseif (Get-Command docker -ErrorAction SilentlyContinue) {
            $composeCmd = "docker"
            docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test-runner
            docker compose -f docker-compose.test.yml down -v
            break
        } else {
            Print-Error "Docker not found"
            exit 1
        }
        
        & $composeCmd -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test-runner
        & $composeCmd -f docker-compose.test.yml down -v
    }
    
    "quick" {
        Print-Header "Running Quick Smoke Test"
        pytest tests/test_api_browse.py::TestBrowseEndpoint::test_browse_root_no_buckets -v
        Print-Success "Quick smoke test passed!"
    }
    
    "all" {
        Print-Header "Running All Tests"
        
        if (-not (Check-LocalStack)) {
            if (-not (Start-LocalStack)) {
                exit 1
            }
        }
        
        pytest -v @additionalArgs
    }
    
    { $_ -in "help", "--help", "-h" } {
        Write-Host "S3 Manager Test Runner"
        Write-Host ""
        Write-Host "Usage: .\run-tests.ps1 [command] [pytest-args]"
        Write-Host ""
        Write-Host "Commands:"
        Write-Host "  backend     Run backend API tests (requires LocalStack)"
        Write-Host "  e2e         Run E2E UI tests (requires app + LocalStack)"
        Write-Host "  integration Run integration tests (requires LocalStack)"
        Write-Host "  unit        Run unit tests (no dependencies)"
        Write-Host "  coverage    Run tests with coverage report"
        Write-Host "  docker      Run tests in Docker containers"
        Write-Host "  quick       Run quick smoke test"
        Write-Host "  all         Run all tests (default)"
        Write-Host "  help        Show this help message"
        Write-Host ""
        Write-Host "Examples:"
        Write-Host "  .\run-tests.ps1 backend              # Run backend tests"
        Write-Host "  .\run-tests.ps1 e2e --headed         # Run E2E tests with visible browser"
        Write-Host "  .\run-tests.ps1 coverage             # Generate coverage report"
        Write-Host "  .\run-tests.ps1 all -k test_upload   # Run all tests matching 'test_upload'"
        Write-Host ""
    }
    
    default {
        Print-Error "Unknown command: $command"
        Write-Host "Run '.\run-tests.ps1 help' for usage information"
        exit 1
    }
}
