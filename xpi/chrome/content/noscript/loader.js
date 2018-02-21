// const TIME0 = Date.now();

var { interfaces: Ci, classes: Cc, utils: Cu, results: Cr } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import(`chrome://noscript/content/importer.jsm`);
var IMPORT = IMPORT_FOR(this);

var IOS = Services.io;
var OS = Services.obs;
var LOADER = Services.scriptloader;


var _INCLUDED = new Set();

var INCLUDE = function (...objectNames) {
  for (let objectName of objectNames) {
    if (!(_INCLUDED.has(objectName))) {
      _INCLUDED.add(objectName);
      // let t = Date.now();
      LOADER.loadSubScript(NO_CACHE(`${objectName}.js`), this);
      // dump((t - TIME0) + " - loaded " + objectName + " in " + (Date.now() - t) + "\n")
    }
  }
};

function LAZY_INCLUDE(...objectNames) {
  for (let objectName of objectNames) {
     if (!(_INCLUDED.has(objectName))) {
      let key = objectName; // hack needed in Fx < 50
      this.__defineGetter__(key, function() {
        delete this[key];
        // dump(objectName + " kickstarted at " + (new Error().stack));
        INCLUDE(key);
        return this[key];
      });
    }
  }
}

function INCLUDE_MIXIN(target, ...objectNames) {
  INCLUDE(...objectNames);
  return MIXIN(target, ...objectNames.map(objectName => this[objectName]));
}

function MIXIN(target, ...objects) {
 for (let o of objects) {
    let object = o; // hack needed in Fx < 50
    Object.defineProperties(target, Object.keys(object).reduce((descriptors, key) => {
      descriptors[key] = Object.getOwnPropertyDescriptor(object, key);
      return descriptors;
    }, {}));
  }
  return target;
}

var COMPAT = {
  setStringPref(branch, name, value) {
    if (branch.setStringPref) {
      branch.setStringPref(name, value);
    } else {
      let str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
      str.data = value;
      branch.setComplexValue(name, Ci.nsISupportsString, str);
    }
  },

  getStringPref(branch, name, defValue) {
    return branch.getStringPref ? branch.getStringPref(name, defValue)
      :  branch.getComplexValue(name, Ci.nsISupportsString).data || defValue;
  }
};
