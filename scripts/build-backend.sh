#!/usr/bin/env bash
set -euo pipefail

# Builds the jar plus a trimmed Java runtime into backend/target/desktop for the Tauri bundle
root="$(cd "$(dirname "$0")/.." && pwd)"

"$root/scripts/build-frontend.sh"

cd "$root/backend"
./mvnw -q -DskipTests clean package

out="$root/backend/target/desktop"
mkdir -p "$out"
cp target/german-job-radar-*-SNAPSHOT.jar "$out/app.jar"

# jdeps can't see inside the fat jar's nested jars
exploded="$(mktemp -d)"
trap 'rm -rf "$exploded"' EXIT
unzip -q "$out/app.jar" -d "$exploded"
modules="$(jdeps --multi-release 25 --ignore-missing-deps --print-module-deps \
  --class-path "$exploded/BOOT-INF/lib/*" "$exploded/BOOT-INF/classes")"

jlink \
  --add-modules "$modules,jdk.unsupported,jdk.crypto.ec" \
  --strip-debug \
  --no-man-pages \
  --no-header-files \
  --output "$out/runtime"

# jlink leaves some files read-only, which breaks Tauri overwriting its copy on rebuilds
chmod -R u+w "$out/runtime"
