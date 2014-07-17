#!/bin/bash
export src="../src/locale"
export ref="../../noscript-1.1.3.6/chrome/locale"
pushd "$src" >/dev/null
for f in $(find ./ -name noscript.properties); do
 
  rf=$ref'/'$(echo $f | sed -e 's/\/noscript\./\/noscript\/noscript\./') 
  if [ ! -f "$rf" ]; then
    echo "$rf does not exist"
  elif [ ! "$(grep 'forbidLocal' $f)" == "$(grep 'forbidLocal' $rf)" ]; then
   echo $f
   grep 'forbidLocal' $f
   grep 'forbidLocal' $rf
  fi
  
done
echo "$ref $src"
popd