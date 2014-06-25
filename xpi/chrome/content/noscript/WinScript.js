var WinScript = ("blockScriptForGlobal" in Cu)
?
{
  supported: true,
  block: function(window) {
    if (window._blockScriptForGlobal) return;
    Cu.blockScriptForGlobal(window);
    window._blockScriptForGlobal = true;
  },
  unblock: function(window) {
    if (!window._blockScriptForGlobal) return;
    Cu.unblockScriptForGlobal(window);
    window._blockScriptForGlobal = false;
  },
  isBlocked: function(window) {
    return window._blockScriptForGlobal;
  },

}
:
{
  supported: false,
  __noSuchMethod__: function() {},
  block: function(window) {
    let ds = DOM.getDocShellForWindow(window)
  },
  unblock: function(window) {
    if (!window._blockScriptForGlobal) return;
    Cu.unblockScriptForGlobal(window);
    window._blockScriptForGlobal = false;
  },
  isBlocked: function(window) {
    return window._blockScriptForGlobal;
  },
};
