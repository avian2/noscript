Components.utils.import("resource://gre/modules/Services.jsm");
Services.scriptloader.loadSubScript("chrome://noscript/content/loader.js", this);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

INCLUDE("Main");

IPC.child = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMessageListener, Ci.nsISupportsWeakReference]),
  init: function() {
    Services.cpmm.addWeakMessageListener(IPC.MSG_CALL, this);
    Main.init();
  },
  dispose: function() {
    Services.cpmm.removeWeakMessageListener(IPC.MSG_CALL, this);
  },

  receiveMessage: function(m) {
    if (IPC.receiveMessage(m)) {
      return;
    }
  },

  remote(objName, method, args) {
    Services.cpmm.sendAsyncMessage(IPC.MSG_CALL, {objName, method, args});
  }

};

try {
  log("Child: Including NoScript Main");

  Main.bootstrap(true);
  
  log("Child: Including NoScript Main\n");
  IPC.child.init();
} catch (e) {
  Cu.reportError(e);
}

