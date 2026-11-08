@echo off
rem ==========================================================================
rem  GastroBar Torero - Reproductor de pantallas (Windows)
rem  Abre /pantalla en Google Chrome a pantalla completa (modo quiosco).
rem  1) Cambia la direccion de abajo por la de tu web (https://...).
rem  2) Para que arranque solo: Win+R, escribe  shell:startup  y copia ahi
rem     un acceso directo a este archivo.
rem  Para salir del modo quiosco: Alt+F4.
rem ==========================================================================
set "WEB=https://TU-WEB.netlify.app/pantalla?kiosk=1"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo No se encuentra Google Chrome. Instalalo desde https://www.google.com/chrome/
  pause
  exit /b 1
)

rem Espera unos segundos a que haya red tras encender el equipo.
timeout /t 15 /nobreak >nul

start "" "%CHROME%" --kiosk --start-fullscreen --noerrdialogs --disable-session-crashed-bubble --disable-infobars --autoplay-policy=no-user-gesture-required --user-data-dir="%LocalAppData%\ToreroPantalla" "%WEB%"
