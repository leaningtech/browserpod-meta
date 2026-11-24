#!/bin/bash
set -e
cd "$(dirname "$0")"

VERSION=1.4.1
STAGE="$PWD/little-coder-stage"
EXT=$STAGE/lib/node_modules/little-coder/.pi/extensions

rm -rf $STAGE
npm install -g --prefix $STAGE little-coder@$VERSION \
  --os=linux --cpu=wasm32 --omit=optional --ignore-scripts \
  --no-audit --no-fund --registry https://registry.npmjs.org
node pod/patch-typebox.mjs $STAGE/lib/node_modules
node pod/patch-pi-bash.mjs $STAGE/lib/node_modules
cp pod/branding.ts $EXT/branding/index.ts
rm -rf $EXT/hello
# Don't nudge after Escape
perl -0pi -e 's/if \(!message\) return;/if (!message || message.stopReason === "aborted") return;/' $EXT/quality-monitor/index.ts
grep -q 'stopReason === "aborted"' $EXT/quality-monitor/index.ts
# Windows-only native binaries
rm -rf $STAGE/lib/node_modules/little-coder/node_modules/koffi/build
COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs -czf little-coder.tgz -C $STAGE bin lib
rm -rf $STAGE pod/little-coder.tgz.*
# Cloudflare caps files at 25MB
split -b 20m little-coder.tgz pod/little-coder.tgz.
rm little-coder.tgz
ls -lh pod/little-coder.tgz.*
