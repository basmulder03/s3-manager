@echo off
REM Quick start script for local development on Windows
REM This script helps you get started with S3 Manager local development

echo ==========================================
echo S3 Manager - Local Development Setup
echo ==========================================
echo.

REM Check if docker is available
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Docker not found
    echo Please install Docker Desktop for Windows first
    pause
    exit /b 1
)

REM Check if docker compose is available
docker compose version >nul 2>&1
if %errorlevel% neq 0 (
    docker-compose --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo Error: Docker Compose not found
        echo Please install Docker Compose first
        pause
        exit /b 1
    )
    set DOCKER_COMPOSE=docker-compose
) else (
    set DOCKER_COMPOSE=docker compose
)

echo Using Docker Compose command: %DOCKER_COMPOSE%
echo.

REM Create .env.local if it doesn't exist
if not exist .env.local (
    echo Creating .env.local file...
    copy .env.local .env.local 2>nul
)

echo Starting local development environment...
echo.
echo This will start:
echo   - LocalStack S3 service on port 4566
echo   - S3 Manager application on port 8080
echo.
echo Pre-configured test buckets:
echo   - test-bucket (empty^)
echo   - demo-bucket (with sample files^)
echo   - uploads (empty^)
echo.
echo You will be auto-logged in as 'Local Developer' with full permissions
echo.

REM Start docker-compose
%DOCKER_COMPOSE% up -d

echo.
echo ==========================================
echo Services started successfully!
echo ==========================================
echo.
echo Access the application at:
echo   http://localhost:8080
echo.
echo LocalStack S3 endpoint:
echo   http://localhost:4566
echo.
echo View logs:
echo   %DOCKER_COMPOSE% logs -f
echo.
echo Stop services:
echo   %DOCKER_COMPOSE% down
echo.
echo Stop and remove data:
echo   %DOCKER_COMPOSE% down -v
echo.
echo Waiting for services to be ready...

REM Wait for services to be healthy
set max_attempts=30
set attempt=0

:wait_localstack
if %attempt% geq %max_attempts% goto localstack_timeout
curl -s http://localhost:4566/_localstack/health >nul 2>&1
if %errorlevel% equ 0 (
    echo √ LocalStack is ready!
    goto wait_s3manager
)
set /a attempt+=1
echo   Waiting for LocalStack... (%attempt%/%max_attempts%^)
timeout /t 2 /nobreak >nul
goto wait_localstack

:localstack_timeout
echo Warning: LocalStack did not become ready in time
echo You can check logs with: %DOCKER_COMPOSE% logs localstack

:wait_s3manager
set attempt=0
:wait_s3manager_loop
if %attempt% geq %max_attempts% goto s3manager_timeout
curl -s http://localhost:8080/auth/user >nul 2>&1
if %errorlevel% equ 0 (
    echo √ S3 Manager is ready!
    echo.
    echo ==========================================
    echo Ready! Open http://localhost:8080
    echo ==========================================
    pause
    exit /b 0
)
set /a attempt+=1
echo   Waiting for S3 Manager... (%attempt%/%max_attempts%^)
timeout /t 2 /nobreak >nul
goto wait_s3manager_loop

:s3manager_timeout
echo Warning: S3 Manager did not become ready in time
echo You can check logs with: %DOCKER_COMPOSE% logs s3-manager
echo.
echo The services are running. Try accessing http://localhost:8080
pause
