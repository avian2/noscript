var ScriptSurrogate = {
  QueryInterface: xpcom_generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),
  JS_VERSION: "1.8",
  enabled: true,
  prefs: null,
  sandbox: true,
  syntaxChecker: new SyntaxChecker(),
  
  get mappings() {
    delete this.mappings;
    this._init();
    return this.mappings;
  },
  
  
  _init: function() {
    this.prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService)
      .getBranch("noscript.surrogate.").QueryInterface(Ci.nsIPrefBranch2);
    this._syncPrefs();
   
  },
  
  _observingPrefs: false,
  _syncPrefs: function() {
    const prefs = this.prefs;
    
    for each(let p in ["enabled", "debug", "sandbox"]) this[p] = prefs.getBoolPref(p);
    
    // inclusions don't work with sandbox on Gecko < 2, but may crash without on Gecko > 2
    if (ns.geckoVersionCheck("2") < 0) this.sandbox = false; 
    
    const map = {__proto__: null};
    var key;
    for each(key in prefs.getChildList("", {})) {
      this._parseMapping(prefs, key, map);
    }
    
    const mappings = {forPage: [], noScript: [], inclusion: [], before: [], after: [], all: map};
    
    var mapping;
    for (key in map) {
      mapping = map[key];
      if (!mapping.error) {
        if (mapping.forPage) mappings.forPage.push(mapping);
        if (mapping.noScript) mappings.noScript.push(mapping);
        else if (!mapping.forPage) {
          if (!(mapping.before || mapping.after)) mappings.inclusion.push(mapping);
          else {
            if (mapping.before) mappings.before.push(mapping);
            if (mapping.after) mappings.after.push(mapping);
          }
        }
      }
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
      let value = prefs.getCharPref(key);
      if (!value) return;
      let mapping = (name in map)
        ? map[name]
        : map[name] = new SurrogateMapping();
      switch(member) {
        case "sources":
          let prefix = true;
          do {
            switch(value[0]) {
              case '@': mapping.forPage = true; break;
              case '!': mapping.noScript = true; break;
              case '<': mapping.before = true; break;
              case '>': mapping.after = true; break;
              case ' ': break;
              default:
                prefix = false;
            }
            if (prefix) value = value.substring(1);
          } while(prefix);
          
        case "exceptions":
          value = new AddressMatcher(value);
          break;
        
        case "replacement":
          if (!this.syntaxChecker.check(value)) {
            Cu.reportError(mapping.error = this.syntaxChecker.lastError);
          }
          break;
        
        default:
          return;
      }
      
      mapping[member] = value; 
    } catch (e) {
      Cu.reportError(e);
    }
  },
  
  observe: function(prefs, topic, key) {
    this.prefs.removeObserver("", this, true);
    this._observingPrefs = false;
    Thread.asap(this._syncPrefs, this);
  },
  
  _resolveFile: function(fileURI) {
    const profileURI = IOS.newFileURI(
      Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties)
      .get("ProfD", Ci.nsIFile));
    return (this._resolveFile = function(fileURI) {
      return profileURI.resolve(fileURI);
    })(fileURI);
  },
  
  getScripts: function(scriptURL, pageURL, noScript, scripts) {

    var isPage = scriptURL === pageURL;
    var code;
    const list = noScript
      ? this.mappings.noScript
      : isPage
        ? this.mappings.forPage
        : pageURL === '<'
          ? this.mappings.before
          : pageURL === '>'
            ? this.mappings.after
            : this.mappings.inclusion;
    
    for (let j = list.length; j-- > 0;) {
      let mapping = list[j];
      if (mapping.sources && mapping.sources.test(scriptURL) &&
          !(mapping.exceptions && mapping.exceptions.test(pageURL)) &&
          mapping.replacement) {
        if (/^(?:file:\/\/|\.\.?\/)/.test(mapping.replacement)) {
          try {
            code = IO.readFile(IOS.newURI(this._resolveFile(mapping.replacement), null, null)
                               .QueryInterface(Ci.nsIFileURL).file);
          } catch(e) {
            ns.dump("Error loading " + mapping.replacement + ": " + e);
            continue;
          }
        } else {
          code = mapping.replacement;
        }
        if (!noScript && mapping.noScript)
          code = 'window.addEventListener("DOMContentLoaded", function(event) {' +
                    code + '}, true)';

        if (!scripts) scripts = [code];
        else scripts.push(code);
      }
    }
    return scripts;
  },
  
  _afterHandler: function(ev) {
    let s = ev.target;
    if (s instanceof Ci.nsIDOMHTMLScriptElement && s.src)
      ScriptSurrogate.apply(s.ownerDocument, s.src, ">", false);
    
  },
  
  apply: function(document, scriptURL, pageURL, noScript, scripts) {
    if (typeof(noScript) !== "boolean") noScript = !!noScript;
    
    if (this.enabled) {
      scripts = this.getScripts(scriptURL, pageURL, noScript, scripts);
      if (!noScript && this.mappings.after.length && !document._noscriptAfterSurrogates) {
        document._noscriptAfterSurrogates = true;
        document.addEventListener("load", this._afterHandler, true);
      }
    }

    if (!scripts) return false;
    
    const runner = noScript
      ? this.fallback
      : scriptURL === pageURL
        ? let (win = document.defaultView) win != win.top ? this.executeSandbox : this.execute
        : this.sandbox ? this.executeSandbox : this.executeDOM;
    
    if (this.debug) {
      // we run each script separately and don't swallow exceptions
      scripts.forEach(function(s) {
       runner.call(this, document, "{" + s + "}");
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
  
  executeSandbox: function(document, scriptBlock, env) {
    var w = document.defaultView;
    try {
      if (typeof w.wrappedJSObject === "object") w = w.wrappedJSObject;
      var s = new Cu.Sandbox(w, { wantXrays: false });
      s.window = w;
      if (typeof env !== "undefined") {
        s.env = env;
        Cu.evalInSandbox("with(window){" + scriptBlock + "}", s, ScriptSurrogate.JS_VERSION);
      } else {
        this._sandboxRun(s, scriptBlock);
      }
    } catch (e) {
      if (ns.consoleDump) {
        ns.dump(e);
        ns.dump(scriptBlock);
      }
      if (this.debug) Cu.reportError(e);
    }
  },
  
  get _sandboxRun() {
    delete this._sandboxRun;
    return this._sandboxRun =
      ns.geckoVersionCheck("2") < 0
        ? this._sandboxRunLegacy
        : this._sandboxRunGecko2;
  },
  _sandboxRunGecko2: function(s, scriptBlock) {
    s.script = scriptBlock;
    Cu.evalInSandbox("window.eval(script)", s, ScriptSurrogate.JS_VERSION);
  },
  _sandboxRunLegacy: function(s, scriptBlock) {
    Cu.evalInSandbox("with(window){" + scriptBlock + "}", s, ScriptSurrogate.JS_VERSION);
  },
  
  executeDOM: function(document, scriptBlock) {
    var de = document.documentElement;
    try {
      if (!de) {
        this.executeSandbox(document, scriptBlock);
        return;
      }
      
      var se = document.createElement("script");
      se.type = "application/javascript;version=" + ScriptSurrogate.JS_VERSION;
      se.appendChild(document.createTextNode(scriptBlock));
      de.appendChild(se);
      de.removeChild(se);
    } catch (e) {
      if (ns.consoleDump) ns.dump(e);
      if (this.debug) Cu.reportError(e);
    }
  }
}

function SurrogateMapping() {}
SurrogateMapping.prototype = {
  sources: null,
  replacement: null,
  exceptions: null,
  error: null,
  
  forPage: false,
  noScript: false,
  before: false,
  after: false
};