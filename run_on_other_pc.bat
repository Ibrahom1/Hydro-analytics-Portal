@echo off
setlocal enabledelayedexpansion

:: Force working directory to be the directory of this script, handling drive changes (e.g. D: to C:)
cd /d "%~dp0"

echo =========================================================
echo  💧 HYDRO ANALYTICS PORTABLE MULTI-PC RUNNER 💧
echo =========================================================
echo.

:: Helper function to check if a port is in use and find the next free one
call :FindFreePort 8000 PROXY_PORT
call :FindFreePort 5504 UI_PORT
call :FindFreePort 5000 DASHBOARD_PORT
call :FindFreePort 8001 GIS_PORT

echo Selected Ports:
echo   Reverse Proxy Port (cloudflared target): !PROXY_PORT!
echo   Frontend UI HTTP Server Port:            !UI_PORT!
echo   Dashboard Flask Backend Port:           !DASHBOARD_PORT!
echo   GIS Uploader FastAPI Port:               !GIS_PORT!
echo.
echo ---------------------------------------------------------
echo Step 1: Running Waterdashboard updates and starting backends...
echo ---------------------------------------------------------
:: Exporting variables so child bat inherits them
set "DASHBOARD_PORT=!DASHBOARD_PORT!"
set "GIS_PORT=!GIS_PORT!"
call "%~dp0update_waterdashboard_and_run.bat" --nopause

echo ---------------------------------------------------------
echo Step 2: Starting HTTP server for Frontend UI on port !UI_PORT!...
echo ---------------------------------------------------------
start "Hydro Front-End HTTP Server" /d "%~dp0" cmd /c "python -m http.server !UI_PORT!"

echo ---------------------------------------------------------
echo Step 3: Starting Reverse Proxy (proxy.py) on port !PROXY_PORT!...
echo ---------------------------------------------------------
:: Exporting variables so proxy.py inherits them
set "PROXY_PORT=!PROXY_PORT!"
set "UI_PORT=!UI_PORT!"
start "Hydro Reverse Proxy" /d "%~dp0" cmd /k ".venv\Scripts\python.exe proxy.py"

echo ---------------------------------------------------------
echo Step 4: Starting Cloudflare Tunnel to expose Proxy Port !PROXY_PORT!...
echo ---------------------------------------------------------
if exist "%~dp0cloudflared.exe" (
    start "Cloudflare Tunnel" /d "%~dp0" cmd /k "cloudflared.exe tunnel --url http://127.0.0.1:!PROXY_PORT!"
) else (
    echo [WARNING] cloudflared.exe not found in the current folder. Skipping tunnel.
)

echo.
echo =========================================================
echo  🎉 SERVER INITIALIZATION COMPLETE! 🎉
echo =========================================================
echo   Local Frontend UI:   http://localhost:!UI_PORT!/index.html
echo   Local Reverse Proxy: http://localhost:!PROXY_PORT!
echo.
echo   Check the separate console windows for logs.
echo   The Cloudflare Tunnel terminal will display your public share URL.
echo =========================================================
pause
goto :eof

:FindFreePort
set "PORT_TO_CHECK=%~1"
set "PORT_VAR_NAME=%~2"
:CheckPortLoop
netstat -ano | findstr /r /c:":%PORT_TO_CHECK% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo Port %PORT_TO_CHECK% is already in use. Checking next port...
    set /a PORT_TO_CHECK+=1
    goto CheckPortLoop
)
set "%PORT_VAR_NAME%=%PORT_TO_CHECK%"
goto :eof
