@echo off
rem ==========================================================================
rem  CIRCLO local preview - double-click to run.
rem  Serves this folder at http://localhost:PORT/ and opens your browser.
rem  Uses Python's built-in web server if installed, otherwise PowerShell
rem  (built into Windows). Nothing is installed.
rem  To stop: press Ctrl+C in this window (then Y), or just close the window.
rem ==========================================================================
setlocal EnableExtensions EnableDelayedExpansion
title CIRCLO local server
cd /d "%~dp0"

if not exist "index.html" (
  echo [ERROR] index.html was not found next to this file.
  echo Keep run-circlo.bat inside the CIRCLO project folder.
  pause
  exit /b 1
)

rem ---- find a free port, starting at 8080 ----
set PORT=8080
:checkport
netstat -ano -p tcp | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo Port %PORT% is busy, trying the next one...
  set /a PORT+=1
  if !PORT! GTR 8099 (
    echo [ERROR] Ports 8080-8099 are all in use. Close other local servers and try again.
    pause
    exit /b 1
  )
  goto checkport
)

rem ---- pick a runtime: Python 3 if available, otherwise PowerShell ----
set "RUNTIME="
py -3 --version >nul 2>&1 && set "RUNTIME=py -3"
if not defined RUNTIME (
  python --version >nul 2>&1 && set "RUNTIME=python"
)

echo.
echo  ==========================================================
echo    CIRCLO is running at:  http://localhost:%PORT%/
echo    Admin sign-in:         http://localhost:%PORT%/admin/login.html
echo.
echo    This serves the WEBSITE FILES only. config.js decides the
echo    backend: if API_URL is set, this local copy uses the LIVE
echo    Google backend, so anything you submit here is REAL data.
echo.
echo    To stop the server: press Ctrl+C (then Y), or close this window.
echo  ==========================================================
echo.

rem open the browser after the server has had a moment to start
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:%PORT%/'"

if defined RUNTIME (
  echo Using Python: %RUNTIME%
  %RUNTIME% -m http.server %PORT% --bind 127.0.0.1
) else (
  echo Python not found - using the built-in PowerShell server.
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" -Port %PORT% -Root "%~dp0."
)

echo.
echo The CIRCLO server has stopped.
pause
