@echo off
cd /d "%~dp0"

:: 1. Check if dependencies exist. If not, install them automatically.
if not exist "node_modules" (
    echo [System] First time setup detected. Installing dependencies...
    call npm install
    echo [System] Installing Browser Engine...
    call npx playwright install chromium
)

:: 2. Start the App
echo [System] Starting RoninClip...
npm run dev

:: 3. Keep window open if it crashes
pause