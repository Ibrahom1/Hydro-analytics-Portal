@echo off
call "D:\portals\Hydro Analytics 2026 v1.26\.venv\Scripts\activate.bat"
cd /d "D:\portals\Hydro Analytics 2026 v1.26\"
"D:\portals\Hydro Analytics 2026 v1.26\.venv\Scripts\python.exe" -m uvicorn gis_uploader_backend.app:app --host 0.0.0.0 --port 8001
pause
