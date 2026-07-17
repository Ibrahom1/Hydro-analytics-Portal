@echo off
:: ──────────────────────────────────────────────────────────────────────
:: start_bot.bat — Run the WhatsApp PDF bot manually
::
:: First-time usage:
::   1. Run this script
::   2. Scan the QR code with your phone
::   3. The session will be saved for future runs
:: ──────────────────────────────────────────────────────────────────────
cd /d "%~dp0"

:: Check Node.js is installed
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js is not installed or not in PATH.
    echo Download it from https://nodejs.org/
    pause
    exit /b 1
)

:: Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Failed to install dependencies.
        pause
        exit /b 1
    )
    echo.
)

echo ═══════════════════════════════════════════════════════
echo   WhatsApp Daily Water Situation PDF Bot
echo   Press Ctrl+C to stop the bot at any time
echo ═══════════════════════════════════════════════════════
echo.

node bot.js
pause
