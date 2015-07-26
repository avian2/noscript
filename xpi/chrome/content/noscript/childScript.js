Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
  .getService(Components.interfaces.mozIJSSubScriptLoader)
  .loadSubScript("chrome://noscript/content/loader.js", this);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const ns = {};

LAZY_INCLUDE("WinScript");

var IPC = {};


IPC.child = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsIMessageListener, Ci.nsISupportsWeakReference]),
  mm: Cc["@mozilla.org/childprocessmessagemanager;1"].getService(Ci.nsISyncMessageSender).QueryInterface(Ci.nsIMessageListenerManager),
  init: function() {
    OS.addObserver(this, "content-document-global-created", true);
  },

  observe: function(subject, topic, data) {
    switch (topic) {
      case "content-document-global-created":
      try {
            let window = subject;

            let blockIt = this.mm.sendRpcMessage("NoScript:mustBlockJS", { site: data }, { window: window })[0];

            if (blockIt) {
              WinScript.block(window);
            } else {
              WinScript.unblock(window);
            }
          break;

      } catch (e) {
        log(e + " " + e.stack);
      }
      break;
    }
  },

  receiveMessage: function(m) {

    switch (m.name) {
      case "NoScript:WinScript":
        let window = m.objects.window;
        if (!Cu.isCrossProcessWrapper(window)) {
          switch (m.data.verb) {
            case "block":
              WinScript.block(window);
              break;
            case "unblock":
              WinScript.unblock(window);
              break;
          }
        }
        break;
    }
  }
};
IPC.child.init();
