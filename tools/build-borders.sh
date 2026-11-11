#!/bin/sh
# Télécharge Cliopatria (Seshat) et prépare les frontières du mode précis dans public/borders/.
set -e
TMP="${TMPDIR:-/tmp}/histomap-clio"
mkdir -p "$TMP"
curl -sSL -o "$TMP/clio.zip" https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/main/cliopatria.geojson.zip
unzip -o -q "$TMP/clio.zip" -d "$TMP"
node --max-old-space-size=6144 tools/build-borders.mjs --clio "$(ls "$TMP"/*.geojson | head -1)" --out public
