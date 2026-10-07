#!/bin/sh
# Build amp for browserpod.
# See README.md for the why.
set -eu

cd "$(dirname "$0")/amp-0.7.1"

# Apple clang has no wasm.
LLVM_PREFIX="$(brew --prefix llvm)"
export BP_CLANG="$LLVM_PREFIX/bin/clang"
export BP_LLVM_AR="$LLVM_PREFIX/bin/llvm-ar"

# cmake and pkg-config.
export PATH="/opt/homebrew/bin:$PATH"

# build.rs shells out to git.
export BUILD_REVISION="0.7.1"

# libgit2 pointer mismatch.
export CFLAGS_wasm32_browserpod_linux_musl="-Wno-error=incompatible-pointer-types -Wno-error=int-conversion -Wno-error=implicit-function-declaration"

PROFILE="${1:-release-small}"
cargo build --profile "$PROFILE" --target wasm32-browserpod-linux-musl

echo
echo "Built: amp-0.7.1/target/wasm32-browserpod-linux-musl/$PROFILE/amp"
ls -lh "target/wasm32-browserpod-linux-musl/$PROFILE/amp" | awk '{print $5}'
