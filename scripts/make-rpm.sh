#!/usr/bin/env bash
# Builds a Fedora .rpm straight from release/linux-unpacked with rpmbuild (no fpm; fpm breaks on newer rpm).
# Run it after:  npx electron-builder --linux dir      (npm run package:rpm does both)
set -euo pipefail
cd "$(dirname "$0")/.."
command -v rpmbuild >/dev/null || { echo "rpmbuild is missing:  sudo dnf install rpm-build"; exit 1; }

SRC="$(pwd)/release/linux-unpacked"
[ -d "$SRC" ] || { echo "release/linux-unpacked not found. Run:  npx electron-builder --linux dir"; exit 1; }
EXE=""
for n in kelmo KELMO kdm; do [ -f "$SRC/$n" ] && [ -x "$SRC/$n" ] && EXE="$n" && break; done
[ -n "$EXE" ] || { echo "Could not find the program inside $SRC"; ls "$SRC"; exit 1; }
VERSION="$(node -p "require('./package.json').version")"
RELEASE="1.$(date +%Y%m%d%H%M)" # a newer build always upgrades the installed one (same version number would be refused)

# work in a path without spaces (rpmbuild is picky)
TOP="$(mktemp -d /tmp/kdm-rpm.XXXXXX)"
trap 'rm -rf "$TOP"' EXIT
mkdir -p "$TOP"/{BUILD,RPMS,SPECS,SOURCES,SRPMS,stage}
cp -a "$SRC" "$TOP/stage/app"
cp build/icon.png "$TOP/stage/kdm.png"
cat > "$TOP/stage/kdm.desktop" <<DESKTOP
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

cat > "$TOP/SPECS/kdm.spec" <<SPEC
%global debug_package %{nil}
%global __os_install_post %{nil}
%global _build_id_links none
AutoReqProv: no
Name:       kdm
Version:    $VERSION
Release:    $RELEASE
Summary:    KDM - Kelmo Download Manager
License:    GPL-3.0-or-later
BuildArch:  x86_64
Requires:   gtk3, nss, libnotify, xdg-utils, at-spi2-core

%description
KDM is an open-source GPLv3 download manager with queues, scheduling,
browser integration and video capture.

%prep
%build

%install
mkdir -p %{buildroot}/opt/KELMO %{buildroot}/usr/bin %{buildroot}/usr/share/applications %{buildroot}/usr/share/icons/hicolor/512x512/apps
cp -a $TOP/stage/app/. %{buildroot}/opt/KELMO/
ln -s /opt/KELMO/$EXE %{buildroot}/usr/bin/kdm
install -m 644 $TOP/stage/kdm.desktop %{buildroot}/usr/share/applications/kdm.desktop
install -m 644 $TOP/stage/kdm.png %{buildroot}/usr/share/icons/hicolor/512x512/apps/kdm.png

%files
%defattr(-,root,root,-)
/opt/KELMO
/usr/bin/kdm
/usr/share/applications/kdm.desktop
/usr/share/icons/hicolor/512x512/apps/kdm.png
SPEC

rpmbuild -bb --define "_topdir $TOP" --define "_rpmdir $TOP/RPMS" "$TOP/SPECS/kdm.spec"
mkdir -p release
rm -f release/kdm-*.rpm
cp "$TOP"/RPMS/*/kdm-*.rpm release/
echo
echo "✔ Built:"; ls -1 release/kdm-*.rpm
echo "Install with:  sudo dnf install ./release/kdm-$VERSION-$RELEASE.x86_64.rpm"
