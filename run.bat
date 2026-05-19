@echo off
echo ==========================================
echo   DeepFace Swap UI - Launching System
echo ==========================================
echo.

echo Checking for leftover services on port 5000...
powershell -Command "Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo Checking for leftover services on port 8080...
powershell -Command "Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

echo Starting services...
cd face_swap_ui
deepface_swap_ui.exe
pause
