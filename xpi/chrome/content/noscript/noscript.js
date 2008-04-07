var noscriptUtil = {
  chromeBase: "chrome://noscript/content/",
  chromeName: "noscript",
  _service: null, 
  get service() {
    if(this._service) return this._service;
    var s = null;
    for(var attempt=1; attempt<=2;attempt++) {
      try {
       s = Components.classes["@maone.net/noscript-service;1"].getService().wrappedJSObject;
       break;
      } catch(ex) {
        dump(ex.message);
        window.navigator.plugins.refresh();
      }
    }
    if(s != null) {
      s.init();
    }
    return this._service = s;
  }, 
  get prompter() {
    return Components.classes["@mozilla.org/embedcomp/prompt-service;1"
          ].getService(Components.interfaces.nsIPromptService);
  }
,
  confirm: function(msg, persistPref, title) {
    const ns = this.service; 
    var alwaysAsk = { value: ns.getPref(persistPref, true) };
     if((!alwaysAsk.value) || 
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
    return this._service.getString(key, parms);
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
  openJarOptions: function() {
    this.openOptionsDialog({tabselIndexes: [5, 3]});
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
    toJavaScriptConsole();
  },
  
  openFaq: function(which) {
    this.browse("http://noscript.net/faq#" + which);
  },
  
  
  browse: function(url, features) {
    var w = this.service.domUtils.mostRecentBrowserWindow;
    if(w && !w.closed) {
      var browser = w.getBrowser();
      browser.selectedTab = browser.addTab(url, null);
    } else {
      window.open(url, "_blank", features || null)
    }
  }
  
};
