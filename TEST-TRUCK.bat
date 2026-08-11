@echo off
title HERE COMES THE TRUCK - tests
cd /d "%~dp0"
set NODE=C:\Users\kylef\tools\node\node.exe
if not exist "%NODE%" set NODE=node
echo.
echo === SOAK (the policy bot: full days through the real sim) ===
"%NODE%" tests\soak.mjs
if errorlevel 1 goto fail
echo.
echo === TRIALS (controlled economy cells, n^>=4) ===
"%NODE%" tests\trial.mjs
if errorlevel 1 goto fail
echo.
echo ALL GREEN.
pause
exit /b 0
:fail
echo.
echo *** TESTS FAILED ***
pause
exit /b 1
