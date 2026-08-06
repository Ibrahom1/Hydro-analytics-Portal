@echo off
setlocal

set "REPO_ROOT=%~dp0"
set "VENV_DIR=%REPO_ROOT%.venv"
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"
set "VENV_ACTIVATE=%VENV_DIR%\Scripts\activate.bat"
set "DASHBOARD_RUNNER=%REPO_ROOT%.run_hydro_dashboard_backend.cmd"
set "GIS_RUNNER=%REPO_ROOT%.run_hydro_gis_uploader.cmd"
set "BOOTSTRAP_PYTHON="

if not defined DASHBOARD_PORT set "DASHBOARD_PORT=5000"
if not defined GIS_PORT set "GIS_PORT=8001"

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

echo Updating Hydro Analytics and waterdashboard repositories if Git is available...
set "HAS_GIT="
where git >nul 2>&1
if errorlevel 1 (
  echo Git not found. Skipping repository updates.
) else (
  set "HAS_GIT=1"
  pushd "%~dp0" >nul
  if errorlevel 1 (
    echo Warning: Could not enter this batch file folder. Skipping main Hydro Analytics git pull.
  ) else (
    git pull
    if errorlevel 1 (
      echo Warning: Main Hydro Analytics git pull failed. Continuing with local files.
    )
    popd >nul
  )

  pushd "%~dp0waterdashboard" >nul
  if errorlevel 1 (
    echo Warning: Could not enter waterdashboard folder. Skipping waterdashboard git pull.
  ) else (
    git pull
    if errorlevel 1 (
      echo Warning: waterdashboard git pull failed. Continuing with local files.
    )
    popd >nul
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
  pandas pdfplumber selenium cloudscraper playwright
if errorlevel 1 (
  echo Dependency installation failed.
  pause
  exit /b 1
)

echo Installing Playwright Chromium browser for FFD cookie scraping...
"%VENV_PYTHON%" -m playwright install chromium
if errorlevel 1 (
  echo Warning: Playwright Chromium install failed. FFD Other Gauges may not work.
)

echo Updating Indian dam values from Google Sheet...
"%VENV_PYTHON%" "%REPO_ROOT%res_storages\fetch_indian_dams_sheet.py"
if errorlevel 1 (
  echo Warning: Failed to refresh Indian dam values from Google Sheet. Continuing with existing values.
)

echo Updating ft_and_percentage.js from Daily Water Situation.pdf...
"%VENV_PYTHON%" "%REPO_ROOT%res_storages\storages.py"
if errorlevel 1 (
  echo Failed to update dam values from PDF.
  pause
  exit /b 1
)

echo Ingesting Daily Water Situation PDF into SQLite and historical archive...
"%VENV_PYTHON%" "%REPO_ROOT%res_storages\daily_water_situation_db.py"
if errorlevel 1 (
  echo Failed to ingest Daily Water Situation PDF into SQLite.
  pause
  exit /b 1
)

echo Ingesting KP Flood Report PDF into SQLite and historical archive...
"%VENV_PYTHON%" "%REPO_ROOT%res_kp\kp_stations_db.py"
if errorlevel 1 (
  echo Warning: Failed to ingest KP Flood Report PDF into SQLite.
)

echo Fetching latest FFD Other Gauges data from ffd.pmd.gov.pk...
"%VENV_PYTHON%" "%REPO_ROOT%fetch_other_gauges.py"
if errorlevel 1 (
  echo Warning: FFD Other Gauges fetch failed. Using cached latest_all_gauges.json if available.
)

if defined HAS_GIT (
  echo Committing Daily Water Situation PDF, SQLite, archive, and dashboard JS updates...
  pushd "%REPO_ROOT%" >nul
  if errorlevel 1 (
    echo Warning: Could not enter repository root. Skipping Daily Water Situation commit.
  ) else (
    git add "res_storages/Daily Water Situation.pdf" "res_storages/Historical Daily Storages" "data/daily_water_situation.sqlite" "script/ft_and_percentage.js" "res_kp/Flood Report.pdf" "res_kp/Historical KP Reports" "data/kp_stations_data.sqlite" "latest_all_gauges.json" "data/other_gauges.sqlite"
    if errorlevel 1 (
      echo Warning: Failed to stage Daily Water Situation updates. Continuing without commit.
    ) else (
      git diff --cached --quiet
      if errorlevel 1 (
        git commit -m "Update daily water situation data"
        if errorlevel 1 (
          echo Warning: Failed to commit Daily Water Situation updates. Continuing without push.
        ) else (
          git push
          if errorlevel 1 (
            echo Warning: Failed to push Daily Water Situation updates. Commit remains local.
          )
        )
      ) else (
        echo No Daily Water Situation changes to commit.
      )
    )
    popd >nul
  )
) else (
  echo Git not found. Daily Water Situation updates were not committed.
)

if not exist "%REPO_ROOT%waterdashboard\backend\app.py" (
  echo Failed to find Hydro Dashboard backend at "%REPO_ROOT%waterdashboard\backend\app.py".
  echo The dashboard API app.py belongs inside waterdashboard\backend, not the project root.
  pause
  exit /b 1
)

echo Checking for an existing Hydro Dashboard backend on port %DASHBOARD_PORT%...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%DASHBOARD_PORT% .*LISTENING"') do (
  if not "%%P"=="0" (
    echo Stopping existing process on port %DASHBOARD_PORT% ^(PID %%P^) so the latest backend code is used...
    taskkill /PID %%P /F >nul 2>&1
  )
)

echo Checking for an existing Hydro GIS Uploader API on port %GIS_PORT%...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%GIS_PORT% .*LISTENING"') do (
  if not "%%P"=="0" (
    echo Stopping existing process on port %GIS_PORT% ^(PID %%P^) so the latest GIS API code is used...
    taskkill /PID %%P /F >nul 2>&1
  )
)

