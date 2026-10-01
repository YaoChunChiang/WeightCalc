#!/usr/bin/env bash
# Give every release a new version so browsers fetch fresh files.
# Usage (Git Bash): ./bump-version.sh   — then commit & push.
set -euo pipefail
cd "$(dirname "$0")"

V=$(date +%Y%m%d-%H%M)
sed -i -E "s/\?v=[0-9A-Za-z-]+/?v=$V/g" index.html
sed -i -E "s/^const APP_VERSION = '[^']*';/const APP_VERSION = '$V';/" update.js
printf '{ "version": "%s" }\n' "$V" > version.json

echo "Version -> $V"
