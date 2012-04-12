#!/bin/bash

if [ "$#" -ne 3 ]; then
	echo "USAGE: version.sh [--add|--strip] version path"
	exit 1
fi

CMD=$1
VERSION=$2
TARGET=$3

REGEX='.*\.\(dtd\|xul\|js\)'

PLACEHOLDER="@VERSION@"

if [ "$CMD" = "--add" ]; then
	SED_SCRIPT="s/$PLACEHOLDER/$VERSION/g"
elif [ "$CMD" = "--strip" ]; then
	SED_SCRIPT="s/${VERSION//./\\.}/$PLACEHOLDER/g"
	if find "$TARGET" -regex "$REGEX" -print0 | xargs -0 grep "$PLACEHOLDER"; then
		echo "Placeholder $PLACEHOLDER already present in source when stripping version!"
		exit 1
	fi

else
	echo "Invalid option $CMD"
	exit 1
fi

find "$TARGET" -regex "$REGEX" -print0 | \
	xargs -0 sed -i -e "$SED_SCRIPT"
