#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 package.pkg.tar.zst" >&2
  exit 1
fi

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
bsdtar -xf "$1" -C "$stage"

# The desktop ID matches the GTK Wayland app_id. StartupWMClass matches X11.
entry="$stage/usr/share/applications/sloy.desktop"
desktop-file-validate "$entry"
grep -Fx 'Exec=sloy' "$entry"
grep -Fx 'Icon=sloy' "$entry"
grep -Fx 'StartupWMClass=Sloy' "$entry"
test -x "$stage/usr/bin/sloy"

icons="$stage/usr/share/icons/hicolor"
for size in 32x32 64x64 128x128; do
  cmp "src-tauri/icons/$size.png" "$icons/$size/apps/sloy.png"
done
cmp src-tauri/icons/128x128@2x.png "$icons/256x256/apps/sloy.png"
cmp src-tauri/icons/icon.png "$icons/512x512/apps/sloy.png"
echo "$1: desktop entry and five branded hicolor icons verified"
