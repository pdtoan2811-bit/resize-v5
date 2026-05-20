@echo off
REM Start the PSD worker (FastAPI) and the Next.js web app together (Windows).
REM Closing this window stops both.

setlocal
cd /d "%~dp0"

if "%WORKER_PORT%"=="" set WORKER_PORT=8787
if "%WEB_PORT%"=="" set WEB_PORT=3000

echo Starting Python worker on :%WORKER_PORT%
start "psd-worker" cmd /c "cd worker && uv run uvicorn app:app --host 127.0.0.1 --port %WORKER_PORT% --log-level warning"

echo Starting Next.js on :%WEB_PORT%
set PSD_WORKER_URL=http://127.0.0.1:%WORKER_PORT%
start "psd-web" cmd /c "cd web && pnpm dev --port %WEB_PORT%"

echo.
echo Open http://localhost:%WEB_PORT%
echo Close the spawned windows to stop the servers.
endlocal
