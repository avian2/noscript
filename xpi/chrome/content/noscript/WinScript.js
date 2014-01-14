var WinScript = ("blockScriptForGlobal" in Cu)
?
{
  block: function(window) {
    if (window._blockScriptForGlobal) return;
    Cu.blockScriptForGlobal(window);
    window._blockScriptForGlobal = true;
    // work-around for https://bugzilla.mozilla.org/show_bug.cgi?id=958962
    window.addEventListener("DOMContentLoaded", this._onContentLoaded, false);
  },
  unblock: function(window) {
    if (!window._blockScriptForGlobal) return;
    Cu.unblockScriptForGlobal(window);
    window._blockScriptForGlobal = false;
  },
  _onContentLoaded: function(ev) {
    let win = ev.currentTarget;
    let doc = win.document;
    let nodes = doc.getElementsByTagName("noscript");
    if (win.getComputedStyle(nodes[0], '').display !== "none") return;
    if (!this._sheetAdded) {
      ns.updateStyleSheet('noscript[data-noscript-visible] { display: inline !important}', true);
      this._sheetAdded = true;
    }
    let range = doc.createRange();
    for (let j = 0; j < nodes.length; j++) {
      let n = nodes[j];
      range.selectNode(n.parentNode);
      let f = range.createContextualFragment(n.innerHTML)
      n.innerHTML = "";
      n.appendChild(f);
      n.setAttribute("data-noscript-visible", "true");
    }
  }
}
:
{
  __noSuchMethod__: function() {}
}