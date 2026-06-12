@echo off
setlocal
set "REPO_ROOT=%~dp0"
set "VENV_DIR=%REPO_ROOT%.venv"
set "VENV_ACTIVATE=%VENV_DIR%\Scripts\activate.bat"
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"
set "PORT=5000"

if not exist "%VENV_PYTHON%" (
  echo Python virtual environment was not found at "%VENV_PYTHON%".
  echo Run update_waterdashboard_and_run.bat first to create/install dependencies.
  pause
  exit /b 1
)

if exist "%VENV_ACTIVATE%" call "%VENV_ACTIVATE%"
cd /d "%REPO_ROOT%waterdashboard\backend"
"%VENV_PYTHON%" app.py
pause
