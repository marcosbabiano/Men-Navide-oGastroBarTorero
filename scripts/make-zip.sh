#!/usr/bin/env bash
# Genera entrega/gastrobar-torero-navidad-2026.zip con el código fuente, la documentación y la compilación (dist/).
set -euo pipefail
cd "$(dirname "$0")/.."
NAME="gastrobar-torero-navidad-2026"
OUT="entrega/${NAME}.zip"
[ -d dist ] || { echo "Falta dist/: ejecuta antes «npm run build»"; exit 1; }
mkdir -p entrega
rm -f "$OUT"
STAGE="$(mktemp -d)"
mkdir -p "$STAGE/$NAME"
# Copia todo salvo dependencias, datos locales, resultados de pruebas y la propia carpeta de entrega.
tar --exclude=./node_modules --exclude=./.git --exclude=./.local-data --exclude=./assets-src \
    --exclude=./test-results --exclude=./playwright-report --exclude=./.netlify --exclude=./entrega \
    --exclude='*.tsbuildinfo' --exclude=./.env -cf - . | tar -xf - -C "$STAGE/$NAME"
(cd "$STAGE" && zip -qr -9 "$OLDPWD/$OUT" "$NAME")
rm -rf "$STAGE"
echo "ZIP generado: $OUT ($(du -h "$OUT" | cut -f1))"
