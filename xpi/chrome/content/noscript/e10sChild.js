var EXPORTED_SYMBOLS = [];
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import(`chrome://noscript/content/importer.jsm`);

Services.scriptloader.loadSubScript(NO_CACHE(`loader.js`), this);

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");



(function () {
  try {
    INCLUDE("Main");
  } catch (e) {
    Cu.reportError(e);
  }

  IPC.child = {
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIMessageListener, Ci.nsISupportsWeakReference]),
    init: function() {
      Services.cpmm.addWeakMessageListener(IPC_P_MSG.CALL, this);
      Main.init();
    },
    dispose: function() {
      Services.cpmm.removeWeakMessageListener(IPC_P_MSG.CALL, this);
      Main.shutdown();
      UNLOAD_ALL();
    },

    receiveMessage: function(m) {
      if (IPC.receiveMessage(m)) {
        return;
      }
      if (m.name === "NoScript:unload") {
        this.dispose();
      }
    },

    remote(objName, method, args) {
      Services.cpmm.sendAsyncMessage(IPC_P_MSG.CALL, {objName, method, args});
    },

    callback(id, autoRemote = true) {
      let cb = () => {
        cb._executed = true;
      };
      cb._executed = false;
      cb.remote = () => {
        Services.cpmm.sendAsyncMessage(IPC_P_MSG.CALLBACK, {id, execute: cb._executed });
      };
      if (autoRemote) Thread.asap(cb.remote);
    },

  };

  try {
    Main.bootstrap();
    IPC.child.init();
    Services.cpmm.sendAsyncMessage(IPC_P_MSG.SERVICE_READY);
  } catch (e) {
    Components.utils.reportError(e);
  }
})();
