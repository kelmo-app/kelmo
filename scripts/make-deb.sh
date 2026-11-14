#!/usr/bin/env bash
# Builds a Debian/Ubuntu/Mint .deb straight from release/linux-unpacked with dpkg-deb (no fpm; fpm is fragile).
# Run it after:  npx electron-builder --linux dir      (npm run package:deb does both)
# On Fedora the tool comes from:  sudo dnf install dpkg
set -euo pipefail
cd "$(dirname "$0")/.."
command -v dpkg-deb >/dev/null || { echo "dpkg-deb is missing:  sudo dnf install dpkg   (Debian/Ubuntu: it is already there)"; exit 1; }

SRC="$(pwd)/release/linux-unpacked"
[ -d "$SRC" ] || { echo "release/linux-unpacked not found. Run:  npx electron-builder --linux dir"; exit 1; }
EXE=""
for n in kelmo KELMO kdm; do [ -f "$SRC/$n" ] && [ -x "$SRC/$n" ] && EXE="$n" && break; done
[ -n "$EXE" ] || { echo "Could not find the program inside $SRC"; ls "$SRC"; exit 1; }
VERSION="$(node -p "require('./package.json').version")"
REVISION="1.$(date +%Y%m%d%H%M)" # a newer build always upgrades the installed one
DEBVER="$VERSION-$REVISION"

TOP="$(mktemp -d /tmp/kdm-deb.XXXXXX)"
trap 'rm -rf "$TOP"' EXIT
ROOT="$TOP/kdm_$DEBVER"
mkdir -p "$ROOT/DEBIAN" "$ROOT/opt/KELMO" "$ROOT/usr/bin" "$ROOT/usr/share/applications" "$ROOT/usr/share/icons/hicolor/512x512/apps"
cp -a "$SRC/." "$ROOT/opt/KELMO/"
ln -s "/opt/KELMO/$EXE" "$ROOT/usr/bin/kdm"
install -m 644 build/icon.png "$ROOT/usr/share/icons/hicolor/512x512/apps/kdm.png"
cat > "$ROOT/usr/share/applications/kdm.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=KDM
GenericName=Download Manager
Comment=Kelmo Download Manager - The Open Download Workspace
Exec=/opt/KELMO/$EXE %U
Icon=kdm
Terminal=false
Categories=Network;FileTransfer;
MimeType=application/x-bittorrent;x-scheme-handler/magnet;
StartupWMClass=KELMO
DESKTOP
chmod 644 "$ROOT/usr/share/applications/kdm.desktop"

SIZE_KB="$(du -sk "$ROOT/opt" | cut -f1)"
cat > "$ROOT/DEBIAN/control" <<CONTROL
Package: kdm
Version: $DEBVER
Section: net
Priority: optional
Architecture: amd64
Installed-Size: $SIZE_KB
Maintainer: KELMO Contributors <hello@kelmo.dev>
Depends: libgtk-3-0 | libgtk-3-0t64, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0 | libatspi2.0-0t64, libuuid1, libsecret-1-0
Homepage: https://github.com/kelmo/kdm
Description: KDM - Kelmo Download Manager
 An open-source GPLv3 download manager with queues, scheduling,
 browser integration, video capture and torrents.
CONTROL

cat > "$ROOT/DEBIAN/postinst" <<POSTINST
#!/bin/sh
set -e
# Electron's sandbox helper must be setuid root on systems that block unprivileged user namespaces (Ubuntu 24.04 and later)
[ -f /opt/KELMO/chrome-sandbox ] && chmod 4755 /opt/KELMO/chrome-sandbox || true
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
exit 0
POSTINST
cat > "$ROOT/DEBIAN/postrm" <<POSTRM
#!/bin/sh
set -e
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true
exit 0
POSTRM
chmod 755 "$ROOT/DEBIAN/postinst" "$ROOT/DEBIAN/postrm"

mkdir -p release
rm -f release/kdm_*.deb
dpkg-deb --root-owner-group -Zxz -z3 --build "$ROOT" "release/kdm_${DEBVER}_amd64.deb"
echo
echo "✔ Built:"; ls -1 release/kdm_*.deb
echo "Install on Debian/Ubuntu/Mint with:  sudo apt install ./release/kdm_${DEBVER}_amd64.deb"
