const _INCLUDED = {};
function IS_INCLUDED(name) name in _INCLUDED;

if (!("LOADER" in this)) {
  var { interfaces: Ci, classes: Cc, utils: Cu } = Components;
  var LOADER = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);
  var ns = {};
}





function INCLUDE(name) {
  if (arguments.length > 1)
    for (var j = 0, len = arguments.length; j < len; j++)
      INCLUDE(arguments[j]);
  else if (!(name in _INCLUDED)) {
    try {
      _INCLUDED[name] = true;
      let t = Date.now();
      LOADER.loadSubScript("chrome://noscript/content/" + name + ".js");
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
      if (ns.consoleDump) ns.dump(name + " kickstarted at " + (new Error().stack));
      INCLUDE(name);
      return this[name];
    });
  }
}
