@echo off
setlocal

echo Updating waterdashboard...
git -C "waterdashboard" pull
if errorlevel 1 (
  echo Git pull failed.
  pause
  exit /b 1
)

echo Starting waterdashboard backend...
cd /d "%~dp0waterdashboard\backend"
python app.py

endlocal
