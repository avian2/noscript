var ScriptSurrogate = {
  QueryInterface: xpcom_generateQI([CI.nsIObserver, CI.nsISupportsWeakReference, CI.nsISupports]),
  
  enabled: true,
  prefs: null,
  
  get mappings() {
    delete this.mappings;
    this._init();
    return this.mappings;
  },
  
  
  _init: function() {
    this.prefs = CC["@mozilla.org/preferences-service;1"].getService(CI.nsIPrefService)
      .getBranch("noscript.surrogate.").QueryInterface(CI.nsIPrefBranch2);
    this._syncPrefs();
    this.prefs.addObserver("", this, true);
  },
  
  _syncPrefs: function() {
    const prefs = this.prefs;
    this.enabled = prefs.getBoolPref("enabled");
    this.mappings = {};
    for each(var key in prefs.getChildList("", {})) {
      this._parseMapping(prefs, key);
    }
  },
  
  _parseMapping: function(prefs, key) {
    var keyParts = key.split(".");
    var name = keyParts[0];
    var member = keyParts[1];
    if (!(name && member)) return;
    try {
      var value = prefs.getCharPref(key);
      if (!value) return;
      var mapping = (name in this.mappings) ? this.mappings[name] : this.mappings[name] = { forPage: false };
      switch(member) {
        case "sources":
          if ((mapping.forPage = value[0] == '@')) value = value.substring(1);
        case "exceptions":
          value = new AddressMatcher(value);
        case "replacement":
          break;
        default:
          return;
      }
      
      mapping[member] = value; 
    } catch (e) {}
  },
  
  observe: function(prefs, topic, key) {
    this._syncPrefs();
  },
  
  getScripts: function(scriptURL, pageURL) {
    var mapping;
    var scripts = null;
    var isPage = scriptURL == pageURL;
    for (var key in this.mappings) {
      mapping = this.mappings[key];
      if (isPage == mapping.forPage && mapping.sources && mapping.sources.test(scriptURL) &&
          !(mapping.exceptions && mapping.exceptions.test(pageURL)) &&
          mapping.replacement) {
        (scripts = scripts || []).push(mapping.replacement);
      }
    }
    return scripts;
  },
  
  getScriptBlock: function(scriptURL, pageURL) {
    var scripts = this.getScripts(scriptURL, pageURL);
    return scripts && "try { (function() {" + scripts.join("})(); (function() {") + "})(); } catch(e) {}";
  },

  apply: function(document, scriptURL, pageURL) {
    if (!this.enabled) return;
    var scriptBlock = this.getScriptBlock(scriptURL, pageURL);
    if (scriptBlock) {
      this.execute(document, scriptBlock, scriptURL == pageURL);
    }
  },
  
  
  execute: function(document, scriptBlock, isPageScript) {
    if (this._mustUseDOM && document.documentElement) {
      var s = document.createElementNS(HTML_NS, "script");
      s.id = "__noscriptSurrogate__" + DOM.rndId();
      s.appendChild(document.createTextNode(scriptBlock +
        ";(function(){var s=document.getElementById('" + s.id + "');s.parentNode.removeChild(s);})()"));
      document.documentElement.insertBefore(s, document.documentElement.firstChild);
      if (this._mustResetStyles && isPageScript) this._resetStyles();
    } else {
      document.defaultView.location.href = encodeURI("javascript:" + scriptBlock);
    }
  },
  
  get _mustUseDOM() {
    delete this._mustUseDOM;
    return this._mustUseDOM = ns.geckoVersionCheck("1.9") >= 0;
  },
  
  get _mustResetStyles() {
    delete this._mustResetStyles;
    return this._mustResetStyles = ns.geckoVersionCheck("1.9.1") < 0;
  },
  
  get _emptyStyle() {
    delete this._emptyStyle;
    return this._emptyStyle = IOS.newURI("data:text/css;charset=utf8,", null, null);
  },
  
  _resetStyles: function() {
    const sss = ns.sss;
    const SHEET = sss.AGENT_SHEET;
    sss.loadAndRegisterSheet(this._emptyStyle, SHEET);
    sss.unregisterSheet(this._emptyStyle, SHEET)
  }

  
}