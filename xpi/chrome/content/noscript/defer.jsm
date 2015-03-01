var EXPORTED_SYMBOLS = ["defer"];

let { interfaces: Ci, classes: Cc } = Components;

let currentThread = null;

function defer(callback, milliseconds) {
  milliseconds = milliseconds || 0;
  if (milliseconds > 0) {
    let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    timer.initWithCallback(callback, milliseconds, timer.TYPE_ONE_SHOT);
  } else {
    (currentThread || (currentThread = Cc["@mozilla.org/thread-manager;1"].getService().currentThread))
      .dispatch({ run: callback }, Ci.nsIEventTarget.DISPATCH_NORMAL);
  }
}
