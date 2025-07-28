@echo off
echo Setting up AI Training Platform...

REM Check if Docker is running
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not installed or not running
    echo Please install Docker Desktop and make sure it's running
    pause
    exit /b 1
)

echo Docker found. Checking Docker Desktop status...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker Desktop is not running
    echo Please start Docker Desktop and try again
    pause
    exit /b 1
)

echo Pulling required Docker images...
docker pull redis:7-alpine
docker pull postgres:15-alpine
docker pull minio/minio:latest
docker pull minio/mc:latest

echo Building application...
docker-compose down -v 2>nul
docker-compose build --no-cache

echo Starting services...
docker-compose up -d

echo Waiting for services to be ready...
timeout /t 10 /nobreak >nul

echo Checking service status...
docker-compose ps

echo.
echo ========================================
echo AI Training Platform is starting up!
echo ========================================
echo.
echo Services will be available at:
echo - API: http://localhost:8000
echo - API Docs: http://localhost:8000/docs
echo - MinIO Console: http://localhost:9001
echo - Flower (Celery Monitor): http://localhost:5555
echo.
echo MinIO Credentials:
echo - Username: minioadmin
echo - Password: minioadmin123
echo.
echo Check logs with: docker-compose logs -f
echo Stop with: docker-compose down
echo.
pause
