IPC.parent = {
  FRAME_SCRIPT: NO_CACHE("frameScript.js"),
  PROCESS_SCRIPT: NO_CACHE("e10sProcessScript.js"),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMessageListener, Ci.nsISupportsWeakReference]),
  init() {
    let globalMM = Services.mm;
    for (let m of Object.keys(IPC_MSG)) {
      globalMM.addWeakMessageListener(IPC_MSG[m], this);
    }
    let processMM = Services.ppmm;
    for (let m of Object.keys(IPC_P_MSG)) {
      processMM.addWeakMessageListener(IPC_P_MSG[m], this);
    }
    processMM.loadProcessScript(this.PROCESS_SCRIPT, true);
    globalMM.loadFrameScript(this.FRAME_SCRIPT, true);
  },
  dispose() {
    let globalMM = Services.mm;
    for (let m of Object.keys(IPC_MSG)) {
      globalMM.removeWeakMessageListener(IPC_MSG[m], this);
    }
    let processMM = Services.ppmm;
    for (let m of Object.keys(IPC_P_MSG)) {
      processMM.removeWeakMessageListener(IPC_P_MSG[m], this);
    }
    globalMM.removeDelayedFrameScript(this.FRAME_SCRIPT);
    globalMM.broadcastAsyncMessage("NoScript:unload");
    processMM.removeDelayedProcessScript(this.PROCESS_SCRIPT);
    processMM.broadcastAsyncMessage("NoScript:unload");
  },
  

  receiveMessage(m) {
    ns.onContentInit();
    this.receiveMessage = this._receiveMessageReal;
    return this.receiveMessage(m);
  },
  _receiveMessageReal(m) {
    if (IPC.receiveMessage(m)) {
      return;
    }
    switch(m.name) {
      case IPC_MSG.SYNC:
        ns.setExpando(m.target, "sites", m.data);
        ns.syncUI(m.target);
        return;
      case IPC_MSG.NOTIFY_META:
        let browser = m.target;
        info.browser = browser;
        browser.defaultView.noscriptOverlay.notifyMetaRefresh(info);
        return;
      case IPC_MSG.CLEARCLICK_WARNING:
        return ClearClickHandler.prototype.showWarningParent(m.target.ownerDocument.defaultView, m.data).locked;
      case IPC_P_MSG.CALLBACK:
        let {id, execute} = m.data;
        this._handleCallback(id, execute);
        return;
      case IPC_P_MSG.LOAD_SURROGATE:
        return ScriptSurrogate.loadReplacementFile(ScriptSurrogate.getReplacement(m.data));
      case IPC_P_MSG.RESUME:
        return IOUtil.resumeParentChannel(m.data.id, m.data.abort);
      case IPC_P_MSG.GET_PREF:
        let {method, name} = m.data;
        if (method in Services.prefs && method.startsWith("get")) {
          try {
            return Services.prefs[method](name);
          } catch (e) {
            Cu.reportError(e);
          }
        }
        return null;
      case IPC_P_MSG.GET_SNAPSHOT:
        return ns.getSnapshot();
    }
  },

  remote(objName, method, args) {
    Services.ppmm.broadcastAsyncMessage(IPC_P_MSG.CALL, {objName, method, args});
  },
  
  _callbacks: new Map(),
  _callbackId: 0,
  callback(f) {
    this._callbacks.set(++this._callbackId, f);
    return this._callbackId;
  },
  _handleCallback(id, execute) {
    let callback = this._callbacks.get(id);
    if (callback) this._callbacks.delete(id);
    if (execute) {
      try {
        callback();
      } catch (e) {
        Cu.reportError(e);
      }
    }
  },
};

IPC.parent.init();

