#!/bin/bash
URL="http://mxr.mozilla.org/mozilla-central/source/parser/html/nsHtml5AtomList.h?raw=1"
COMMON="key|row|mouse|drag|befor|after|focus|move|data|select"
FILE="$(dirname $0)/RequestWatchdog.js"

EVS=$(curl "$URL" | egrep -v "on($COMMON)" | awk -F'"' '/"on.*"/ { printf("|%s", substr($2, 3)); }')

if [ -z "$EVS" ]; then
  echo >&2 "ERROR! No event found."
  exit 1
fi

EVS="$COMMON$EVS"
echo "Events: $EVS"
echo "Replacing in $FILE..."
sed -e "s/\(const IC_EVENT_PATTERN = .*:\)key|[^)]*/\1$EVS/" "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
echo "Done."
