var WinScript = ("blockScriptForGlobal" in Cu)
?
{
  supported: true,
  block: function(window) {
    if (window._blockScriptForGlobal) return;
    Cu.blockScriptForGlobal(window);
    window._blockScriptForGlobal = true;
    // work-around for https://bugzilla.mozilla.org/show_bug.cgi?id=958962
    this._patchStyle(window.document);
  },
  unblock: function(window) {
    if (!window._blockScriptForGlobal) return;
    Cu.unblockScriptForGlobal(window);
    window._blockScriptForGlobal = false;
  },
  isBlocked: function(window) {
    return window._blockScriptForGlobal;
  },
  _domUtils: Cc["@mozilla.org/inspector/dom-utils;1"].getService(Ci.inIDOMUtils),
  _patchStyle: function(doc) {
    let ss = this._domUtils.getAllStyleSheets(doc);
    // reverse loop because the preference stylesheet is almost always the last one
    for (let j = ss.length; j-- > 0;) { 
      let s = ss[j];
      if(s.href === "about:PreferenceStyleSheet") {
          let rules = s.cssRules;
          // skip 1st & 2nd, as they are HTML & SVG namespaces
          for (let j = 2, len = rules.length; j < len; j++) {
              let r = rules[j];
              if (r.cssText === "noscript { display: none ! important; }") {
                  s.deleteRule(j);
                  break;
              }
          }
          break;
      }
    }
 },

}
:
{
  supported: false,
  __noSuchMethod__: function() {},

};
