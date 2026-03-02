@echo off
setlocal

set "PYTHON_CMD=python"
where py >nul 2>&1
if not errorlevel 1 (
  set "PYTHON_CMD=py -3"
)

echo Updating waterdashboard...
git -C "waterdashboard" pull
if errorlevel 1 (
  echo Git pull failed.
  pause
  exit /b 1
)

echo Checking PDF parser dependency (pdfplumber)...
%PYTHON_CMD% -c "import pdfplumber" >nul 2>&1
if errorlevel 1 (
  echo pdfplumber not found. Installing...
  %PYTHON_CMD% -m pip install --user pdfplumber
  if errorlevel 1 (
    echo Standard install failed. Retrying with --break-system-packages...
    %PYTHON_CMD% -m pip install --user --break-system-packages pdfplumber
  )
  if errorlevel 1 (
    echo pip install failed. Trying to bootstrap pip and retry...
    %PYTHON_CMD% -m ensurepip --upgrade
    %PYTHON_CMD% -m pip install --user pdfplumber
  )
  if errorlevel 1 (
    echo Could not install pdfplumber automatically.
    echo Please run: %PYTHON_CMD% -m pip install --user pdfplumber
    pause
    exit /b 1
  )
)

echo Updating ft_and_percentage.js from Daily Water Situation.pdf...
%PYTHON_CMD% "%~dp0res_storages\storages.py"
if errorlevel 1 (
  echo Failed to update dam values from PDF.
  pause
  exit /b 1
)

echo Starting waterdashboard backend...
cd /d "%~dp0waterdashboard\backend"
%PYTHON_CMD% app.py

endlocal
