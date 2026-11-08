#!/bin/bash
# ==========================================================================
#  GastroBar Torero - Reproductor de pantallas (macOS)
#  Abre /pantalla en Google Chrome a pantalla completa (modo quiosco).
#  1) Cambia la dirección de abajo por la de tu web (https://...).
#  2) La primera vez: clic derecho → Abrir (para autorizar el archivo).
#  3) Para que arranque solo: Ajustes del Sistema → General → Ítems de inicio
#     → «+» y elige este archivo.
#  Para salir del modo quiosco: Cmd+Q.
# ==========================================================================
WEB="https://TU-WEB.netlify.app/pantalla?kiosk=1"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -x "$CHROME" ]; then
  echo "No se encuentra Google Chrome. Instálalo desde https://www.google.com/chrome/"
  read -r -p "Pulsa Intro para cerrar"
  exit 1
fi

# Espera a que haya red tras encender el equipo.
sleep 15

# Evita que el Mac duerma la pantalla mientras el reproductor está abierto.
caffeinate -dimsu &

"$CHROME" --kiosk --noerrdialogs --disable-session-crashed-bubble --disable-infobars \
  --autoplay-policy=no-user-gesture-required \
  --user-data-dir="$HOME/Library/Application Support/ToreroPantalla" "$WEB" &
