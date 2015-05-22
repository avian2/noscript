
const { interfaces: Ci, classes: Cc, utils: Cu } = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const ns = {};
const OS = Cc['@mozilla.org/observer-service;1'].getService(Ci.nsIObserverService);

Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader)
  .loadSubScript("chrome://noscript/content/loader.js");
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

        let window = subject;

        let blockIt = this.mm.sendSyncMessage("NoScript:mustBlockJS", { site: data }, { window: window })[0];

        if (blockIt) {
          WinScript.block(window);
        } else {
          WinScript.unblock(window);
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
