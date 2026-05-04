@echo off
setlocal

set "REPO_ROOT=%~dp0"
set "BOOTSTRAP_PYTHON=python"
set "VENV_DIR=%REPO_ROOT%.venv"
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"
set "VENV_ACTIVATE=%VENV_DIR%\Scripts\activate.bat"
set "DASHBOARD_RUNNER=%REPO_ROOT%.run_hydro_dashboard_backend.cmd"
set "GIS_RUNNER=%REPO_ROOT%.run_hydro_gis_uploader.cmd"

where py >nul 2>&1
if not errorlevel 1 (
  set "BOOTSTRAP_PYTHON=py -3"
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

if not exist "%VENV_PYTHON%" (
  echo Creating project virtual environment at "%VENV_DIR%"...
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

echo Updating Indian dam values from current CWC bulletin snapshot...
"%VENV_PYTHON%" "%REPO_ROOT%current_day_reservoir_snapshot.py"
if errorlevel 1 (
  echo Warning: Failed to refresh Indian dam snapshot. Continuing with existing Indian values.
)

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

echo Starting Hydro Dashboard Backend on http://localhost:5000 ...
(
  echo @echo off
  echo call "%VENV_ACTIVATE%"
  echo set "PORT=5000"
  echo cd /d "%REPO_ROOT%waterdashboard\backend"
  echo python app.py
  echo pause
) > "%DASHBOARD_RUNNER%"
start "Hydro Dashboard Backend" "%DASHBOARD_RUNNER%"

echo Starting Hydro GIS Uploader API on http://localhost:8001 ...
(
  echo @echo off
  echo call "%VENV_ACTIVATE%"
  echo cd /d "%REPO_ROOT%"
  echo python -m uvicorn gis_uploader_backend.app:app --host 0.0.0.0 --port 8001
  echo pause
) > "%GIS_RUNNER%"
start "Hydro GIS Uploader API" "%GIS_RUNNER%"

echo.
echo Backends started in separate windows:
echo   Hydro Dashboard Backend  - http://localhost:5000/api/health
echo   Hydro GIS Uploader API   - http://localhost:8001/api/gis/health
echo.
pause

endlocal
