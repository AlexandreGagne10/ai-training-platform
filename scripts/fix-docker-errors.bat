@echo off
echo Fixing Docker Compose Errors for AI Training Platform...

REM Stop any running containers
echo Stopping existing containers...
docker-compose down -v 2>nul

REM Remove old images
echo Cleaning up old images...
docker system prune -f

REM Check Docker version
echo Checking Docker version...
docker --version
docker-compose --version

REM Pull fresh images
echo Pulling fresh images...
docker pull redis:7-alpine
docker pull postgres:15-alpine  
docker pull minio/minio:latest
docker pull minio/mc:latest

REM Fix common Windows issues
echo Checking Windows Docker settings...

REM Restart Docker Desktop (requires admin)
echo Restarting Docker Desktop...
taskkill /f /im "Docker Desktop.exe" 2>nul
timeout /t 5 /nobreak >nul
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"

echo Waiting for Docker to restart...
timeout /t 30 /nobreak >nul

REM Wait for Docker to be ready
:wait_docker
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Waiting for Docker to be ready...
    timeout /t 5 /nobreak >nul
    goto wait_docker
)

echo Docker is ready!

REM Build with no cache
echo Building with no cache...
docker-compose build --no-cache --pull

REM Start services
echo Starting services...
docker-compose up -d

echo.
echo ========================================
echo Error fixes applied!
echo ========================================
echo.
echo If you still get errors, try:
echo 1. Restart your computer
echo 2. Update Docker Desktop
echo 3. Check Windows WSL2 installation
echo 4. Run as Administrator
echo.
pause
