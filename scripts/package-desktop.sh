#!/usr/bin/env bash
set -euo pipefail

# Builds the installer for the current OS into desktop/src-tauri/target/release/bundle
root="$(cd "$(dirname "$0")/.." && pwd)"

"$root/scripts/build-backend.sh"

cd "$root/desktop"
npm ci
npx tauri build
