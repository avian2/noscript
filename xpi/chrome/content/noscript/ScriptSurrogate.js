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
   
  },
  
  _observingPrefs: false,
  _syncPrefs: function() {
    const prefs = this.prefs;
    
    this.enabled = prefs.getBoolPref("enabled");
    
    const map = {};
    var key;
    for each(key in prefs.getChildList("", {})) {
      this._parseMapping(prefs, key, map);
    }
    
    const mappings = { forPage: [], noScript: [], inclusion: [], all: map};
    
    var mapping;
    for (key in map) {
      mapping = map[key];
      if (mapping.forPage) mappings.forPage.push(mapping);
      if (mapping.noScript) mappings.noScript.push(mapping);
      else if (!mapping.forPage) mappings.inclusion.push(mapping);
    }
    
    this.mappings = mappings;
    
    if (!this._observingPrefs) {
      prefs.addObserver("", this, true);
      this._observingPrefs = true;
    }
  },
  
  _parseMapping: function(prefs, key, map) {
    var keyParts = key.split(".");
    var name = keyParts[0];
    var member = keyParts[1];
    if (!(name && member)) return;
    try {
      var value = prefs.getCharPref(key);
      if (!value) return;
      var mapping = (name in map)
        ? map[name]
        : map[name] = { forPage: false, noScript: false };
      switch(member) {
        case "sources":
          var prefix = true;
          do {
            switch(value[0]) {
              case '@': mapping.forPage = true; break;
              case '!': mapping.noScript = true; break;
              case ' ': break;
              default:
                prefix = false;
            }
            if (prefix) value = value.substring(1);
          } while(prefix);
          
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
    this.prefs.removeObserver("", this, true);
    this._observingPrefs = false;
    Thread.asap(this._syncPrefs, this);
  },
  
  _resolveFile: function(fileURI) {
    const profileURI = IOS.newFileURI(
      CC["@mozilla.org/file/directory_service;1"].getService(CI.nsIProperties)
      .get("ProfD", CI.nsIFile));
    return (this._resolveFile = function(fileURI) {
      return profileURI.resolve(fileURI);
    })(fileURI);
  },
  
  getScripts: function(scriptURL, pageURL, noScript) {
    var mapping;
    var scripts = null;
    var isPage = scriptURL == pageURL;
    var code;
    const list = noScript
      ? this.mappings.noScript
      : isPage
        ? this.mappings.forPage
        : this.mappings.inclusion;
    
    for each (var mapping in list) {
      if (mapping.sources && mapping.sources.test(scriptURL) &&
          !(mapping.exceptions && mapping.exceptions.test(pageURL)) &&
          mapping.replacement) {
        if (/^(?:file:\/\/|\.\.?\/)/.test(mapping.replacement)) {
          try {
            code = IO.readFile(IOS.newURI(this._resolveFile(mapping.replacement), null, null)
                               .QueryInterface(CI.nsIFileURL).file);
          } catch(e) {
            ns.dump("Error loading " + mapping.replacement + ": " + e);
            continue;
          }
        } else {
          code = mapping.replacement;
          if (!noScript && mapping.noScript)
            code = 'document.addEventListener("DOMContentLoaded", function(event) {' +
                    code + '}, false)';
        }
        (scripts = scripts || []).push(code);
      }
    }
    return scripts;
  },
  
  getScriptBlock: function(scriptURL, pageURL, noScript) {
    var scripts = this.getScripts(scriptURL, pageURL, noScript);
    return scripts && "try { (function() {" + scripts.join("})(); (function() {") + "})(); } catch(e) {}";
  },

  apply: function(document, scriptURL, pageURL, noScript) {
    if (!this.enabled) return;
    if (typeof(noScript) != "boolean") noScript = !!noScript;
    var scriptBlock = this.getScriptBlock(scriptURL, pageURL, noScript);
    if (scriptBlock) {
      if (noScript) {
        document.defaultView.addEventListener("DOMContentLoaded", function(ev) {
          ScriptSurrogate.sandbox(ev.target, scriptBlock);
        }, false);
      } else {
        this.execute(document, scriptBlock, scriptURL == pageURL);
      }
    }
  },
  
  sandbox: function(document, scriptBlock) {
    var w = document.defaultView;
    try {
      var s = new CU.Sandbox(w);
      s.window = w.wrappedJSObject || w;
      CU.evalInSandbox("with(window) {" + scriptBlock + "}", s);
    } catch(e) {
      if (ns.consoleDump) ns.dump(e);
    }
  },
  
  execute: function(document, scriptBlock, isPageScript) {
    if (this._mustUseDOM && document.documentElement) {
      var s = document.createElementNS(HTML_NS, "script");
      s.appendChild(document.createTextNode(scriptBlock));
      var parent = document.documentElement;
      parent.insertBefore(s, parent.firstChild);
      parent.removeChild(s);
      if (this._mustResetStyles && isPageScript) this._resetStyles();
    } else {
      try {
        document.defaultView.location.href =
          encodeURI("javascript:" + scriptBlock);
      } catch(e) {
        if (ns.consoleDump) ns.dump("Error running " + scriptBlock + "\non " + document.URL + ":\n" + e);
      }
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