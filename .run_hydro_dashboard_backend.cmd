@echo off
call "D:\portals\Hydro Analytics 2026 v1.26\.venv\Scripts\activate.bat"
set "PORT=5000"
cd /d "D:\portals\Hydro Analytics 2026 v1.26\waterdashboard\backend"
"D:\portals\Hydro Analytics 2026 v1.26\.venv\Scripts\python.exe" app.py
pause
