@echo off
REM ===========================================================================
REM  YUGM AI - local development launcher
REM  Installs server dependencies if needed, starts the Express server (which
REM  also serves the static front-end), and opens the site in your browser.
REM ===========================================================================

setlocal
cd /d "%~dp0"

echo.
echo  ===============================================
echo   YUGM AI - starting local server
echo  ===============================================
echo.

REM --- Check Node is installed --------------------------------------------------
where node >nul 2>nul
if errorlevel 1 goto no_node

REM --- Warn if port 3000 is already in use --------------------------------------
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul
if not errorlevel 1 goto port_busy
goto start_server

:port_busy
echo  [WARNING] Something is already using port 3000.
echo  This is usually an old server window still running.
echo  Close that window, then run this file again.
echo.
echo  Press any key to try starting anyway (it may fail)...
pause >nul

:start_server
cd server

REM --- Install dependencies the first time -------------------------------------
if not exist "node_modules" call npm install
if errorlevel 1 goto install_failed

REM --- Open the browser once the server has had a moment to boot ----------------
echo.
echo  The site will open in your browser in a few seconds...
start "" cmd /c "timeout /t 4 /nobreak >nul & start "" http://localhost:3000"

echo.
echo  Server logs (press Ctrl+C to stop):
echo  -----------------------------------------------
call npm start

echo.
echo  -----------------------------------------------
echo  The server has stopped. Read any error message above.
echo  If it says EADDRINUSE, port 3000 was busy - close other windows.
echo.
pause
goto end

:no_node
echo  [ERROR] Node.js was not found on this machine.
echo  Install it from https://nodejs.org/ and run this file again.
echo.
pause
goto end

:install_failed
echo  [ERROR] npm install failed. See the messages above.
echo.
pause
goto end

:end
endlocal