echo Preparing Hydro Dashboard Backend runner...
(
  echo @echo off
  echo setlocal
  echo set "REPO_ROOT=%%~dp0"
  echo set "VENV_DIR=%%REPO_ROOT%%.venv"
  echo set "VENV_ACTIVATE=%%VENV_DIR%%\Scripts\activate.bat"
  echo set "VENV_PYTHON=%%VENV_DIR%%\Scripts\python.exe"
  echo set "PORT=%DASHBOARD_PORT%"
  echo.
  echo if not exist "%%VENV_PYTHON%%" ^(
  echo   echo Python virtual environment was not found at "%%VENV_PYTHON%%".
  echo   echo Run update_waterdashboard_and_run.bat first to create/install dependencies.
  echo   pause
  echo   exit /b 1
  echo ^)
  echo.
  echo if exist "%%VENV_ACTIVATE%%" call "%%VENV_ACTIVATE%%"
  echo cd /d "%%REPO_ROOT%%waterdashboard\backend"
  echo "%%VENV_PYTHON%%" app.py
  echo pause
) > "%DASHBOARD_RUNNER%"

echo Preparing Hydro GIS Uploader API runner...
(
  echo @echo off
  echo setlocal
  echo set "REPO_ROOT=%%~dp0"
  echo set "VENV_DIR=%%REPO_ROOT%%.venv"
  echo set "VENV_ACTIVATE=%%VENV_DIR%%\Scripts\activate.bat"
  echo set "VENV_PYTHON=%%VENV_DIR%%\Scripts\python.exe"
  echo.
  echo if not exist "%%VENV_PYTHON%%" ^(
  echo   echo Python virtual environment was not found at "%%VENV_PYTHON%%".
  echo   echo Run update_waterdashboard_and_run.bat first to create/install dependencies.
  echo   pause
  echo   exit /b 1
  echo ^)
  echo.
  echo if exist "%%VENV_ACTIVATE%%" call "%%VENV_ACTIVATE%%"
  echo cd /d "%%REPO_ROOT%%"
  echo "%%VENV_PYTHON%%" -m uvicorn gis_uploader_backend.app:app --host 0.0.0.0 --port %GIS_PORT% --reload
  echo pause
) > "%GIS_RUNNER%"

echo Starting Hydro Dashboard Backend on http://localhost:%DASHBOARD_PORT% ...
start "Hydro Dashboard Backend" "%DASHBOARD_RUNNER%"

echo Starting Hydro GIS Uploader API on http://localhost:%GIS_PORT% ...
start "Hydro GIS Uploader API" "%GIS_RUNNER%"

echo.
echo Backends started in separate windows:
echo   Hydro Dashboard Backend  - http://localhost:%DASHBOARD_PORT%/api/health
echo   Hydro GIS Uploader API   - http://localhost:%GIS_PORT%/api/gis/health
echo.
echo If either endpoint is not ready immediately, wait a few seconds for its window to finish starting.
echo.
if not "%~1"=="--nopause" pause

endlocal
