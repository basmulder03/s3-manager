@echo off
REM Quick start script for local development on Windows
REM This script helps you get started with S3 Manager local development
REM Supports Docker and Podman

echo ==========================================
echo S3 Manager - Local Development Setup
echo ==========================================
echo.

REM Function to detect container runtime
set RUNTIME=
set COMPOSE_CMD=

REM Check for podman first
podman version >nul 2>&1
if %errorlevel% equ 0 (
    set RUNTIME=podman
    REM Check for podman-compose
    podman-compose --version >nul 2>&1
    if %errorlevel% equ 0 (
        set COMPOSE_CMD=podman-compose
    ) else (
        REM Check for podman compose subcommand
        podman compose version >nul 2>&1
        if %errorlevel% equ 0 (
            set COMPOSE_CMD=podman compose
        )
    )
)

REM If podman not found, check for docker
if "%RUNTIME%"=="" (
    docker version >nul 2>&1
    if %errorlevel% equ 0 (
        set RUNTIME=docker
        REM Check for docker compose plugin
        docker compose version >nul 2>&1
        if %errorlevel% equ 0 (
            set COMPOSE_CMD=docker compose
        ) else (
            REM Check for docker-compose standalone
            docker-compose --version >nul 2>&1
            if %errorlevel% equ 0 (
                set COMPOSE_CMD=docker-compose
            )
        )
    )
)

REM Error if no runtime found
if "%RUNTIME%"=="" (
    echo Error: No container runtime found
    echo Please install one of the following:
    echo   - Docker Desktop for Windows
    echo   - Podman Desktop for Windows
    pause
    exit /b 1
)

echo √ Detected container runtime: %RUNTIME%

REM Error if no compose command found
if "%COMPOSE_CMD%"=="" (
    echo Error: No compose command found
    if "%RUNTIME%"=="podman" (
        echo Please install podman-compose:
        echo   pip install podman-compose
    ) else (
        echo Please ensure Docker Compose is installed
    )
    pause
    exit /b 1
)

echo √ Using compose command: %COMPOSE_CMD%
echo.

REM Select appropriate compose file
set COMPOSE_FILE=docker-compose.yml
if "%RUNTIME%"=="podman" (
    if exist podman-compose.yml (
        set COMPOSE_FILE=podman-compose.yml
        echo √ Using Podman-specific compose file
    )
) else (
    echo √ Using standard compose file
)

REM Create .env.local if it doesn't exist
if not exist .env.local (
    echo Creating .env.local file...
    (
        echo LOCAL_DEV_MODE=true
        echo FLASK_DEBUG=true
        echo SECRET_KEY=dev-secret-key-change-in-production
        echo DEFAULT_ROLE=S3-Admin
        echo S3_ENDPOINT=http://localhost:4566
        echo S3_ACCESS_KEY=test
        echo S3_SECRET_KEY=test
        echo S3_REGION=us-east-1
        echo S3_USE_SSL=false
        echo S3_VERIFY_SSL=false
        echo SESSION_COOKIE_SECURE=false
    ) > .env.local
)

echo.
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

REM Start compose
%COMPOSE_CMD% -f %COMPOSE_FILE% up -d

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
echo   %COMPOSE_CMD% -f %COMPOSE_FILE% logs -f
echo.
echo Stop services:
echo   %COMPOSE_CMD% -f %COMPOSE_FILE% down
echo.
echo Stop and remove data:
echo   %COMPOSE_CMD% -f %COMPOSE_FILE% down -v
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
echo You can check logs with: %COMPOSE_CMD% -f %COMPOSE_FILE% logs localstack

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
echo You can check logs with: %COMPOSE_CMD% -f %COMPOSE_FILE% logs s3-manager
echo.
echo The services are running. Try accessing http://localhost:8080
pause
