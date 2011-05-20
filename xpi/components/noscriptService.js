// XPCOM scaffold
const TIME0 = Date.now();

const CI = Components.interfaces;
const CC = Components.classes;
const CU = Components.utils;

const EXTENSION_ID = "{73a6fe31-595d-460b-a920-fcc0f8843232}";
const EXTENSION_NAME = "NoScript";
const CHROME_NAME = "noscript";
const VERSION = "2.1.0.5";
const SERVICE_NAME = EXTENSION_NAME + " Service";
const SERVICE_CTRID = "@maone.net/noscript-service;1";
const SERVICE_ID="{31aec909-8e86-4397-9380-63a59e0c5ff5}";

// interfaces implemented by this component
const SERVICE_IIDS = 
[
CI.nsIContentPolicy,
CI.nsIWebProgressListener,
CI.nsIWebProgressListener2,
CI.nsIObserver,
CI.nsISupportsWeakReference,
CI.nsIChannelEventSink
];

// categories which this component is registered in
const SERVICE_CATS = ["app-startup"];

const IOS = CC["@mozilla.org/network/io-service;1"].getService(CI.nsIIOService);
const OS = CC['@mozilla.org/observer-service;1'].getService(CI.nsIObserverService);
const LOADER = CC["@mozilla.org/moz/jssubscript-loader;1"].getService(CI.mozIJSSubScriptLoader);
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
      LOADER.loadSubScript("chrome://noscript/content/"+ name + ".js");
      // dump((t - TIME0) + " - loaded " + name + " in " + (Date.now() - t) + "\n")
    } catch(e) {
      let msg = "INCLUDE " + name + ": " + e + "\n" + e.stack;
      CU.reportError(msg);
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
      INCLUDE(name);
      return this[name];
    });
  }
}


var singleton;
const SERVICE_CONSTRUCTOR = function() {
  INCLUDE("Main");
  return singleton;
}

INCLUDE("XPCOM");
