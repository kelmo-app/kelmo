#!/usr/bin/env bash
# Builds KDM once and adds it to the application menu (no root needed).
set -euo pipefail
cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"

echo "▸ Building KDM…"
npm run build

mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications" "$HOME/.local/share/icons"
cp build/icon.png "$HOME/.local/share/icons/kdm.png"

# Launcher script (path may contain spaces, so keep it out of the .desktop Exec line)
cat > "$HOME/.local/bin/kdm" <<LAUNCH
#!/usr/bin/env bash
cd "$APP_DIR" && exec npx electron . "\$@"
LAUNCH
chmod +x "$HOME/.local/bin/kdm"

cat > "$HOME/.local/share/applications/kdm.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=KDM
GenericName=Download Manager
Comment=Kelmo Download Manager — The Open Download Workspace
Exec=$HOME/.local/bin/kdm %U
Icon=$HOME/.local/share/icons/kdm.png
Terminal=false
Categories=Network;FileTransfer;
StartupWMClass=KELMO
DESKTOP

command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" || true
echo
echo "✔ Installed. Open the Menu and search for “KDM”, or run:  kdm"
