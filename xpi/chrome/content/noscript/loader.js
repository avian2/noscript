const { interfaces: Ci, classes: Cc, utils: Cu, results: Cr } = Components;
const IOS = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
const OS = Cc['@mozilla.org/observer-service;1'].getService(Ci.nsIObserverService);


const LOADER = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);

const _INCLUDED = {};
function IS_INCLUDED(name) name in _INCLUDED;

function INCLUDE(name) {
  if (arguments.length > 1)
    for (var j = 0, len = arguments.length; j < len; j++)
      INCLUDE(arguments[j]);
  else if (!(name in _INCLUDED)) {
    try {
      _INCLUDED[name] = true;
      let t = Date.now();
      LOADER.loadSubScript("chrome://noscript/content/" + name + ".js", this);
      // dump((t - TIME0) + " - loaded " + name + " in " + (Date.now() - t) + "\n")
    } catch(e) {
      let msg = "INCLUDE " + name + ": " + e + "\n" + e.stack;
      Components.utils.reportError(msg);
      dump(msg + "\n");
    }
  }
}

function LAZY_INCLUDE(name) {
  if (arguments.length > 1)
    for (var j = 0, len = arguments.length; j < len; j++)
      arguments.callee(arguments[j]);
  else if (!(name in this)) {
    __defineGetter__(name, function() {
      delete this[name];
      // dump(name + " kickstarted at " + (new Error().stack));
      INCLUDE(name);
      return this[name];
    });
  }
}
