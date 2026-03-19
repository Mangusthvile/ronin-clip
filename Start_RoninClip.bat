@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

:: 1. Check if dependencies exist. If not, install them automatically.
if not exist "node_modules" (
    echo [System] First time setup detected. Installing dependencies...
    call npm install
)

:: 2. Ensure Browser Engine is installed (skips if already installed)
echo [System] Verifying Browser Engine...
call npx -y playwright install chromium

:: 3. Check for Gemini API Key
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        if "%%A"=="GEMINI_API_KEY" set GEMINI_API_KEY=%%B
    )
)

if not defined GEMINI_API_KEY (
    echo.
    echo [System] GEMINI_API_KEY is not set.
    set /p NEW_KEY="Please enter your Gemini API Key: "
    set GEMINI_API_KEY=!NEW_KEY!
    echo GEMINI_API_KEY=!NEW_KEY!> .env
)

:: 4. Start the App and open browser
echo [System] Starting RoninClip...
start http://localhost:3000
npm run dev

:: 5. Keep window open if it crashes
pause