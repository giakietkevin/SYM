#!/bin/sh
# Daily backup: snapshot inside the volume, then a copy on the host in ~/sym-backups (14 newest kept).
# Both live on this VM: also download them now and then (see docs/DEPLOY.md, "Sao lưu").
set -e
cd "$(dirname "$0")"
docker compose exec -T sym node scripts/backup.mjs
mkdir -p "$HOME/sym-backups"
docker compose cp sym:/data/backups/. "$HOME/sym-backups/"
ls -1t "$HOME"/sym-backups/sym-*.db 2>/dev/null | tail -n +15 | xargs -r rm --
