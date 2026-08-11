@echo off
title HERE COMES THE TRUCK
cd /d "%~dp0"
set NODE=C:\Users\kylef\tools\node\node.exe
if not exist "%NODE%" set NODE=node
start "" http://localhost:8456
"%NODE%" serve.mjs
