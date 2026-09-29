#!/bin/sh
# Refuse a stale public/amp.
set -eu

cd "$(dirname "$0")"

if [ ! -f public/amp ]; then
  echo "public/amp is missing." >&2
  echo "Run: npm run build-amp && npm run copy-binary" >&2
  exit 1
fi

newer=$(find amp-0.7.1/src amp-0.7.1/Cargo.toml -type f -newer public/amp -print -quit)

if [ -n "$newer" ]; then
  echo "public/amp is older than $newer" >&2
  echo "Run: npm run build-amp && npm run copy-binary" >&2
  exit 1
fi
