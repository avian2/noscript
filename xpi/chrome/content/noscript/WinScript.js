var WinScript = ("blockScriptForGlobal" in Cu)
?
{
  block: function(window) {
    if (window._blockScriptForGlobal) return;
    Cu.blockScriptForGlobal(window);
    window._blockScriptForGlobal = true;
  },
  unblock: function(window) {
    if (!window._blockScriptForGlobal) return;
    Cu.unblockScriptForGlobal(window);
    window._blockScriptForGlobal = false;
  }
}
:
{
  __noSuchMethod__: function() {}
}