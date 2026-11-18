#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
app="/Applications/Job Radar.app"

"$root/scripts/package-desktop.sh"

# Quitting closes the backend's stdin, so it shuts down on its own
osascript -e 'tell application "Job Radar" to quit' 2>/dev/null || true
while pgrep -f "$app/Contents/MacOS/" > /dev/null; do sleep 0.2; done

rm -rf "$app"
ditto "$root/desktop/src-tauri/target/release/bundle/macos/Job Radar.app" "$app"

open "$app"
