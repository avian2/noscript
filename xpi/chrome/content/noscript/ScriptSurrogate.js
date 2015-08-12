var ScriptSurrogate = {
  QueryInterface: xpcom_generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),
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
    this.prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService)
      .getBranch("noscript.surrogate.").QueryInterface(Ci.nsIPrefBranch2);
    this._syncPrefs();

  },

  _observingPrefs: false,
  _syncPrefs: function() {
    const prefs = this.prefs;

    for each(let p in ["enabled", "debug", "sandbox"]) this[p] = prefs.getBoolPref(p);

    // inclusions don't work with sandbox on Gecko < 2, but may crash without on Gecko > 2
    this.sandboxInclusions = this.sandbox && (ns.geckoVersionCheck("2") >= 0);

    const map = {__proto__: null};
    var key;
    for each(key in prefs.getChildList("", {})) {
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

  initReplacement: function(m) {
    var r;
    try {
      r = this.prefs.getComplexValue(m.name + ".replacement",
                         Ci.nsISupportsString).data;
      if (/^(?:file:\/\/|\.\.?\/)/.test(r)) {
        r = IO.readFile(IOS.newURI(this._resolveFile(r), null, null)
              .QueryInterface(Ci.nsIFileURL).file);
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


  _errorListener: function(ev) {
    var s = ev.target;
    if (!(s instanceof Ci.nsIDOMHTMLScriptElement)) return;
    let url = s.src;
    if (!url) return;

    let doc = s.ownerDocument;
    let hasSurrogate = ScriptSurrogate.apply(doc, url);
    if (hasSurrogate) {

    }
    let fakeLoad = ns.fakeScriptLoadEvents;
    if ((hasSurrogate ||
         fakeLoad.enabled &&
         !(fakeLoad.onlyRequireJS && !s.hasAttribute("data-requiremodule"))
         ) &&
        !(fakeLoad.exceptions && fakeLoad.exceptions.test(url) ||
          fakeLoad.docExceptions && fakeLoad.docExceptions.test(doc.URL))) {
      ev.preventDefault();
      ev.stopPropagation();
      ev = s.ownerDocument.createEvent('HTMLEvents');
      ev.initEvent('load', false, true);
      s.dispatchEvent(ev)
    }
  },
  _execListener: function(ev) {
    let s = ev.target;
    if (s instanceof Ci.nsIDOMHTMLScriptElement && s.src) {
      ScriptSurrogate.apply(s.ownerDocument, s.src, ev.type[0] === 'b' ? "<" : ">", false);
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

  apply: function(document, scriptURL, pageURL, noScript, scripts) {
    if (typeof(noScript) !== "boolean") noScript = !!noScript;

    if (this.enabled) {
      scripts = this.getScripts(scriptURL, pageURL, noScript, scripts);
      if (pageURL && !noScript) {
        let w = document.defaultView;
        w.addEventListener("error", this._errorListener, true);
        if (this.mappings.before.length)
          w.addEventListener("beforescriptexecute", this._execListener, true);
        if (this.mappings.after.length)
          w.addEventListener("afterscriptexecute", this._execListener, true);
      }
    }

    if (!scripts) return false;

    const runner = noScript
      ? this.fallback
      : scriptURL === pageURL
        ? document.defaultView !== document.defaultView.top
            ? this.executeSandbox
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
    ? function(s) s.indexOf("$S(") !== -1
      ?  "{let $S; {let nsmHandler={get:function(t,n)n in t?t[n]:function()t.__noSuchMethod__(n,Array.prototype.slice.call(arguments))};$S=function(o)new Proxy(o||{},nsmHandler);}\n" + s + "\n}"
      : s
    : function(s) "{let $S = function(o){return o||{};};\n" + s + "\n}"
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

  getPrincipal: ns.geckoVersionCheck("24") > 0 ? function(doc) doc.nodePrincipal : function(doc) doc.defaultView,


  executeSandbox: function(document, scriptBlock, env) {
    var w = document.defaultView;
    try {
      if (typeof w.wrappedJSObject === "object") w = w.wrappedJSObject;
      this._sandboxParams.sandboxName = "NoScript::ScriptSurrogate@" + document.documentURI;
      this._sandboxParams.sandboxPrototype = w;
      let s = new Cu.Sandbox(this.getPrincipal(document), this._sandboxParams);
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
      Cu.evalInSandbox(code, s, this.JS_VERSION);
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




}

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
