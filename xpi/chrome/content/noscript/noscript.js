var noscriptUtil = {
  chromeBase: "chrome://noscript/content/",
  chromeName: "noscript",
  get service() {
    var ns = null;
    for(var attempt=1; attempt <= 2 ;attempt++) {
      try {
        ns = Components.classes["@maone.net/noscript-service;1"].getService().wrappedJSObject;
        break;
      } catch(ex) {
        dump(ex.message);
        window.navigator.plugins.refresh();
      }
    }
    if(ns != null) {
      ns.init();
    }
    delete this.service;
    return this.service = ns;
  },
  
  get prompter() {
    delete this.prompter;
    return this.prompter =
      Components.classes["@mozilla.org/embedcomp/prompt-service;1"
          ].getService(Components.interfaces.nsIPromptService);
  }
,
  confirm: function(msg, persistPref, title) {
    const ns = this.service; 
    var alwaysAsk = { value: ns.getPref(persistPref) };
    if(!alwaysAsk.value &&  ns.prefs.prefHasUserValue(persistPref) ||
        noscriptUtil.prompter.confirmCheck(window, title || "NoScript",
          msg,
          noscriptUtil.getString("alwaysAsk"), alwaysAsk)
     ) {
      ns.setPref(persistPref, alwaysAsk.value);
      return true;
    }
    return false;
  },

  getString: function(key, parms) {
    return this.service.getString(key, parms);
  }
,
  openOptionsDialog: function(params) {
    let odRef = this.service.optionsDialogRef;
    let od;
    try {
      od = odRef && odRef.get();
    } catch (e) {}
    if (od && !od.closed) {
      od.focus();
      return;
    }
    window.openDialog(
        this.chromeBase + this.chromeName + "Options.xul", 
        this.chromeName + "Options",
        "chrome, dialog=no, centerscreen, resizable=no, alwaysraised=no",
        params);
  },
  
  openXssOptions: function() {
    this.openOptionsDialog({tabselIndexes: [5, 2]});
  },
  openABEOptions: function(info) {
    this.openOptionsDialog({
        tabselIndexes: [5, 4],
        callback: info ? function() { this.abeOpts.select(info.ruleset); } : null
    });
  },
  openEFOptions: function(filterName) {
    if (filterName) {
      if ("getAttribute" in filterName) filterName = filterName.getAttribute("statustext");
      this.service.externalFilters.lastFilterName = filterName;
    }
    this.openOptionsDialog({tabselIndexes: [5, 5]});
  }
, 
  openAboutDialog: function(params) {
    window.open(
      this.chromeBase + "about.xul", 
      this.chromeName + "About",
      "chrome,dialog,centerscreen");
  }
,
  openConsole: function() {
    if ("HUDService" in window && HUDService.getBrowserConsole && HUDService.toggleBrowserConsole) {
      let bc = HUDService.getBrowserConsole();
      function showJS(bc) { bc.setFilterState("jslog", true); }
      if (bc) { 
        showJS(bc);
        let w = bc.chromeWindow;
        if (w.windowState === w.STATE_MINIMIZED) {
          w.restore();
        }
        w.focus();
      }
      else HUDService.toggleBrowserConsole().then(showJS);
      
    } else if ("toErrorConsole" in window) {
        toErrorConsole();
    }
    else if ("toJavaScriptConsole" in window) {
        toJavaScriptConsole();
    } else {
        window.openDialog("chrome://global/content/console.xul", "", "chrome,all,dialog=no");
    }
  },
  
  openFaq: function(which) {
    this.browse("https://noscript.net/faq#" + which);
  },
  
  openHelp: function(section) {
    this.browse("https://noscript.net/help/" + section);
  },
  
  openDonate: function(src) {
    this.browse("https://secure.informaction.com/donate/?id=noscript&src=" + src);
  },
  
  openInfo: function(about) {
    const ns = this.service;
    
    let url = ns.getPref("siteInfoProvider");
    if (!url) return false;
  
    let domain = ns.getSite(about);
    if (!domain) return false;
    
    if (domain.indexOf('@') > -1) domain = domain.split('@')[1]; // Blocked objects entries
    if (domain.indexOf(':') > -1) domain = ns.getDomain(domain) || domain;
    if (!domain) return false;
    
    let ace;
    try {
      ace = Cc["@mozilla.org/network/idn-service;1"]
              .getService(Ci.nsIIDNService).convertUTF8toACE(domain);
    } catch(e) {
      ace = '';
    }
    
    url = url.replace(/%utf8%/g, encodeURI(domain))
            .replace(/%ace%/g, encodeURI(ace));
        
    if (this.confirm(
       this.getString("siteInfo.confirm", [domain, ns.getSite(url) || "?", url]),
        "confirmSiteInfo", "NoScript"
      )) {
      let currentTab = window.gBrowser && gBrowser.selectedTab;
      let w = this.browse(url);
      if ("noscriptOverlay" in window) {
          let et = "DOMContentLoaded";
          let eh = function(ev) {
            let d = ev.target;
            if (d.URL !== url) return;
            let button = d.getElementById("allow-button");
            if (!button) return;
            
            let ns = noscriptOverlay.ns;
            let enabled = ns.isJSEnabled(domain);
            
            button.firstChild.textContent = noscriptOverlay.getString((enabled ? "forbidLocal" : "allowLocal"), [domain]);
            button.style.display = "";
            button.className = enabled ? "forbid" : "allow";
            
            function complete(enable) {
              noscriptOverlay.safeAllow(domain, enable, false, ns.RELOAD_ALL);
              d.defaultView.close();
              if (currentTab) gBrowser.selectedTab = currentTab;
            }
            
            button.addEventListener("click", function(e) complete(!enabled), false);
            
            if (!(enabled || ns.isUntrusted(domain))) {
              button = d.getElementById("distrust-button");
              if (!button) return;
              button.style.display = "";
              button.firstChild.textContent = noscriptOverlay.getString("distrust", [domain]);
              button.addEventListener("click", function(e) {
                ns.setUntrusted(domain, true);
                complete(false);
              }, false);
            }
          };
          w.addEventListener(et, eh, true);
         
          w.setTimeout(function() w.removeEventListener(et, eh, true), 20000);
      }
      return true;
    }
    
    return false;
  },
  
  browse: function(url, features) {
    var w = this.service.dom.mostRecentBrowserWindow;
    if(w && !w.closed && w.gBrowser) {
      w.gBrowser.selectedTab = w.gBrowser.addTab(url);
    } else {
      window.open(url, "_blank", features || null).focus();
    }
    return w;
  }
  
};
