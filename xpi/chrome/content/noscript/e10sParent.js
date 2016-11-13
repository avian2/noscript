IPC.parent = {
  FRAME_SCRIPT: "chrome://noscript/content/frameScript.js",
  PROCESS_SCRIPT: "chrome://noscript/content/e10sProcessScript.js",
  MSG_SYNC: "NoScript:syncUI",
  MSG_NOTIFY_META: "NoScript:notifyMetaRefresh",
  MSG_CLEARCLICK_WARNING: "NoScript:clearClickWarning",
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMessageListener, Ci.nsISupportsWeakReference]),
  init() {
    let globalMM = Services.mm;
    globalMM.addWeakMessageListener(this.MSG_SYNC, this);
    globalMM.addWeakMessageListener(this.MSG_NOTIFY_META, this);
    globalMM.addWeakMessageListener(this.MSG_CLEARCLICK_WARNING, this);
    globalMM.loadFrameScript(this.FRAME_SCRIPT, true);
    Services.ppmm.loadProcessScript(this.PROCESS_SCRIPT, true);

  },
  dispose() {
    let globalMM = Services.mm;
    globalMM.addWeakMessageListener(this.MSG_CLEARCLICK_WARNING, this);
    globalMM.removeWeakMessageListener(this.MSG_NOTIFY_META, this);
    globalMM.removeWeakMessageListener(this.MSG_SYNC, this);
    globalMM.removeDelayedFrameScript(this.FRAME_SCRIPT);
    Services.ppmm.removeDelayedProcessScript(this.PROCESS_SCRIPT);
  },

  receiveMessage(m) {
    ns.onContentInit();
    this.receiveMessage = this._receiveMessageReal;
    return this.receiveMessage(m);
  },
  _receiveMessageReal(m) {
    // ns.log(`Received ${m.name}: ${JSON.strigify(m.data)}`);
    if (IPC.receiveMessage(m)) {
      return;
    }
    switch(m.name) {
      case this.MSG_SYNC:
        ns.setExpando(m.target, "sites", m.data);
        ns.syncUI(m.target);
        return;
      case this.MSG_NOTIFY_META:
        let browser = m.target;
        info.browser = browser;
        browser.defaultView.noscriptOverlay.notifyMetaRefresh(info);
        return;
      case this.MSG_CLEARCLICK_WARNING:
        return ClearClickHandler.prototype.showWarningParent(m.target.ownerDocument.defaultView, m.data).locked;
    }
  },

  remote(objName, method, args) {
    Services.ppmm.broadcastAsyncMessage(IPC.MSG_CALL, {objName, method, args});
  },
};

IPC.parent.init();
