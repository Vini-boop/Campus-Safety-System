@echo off
REM Campus Safety App - APK Build Script for Windows
REM This script automates the APK build process using EAS Build

echo.
echo ========================================
echo Campus Safety App - APK Build Script
echo ========================================
echo.

REM Check if EAS CLI is installed
where eas >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] EAS CLI is not installed
    echo [INFO] Installing EAS CLI...
    call npm install -g eas-cli
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install EAS CLI
        pause
        exit /b 1
    )
    echo [SUCCESS] EAS CLI installed successfully
) else (
    echo [SUCCESS] EAS CLI is already installed
)

echo.
echo [INFO] Checking Expo authentication...

REM Check if user is logged in
eas whoami >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Not logged in to Expo
    echo [INFO] Please login to your Expo account:
    call eas login
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Login failed
        pause
        exit /b 1
    )
)

for /f "tokens=*" %%i in ('eas whoami') do set EXPO_USER=%%i
echo [SUCCESS] Logged in as: %EXPO_USER%

echo.
echo ========================================
echo Select build profile:
echo ========================================
echo   1) Preview (APK for testing - Recommended)
echo   2) Development (APK with debugging)
echo   3) Production (AAB for Play Store)
echo.
set /p choice="Enter choice [1-3]: "

if "%choice%"=="1" (
    set PROFILE=preview
    echo [INFO] Building Preview APK...
) else if "%choice%"=="2" (
    set PROFILE=development
    echo [INFO] Building Development APK...
) else if "%choice%"=="3" (
    set PROFILE=production
    echo [INFO] Building Production AAB...
) else (
    echo [WARNING] Invalid choice. Defaulting to Preview.
    set PROFILE=preview
)

echo.
echo [INFO] Checking environment configuration...

REM Check if .env file exists
if not exist ".env" (
    echo [WARNING] .env file not found
    echo            Make sure all environment variables are configured
)

REM Check if google-services.json exists
if not exist "android\app\google-services.json" (
    echo [WARNING] google-services.json not found in android\app\
    echo            Firebase services may not work correctly
)

echo.
echo ========================================
echo Starting EAS Build
echo ========================================
echo   Profile: %PROFILE%
echo   Platform: Android
echo.

REM Start the build
call eas build --platform android --profile %PROFILE%

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Build submission failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo Build submitted successfully!
echo ========================================
echo.
echo Next steps:
echo   1. Wait for the build to complete (10-20 minutes)
echo   2. Download the APK from the provided link
echo   3. Install on your Android device
echo.
echo View build status at:
echo https://expo.dev/accounts/%EXPO_USER%/projects/mobile/builds
echo.

pause
