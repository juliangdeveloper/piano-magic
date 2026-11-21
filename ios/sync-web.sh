#!/bin/sh
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
web="$root/ios/Sources/PianoMagic/web"
engine_ref=d1931bd6a19c6340435d3768aeb39bb0568257ad
engine_url="https://raw.githubusercontent.com/juliangdeveloper/piano-transcribe/$engine_ref/engine/v1"
rm -rf "$web"
mkdir -p "$web/engine/v1"
cp -R "$root/index.html" "$root/VERSION" "$root/assets" "$root/charts" "$root/css" "$root/js" "$web/"
rm -f "$web/assets/screenshot.png"
for file in capture.js version.txt; do
  curl -fsSL "$engine_url/$file" -o "$web/engine/v1/$file"
done
want=$(sed -n "s/.*var ENGINE_VERSION = '\([0-9.]*\)'.*/\1/p" "$root/js/app.js")
got=$(tr -d '[:space:]' < "$web/engine/v1/version.txt")
if [ "$want" != "$got" ]; then
  echo "engine $got does not match ENGINE_VERSION $want" >&2
  exit 1
fi
echo "web $(cat "$root/VERSION") with engine $got"
