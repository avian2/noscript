var WinScript = ("blockScriptForGlobal" in Cu) ?
{
  supported: true,
  block: function(window) {
    if (window._blockScriptForGlobal) return;
    try {
      Cu.blockScriptForGlobal(window);
      if (!("_blockScriptForGlobal" in window)) {
        this.patchStyle(window.document);
      }
    } catch (e) {
      if (!this._childDo("block", window)) throw e;
    }
    window._blockScriptForGlobal = true;
  },
  unblock: function(window) {
    if (!window._blockScriptForGlobal) return;
    try {
      Cu.unblockScriptForGlobal(window);
    } catch (e) {
       if (this._childDo("unblock", window)) throw e;
    }
    window._blockScriptForGlobal = false;
  },
  isBlocked: function(window) {
    return window._blockScriptForGlobal;
  },
  isDecided: function(window) {
    return "_blockScriptForGlobal" in window;
  },
  get _childDo() {
    delete this._childDo;
    return (this._childDo = IPC.parent && IPC.parent.mm && ("isCrossProcessWrapper" in Cu) ?
      function(verb, window) {
        if (Cu.isCrossProcessWrapper(window)) {
          IPC.parent.mm.broadcastAsyncMessage("NoScript:WinScript", verb, { window: window });
          return true;
        }
        return false;
      }
    : function() { return false; }
    );
  }
}
:
{
  supported: false,
  __noSuchMethod__: function() {},
};

WinScript._domUtils = Cc["@mozilla.org/inspector/dom-utils;1"].getService(Ci.inIDOMUtils);
WinScript.patchStyle = function(doc) {
  let ss = this._domUtils.getAllStyleSheets(doc);
  // reverse loop because the preference stylesheet is almost always the last one
  for (let j = ss.length; j-- > 0;) {
    let s = ss[j];
    switch(s.href) {
      case "about:PreferenceStyleSheet":
        {
          let rules = s.cssRules;
          // skip 1st & 2nd, as they are HTML & SVG namespaces
          for (let j = 2, len = rules.length; j < len; j++) {
              let r = rules[j];
              if (r.cssText === "noscript { display: none ! important; }") {
                  s.deleteRule(j);
                  return;
              }
          }
        }
        break;
      case "resource://gre-resources/noscript.css":
        doc.defaultView.QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIDOMWindowUtils)
        .loadSheetUsingURIString("data:text/css,noscript { display: inline !important }", 0);
        return;
    }
  }
};
