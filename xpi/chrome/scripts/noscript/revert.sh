#!/bin/bash
export dest="../src/locale"
export src="../noscript-1.1.3.5/chrome/locale"

pushd "$src" >/dev/null
propfiles=$(find ./ -regex '.*.properties');
popd
for f in $propfiles; do
  df=$(echo $f | sed -e 's/\/noscript\//\//')
  cp "$src/$f" "$dest/$df"
  echo "copying $src/$f to $dest/$df"
done