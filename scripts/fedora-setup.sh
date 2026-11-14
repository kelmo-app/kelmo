#!/usr/bin/env bash
# KDM — one-shot setup for Fedora (tested target: Fedora 44, X11). Run from the project folder.
set -euo pipefail

echo "▸ Installing system packages (needs sudo)…"
sudo dnf install -y nodejs npm git rpm-build \
  nss atk at-spi2-atk cups-libs libdrm libxkbcommon mesa-libgbm alsa-lib gtk3 libXScrnSaver libXtst

echo "▸ Node: $(node -v)   npm: $(npm -v)"
node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)' || { echo "Node 20+ required"; exit 1; }

echo "▸ Installing project dependencies…"
npm install --no-audit --no-fund

echo "▸ Engine tests…";  npm run test:engine
echo "▸ Live pipeline…"; npm run test:live
echo "▸ Browser bridge…"; npm run test:bridge
echo "▸ Type-check…";    npm run typecheck
echo "▸ Unit tests…";    npm test

echo
echo "✔ Ready. Start the app with:  npm run dev"
