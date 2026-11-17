#!/bin/bash
set -e

APP_DIR=/home/user/verdaccio
VERSION=6.11.1

mkdir -p "$APP_DIR"
cd "$APP_DIR"
[ -f package.json ] || echo '{ "private": true }' > package.json

PKG=node_modules/verdaccio/package.json
INSTALLED=$(node -p "const fs = require('fs'); fs.existsSync('$PKG') ? JSON.parse(fs.readFileSync('$PKG', 'utf8')).version : ''")

if [ "$INSTALLED" != "$VERSION" ]; then
  echo "Installing Verdaccio $VERSION..."
  npm install --no-audit --no-fund "verdaccio@$VERSION"
else
  echo "Verdaccio $VERSION is already installed."
fi

if [ ! -f config.yaml ]; then
  cp config.default.yaml config.yaml
  echo "Created $APP_DIR/config.yaml"
fi

echo "SETUP_DONE"
