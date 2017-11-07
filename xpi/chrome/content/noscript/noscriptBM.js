window.noscriptBM = {

  openUILinkIn: function(url, ...args) {
    var callback = () => openUILinkIn._noscriptBMSaved(url, ...args);
    
    if(!(window.gURLBar && gURLBar.value))
      return callback();
   
    var shortcut = gURLBar.value;
    var jsrx = /^\s*(?:data|javascript):/i;
    var isJS = jsrx.test(url);
    var ns = noscriptUtil.service;
    
    
    if (isJS) {
      let allowJS = ns.getPref("allowURLBarJS", true);
      let isShortcut = ("originalShortcut" in gURLBar) && gURLBar.originalShortcut !== shortcut;
      if (allowJS || isShortcut || !/\bhandleCommand@/.test(new Error().stack)) {
        window.setTimeout(function() { // if we don't defer, errors are not logged in the console...
          if (!ns.executeJSURL(url, callback, !isShortcut))
            callback();
        }, 0);
      } else {
        ns.prompter.alert(window, "NoScript",
            "javascript: and data: URIs typed or pasted in the address bar are disabled to prevent social engineering attacks.\nDevelopers can enable them for testing purposes by toggling the \"noscript.allowURLBarJS\" preference.");
      }
      return;
    }

    return callback();
  },

  patchPlacesMethods: function(pu) {
    let ns = noscriptUtil.service;
    if (pu.__ns === ns) return; // already patched
    pu.__ns = ns;
    if (!pu.__originalCheckURLSecurity) {
      pu.__originalCheckURLSecurity = pu.checkURLSecurity;
    }
    pu.checkURLSecurity = ns.placesCheckURLSecurity;
    
    ns.onDisposal(() => {
      if ("__originalCheckURLSecurity" in pu) {
        pu.checkURLSecurity = pu.__originalCheckURLSecurity;
        delete pu.__originalCheckURLSecurity;
      }
      delete pu.__ns;
    });

  },

  onLoad: function(ev) {
    ev.currentTarget.removeEventListener("load", arguments.callee, false);
    if(!noscriptUtil.service) return;
    window.addEventListener("unload", noscriptBM.dispose, false);
    noscriptBM.init();
  },
  
  _inited: false,
  init: function() {
    // patch URLBar for keyword-triggered bookmarklets:
    // we do it early, in case user has a bookmarklet startup page
    if (noscriptBM._inited) return;
    noscriptBM._inited = true;
    if (!window.openUILinkIn) return;
    let original = window.openUILinkIn._noscriptBMSaved;
    this.openUILinkIn._noscriptBMSaved = original || window.openUILinkIn;
    window.openUILinkIn = this.openUILinkIn;
    noscriptBM.onDisposal(() => {
      window.openUILinkIn = window.openUILinkIn._noscriptBMSaved;
    });

    // delay bookmark stuff
    window.setTimeout(noscriptBM.delayedInit, 50);
  },

  delayedInit: function() {
    for (let f  of ["getShortcutOrURIAndPostData" /* Fx >= 25 */, "getShortcutOrURI"]) {
      if (f in window) {
        let getShortcut = window[f];
        if (getShortcut._noscriptBM) return;

        let replacement = function(aURL) {
          if ("gURLBar" in window && window.gURLBar) {
            window.gURLBar.originalShortcut = aURL;
          }
          return getShortcut.apply(window, arguments);
        };
        replacement._noscriptBM = true;

        window[f] = replacement;
        noscriptBM.onDisposal(() => {
          window[f] = getShortcut;
        });
        break;
      }
    }
    
    // Places stuff, from most recent to oldest
    var pu = window.PlacesUIUtils || window.PlacesUtils || false;
    if (typeof(pu) == "object") {
      noscriptBM.placesUtils = pu; // hold a reference even if in Fx 4 it's a module
      noscriptBM.patchPlacesMethods(pu);
    }
  },

  _disposalTasks: [],
  onDisposal(t) {
    this._disposalTasks.push(t);
  },
  dispose() {
    window.removeEventListener("unload", noscriptBM.dispose, false);
    let ns = noscriptUtil.service;
    let tasks = noscriptBM._disposalTasks; 
    for (let t of tasks) {
      try {
        if (ns.consoleDump) ns.dump(`Running noscriptBM disposal task ${uneval(t)}`);
        t();
      } catch (e) {
        Components.utils.reportError(e);
      }
    }
    delete window.noscriptBM;
  }
};


