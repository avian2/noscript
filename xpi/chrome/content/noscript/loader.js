// const TIME0 = Date.now();
Components.utils.import("resource://gre/modules/Services.jsm");
var { interfaces: Ci, classes: Cc, utils: Cu, results: Cr } = Components;
var IOS = Services.io;
var OS = Services.obs;


const LOADER = Services.scriptloader;
const _INCLUDED = {};

function INCLUDE(...objectNames) {
  for (let objectName of objectNames) {
    if (!(objectName in _INCLUDED)) {
      _INCLUDED[objectName] = true;
      // let t = Date.now();
      LOADER.loadSubScript(`chrome://noscript/content/${objectName}.js`, this);
      // dump((t - TIME0) + " - loaded " + objectName + " in " + (Date.now() - t) + "\n")
    }
  }
}

function LAZY_INCLUDE(...objectNames) {
  for (let objectName of objectNames) {
    if (!(objectName in this)) {
      this.__defineGetter__(objectName, () => {
        delete this[objectName];
        // dump(objectName + " kickstarted at " + (new Error().stack));
        INCLUDE(objectName);
        return this[objectName];
      });
    }
  }
}

function INCLUDE_MIXIN(target, ...objectNames) {
  INCLUDE(...objectNames);
  return MIXIN(target, ...objectNames.map(objectName => this[objectName]));
}

function MIXIN(target, ...objects) {
 for (let object of objects) {
    Object.defineProperties(target, Object.keys(object).reduce((descriptors, key) => {
      descriptors[key] = Object.getOwnPropertyDescriptor(object, key);
      return descriptors;
    }, {}));
  }
  return target;
}
