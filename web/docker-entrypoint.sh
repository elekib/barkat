#!/bin/sh
# Start Barkat as an unprivileged user.
#
# Started as root (the default): make the data directory belong to PUID:PGID
# (default 1000:1000), then drop to that user and run the command.
# Started as another user (compose `user:`): run the command as is; the data
# directory must already be writable by that user.
set -eu

if [ "$(id -u)" != 0 ]; then
  exec "$@"
fi

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${BARKAT_DATA_DIR:-/app/data}"

case "$PUID$PGID" in
  *[!0-9]* | "") echo "barkat: PUID and PGID must be numbers" >&2; exit 1 ;;
esac

# Next.js keeps its runtime cache next to the server.
mkdir -p "$DATA_DIR" /app/.next/cache
for dir in "$DATA_DIR" /app/.next/cache; do
  # Only touch the tree when something in it has the wrong owner.
  if [ -n "$(find "$dir" \( ! -user "$PUID" -o ! -group "$PGID" \) -print -quit)" ]; then
    chown -R "$PUID:$PGID" "$dir"
  fi
done

exec setpriv --reuid "$PUID" --regid "$PGID" --clear-groups "$@"
