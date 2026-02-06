@echo off
setlocal


cd /d D:\IEEE_Hackeson\python_service


echo Working dir: %cd%


if not exist ".\.venv\Scripts\python.exe" (
  echo [ERROR] .venv not found. Please create venv first.
  echo Expected: D:\IEEE_Hackeson\python_service\.venv
  pause
  exit /b 1
)


if "%OPENAI_API_KEY%"=="" (
  echo [WARN] OPENAI_API_KEY not found in this window.
  echo If you already ran setx, close and reopen CMD/PowerShell and double-click again.
  echo If not set yet, run once in PowerShell:
  echo   setx OPENAI_API_KEY "sk-xxxx"
  echo.
)


".\.venv\Scripts\python.exe" server.py

echo.
echo Server stopped.
pause
