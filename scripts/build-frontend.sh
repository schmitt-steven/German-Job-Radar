#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../frontend"
npx ng build

static=../backend/src/main/resources/static
rm -rf "$static"
mkdir -p "$static"
cp -R dist/frontend/browser/. "$static/"
