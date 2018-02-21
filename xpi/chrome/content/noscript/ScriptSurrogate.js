var ScriptSurrogate = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),
  JS_VERSION: "1.8",
  enabled: true,
  prefs: null,
  sandbox: true,
  sandboxInclusions: true,

  get syntaxChecker() {
    delete this.syntaxChecker;
    return this.syntaxChecker = new SyntaxChecker(this.JS_VERSION);
  },
  get mappings() {
    delete this.mappings;
    this._init();
    return this.mappings;
  },


  _init: function() {
    this.prefs = ns.prefService.getBranch("noscript.surrogate.");
    this._syncPrefs();
    ns.onDisposal(() => { this.dispose(); });
  },

  _observingPrefs: false,
  _syncPrefs: function() {
    const prefs = this.prefs;

    for (let p  of ["enabled", "debug", "sandbox", "matchPrivileged"]) this[p] = prefs.getBoolPref(p);

    this.sandboxInclusions = this.sandbox;

    const map = {__proto__: null};
    var key;
    for (key  of prefs.getChildList("", {})) {
      this._parseMapping(prefs, key, map);
    }

    const mappings = {forPage: [], noScript: [], inclusion: [], before: [], after: [], all: map};

    var mapping;
    for (key in map) {
      mapping = map[key];
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
        : map[name] = new SurrogateMapping(name);
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

        // case "exceptions": case "replacement": // deferred, see SurrogateMapping.replacement

        default:
          return;
      }

      mapping[member] = value;
    } catch (e) {
      Cu.reportError(e);
    }
  },
  loadReplacementFile(path) {
    return IO.readFile(IOS.newURI(this._resolveFile(path), null, null)
              .QueryInterface(Ci.nsIFileURL).file);
  },
  getReplacement(name) {
    return COMPAT.getStringPref(this.prefs, name + ".replacement");
  },
  initReplacement: function(m) {
    var r;
    try {
      r = this.getReplacement(m.name);
      if (/^(?:file:\/\/|\.\.?\/)/.test(r)) {
        r = Services.cpmm.sendSyncMessage(IPC_P_MSG.LOAD_SURROGATE, m.name)[0];
      }

      if (r && !this.syntaxChecker.check(r)) {
        throw this.syntaxChecker.lastError;
      }
    } catch (e) {
      m.error = e;
      Cu.reportError("Error loading " + m.name + " surrogate: " + e + (r ? "\n" + r : ""));
      r = "";
    }
    return r;
  },

  _sandboxes: null,
  createSandboxForWindow(w, ...args) {
    if (!this._sandboxes) {
      this._sandboxes = new Map();
      OS.addObserver(this, "inner-window-destroyed", true);
    }
    let s = new Cu.Sandbox(...args);
    let weakRef = Cu.getWeakReference(s);
    let windowId = w.QueryInterface(Ci.nsIInterfaceRequestor)
                     .getInterface(Ci.nsIDOMWindowUtils).currentInnerWindowID;
    let sandboxes = this._sandboxes.get(windowId);
    if (!sandboxes) {
      this._sandboxes.set(windowId, sandboxes = [weakRef]);
    } else {
      sandboxes.push(weakRef);
    }
    return s;
  },
  _: {Ci, Cu},
  observe(subject, topic, key) {
     let {Ci, Cu} = this._;

    if (topic === "inner-window-destroyed") {
      let windowId = subject.QueryInterface(Ci.nsISupportsPRUint64).data;
      let sandboxes = this._sandboxes.get(windowId);
      if (sandboxes) {
        this._sandboxes.delete(windowId);
        for (let weakRef of sandboxes) {
          let s = weakRef.get();
          if (s) {
            try {
              Cu.nukeSandbox(s);
            } catch (e) {
              Cu.reportError(e);
            }
          }
        }
      }
      return;
    }

    if (subject instanceof Ci.nsIPrefBranch) {
      this.prefs.removeObserver("", this, true);
      this._observingPrefs = false;
      if (typeof Thread !== "undefined") {
        Thread.asap(this._syncPrefs, this);
      }
      return;
    }
    
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
        let code = mapping.replacement;

        if (!noScript && mapping.noScript)
          code = 'window.addEventListener("DOMContentLoaded", function(event) {' +
                    code + '}, true)';

        if (!scripts) scripts = [code];
        else scripts.push(code);
      }
    }
    return scripts;
  },

  _listener(ev) {
    if (typeof ScriptSurrogate === "undefined") { // disabled / uninstalled
      let f = arguments.callee;
      let t = ev.currentTarget;
      for (let et of ["error", "beforescriptexecute", "afterscriptexecute"]) {
        t.removeEventListener(et, f, true);
      }
      return;
    }
    
    let s = ev.target;
    if (s.localName !== "script") return;
    let url = s.src;
    if (!url) return;

    let doc = s.ownerDocument;
    let et = ev.type;

    if (et !== "error") { // onbefore/onafter script execution
      ScriptSurrogate.apply(doc, url, et[0] === 'b' ? "<" : ">", false);
      return;
    }

    // onerror
    let hasSurrogate = ScriptSurrogate.apply(doc, url);
    if (!hasSurrogate) return;

    let fakeLoad = ns.fakeScriptLoadEvents;
    if (fakeLoad.enabled &&
        !(fakeLoad.onlyRequireJS && !s.hasAttribute("data-requiremodule") ||
          fakeLoad.exceptions && fakeLoad.exceptions.test(url) ||
          fakeLoad.docExceptions && fakeLoad.docExceptions.test(doc.URL)
         )
      ) {
      ev.preventDefault();
      ev.stopPropagation();
      ev = doc.createEvent('HTMLEvents');
      ev.initEvent('load', false, true);
      s.dispatchEvent(ev);
    }
    
    
    
  },

  replaceScript: function(scriptElement) {
    if (scriptElement._surrogated) return true;

    let src = scriptElement.src;
    let doc = scriptElement.ownerDocument;

    return (src && doc) && this.apply(doc, src, false, false) &&
       (ns.getExpando(doc, "surrogates", {})[src] =
        scriptElement._surrogated = true);
  },

  _privilegedRx: /^(?:chrome|resource|moz-extension):/,
  apply: function(document, scriptURL, pageURL, noScript, scripts) {
    if (typeof(noScript) !== "boolean") noScript = !!noScript;

    if (this.enabled && (this.matchPrivileged || !this._privilegedRx.test(scriptURL))) {
      scripts = this.getScripts(scriptURL, pageURL, noScript, scripts);
      if (pageURL && !noScript) {
        let w = document.defaultView;
        let events = ["error"];
        for (let when of ["before", "after"]) {
          if (this.mappings[when].length) events.push(`${when}scriptexecute`);
        }
        for (let e of events) {
          w.addEventListener(e, this._listener, true);
        }
      }
    }

    if (!scripts) return false;

    const runner = noScript ? this.fallback :
      scriptURL === pageURL ?
        document.defaultView !== document.defaultView.top ?
          this.executeSandbox
            : (this.sandbox ? this.execute : this.executeDOM)
          : this.sandboxInclusions ? this.executeSandbox : this.executeDOM;

    if (this.debug) {
      // we run each script separately and don't swallow exceptions
      scripts.forEach(function(s) {
       runner.call(this, document, "{" + this._preamble(s) + "}");
      }, this);
    } else {
      runner.call(this, document,this._preamble(
        "try{" +
          scripts.join("}catch(e){}\ntry{") +
          "}catch(e){}")
        );
    }
    return true;
  },

  _testAll: function(document) {
    let scripts = [];
    let all = this.mappings.all;
    for (let k in  all) scripts.push(all[k].replacement);
    scripts.forEach(function(s) {
     this.executeSandbox(document, "{" + this._preamble(s) + "}");
    }, this);
  },

  _preamble: function(s) {
    delete this._preamble;
    return (this._preamble = (ns.geckoVersionCheck("37") >= 0
    ? (s) => s.indexOf("$S(") !== -1
      ?  "{let $S; {let nsmHandler={get:(t,n)=>n in t?t[n]:(...x)=>t.__noSuchMethod__(n,...x)};$S=(o)=>new Proxy(o||{},nsmHandler);}\n" + s + "\n}"
      : s
    : s => `{let $S=o=>o||{};\n${s}\n}`
    ))(s);
  },

  fallback: function(document, scriptBlock) {
    document.addEventListener("DOMContentLoaded", function(ev) {
      ScriptSurrogate.executeSandbox(ev.currentTarget, scriptBlock);
    }, false);
  },

  execute: function(document, scriptBlock) {
    this.execute = ns.geckoVersionCheck("1.9.1") < 0 || ns.geckoVersionCheck("2") >= 0
      ? this.executeSandbox
      : this.executeDOM;
    this.execute(document, scriptBlock);
  },

  _sandboxParams: {
    wantXrays: false,
    sandboxName: ""
  },

  getPrincipal: (doc) => doc.nodePrincipal,

  executeSandbox: function(document, scriptBlock, env) {
    var w = document.defaultView;
    var wrapper = w;
    var s = null;
    try {
      if (typeof w.wrappedJSObject === "object") w = w.wrappedJSObject;
      this._sandboxParams.sandboxName = "NoScript::ScriptSurrogate@" + document.documentURI;
      this._sandboxParams.sandboxPrototype = w;
      s = this.createSandboxForWindow(wrapper, this.getPrincipal(document), this._sandboxParams);
      if (!("top" in s)) s.__proto__ = w;
      if (typeof env !== "undefined") {
        s.env = env;
        let ep = {};
        for (let p in env) {
          ep[p] = "rw";
        }
        env.__exposedProps__ = ep;
      }
      let code = "with(window){" + scriptBlock + "}delete this.env;";
      if ("keys" in Object) code += "Object.keys(this).forEach(function(p) { window[p] = this[p] }, this);";
      Cu.evalInSandbox(code, s);
    } catch (e) {
      if (ns.consoleDump) {
        ns.dump(e);
        ns.dump(scriptBlock);
      }
      if (this.debug) Cu.reportError(e);
    } finally {
      delete this._sandboxParams.sandboxPrototype;
    }
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
  },

  dispose() {
    if (this._observingPrefs) {
      this.prefs.removeObserver("", this, true);
    }
  }



};

function SurrogateMapping(name) {
  this.name = name;
  this.__defineGetter__("replacement", this._replacement);
}
SurrogateMapping.prototype = {
  sources: null,
  _replacement: function() {
    delete this.replacement;
    return this.replacement = ScriptSurrogate.initReplacement(this);
  },
  exceptions: null,
  error: null,

  forPage: false,
  noScript: false,
  before: false,
  after: false
};
