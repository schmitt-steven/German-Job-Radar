#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

"$root/scripts/build-frontend.sh"

cd "$root/backend"
./mvnw -q -DskipTests clean package
exec java -jar target/german-job-radar-0.0.1-SNAPSHOT.jar
