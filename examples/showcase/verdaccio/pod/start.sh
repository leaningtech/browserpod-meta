#!/bin/bash
APP_DIR=/home/user/verdaccio

if [ ! -d "$APP_DIR/node_modules/verdaccio" ]; then
  echo "Verdaccio isn't installed yet. Run: bash /home/user/setup.sh"
  exit 1
fi

cd "$APP_DIR"
exec node "$APP_DIR/run.mjs" "$@"
