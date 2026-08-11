@echo off
title HERE COMES THE TRUCK - deploy
cd /d "%~dp0"
set GH=C:\Users\kylef\tools\gh\bin\gh.exe
set MSG=%*
if "%MSG%"=="" set MSG=update
echo.
echo Committing and pushing: %MSG%
git add -A
git commit -m "%MSG%"
git push origin main
if errorlevel 1 goto fail
echo.
echo Pushed. Live in a minute or two at:
echo   https://kylefriesmarketing.github.io/here-comes-the-truck/
pause
exit /b 0
:fail
echo.
echo *** PUSH FAILED ***
pause
exit /b 1
