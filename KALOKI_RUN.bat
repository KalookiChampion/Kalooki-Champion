@echo off
title KALOKI Server

echo Installing dependencies (first time setup)...
call npm install

echo.
echo Starting KALOKI server...
start "" cmd /k "npm start"

timeout /t 3 >nul

echo Opening browser...
start "" http://localhost:5000/

exit
