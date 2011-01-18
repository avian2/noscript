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
    window.openDialog(
        this.chromeBase + this.chromeName + "Options.xul", 
        this.chromeName + "Options",
        "chrome, dialog, centerscreen, alwaysRaised",
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
    if (window.toJavaScriptConsole) {
        toJavaScriptConsole();
    } else {
        window.open("chrome://global/content/console.xul", "_js_console_", "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar");
    }
  },
  
  openFaq: function(which) {
    this.browse("http://noscript.net/faq#" + which);
  },
  
  openHelp: function(section) {
    this.browse("http://noscript.net/help/" + section);
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
      ace = CC["@mozilla.org/network/idn-service;1"]
              .getService(CI.nsIIDNService).convertUTF8toACE(domain);
    } catch(e) {
      ace = '';
    }
    
    url = url.replace(/%utf8%/g, encodeURI(domain))
            .replace(/%ace%/g, encodeURI(ace));
        
    if (this.confirm(
       this.getString("siteInfo.confirm", [domain, ns.getSite(url) || "?", url]),
        "confirmSiteInfo", "NoScript"
      )) {
      this.browse(url);
      return true;
    }
    
    return false;
  },
  
  browse: function(url, features) {
    var w = this.service.dom.mostRecentBrowserWindow;
    if(w && !w.closed && w.gBrowser) {
      w.gBrowser.selectedTab = w.gBrowser.addTab(url);
    } else {
      w = window.open(url, "_blank", features || null);
    }
    w.focus();
  }
  
};
