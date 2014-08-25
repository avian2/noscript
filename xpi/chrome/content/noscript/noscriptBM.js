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
    var callback = function() { noscriptBM.handleURLBarCommandOriginal(originalArguments) };
    
    var shortcut = gURLBar.value;
    var jsrx = /^\s*(?:data|javascript):/i;
    var isJS = jsrx.test(shortcut);
    var ns = noscriptUtil.service;
    
    
    if (isJS) {
      let allowJS = ns.getPref("allowURLBarJS", true);
      let isShortcut = ("originalShortcut" in gURLBar) && gURLBar.originalShortcut !== shortcut;
      if (allowJS || isShortcut) {
        window.setTimeout(function() { // if we don't defer, errors are not logged in the console...
          if (!ns.executeJSURL(shortcut, callback, !isShortcut))
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
  
  loadURIWithFlags: function(url, flags) { // Fx 3.5 and above command bar interception
    try {
      if ("gURLBar" in window && /\nhandleCommand\b.*@chrome:\/\//.test(new Error().stack)) {
        if (/^(?:javascript|data):/i.test(url)) arguments[1] |= Ci.nsIWebNavigation.LOAD_FLAGS_ALLOW_POPUPS;
        return noscriptBM.handleURLBarCommand.apply(window, arguments);
      }
    } catch(e) {}
    return noscriptBM.handleURLBarCommandOriginal(arguments);
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
    
    noscriptBM.init();
  },
  init: function() {
    // patch URLBar for keyword-triggered bookmarklets:
    // we do it early, in case user has a bookmarklet startup page
    if (!noscriptBM.handleURLBarCommandOriginal) {
      let patch = null;
      if("handleURLBarCommand" in window) { // Fx 3.0
        patch = { obj: window, func: window.handleURLBarCommand };
        window.handleURLBarCommand = noscriptBM.handleURLBarCommand;
      } else if ("gBrowser" in window) { // Fx >= 3.5
        patch = { obj: gBrowser, func: gBrowser.loadURIWithFlags };
        gBrowser.loadURIWithFlags = noscriptBM.loadURIWithFlags;
      }
      if (patch)
        noscriptBM.handleURLBarCommandOriginal = function(args) patch.func.apply(patch.obj, args);
    }
    
    // delay bookmark stuff
    window.setTimeout(noscriptBM.delayedInit, 50);
  },
  delayedInit: function() {
    for each (let f in ["getShortcutOrURIAndPostData" /* Fx >= 25 */, "getShortcutOrURI"]) {
      if (f in window) {
        let getShortcut = window[f];
        let replacement = function(aURL) {
          if ("gURLBar" in window && window.gURLBar) {
            window.gURLBar.originalShortcut = aURL;
          }
          return getShortcut.apply(window, arguments);
        }
        window[f] = getShortcut.length === 2
          ? function(aURL, callback) replacement.apply(window, arguments)
          : function(aURL) replacement.apply(window, arguments);
        break;
      }
    }
    
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


