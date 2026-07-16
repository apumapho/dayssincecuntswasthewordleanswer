#!/bin/zsh
set -euo pipefail

source_plist="/Users/alex/Sites/dayssince/launchd/com.dayssince.wordle-updater.plist"
target_plist="/Users/alex/Library/LaunchAgents/com.dayssince.wordle-updater.plist"
service="gui/$(/usr/bin/id -u)/com.dayssince.wordle-updater"

/usr/bin/plutil -lint "$source_plist"
/bin/mkdir -p /Users/alex/Library/LaunchAgents
/usr/bin/install -m 644 "$source_plist" "$target_plist"
/bin/launchctl bootout "$service" 2>/dev/null || true
/bin/launchctl bootstrap "gui/$(/usr/bin/id -u)" "$target_plist"
/bin/launchctl enable "$service"

echo "Installed com.dayssince.wordle-updater for a daily 8:15 AM run."
/bin/launchctl print "$service" | /usr/bin/sed -n '1,45p'
