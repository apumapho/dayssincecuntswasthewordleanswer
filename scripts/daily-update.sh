#!/bin/zsh
set -euo pipefail

project_dir="/Users/alex/Sites/dayssince"
log_prefix="[dayssince]"

cd "$project_dir"
/opt/homebrew/opt/node@24/bin/node scripts/update-data.mjs

if /usr/bin/git diff --quiet -- public/data/wordle.json; then
  echo "$log_prefix Archive is already current."
  exit 0
fi

/usr/bin/git add public/data/wordle.json
/usr/bin/git commit -m "Update Wordle answer for $(/bin/date +%F)"
/usr/bin/git push
echo "$log_prefix Update committed and pushed."
