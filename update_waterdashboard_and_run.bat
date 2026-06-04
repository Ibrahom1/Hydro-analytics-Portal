@echo off
setlocal

set "REPO_ROOT=%~dp0"
set "VENV_DIR=%REPO_ROOT%.venv"
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"
set "VENV_ACTIVATE=%VENV_DIR%\Scripts\activate.bat"
set "DASHBOARD_RUNNER=%REPO_ROOT%.run_hydro_dashboard_backend.cmd"
set "GIS_RUNNER=%REPO_ROOT%.run_hydro_gis_uploader.cmd"
set "BOOTSTRAP_PYTHON="

where py >nul 2>&1
if not errorlevel 1 (
  py -3 -c "import sys" >nul 2>&1
  if not errorlevel 1 (
    set "BOOTSTRAP_PYTHON=py -3"
  )
)

if not defined BOOTSTRAP_PYTHON (
  where python >nul 2>&1
  if not errorlevel 1 (
    python -c "import sys" >nul 2>&1
    if not errorlevel 1 (
      set "BOOTSTRAP_PYTHON=python"
    )
  )
)

if not defined BOOTSTRAP_PYTHON (
  echo Failed to find a working Python installation.
  echo Please install Python 3 and make sure py -3 or python works from Command Prompt.
  pause
  exit /b 1
)

echo Updating waterdashboard repository if Git is available...
where git >nul 2>&1
if errorlevel 1 (
  echo Git not found. Skipping waterdashboard git pull.
) else (
  git -C "%REPO_ROOT%waterdashboard" pull
  if errorlevel 1 (
    echo Warning: Git pull failed. Continuing with local files.
  )
)

set "RECREATE_VENV="
if exist "%VENV_PYTHON%" (
  "%VENV_PYTHON%" -c "import sys" >nul 2>&1
  if errorlevel 1 (
    echo Existing virtual environment is not usable on this PC.
    echo It may have been copied from another Windows user or Python install.
    set "RECREATE_VENV=1"
  )
) else (
  set "RECREATE_VENV=1"
)

if defined RECREATE_VENV (
  if exist "%VENV_DIR%" (
    echo Removing stale project virtual environment at "%VENV_DIR%"...
    rmdir /s /q "%VENV_DIR%"
    if errorlevel 1 (
      echo Failed to remove stale virtual environment.
      echo Close any terminals using "%VENV_DIR%" and run this file again.
      pause
      exit /b 1
    )
  )

  echo Creating project virtual environment at "%VENV_DIR%" using %BOOTSTRAP_PYTHON%...
  %BOOTSTRAP_PYTHON% -m venv "%VENV_DIR%"
  if errorlevel 1 (
    echo Failed to create virtual environment.
    echo Please confirm Python is installed and available as py -3 or python.
    pause
    exit /b 1
  )

  echo Bootstrapping and upgrading pip...
  "%VENV_PYTHON%" -m ensurepip --upgrade >nul 2>&1
  "%VENV_PYTHON%" -m pip install --upgrade pip
  if errorlevel 1 (
    echo Failed to upgrade pip inside the virtual environment.
    pause
    exit /b 1
  )
)

"%VENV_PYTHON%" -c "import sys" >nul 2>&1
if errorlevel 1 (
  echo The project virtual environment still cannot run Python.
  echo Delete "%VENV_DIR%" manually and run this file again.
  pause
  exit /b 1
)

echo Installing Python dependencies...
"%VENV_PYTHON%" -m pip install ^
  -r "%REPO_ROOT%waterdashboard\backend\requirements.txt" ^
  -r "%REPO_ROOT%gis_uploader_backend\requirements.txt" ^
  pandas pdfplumber selenium
if errorlevel 1 (
  echo Dependency installation failed.
  pause
  exit /b 1
)

echo Skipping Indian dam snapshot refresh. Current CWC bulletin update is commented out.
rem Uncomment this block when the current CWC bulletin should update data\current_reservoir_snapshot.json again.
rem echo Updating Indian dam values from current CWC bulletin snapshot...
rem "%VENV_PYTHON%" "%REPO_ROOT%current_day_reservoir_snapshot.py"
rem if errorlevel 1 (
rem   echo Warning: Failed to refresh Indian dam snapshot. Continuing with existing Indian values.
rem )

echo Updating ft_and_percentage.js from Daily Water Situation.pdf...
"%VENV_PYTHON%" "%REPO_ROOT%res_storages\storages.py"
if errorlevel 1 (
  echo Failed to update dam values from PDF.
  pause
  exit /b 1
)

if not exist "%REPO_ROOT%waterdashboard\backend\app.py" (
  echo Failed to find Hydro Dashboard backend at "%REPO_ROOT%waterdashboard\backend\app.py".
  echo The dashboard API app.py belongs inside waterdashboard\backend, not the project root.
  pause
  exit /b 1
)

echo Checking for an existing Hydro Dashboard backend on port 5000...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":5000 .*LISTENING"') do (
  if not "%%P"=="0" (
    echo Stopping existing process on port 5000 ^(PID %%P^) so the latest backend code is used...
    taskkill /PID %%P /F >nul 2>&1
  )
)

echo Checking for an existing Hydro GIS Uploader API on port 8001...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":8001 .*LISTENING"') do (
  if not "%%P"=="0" (
    echo Stopping existing process on port 8001 ^(PID %%P^) so the latest GIS API code is used...
    taskkill /PID %%P /F >nul 2>&1
  )
)

echo Preparing Hydro Dashboard Backend runner...
(
  echo @echo off
  echo call "%VENV_ACTIVATE%"
  echo set "PORT=5000"
  echo cd /d "%REPO_ROOT%waterdashboard\backend"
  echo "%VENV_PYTHON%" app.py
  echo pause
) > "%DASHBOARD_RUNNER%"

echo Preparing Hydro GIS Uploader API runner...
(
  echo @echo off
  echo call "%VENV_ACTIVATE%"
  echo cd /d "%REPO_ROOT%"
  echo "%VENV_PYTHON%" -m uvicorn gis_uploader_backend.app:app --host 0.0.0.0 --port 8001
  echo pause
) > "%GIS_RUNNER%"

echo Starting Hydro Dashboard Backend on http://localhost:5000 ...
start "Hydro Dashboard Backend" "%DASHBOARD_RUNNER%"

echo Starting Hydro GIS Uploader API on http://localhost:8001 ...
start "Hydro GIS Uploader API" "%GIS_RUNNER%"

echo.
echo Backends started in separate windows:
echo   Hydro Dashboard Backend  - http://localhost:5000/api/health
echo   Hydro GIS Uploader API   - http://localhost:8001/api/gis/health
echo.
echo If either endpoint is not ready immediately, wait a few seconds for its window to finish starting.
echo.
pause

endlocal
