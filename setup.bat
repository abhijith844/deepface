@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo   DeepFace Swap UI - Setup Script (Windows)
echo ==========================================
echo.

:: Clean up old Linux .venv file if it exists
if exist .venv (
    dir /ad .venv >nul 2>nul
    if errorlevel 1 (
        echo Clean up legacy .venv configuration file...
        del /f /q .venv
    )
)

:: Create Python virtual environment
echo Creating Python virtual environment...
python -m venv .venv
if %errorlevel% neq 0 (
    echo Error: Failed to create Python virtual environment. Make sure Python is installed and in your PATH.
    pause
    exit /b 1
)

:: Install Python dependencies
echo Installing Python dependencies...
call .venv\Scripts\activate
pip install --upgrade pip
:: Force uninstall CPU onnxruntime to avoid library conflicts with GPU version
echo Upgrading ONNX Runtime to GPU-accelerated version...
pip uninstall onnxruntime -y >nul 2>nul
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo Error: Failed to install Python dependencies.
    pause
    exit /b 1
)

:: Build React Frontend
echo Building React frontend...
cd face_swap_ui\frontend
call npm install
if %errorlevel% neq 0 (
    echo Error: npm install failed. Make sure Node.js is installed.
    cd ..\..
    pause
    exit /b 1
)
call npm run build
if %errorlevel% neq 0 (
    echo Error: npm build failed.
    cd ..\..
    pause
    exit /b 1
)
cd ..\..

:: Compile Go UI executable
echo Compiling Go Desktop/Server binary...
cd face_swap_ui
go build -o deepface_swap_ui.exe main.go sys_windows.go
if %errorlevel% neq 0 (
    echo Error: Go compilation failed. Make sure Go is installed.
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo ==========================================
echo   Setup Complete!
echo   Double-click run.bat to start the system.
echo ==========================================
pause
