#!/bin/sh
# 每日备份：SQLite 在线备份 + 照片目录打包。建议加入 crontab：30 3 * * * /opt/shiguang/deploy/backup.sh
set -e
DATA=${DATA_DIR:-/data}; OUT=${BACKUP_DIR:-/var/backups/shiguang}; D=$(date +%F)
mkdir -p "$OUT"
sqlite3 "$DATA/shiguang.db" ".backup '$OUT/shiguang-$D.db'"
tar czf "$OUT/uploads-$D.tgz" -C "$DATA" uploads 2>/dev/null || true
find "$OUT" -type f -mtime +30 -delete
