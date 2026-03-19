#!/bin/bash
PLIST_LABEL="com.calendar-tools.block-time"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

if [ ! -f "$PLIST_PATH" ]; then
  echo "No scheduled job found."
  exit 0
fi

launchctl unload "$PLIST_PATH"
rm "$PLIST_PATH"
echo "✅ Schedule removed."
