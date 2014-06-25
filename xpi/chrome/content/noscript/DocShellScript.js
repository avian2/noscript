var DocShellScript = {
   
  block: function(window) {
    window._blockedByDocShell = true;

    let docShell = DOM.getDocShellForWindow(window);
    if (!docShell.allowJavascript) return;
    window._restoreDocShellScript = true;
    docShell.allowJavascript = false;
    window.addEventListener("pagehide", function(e) {
      docShell.allowJavascript = true;
    }, true);
    window.addEventListener("pageshow", function(e) {
      docShell.allowJavascript = false;
    }, true);
  },
  
  unblock: function(window) {
    if (window._blockedByDocShell) {
      window._blockedByDocShell = false;
      if ("_restoreDocShellScript" in window)
        DOM.getDocShellForWindow(window).allowJavascript = window._restoreDocShellScript;
    }
  },
  isBlocked: function(window) window && window._blockedByDocShell,
}