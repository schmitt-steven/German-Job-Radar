#!/usr/bin/env bash
set -uo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

# Job control gives each server its own process group, so we can kill the whole tree
set -m

# Background jobs that touch the terminal get stopped by the shell, so cut them off from it
(cd "$root/backend" && exec ./mvnw spring-boot:run < /dev/null) &
backend_pid=$!
(cd "$root/frontend" && NG_CLI_ANALYTICS=false exec npm start < /dev/null) &
frontend_pid=$!

stop_servers() {
  trap '' INT TERM HUP
  kill -TERM -- "-$backend_pid" "-$frontend_pid" 2>/dev/null
  wait 2>/dev/null
}
trap stop_servers EXIT
trap 'exit 0' INT TERM HUP

echo "Backend: http://127.0.0.1:42420  Frontend: http://localhost:4200  (Ctrl+C stops both)"

# macOS ships bash 3.2 without `wait -n`, so poll until either server exits
while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
  sleep 1
done
