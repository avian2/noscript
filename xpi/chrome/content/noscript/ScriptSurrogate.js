var ScriptSurrogate = {
  QueryInterface: xpcom_generateQI([CI.nsIObserver, CI.nsISupportsWeakReference]),
  
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
    this.debug = prefs.getBoolPref("debug");
    
    const map = {__proto__: null};
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
  
  getScripts: function(scriptURL, pageURL, noScript, scripts) {

    var isPage = scriptURL == pageURL;
    var code;
    const list = noScript
      ? this.mappings.noScript
      : isPage
        ? this.mappings.forPage
        : this.mappings.inclusion;
    
    for (let j = list.length; j-- > 0;) {
      let mapping = list[j];
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
        if (!scripts) scripts = [code];
        else scripts.push(code);
      }
    }
    return scripts;
  },
  

  apply: function(document, scriptURL, pageURL, noScript, scripts) {
    if (typeof(noScript) !== "boolean") noScript = !!noScript;
    
    if (this.enabled) 
      scripts = this.getScripts(scriptURL, pageURL, 
        typeof(noScript) === "boolean" ? noScript : !!noScript, 
        scripts);

    if (!scripts) return false;
    
    const runner = noScript
      ? this.fallback
      : scriptURL === pageURL
        ? let (win = document.defaultView) win != win.top ? this.executeSandbox : this.execute
        : this.executeDOM;
    
    if (this.debug) {
      // we run each script separately and don't swallow exceptions
      scripts.forEach(function(s) {
       runner.call(this, document, s);
      }, this);
    } else {
      runner.call(this, document,
        "try{" +
          scripts.join("}catch(e){}\ntry{") +
          "}catch(e){}");
    }

    return true;
  },
  
  
  fallback: function(document, scriptBlock) {
    document.addEventListener("DOMContentLoaded", function(ev) {
      ScriptSurrogate.executeSandbox(ev.currentTarget, scriptBlock);
    }, false);
  },
  
  execute: function(document, scriptBlock) {
    this.execute = ns.geckoVersionCheck("1.9.1") < 0
      ? this.executeSandbox
      : this.executeDOM;
    this.execute(document, scriptBlock);
  },
  
  executeSandbox: function(document, scriptBlock) {
    var w = document.defaultView;
    try {
      if (typeof w.wrappedJSObject === "object") w = w.wrappedJSObject;
      var s = new CU.Sandbox(w, { wantXrays: false });
      s.window = w;
      CU.evalInSandbox("with(window) {" + scriptBlock + "}", s);
    } catch (e) {
      if (ns.consoleDump) ns.dump(e);
      if (this.debug) CU.reportError(e);
    }
  },
  
  executeDOM: function(document, scriptBlock) {
    var de = document.documentElement;
    try {
      if (!de) {
        document.defaultView.location.href = "javascript:" + encodeURIComponent(scriptBlock) + "; void(0)";
        return;
      }
      
      var se = document.createElement("script");
      se.appendChild(document.createTextNode(scriptBlock));
      de.appendChild(se);
      de.removeChild(se);
    } catch (e) {
      if (ns.consoleDump) ns.dump(e);
      if (this.debug) CU.reportError(e);
    }
  }
  
}