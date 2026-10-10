@echo off
setlocal
cd /d "%~dp0"

if not exist "frontend\out\index.html" (
  where npm >nul 2>nul
  if errorlevel 1 (
    echo frontend\out is missing and npm was not found.
    exit /b 1
  )
  echo Building frontend static export...
  call npm --prefix frontend run build
  if errorlevel 1 exit /b 1
)

if exist "backend\.venv\Scripts\python.exe" (
  "backend\.venv\Scripts\python.exe" -m backend.linkedin_demo
) else (
  py -m backend.linkedin_demo
)
