var IPC = {};
IPC.parent = {
  QueryInterface: xpcom_generateQI([Ci.nsIMessageListener, Ci.nsISupportsWeakReference]),
  globalMM: null,
  mm: null,
  init: function() {
    if (! ("@mozilla.org/globalmessagemanager;1" in Cc)) return;
    let globalMM = this.globalMM = Cc["@mozilla.org/globalmessagemanager;1"]
        .getService(Ci.nsIMessageListenerManager)
        .QueryInterface(Ci.nsIMessageBroadcaster)
        .QueryInterface(Ci.nsIFrameScriptLoader);
    globalMM.loadFrameScript("chrome://noscript/content/frameScript.js", true);

    if ("nsIProcessScriptLoader" in Ci) {
      let mm = this.mm = Cc["@mozilla.org/parentprocessmessagemanager;1"]
        .getService(Ci.nsIMessageListenerManager)
        .QueryInterface(Ci.nsIMessageBroadcaster)
        .QueryInterface(Ci.nsIProcessScriptLoader);
      mm.loadProcessScript("chrome://noscript/content/childScript.js", true);
      mm.addWeakMessageListener("NoScript:mustBlockJS", this);
    }
  },
  dispose: function() {
    let globalMM = this.globalMM;
    if (globalMM) {
      globalMM.removeDelayedFrameScript("chrome://noscript/content/frameScript.js");
      let mm = this.mm;
      if (mm) {
        mm.removeWeakMessageListener("NoScript:mustBlockJS");
        mm.removeDelayedProcessScript("chrome://noscript/content/childScript.js");
      }
    }
  },

  receiveMessage: function(m) {
    switch(m.name) {
      case "NoScript:mustBlockJS":
        return ns.mustBlockJS(m.objects.window, m.data.site);
    }
  },
};

IPC.parent.init();
