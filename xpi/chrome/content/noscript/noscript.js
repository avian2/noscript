const noscriptUtil = {
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
      s.nakeEmbed = this._nakeEmbed;
    } else {
      s = { uninstalling: true };
    }
    return this._service = s;
  },
  
  _nakeEmbed: function(ctx) {
    const lm = this.lookupMethod;
    var prev = lm(ctx, "previousSibling")();
    if(prev) return lm(prev, "nextSibling")();
    return lm(lm(ctx, "parentNode")(), "firstChild")();
  },
  
  get prompter() {
    return Components.classes["@mozilla.org/embedcomp/prompt-service;1"
          ].getService(Components.interfaces.nsIPromptService);
  }
,
  getString: function(key, parms) {
    return this._service.getString(key, parms);
  }
,
  openOptionsDialog: function() {
    window.open(this.chromeBase + this.chromeName + "Options.xul", this.chromeName + "Options",
          "chrome, dialog, centerscreen,alwaysRaised");  
  }
,
  openAboutDialog: function() {
    window.open(this.chromeBase + "about.xul", this.chromeName + "About",
      "chrome,dialog,centerscreen");
  }
  
  
};
