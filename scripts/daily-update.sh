#!/bin/zsh
set -euo pipefail

project_dir="/Users/alex/Sites/dayssince"
log_prefix="[dayssince]"

cd "$project_dir"
/opt/homebrew/opt/node@24/bin/node scripts/update-data.mjs

if ! /usr/bin/git diff --quiet -- public/data/wordle.json; then
  /usr/bin/git add public/data/wordle.json
  /usr/bin/git commit -m "Update Wordle answer for $(/bin/date +%F)"
else
  echo "$log_prefix Archive is already current."
fi

# Push even when today's data was already committed. This retries a push that
# failed on an earlier run because the network or Git host was unavailable.
/usr/bin/git push
echo "$log_prefix Repository is current and pushed."
