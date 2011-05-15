var noscriptBM = {
  openOneBookmarkOriginal: null,
  openOneBookmark: function (aURI, aTargetBrowser, aDS) {
    var ncNS = typeof(gNC_NS) == "undefined" ? ( typeof(NC_NS) == "undefined" ?
      "http://home.netscape.com/NC-rdf#" : NC_NS ) : gNC_NS;
    const url = BookmarksUtils.getProperty(aURI, ncNS+"URL", aDS);
    
    var openCallback = function(url) {
      noscriptBM.openOneBookmarkOriginal.apply(BookmarksCommand, [aURI, aTargetBrowser, aDS]);
    };
  
    if(!noscriptBM.handleBookmark(url, openCallback)) {
      openCallback();
    }
  },
  
  handleURLBarCommandOriginal: null,
  handleURLBarCommand: function() { // Fx 3.0 command bar interception
    if(!(window.gURLBar && gURLBar.value))
      return;
   
    var originalArguments = arguments;
    var callback = function() { noscriptBM.handleURLBarCommandOriginal.apply(window, originalArguments); };
    
    var shortcut = gURLBar.value;
    var jsrx = /^\s*(?:data|javascript):/i;
    var isJS = jsrx.test(shortcut);
    var ns = noscriptUtil.service;
    var allowJS = ns.getPref("allowURLBarJS", true);
    
    if (isJS) {
      if (allowJS) {
        window.setTimeout(function() { // if we don't defer, errors are not logged in the console...
          if (!ns.executeJSURL(shortcut, callback, true))
            callback();
        }, 0);
      } else {
        noscriptUtil.prompter.alert(window, "NoScript",
            "javascript: and data: URIs typed or pasted in the address bar are disabled to prevent social engineering attacks.\nDevelopers can enable them for testing purposes by toggling the \"noscript.allowURLBarJS\" preference.");
      }
      return;
    } else if (("getShortcutOrURI" in window) && (shortcut.indexOf(" ") > 0  && !isJS || shortcut.indexOf(":") < 0)) {
      let url = getShortcutOrURI(shortcut, {});
      if(jsrx.test(url) && noscriptBM.handleBookmark(url, callback))
        return;
    }
    callback(); 
  },
  
  loadURI: function() { // Fx 3.5 command bar interception
    try {
      if ("gURLBar" in window) {
        var handleCommand = window.gURLBar.handleCommand;
        var times = 5;
        for(var caller, f = arguments.callee; (caller = f.caller) && times; f = caller, times--) {
          if (caller === handleCommand) {
            return noscriptBM.handleURLBarCommand.apply(window, arguments);
          }
        }
      }
    } catch(e) {}
    return noscriptBM.handleURLBarCommandOriginal.apply(window, arguments);
  },

  handleBookmark: function(url, openCallback) {
    return noscriptUtil.service.handleBookmark(url, openCallback);
  },
  
  patchPlacesMethods: function(pu) {   
    if ("__originalCheckURLSecurity" in pu) return; // already patched
    pu.__originalCheckURLSecurity = pu.checkURLSecurity;
    pu.__ns = noscriptUtil.service;
    pu.checkURLSecurity = pu.__ns.placesCheckURLSecurity;
    
    for each (var method in ["openNodeIn", "openSelectedNodeWithEvent"]) 
      if (method in pu) pu[method].__noscriptPatched = true;
  },
  
  onLoad: function(ev) {
    ev.currentTarget.removeEventListener("load", arguments.callee, false);
    if(!noscriptUtil.service) return;
    
    // patch URLBar for keyword-triggered bookmarklets:
    // we do it early, in case user has a bookmarklet startup page
    if (!noscriptBM.handleURLBarCommandOriginal) {
      if("handleURLBarCommand" in window) { // Fx 3.0
        noscriptBM.handleURLBarCommandOriginal = window.handleURLBarCommand;
        window.handleURLBarCommand = noscriptBM.handleURLBarCommand;
      } else { // Fx >= 3.5
        noscriptBM.handleURLBarCommandOriginal = window.loadURI;
        window.loadURI = noscriptBM.loadURI;
      }
    }
    
    // delay bookmark stuff
    window.setTimeout(noscriptBM.delayedInit, 50);
  },
  delayedInit: function() {
    // Legacy (non-Places), patch bookmark clicks
    if("BookmarksCommand" in window && noscriptBM.openOneBookmarkOriginal === null) { 
      noscriptBM.openOneBookmarkOriginal = BookmarksCommand.openOneBookmark;
      BookmarksCommand.openOneBookmark = noscriptBM.openOneBookmark;
    }
    
    // Places stuff, from most recent to oldest
    var pu = window.PlacesUIUtils || window.PlacesUtils || false;
    if (typeof(pu) == "object") {
      noscriptBM.placesUtils = pu; // hold a reference even if in Fx 4 it's a module
      noscriptBM.patchPlacesMethods(pu);
    }
  }
};

window.addEventListener("load", noscriptBM.onLoad, false);

