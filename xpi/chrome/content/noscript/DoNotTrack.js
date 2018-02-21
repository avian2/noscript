var DoNotTrack = {
  enabled: true,
  exceptions: null,
  forced: null,

  init: function(prefs) {
    this.prefs = prefs;
    for (let k  of prefs.getChildList("", {})) {
      this.observe(prefs, null, k);
    }
    prefs.addObserver("", this, true);
  },
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),
  observe: function(prefs, topic, name) {
    switch(name) {
      case "enabled":
        this.enabled = prefs.getBoolPref(name);
       break;
      case "exceptions":
      case "forced":
        this[name] = AddressMatcher.create(COMPAT.getStringPref(prefs, name));
      break;
    }
  },

  apply: function(/* ABEReq */ req) {
    let url = req.destination;

    try {
      if (
          (this.exceptions && this.exceptions.test(url) ||
            req.localDestination ||
            req.isDoc && req.method === "POST" && req.originURI.host === req.destinationURI.host
          ) &&
          !(this.forced && this.forced.test(url))
           // TODO: find a way to check whether this request is gonna be WWW-authenticated
        )
        return;

      let channel = req.channel;
      channel.setRequestHeader("DNT", "1", false);

      // reorder headers to mirror Firefox 4's behavior
      let conn = channel.getRequestHeader("Connection");
      channel.setRequestHeader("Connection", "", false);
      channel.setRequestHeader("Connection", conn, false);
    } catch(e) {}
  },

  getDOMPatch: function(docShell) {
    try {
      if (docShell.document.defaultView.navigator.doNotTrack !== "1" &&
          docShell.currentDocumentChannel.getRequestHeader("DNT") === "1") {
        return 'Object.defineProperty(window.navigator, "doNotTrack", { configurable: true, enumerable: true, value: "1" });';
      }
    } catch (e) {}
    return "";
  },
}
