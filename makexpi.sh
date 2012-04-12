#!/bin/sh
# builds a .xpi from the git repository, placing the .xpi in the root
# of the repository.
#
# invoke with no arguments to build from the current src directory.
#
#  ./makexpi.sh
#
# OR, invoke with a tag name to build a specific branch or tag.
#
# e.g.:
#
#  ./makexpi.sh 0.2.3.development.2
#
# Script adapted from 
# https://gitweb.torproject.org/https-everywhere.git/blob/HEAD:/makexpi.sh

set -e

APP_NAME=noscript

BUILDDIR=build

cd "`dirname $0`"

rm -rf "$BUILDDIR"
mkdir "$BUILDDIR"

# If the command line argument is a tag name, check that out and build it
if [ -n "$1" ]; then
	cp -a .git "$BUILDDIR"
	cd "$BUILDDIR"
	git reset --hard "$1"
else
	cp -a xpi "$BUILDDIR"
	cd "$BUILDDIR"
fi

# The name/version of the XPI we're building comes from src/install.rdf
VERSION=`grep em:version xpi/install.rdf | sed -e 's/[<>]/	/g' | cut -f3`
XPI_NAME="$APP_NAME-$VERSION"
if [ "$1" ]; then
	XPI_NAME="$XPI_NAME.xpi"
else
	XPI_NAME="$XPI_NAME~pre.xpi"
fi

../version.sh --add "$VERSION" xpi

# Build the XPI!
rm -f "../$XPI_NAME"
(cd xpi/chrome && zip -q -r -m "noscript.jar" *)
(cd xpi && zip -q -r "../../$XPI_NAME" .)
