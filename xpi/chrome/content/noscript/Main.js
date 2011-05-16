const WP_STATE_START = CI.nsIWebProgressListener.STATE_START;
const WP_STATE_STOP = CI.nsIWebProgressListener.STATE_STOP;
const WP_STATE_DOC = CI.nsIWebProgressListener.STATE_IS_DOCUMENT;
const WP_STATE_START_DOC = WP_STATE_START | WP_STATE_DOC;
const WP_STATE_RESTORING = CI.nsIWebProgressListener.STATE_RESTORING;

const LF_VALIDATE_ALWAYS = CI.nsIRequest.VALIDATE_ALWAYS;
const LF_LOAD_BYPASS_ALL_CACHES = CI.nsIRequest.LOAD_BYPASS_CACHE | CI.nsICachingChannel.LOAD_BYPASS_LOCAL_CACHE;

const NS_OK = 0;
const NS_BINDING_ABORTED = 0x804b0002;
const NS_BINDING_REDIRECTED = 0x804b0003;
const NS_ERROR_UNKNOWN_HOST = 0x804b001e;
const NS_ERROR_REDIRECT_LOOP = 0x804b001f;
const NS_ERROR_CONNECTION_REFUSED = 0x804b000e;
const NS_ERROR_NOT_AVAILABLE = 0x804b0111;

const LOG_CONTENT_BLOCK = 1;
const LOG_CONTENT_CALL = 2;
const LOG_CONTENT_INTERCEPT = 4;
const LOG_CHROME_WIN = 8;
const LOG_XSS_FILTER = 16;
const LOG_INJECTION_CHECK = 32;
const LOG_DOM = 64; // obsolete, reuse me
const LOG_JS = 128;
const LOG_LEAKS = 1024;
const LOG_SNIFF = 2048;
const LOG_CLEARCLICK = 4096;
const LOG_ABE = 8192;

const HTML_NS = "http://www.w3.org/1999/xhtml";

const WHERE_UNTRUSTED = 1;
const WHERE_TRUSTED = 2;
const ANYWHERE = 3;

const DUMMYOBJ = {};
DUMMYOBJ.wrappedJSObject = DUMMYOBJ;

const DUMMYFUNC = function() {}
const EARLY_VERSION_CHECK = !("nsISessionStore" in CI && typeof(/ /) === "object");

INCLUDE("Sites", "AddressMatcher", "IOUtil", "Policy", "Thread");
LAZY_INCLUDE("DNS", "HTTPS", "ScriptSurrogate", "DOM", "URIValidator", "ClearClickHandler", "STS");

__defineGetter__("ABE", function() {
  delete this.ABE;
  INCLUDE("ABE");
  ABE.init("noscript.");
  DNS.logEnabled = ns.getPref("logDNS");
  return ABE;
});


var ns = singleton = {
  VERSION: VERSION
,
  QueryInterface: xpcom_generateQI(SERVICE_IIDS),
  generateQI: xpcom_generateQI
,
  get ABE() ABE,
  get OriginTracer() OriginTracer,
  
  AddressMatcher: AddressMatcher,
  Thread: Thread,

  // nsIObserver implementation 
  observe: function(subject, topic, data) {
    
    switch (topic) {
      case "content-document-global-created":
        if (subject == subject.top) return;
      case "document-element-inserted":
        this.beforeScripting(subject, data);
      return;
    }
    
    if (subject instanceof CI.nsIPrefBranch2) {
      this.syncPrefs(subject, data);
    } else {
      switch (topic) {

        case "xpcom-shutdown":
          this.unregister();
          break;
        
        case "profile-before-change": 
          this.dispose();
          Thread.hostRunning = false;
          break;
        case "profile-after-change":
          Thread.hostRunning = true;
          try {
            this.init();
          } catch(e) {
            this.dump("Init error -- " + e + "\n" + e.stack);
          }
          break;
        case "sessionstore-windows-restored":
          ns.checkVersion();
          break;
        
        case "em-action-requested":
          if ((subject instanceof CI.nsIUpdateItem)
              && subject.id == EXTENSION_ID ) {
            if (data == "item-uninstalled" || data == "item-disabled") {
              this.uninstalling = true;
            } else if (data == "item-enabled") {
              this.uninstalling = false;
            }
          }
        break;
        
        case "toplevel-window-ready":
          this.registerToplevel(subject); 
        break;
      
        case "private-browsing":
          if (data == "enter") {
            STS.enterPrivateBrowsing();
            if (!("_realDump_" in this)) this._realDump_ = this.dump;
            this.dump = DUMMYFUNC;
          }
          if (data == "exit") {
            this.eraseTemp();
            STS.exitPrivateBrowsing();
            this.dump = this._realDump_ || DUMMYFUNC;
          }
        // break; 
        case "browser:purge-session-history":
          this.recentlyBlocked = [];
          STS.eraseDB();
        break;
        
        
      }
    }
  },
  
  registerToplevel: function(window) {
    if (window instanceof CI.nsIDOMChromeWindow && window instanceof CI.nsIDOMNSEventTarget) {
      if (!window.opener) {
        window.isNewToplevel = true;
        if (this.consoleDump & LOG_CHROME_WIN) {
          this.dump("Toplevel register, true");
        }
        window.addEventListener("load", this.handleToplevel, false);
      }
      if (EARLY_VERSION_CHECK && !this.versionChecked) {
        window.addEventListener("load", function() {
          if (window == DOM.mostRecentBrowserWindow) ns.checkVersion();
        }, false);
      }
    }
  },
  handleToplevel: function(ev) {
    // this resets newtoplevel status to true after chrome
    const window = ev.currentTarget;
    const callee = arguments.callee;
    switch (ev.type) {
      case "load":
        window.removeEventListener("load", callee, false);
        window.addEventListener("unload", callee, false);
        ns.delayExec(callee, 0, { type: "timeout", currentTarget: window });
        break;
      case "timeout":
      case "unload":
        window.isNewToplevel = false;
        window.removeEventListener("unload", callee, false);
    }
    if (ns.consoleDump & LOG_CHROME_WIN) 
      ns.dump("Toplevel " + ev.type + ", " + window.isNewToplevel);
    
  },
  
  httpObserver: {
    observe: function(channel, topic, data) {
      if (channel instanceof CI.nsIHttpChannel) {
        let ncb = channel.notificationCallbacks;
        let loadFlags = channel.loadFlags;
        if (!(loadFlags || ncb || channel.owner)) {
          try {
            if (channel.getRequestHeader("Content-type") == "application/ocsp-request") {
              if (ns.consoleDump) ns.dump("Skipping cross-site checks for OCSP request " + channel.name);
              return;
            }
          } catch(e) {}
        }
  
        if (ncb instanceof CI.nsIXMLHttpRequest && !ns.isCheckedChannel(channel)) {
          if (ns.consoleDump) ns.dump("Skipping cross-site checks for chrome XMLHttpRequest " + channel.name + ", " + loadFlags + ", "
                                      + channel.owner + ", " + !!PolicyState.hints);
          return;
        }
        
        ns.requestWatchdog.onHttpStart(channel);
      }
    }
  },
  
  OBSERVED_TOPICS: ["profile-before-change", "xpcom-shutdown", "profile-after-change", "sessionstore-windows-restored",
                    "toplevel-window-ready", "browser:purge-session-history", "private-browsing",
                    "content-document-global-created", "document-element-inserted"],
  register: function() {
    OS.addObserver(this.httpObserver, "http-on-modify-request", false);
    this.OBSERVED_TOPICS.forEach(function(topic) {
      OS.addObserver(this, topic, true);
    }, this);
  },
  unregister: function() {
    this.OBSERVED_TOPICS.forEach(function(topic) {
      try {
        OS.removeObserver(this, topic);
      } catch (e) {}
    }, this);
    OS.removeObserver(this.httpObserver, "http-on-modify-request");
  }
,
  
  // Preference driven properties
  autoAllow: false,

  blockNSWB: false,
  
  consoleDump: 0,
  consoleLog: false,
  
  truncateTitle: true,
  truncateTitleLen: 255,
  
  showBlankSources: false,
  showPlaceholder: true,
  showUntrustedPlaceholder: true,
  collapseObject: false,
  clearClick: 3,

  
  forbidSomeContent: true,
  contentBlocker: false,

  forbidData: true,

  forbidJava: true,
  forbidFlash: false,
  forbidFlash: true,
  forbidPlugins: true,
  forbidMedia: true,
  forbidFonts: true,
  forbidIFrames: false, 
  forbidIFramesContext: 2, // 0 = all iframes, 1 = different site, 2 = different domain, 3 = different base domain
  forbidFrames: false,
  
  alwaysBlockUntrustedContent: true,
  docShellJSBlocking: 1, // 0 - don't touch docShells, 1 - block untrusted, 2 - block not whitelisted
  
  forbidXBL: 4,
  forbidXHR: 2,
  injectionCheck: 2,
  injectionCheckSubframes: true,
  
  jsredirectIgnore: false,
  jsredirectFollow: false,
  jsredirectForceShow: false,
  emulateFrameBreak: true,
  
  jsHack: null,
  jsHackRegExp: null,
  
  flashPatch: true,
  silverlightPatch: true,
  
  nselNever: false,
  nselForce: true,

  filterXGetRx: "(?:<+(?=[^<>=\\d\\. ])|[\\\\'\"\\x00-\\x07\\x09\\x0B\\x0C\\x0E-\\x1F\\x7F])",
  filterXGetUserRx: "",
  
  
  whitelistRegExp: null,
  allowedMimeRegExp: null, 
  hideOnUnloadRegExp: null,
  requireReloadRegExp: null,
  ignorePorts: true,
  
  inclusionTypeChecking: true,
  nosniff: true,
  
  resetDefaultPrefs: function(prefs, exclude) {
    exclude = exclude || [];
    const root = prefs.root;
    const keys = prefs.getChildList("", {});
    for (let j = keys.length; j-- > 0;) {
      let k = keys[j];
      if (exclude.indexOf(k) === -1) {
        if (prefs.prefHasUserValue(k)) {
          dump("Resetting " + root + k + "\n");
          try {
            prefs.clearUserPref(k);
          } catch(e) { dump(e + "\n") }
        }
      }
    }
    this.savePrefs();
  },
  
  resetDefaultGeneralPrefs: function() {
    this.resetDefaultPrefs(this.prefs, ['version']);
  },
  
  resetDefaultSitePrefs: function() {
    this.eraseTemp();
    this.setJSEnabled(this.splitList(this.getPref("default")), true, true);
  },
  
  resetDefaults: function() {
    this.resetDefaultGeneralPrefs();
    this.jsEnabled = false;
    this.resetDefaultSitePrefs();
  },
  
  syncPrefs: function(branch, name) {
    switch (name) {
      case "sites":
        if (this.jsPolicySites.settingPref) return;
        if (this.locked) this.defaultCaps.lockPref(this.POLICY_NAME + ".sites");
        if (!this.jsPolicySites.fromPref(this.policyPB)) {
          this.resetDefaultSitePrefs();
        }
        break;
      case "temp":
        this.tempSites.fromPref(branch, name);
      break;
      case "gtemp":
        this.gTempSites.fromPref(branch, name);
      break;
      case "untrusted":
        this.untrustedSites.fromPref(branch, name);
      break;
      case "default.javascript.enabled":
          if (dc.getCharPref(name) != "noAccess") {
            dc.unlockPref(name);
            dc.setCharPref(name, "noAccess");
          }
         dc.lockPref(name);
         break;
      case "enabled":
        try {
          this.mozJSEnabled = this.mozJSPref.getBoolPref("enabled");
        } catch(ex) {
          this.mozJSPref.setBoolPref("enabled", this.mozJSEnabled = true);
        }
      break;
      case "forbidJava":
      case "forbidFlash":
      case "forbidSilverlight":
      case "forbidPlugins":
      case "forbidMedia":
      case "forbidFonts":
      case "forbidIFrames":
      case "forbidFrames":
        this[name]=this.getPref(name, this[name]);
        this.forbidSomeContent = this.forbidJava || this.forbidFlash ||
          this.forbidSilverlight || this.forbidPlugins ||
          this.forbidMedia || this.forbidFonts ||
          this.forbidIFrames || this.forbidFrames;
      break;
      
      case "emulateFrameBreak":
      case "filterXPost":
      case "filterXGet":
      case "safeToplevel":
      case "autoAllow":
      case "contentBlocker":
      case "alwaysShowObjectSources":
      case "docShellJSBlocking":
      case "showUntrustedPlaceholder":
      case "collapseObject":
      case "truncateTitle":
      case "truncateTitleLen":
      case "forbidData":
      case "forbidMetaRefresh":
      case "forbidIFramesContext":
      case "forbidXBL":
      case "forbidXHR":
      case "ignorePorts":
      case "injectionCheck":
      case "jsredirectFollow":
      case "jsredirectIgnore":
      case "jsredirectForceShow":
      case "jsHack":
      case "consoleLog":
      case "flashPatch":
      case "silverlightPatch":
      case "inclusionTypeChecking":
      case "nosniff":
      case "showBlankSources":
      case "liveConnectInterception":
      case "allowHttpsOnly":
        this[name] = this.getPref(name, this[name]);  
      break;
      
      case "sync.enabled":
        this._updateSync();
      break;
      
      case "subscription.trustedURL":
      case "subscription.untrustedURL":
        this.setPref("subscription.lastCheck", 0);
      break;
      
      case "proxiedDNS":
      case "asyncNetworking":
        IOUtil[name] = this.getPref(name, IOUtil[name]);
      break;

      case "consoleDump":
        this[name] = this.getPref(name, this[name]);
        if (this.consoleDump & LOG_INJECTION_CHECK) this.injectionChecker.logEnabled = true;
        if (this.consoleDump & LOG_ABE) ABE.consoleDump = true;
      break;
      case "global":
        this.globalJS = this.getPref(name, false);
      break;
      
      case "alwaysBlockUntrustedContent":
        this[name] = this.getPref(name, this[name]);
        this.initContentPolicy();
      break;
      
      case "forbidMetaRefreshRemember":
        if (!this.getPref(name)) this.metaRefreshWhitelist = {};
      break;
      
      // single rx
      case "filterXGetRx":
      case "filterXGetUserRx":
        this.updateRxPref(name, this[name], "g");
      break;
      
      // multiple rx
      case "filterXExceptions":
      case "jsHackRegExp":
        this.updateRxPref(name, "", "", this.rxParsers.multi);
      break;
      
      // multiple rx autoanchored
      case "hideOnUnloadRegExp":
        this.updateStyleSheet("." + this.hideObjClassName + " {display: none !important}", true);
      case "allowedMimeRegExp":
      case "requireReloadRegExp":
      case "whitelistRegExp":
        this.updateRxPref(name, "", "^", this.rxParsers.multi);
      break;
        
        
      case "safeJSRx":
        this.initSafeJSRx();
      break;
      
      case "allowClipboard":
        this.updateExtraPerm(name, "Clipboard", ["cutcopy", "paste"]);
      break;
      case "allowLocalLinks":
        this.updateExtraPerm(name, "checkloaduri", ["enabled"]);
      break;
      
      case "blockNSWB":
      case "nselForce":
      case "nselNever":
      case "showPlaceholder":
      case "clearClick":
        this.updateCssPref(name);
        if ((name == "nselNever") && this.getPref("nselNever") && !this.blockNSWB) {
          this.setPref("blockNSWB", true);
        }
      break;
      
      case "policynames":
        this.setupJSCaps();
      break;
    
      case "clearClick.exceptions":
      case "clearClick.subexceptions":
        ClearClickHandler.prototype[name.split('.')[1]] = AddressMatcher.create(this.getPref(name, ''));
      break;
      
      case "secureCookies":
        HTTPS[name] = this.getPref(name, HTTPS[name]);  
      break;
      case "secureCookiesExceptions":
      case "secureCookiesForced":
      case "httpsForced":
      case "httpsForcedExceptions":
        HTTPS[name] = AddressMatcher.create(this.getPref(name, ''));
      break;

      case "STS.enabled":
        STS.enabled = this.getPref(name);
      break;
    
    }
  },
  
  rxParsers: {
    simple: function(s, flags) {
      var anchor = /\^/.test(flags);
      return new RegExp(anchor ? ns.rxParsers.anchor(s) : s,
        anchor ? flags.replace(/\^/g, '') : flags);
    },
    anchor: function(s) {
      return /^\^|\$$/.test(s) ? s : "^" + s + "$";
    },
    multi: function(s, flags) {
      var anchor = /\^/.test(flags);
      var lines = s.split(/[\n\r]+/)
          .filter(function(l) { return /\S/.test(l) });
      return new RegExp(
        "(?:" +
        (anchor ? lines.map(ns.rxParsers.anchor) : lines).join('|')
        + ")",
        anchor ? flags.replace(/\^/g, '') : flags);
    }
  },
  updateRxPref: function(name, def, flags, parseRx) {
    parseRx = parseRx || this.rxParsers.simple;
    var s = this.getPref(name, def);
    if (!s) {
      this[name] = null;
    } else
    {
      
      try {
        this[name] = parseRx(this.getPref(name, def), flags);
      } catch(e) {
        if(this.consoleDump) this.dump("Error parsing regular expression " + name + ", " + e);
        this[name] = parseRx(def, flags);
      }
    }
  },
  
  
  updateExtraPerm: function(prefName, baseName, names) {
    var cpName;
    var enabled = this.getPref(prefName, false);
    for (var j = names.length; j-- > 0;) {
      cpName = this.POLICY_NAME + "." + baseName + "." + names[j];
      try {
        if (enabled) {
          this.caps.setCharPref(cpName, "allAccess");
        } else {
          if (this.caps.prefHasUserValue(cpName)) {
            this.caps.clearUserPref(cpName);
          }
        }
      } catch(ex) {}
    }
  },
  
  updateCssPref: function(name) {
    var value = this[name] = this.getPref(name);
    var sheet;
    switch(name) {
      case "nselForce":
        sheet = "noscript.noscript-show, span.noscript-show { display: inline !important } span.noscript-show { padding: 0px; margin: 0px; border: none; background: inherit; color: inherit }";
        break;
      case "nselNever":
        sheet = "noscript, noscript * { display: none !important }";
        break;
      case "blockNSWB": 
        sheet = "noscript, noscript * { background-image: none !important; list-style-image: none !important }";
        break;
      case "showPlaceholder": 
        sheet = '.__noscriptPlaceholder__ { direction: ltr !important } ' +
                '.__noscriptPlaceholder__ > .__noscriptPlaceholder__1 { display: inline-block !important; ' +
                'outline-color: #fc0 !important; outline-style: solid !important; outline-width: 1px !important; outline-offset: -1px !important;' +
                'cursor: pointer !important; background: #ffffe0 url("' + 
                    this.pluginPlaceholder + '") no-repeat left top !important; opacity: 0.6 !important; margin-top: 0px !important; margin-bottom: 0px !important;} ' +
                '.__noscriptPlaceholder__1 > .__noscriptPlaceholder__2 { display: inline-block !important; background-repeat: no-repeat !important; background-color: transparent !important; width: 100%; height: 100%; display: block; margin: 0px; border: none } ' +
                'noscript .__noscriptPlaceholder__ { display: inline !important; }';
        if (this.geckoVersionCheck("1.9") < 0) {
          sheet = sheet.replace(/ outline-/g, ' -moz-outline-').replace(/ inline-/g, '');
        }
      break;
      case "clearClick":
        sheet = ".__noscriptOpaqued__ { opacity: 1 !important; visibility: visible; filter: none !important } " +
                "iframe.__noscriptOpaqued__ { display: block !important; } " +
                "object.__noscriptOpaqued__, embed.__noscriptOpaqued__ { display: inline !important } " +
                ".__noscriptJustOpaqued__ { opacity: 1 !important; filter: none !important } " +
                ".__noscriptScrolling__ { overflow: auto !important; min-width: 52px !important; min-height: 52px !important } " +
                ".__noscriptNoScrolling__ { overflow: hidden !important } " +
                ".__noscriptHidden__ { visibility: hidden !important } " +
                ".__noscriptBlank__ { background-color: white !important; color: white !important; border-color: white !important; background-image: none !important }";
                
      break;
      default:
        return;
    };
    this.updateStyleSheet(sheet, value);
  },
  
  get sss() {
    delete this.sss;
    try {
      return this.sss = CC["@mozilla.org/content/style-sheet-service;1"]
                        .getService(CI.nsIStyleSheetService);
    } catch(e) {
      return this.sss = null;
    }
  },
  
  updateStyleSheet: function(sheet, enabled) {
    const sss = this.sss;
    if (!sss) return;
    const uri = IOS.newURI("data:text/css;charset=utf8," + sheet, null, null);
    if (sss.sheetRegistered(uri, sss.USER_SHEET)) {
      if (!enabled) sss.unregisterSheet(uri, sss.USER_SHEET);
    } else {
      try {
        if (enabled) sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
      } catch(e) {
        this.log("[NoScript CSS] Can't register " + uri + ", " + e); 
      }
    }
  },
  
  get getString() {
    delete this.getString;
    INCLUDE('Strings');
    const ss = new Strings("noscript");
    return this.getString = function(name, parms) { return ss.getString(name, parms) };
  },
  
  _uninstalling: false,
  get uninstalling() {
    return this._uninstalling;
  },
  set uninstalling(b) {
    if (!this._uninstalling) {
      if (b) this.uninstallJob();
    } else {
      if (!b) this.undoUninstallJob();
    }
    return this._uninstalling = b;
  }
,
  _inited: false,
  POLICY_NAME: "maonoscript",
  prefService: null,
  caps: null,
  defaultCaps: null,
  policyPB: null,
  prefs: null,
  mozJSPref: null,
  mozJSEnabled: true,
  disabled: false
,
  // random resource aliases
  contentBase: null,
  skinBase: null,
  hideObjClassName: "__noscriptHideObj__",
  get hideObjClassNameRx() {
    const v = new RegExp("\\b" + this.hideObjClassName + "\\s*", "g");
    this.__defineGetter__("hideObjClassNameRx", function() { return v; });
    return v;
  },
  pluginPlaceholder: "",
  
  _initResources: function() {
    const ios = IOS;
    var resProt = ios.getProtocolHandler("resource").QueryInterface(CI.nsIResProtocolHandler);
    var base;
    for each(var r in ["skin", "content"]) {
      base = "noscript_" + Math.random();
      resProt.setSubstitution(base, ios.newURI("chrome:noscript/" + r + "/", null, null));
      this[r + "Base"] = "resource://" + base + "/";
    }
    this.pluginPlaceholder = this.skinBase + "icon32.png";
  },
  
  init: function() {
    if (this._inited) return false;
    
    let t = Date.now();
    
    this._inited = true;
    
    this._initResources();
    
    OS.addObserver(this, "em-action-requested", true);
    
    const dls = CC['@mozilla.org/docloaderservice;1'].getService(CI.nsIWebProgress);
    dls.addProgressListener(this, CI.nsIWebProgress.NOTIFY_LOCATION | CI.nsIWebProgress.NOTIFY_STATE_REQUEST | CI.nsIWebProgress.NOTIFY_STATUS |
                            ("NOTIFY_REFRESH" in CI.nsIWebProgress ? CI.nsIWebProgress.NOTIFY_REFRESH : 0));


    const prefSrv = this.prefService = CC["@mozilla.org/preferences-service;1"]
      .getService(CI.nsIPrefService).QueryInterface(CI.nsIPrefBranch);

    const PBI = CI.nsIPrefBranch2;
    this.caps = prefSrv.getBranch("capability.policy.").QueryInterface(PBI);
    this.defaultCaps = prefSrv.getDefaultBranch(this.caps.root);

    this.policyPB = prefSrv.getBranch("capability.policy." + this.POLICY_NAME + ".").QueryInterface(PBI);
    this.prefs = prefSrv.getBranch("noscript.").QueryInterface(PBI);
     
    this.policyPB.addObserver("sites", this, true);
    
    this.prefs.addObserver("", this, true);
    this.mozJSPref = prefSrv.getBranch("javascript.").QueryInterface(PBI);
    this.mozJSPref.addObserver("enabled", this, true);
    
    this.mandatorySites.sitesString = this.getPref("mandatory", "chrome: about: resource:");
    
    this.captureExternalProtocols();
    
    for each(var p in [
      "autoAllow",
      "allowClipboard", "allowLocalLinks",
      "allowedMimeRegExp", "hideOnUnloadRegExp", "requireReloadRegExp",
      "blockNSWB",
      "consoleDump", "consoleLog", "contentBlocker", "alwaysShowObjectSources",
      "docShellJSBlocking",
      "filterXPost", "filterXGet", 
      "filterXGetRx", "filterXGetUserRx", 
      "filterXExceptions",
      "forbidJava", "forbidFlash", "forbidSilverlight", "forbidPlugins", "forbidMedia", "forbidFonts",
      "forbidIFrames", "forbidIFramesContext", "forbidFrames", "forbidData",
      "forbidMetaRefresh",
      "forbidXBL", "forbidXHR",
      "liveConnectInterception",
      "inclusionTypeChecking", "nosniff",
      "alwaysBlockUntrustedContent",
      "global", "ignorePorts",
      "injectionCheck", "injectionCheckSubframes",
      "jsredirectIgnore", "jsredirectFollow", "jsredirectForceShow",
      "jsHack", "jsHackRegExp",
      "emulateFrameBreak",
      "nselNever", "nselForce",
      "showBlankSources", "showPlaceholder", "showUntrustedPlaceholder",
      "collapseObject",
      "temp", "untrusted", "gtemp",
      "flashPatch", "silverlightPatch",
      "allowHttpsOnly",
      "truncateTitle", "truncateTitleLen",
      "whitelistRegExp", "proxiedDNS", "asyncNetworking",
      ]) {
      try {
        this.syncPrefs(this.prefs, p);
      } catch(e) {
        dump("[NoScript init error] " + e.message + ":" + e.stack + " setting " + p + "\n");
      }
    }
    

    
    
    
    this.setupJSCaps();
    
    // locking management
    if ((this.locked = this.prefs.prefIsLocked("default"))) {
      try {
        const psKey = this.POLICY_NAME + ".sites";
        const dc = this.defaultCaps;
        dc.lockPref("policynames");
        dc.unlockPref(psKey);
        this.resetDefaultSitePrefs();
        dc.setCharPref(psKey, this.policyPB.getCharPref("sites"));
        dc.lockPref(psKey);
        if (dc instanceof PBI) dc.addObserver("default.javascript.", this, true);
        dc.setCharPref("default.javascript.enabled", "noAccess");
        dc.lockPref("default.javascript.enabled");
        this.prefs.lockPref("global");
      } catch(e) {
        this.dump(e);
      }
    } else {
      // init jsPolicySites from prefs
      this.syncPrefs(this.policyPB, "sites");
    }
    
    this.syncPrefs(this.mozJSPref, "enabled");
    
    if (this.getPref("tempGlobal", false))
      this.jsEnabled = false;
    
    this.eraseTemp();
    
    Thread.delay(this.checkSubscriptions, 10000, this);
    
    this.reloadWhereNeeded(); // init snapshot
    
    // this.savePrefs(true); // flush preferences to file [TODO: check if it's really needed]
    
    this._updateSync();
    
    // hook on redirections (non persistent, otherwise crashes on 1.8.x)
    CC['@mozilla.org/categorymanager;1'].getService(CI.nsICategoryManager)
      .addCategoryEntry("net-channel-event-sinks", SERVICE_CTRID, SERVICE_CTRID, false, true);
    
    if (this.consoleDump) ns.dump("Init done in " + (Date.now() - t));  
    return true;
  },
  
  
  
  dispose: function() {
    try {
      if(!this._inited) return;
      this._inited = false;
      
      this.shouldLoad = this.shouldProcess = CP_NOP;
      
      CC['@mozilla.org/categorymanager;1'].getService(CI.nsICategoryManager)
        .deleteCategoryEntry("net-channel-event-sinks", SERVICE_CTRID, false);
      
      
      this.requestWatchdog.dispose();
      
      OS.removeObserver(this, "em-action-requested");
            
      const dls = CC['@mozilla.org/docloaderservice;1'].getService(CI.nsIWebProgress);
      dls.removeProgressListener(this);
      
      this.prefs.removeObserver("", this);
      this.mozJSPref.removeObserver("enabled", this);
      this.resetJSCaps();
      PolicyState.reset();
      
      if (this.placesPrefs) this.placesPrefs.dispose();
      
      STS.dispose();
      
      if(this.consoleDump & LOG_LEAKS) this.reportLeaks();
    } catch(e) {
      this.dump(e + " while disposing.");
    }
    
  },
  
 
  onVersionChanged: function(prev) {
    // upgrade hacks
    
    if (prev >= "1.9.3.4" && prev < "1.9.4") {
      this.setPref("ABE.legacySupport", true);
    } else if (prev >= "1.9.6" && prev <= "1.9.6.8") { // early 1.9.6 broke default whitelist
      if (!this.isJSEnabled("about:credits") && !this.getPref("untrusted")) {
        this.setJSEnabled(this.splitList(this.getPref("default")), true);
      }
    }
    
    // remove every file://host entry from the policy sites lists
    var rx = /\bfile:\/\/\S+\s*/g;
    if (rx.test(this.jsPolicySites.sitesString)) try {
      this.flushCAPS(this.jsPolicySites.sitesString.replace(rx, ''));
      this.persistUntrusted(this.untrustedSites.sitesString.replace(rx, ''));
    } catch(e) {
      ns.dump(e);
    }
    
  },
 
  reportLeaks: function() {
    // leakage detection
    var parent = "__parent__" in this ? this.__parent__ : CU.getGlobalForObject(this);
    this.dump("DUMPING " + parent);
    for(var v in parent) {
      this.dump(v + " = " + parent[v] + "\n");
    }
  },
  
  get profiler() {
    delete this.profiler;
    INCLUDE("Profiler");
    return this.profiler = Profiler;
  },
  
  get requestWatchdog() {
    if (ns.consoleDump) ns.dump("RW kickstart at " + new Error().stack);
    INCLUDE("RequestWatchdog");
    delete this.requestWatchdog;
    return this.requestWatchdog = new RequestWatchdog();
  },
  
  captureExternalProtocols: function() {
    try {
      const pb = this.prefService.getDefaultBranch("network.protocol-handler.");
      if (this.getPref("fixURI", true)) {
        try {
          pb.setBoolPref("expose-all", true);
        } catch(e1) {}
        var prots = [];
        for each(var key in pb.getChildList("expose.", {})) {
          try {
            pb.setBoolPref(key, true);
            prots.push(key.replace("expose.", ""));
            if (pb.prefHasUserValue(key)) pb.clearUserPref(key);
          } catch(e1) {}
        }
        if (prots.length) this.extraCapturedProtocols = prots;
      }
    } catch(e) {}
  },
  
  extraCapturedProtocols: null,
  
  mandatorySites: new PolicySites(),
  isMandatory: function(s) {
    return s && this.mandatorySites.matches(s);
  }
,
  tempSites: new PolicySites(),
  gTempSites: new PolicySites(),
  isTemp: function(s) {
    return s in (this.globalJS ? this.gTempSites : this.tempSites).sitesMap;
  }
,
  setTemp: function(s, b) {
    const sites = {
      "temp": this.tempSites,
      "gtemp": this.gTempSites
    };
    for (var p in sites) {
      if (b
          ? (p[0] != "g" || this.globalJS) && sites[p].add(s)
          : sites[p].remove(s, true, true) // keeps up and down, see #eraseTemp() 
      ) sites[p].toPref(this.prefs, p);
    }
    return b;
  },
  
  untrustedSites: new PolicySites(),
  isUntrusted: function(s) {
    return !!this.untrustedSites.matches(s);
  },
  setUntrusted: function(s, b) {
    var change = b ? this.untrustedSites.add(s) : this.untrustedSites.remove(s, false, true);
    if (change) {
      this.persistUntrusted();
    }
    return b;
  },
  persistUntrusted: function(snapshot) {
    if (typeof(snaposhot) == "string") {
      this.untrustedSites.sitesString = snapshot;
    }
    this.untrustedSites.toPref(this.prefs, "untrusted");
  },
  
  manualSites: new PolicySites(),
  isManual: function(s) {
    return !!this.manualSites.matches(s);
  },
  setManual: function(ss, b) {
    if (b) this.manualSites.add(ss);
    else {
      if (!ss.push) ss = [ss];
      try {
        this.manualSites.sitesString = this.manualSites.sitesString.replace(
          new RegExp("(^|\\s)(?:" +
            ss.map(function(k) {
              k = k.replace(/[\.\-]/g, '\\$&');
              if (k.indexOf(":") < 0) k = "(?:[a-z\\-]+:\/\/)?(?:[^\\s/]+\.)?" + k; // match protocols and subdomains
              if (!/:\d+$/.test(k)) k += "(?::\\d+)?"; // match ports
              return k;
            }).join("|") +
            ")(?=\\s|$)", "ig"),
          "$1"
        );
      } catch(e) {
        this.manualSites.remove(ss)
      }
    }
    return b;
  },
  
  autoTemp: function(site) {
    if (!(this.isUntrusted(site) || this.isManual(site) || this.isJSEnabled(site))) {
      this.setTemp(site, true);
      this.setJSEnabled(site, true);
      return true;
    }
    return false;
  }
,
  mustCascadeTrust: function(sites, temp) {
    var untrustedGranularity = this.getPref("untrustedGranularity", 3);
    /*  noscript.untrustedGranularity  controls how manually whitelisting
        a domain affects the untrusted blacklist status of descendants:
        0 - always delist descendants from the untrusted blacklist
        1 - keep descendants blacklisted for temporary allow actions
        2 - keep descendants blacklisted for permanent allow actions
        3 - (default) always keep descendants blacklisted
        4 - delist blacklisted descendants of a site marked as untrusted
        All these values can be put in OR (the 3 default is actually 2 | 1)
    */
    var single = !(typeof(site) == "object" && ("push" in site)); // not an array
    return !((untrustedGranularity & 1) && !temp || (untrustedGranularity & 2) && temp)
      || (untrustedGranularity & 4) && single && this.isUntrusted(site);
  }
,
  _unsafeSchemeRx: /^(?:ht|f)tp:\/\//,
  isForbiddenByHttpsStatus: function(site) {
    switch(this.allowHttpsOnly) {
      case 0:
        return false;
      case 1:
        return this._unsafeSchemeRx.test(site) && this.isProxied(site);
      case 2:
        return this._unsafeSchemeRx.test(site);
    }
    return false;
  },
  isProxied: function(u) {
    var ps = CC["@mozilla.org/network/protocol-proxy-service;1"].getService(CI.nsIProtocolProxyService);
   
    this.isProxied = function(u) {
      try {
        if (!(u instanceof CI.nsIURI)) {
          u = IOS.newURI(u, null, null);
        }
        return ps.resolve(u, 0).type != "direct";
      } catch(e) {
        return false;
      }
    }
  },

  jsPolicySites: new PolicySites(),
  isJSEnabled: function(s) {
    return !(this.globalJS
      ? this.alwaysBlockUntrustedContent && this.untrustedSites.matches(s)
      : !this.jsPolicySites.matches(s) || this.untrustedSites.matches(s)
        || this.isForbiddenByHttpsStatus(s)
    );
  },
  setJSEnabled: function(site, is, fromScratch, cascadeTrust) {
        
    const ps = this.jsPolicySites;
    if (fromScratch) ps.sitesString = this.mandatorySites.sitesString;
    if (is) {
      ps.add(site);
      if (!fromScratch) {
        if (this.untrustedSites.remove(site, false, !cascadeTrust)) 
          this.persistUntrusted();
        
        this.setManual(site, false);
      }
    } else {
      ps.remove(site, false, true);
      
      if (typeof(site) == "string") {
        this._removeAutoPorts(site);
      }
      
      if (this.forbidImpliesUntrust) {
        this.setUntrusted(site, true);
      } else {
        this.setManual(site, true);
      }
    }
    
    this.flushCAPS();
    
    return is;
  },
  
  _removeAutoPorts: function(site) {
    // remove temporary permissions implied by this site for non-standard ports

    const portRx = /:\d+$/;

    if (portRx.test(site)) {
      if (/:0$/.test(site)) site = site.replace(portRx, '');
      else return;
    }
    
    const tempSites = this.tempSites;
    var portSites = this.tempSites.sitesString.match(/\S+:[1-9]\d*(?=\s|$)/g);
    if (!portSites) return;
    
    
    var domain = SiteUtils.domainMatch(site);
    var filter;
    
    if (domain) {
      const dotDomain = "." + domain;
      const dLen = dotDomain.length;
      filter = function(d) {
        d = this.getDomain(d);
        return d === domain || d.length > dLen && d.slice(- dLen) === dotDomain; 
      };
    } else {
      filter = function(s) { return s.replace(portRx, '') === site; };
    }
    
    var doomedSites = portSites.filter(filter, this);
    
    if (doomedSites.length) {
      tempSites.remove(doomedSites);
      this.jsPolicySites.remove(doomedSites);
    }
  },
  
  get forbidImpliesUntrust() {
    return this.globalJS || this.autoAllow || this.getPref("forbidImpliesUntrust", false);
  }
,
  portRx: /:\d+$/,
  _ipShorthandRx: /^(https?:\/\/)((\d+\.\d+)\.\d+)\.\d+(?::\d|$)/,
  checkShorthands: function(site, policy) {
    if (this.whitelistRegExp && this.whitelistRegExp.test(site)) {
      return true;
    }
    
    if (!policy) policy = this.jsPolicySites;
   
    let map = policy.sitesMap;
    
    if (this.portRx.test(site)) {
      let portRx = this.portRx;
      if (this.ignorePorts && policy.matches(site.replace(/:\d+$/, '')))
        return true;
      
      // port matching, with "0" as port wildcard  and * as nth level host wildcard
      let key = site.replace(portRx, ":0");
      if (key in map || site in map) return true;
      var keys = site.split(".");
      if (keys.length > 1) {
        let prefix = keys[0].match(/^https?:\/\//i)[0] + "*.";
        while (keys.length > 2) {
          keys.shift();
          key = prefix + keys.join(".");
          if (key in map || key.replace(portRx, ":0") in map) return true;
        }
      }
    }
    // check IP leftmost portion up to 2nd byte (e.g. [http://]192.168 or [http://]10.0.0)
    let m = site.match(this._ipShorthandRx);
    return m && (m[2] in map || m[3] in map || (m[1] + m[2]) in map || (m[1] + m[3]) in map);
  }
,
  flushCAPS: function(sitesString) {
    const ps = this.jsPolicySites;
    if (sitesString) ps.sitesString = sitesString;
    
    // dump("Flushing " + ps.sitesString);
    ps.toPref(this.policyPB);
  }
,
  get injectionChecker() this.requestWatchdog.injectionChecker
,
  splitList: function(s) {
    return s ?/^[,\s]*$/.test(s) ? [] : s.split(/\s*[,\s]\s*/) : [];
  }
,
  get placesPrefs() {
    if (!this.getPref("placesPrefs", false)) return null; 
    delete this.placesPrefs;
    try {
      INCLUDE('PlacesPrefs');
      PlacesPrefs.init();
    } catch(e) {
      PlacesPrefs = null;
    }
    return this.placesPrefs = PlacesPrefs;
  },

  savePrefs: function(skipPlaces) {
    var res = this.prefService.savePrefFile(null);
    if (this.placesPrefs && !skipPlaces) this.placesPrefs.save();
    return res;
  },
  
  sortedSiteSet: function(s) { return  SiteUtils.sortedSet(s); }
,
  globalJS: false,
  get jsEnabled() {
    try {
      return this.mozJSEnabled && this.caps.getCharPref("default.javascript.enabled") != "noAccess";
    } catch(ex) {
      return this.uninstalling ? this.mozJSEnabled : (this.jsEnabled = this.globalJS);
    }
  }
,
  set jsEnabled(enabled) {
    if (this.locked || this.prefs.prefIsLocked("global")) {
      enabled = false;
    }
    const prefName = "default.javascript.enabled";
    try {
      this.caps.clearUserPref("default.javascript.enabled");
    } catch(e) {}
    this.defaultCaps.setCharPref(prefName, enabled ? "allAccess" : "noAccess");
    
    this.setPref("global", enabled);
    if (enabled) {
      this.mozJSPref.setBoolPref("enabled", true);
    }
    return enabled;
  }
,
  getSite: function(url) {
    return SiteUtils.getSite(url);
  },
  
  getQuickSite: function(url, level) {
    var site = null;
    if (level > 0 && !this.jsEnabled) {
      site = this.getSite(url);
      var domain;
      if (level > 1 && (domain = this.getDomain(site))) {
        site = level > 2 ? this.getBaseDomain(domain) : domain;
      }
    }
    return site;
  },
  
  get preferredSiteLevel() {
    return this.getPref("showAddress", false) ? 1 : this.getPref("showDomain", false) ? 2 : 3;
  },
  
  
  getDomain: function(site, force) {
    try {
      const url = (site instanceof CI.nsIURL) ? site : IOS.newURI(site, null, null);
      const host = url.host;
      return force || (this.ignorePorts || url.port === -1) && host[host.length - 1] != "." && 
            (host.lastIndexOf(".") > 0 || host == "localhost") ? host : '';
    } catch(e) {
      return '';
    }
  },
  
  get _tldService() {
    delete this._tldService;
    return this._tldService = IOUtil.TLDService;
  },

  getBaseDomain: function(domain) {
    if (!domain || DNS.isIP(domain)) return domain; // IP
    
    var pos = domain.lastIndexOf('.');
    if (pos < 1 || (pos = domain.lastIndexOf('.', pos - 1)) < 1) return domain;
    
    try {
      return this._tldService.getBaseDomainFromHost(domain);
    } catch(e) {
      this.dump(e);
    }
    return domain;
  },
  getPublicSuffix: function(domain) {
    try {
      return this._tldService.getPublicSuffixFromHost(domain);
    } catch(e) {}
    return "";
  }
,
  delayExec: function(callback, time) {
    Thread.delay(callback, time, this, Array.slice(arguments, 2));
  }
,
  RELOAD_NO: -1,
  RELOAD_CURRENT: 1,
  RELOAD_ALL: 0,
  safeCapsOp: function(callback, reloadPolicy, nosave) {
    this.delayExec(function() {
      try {
        callback(this);
        if (!nosave) this.savePrefs();
        this.reloadWhereNeeded(reloadPolicy);
      } catch(e) {
        this.dump("FAILED TO SAVE PERMISSIONS! " + e + "," + e.stack);
      }
     }, 0);
  }
,
  _lastSnapshot: {
    trusted: null,
    untrusted: null,
    global: false,
    objects: null
  },
  reloadWhereNeeded: function(reloadPolicy) {
    if (arguments.length === 0) reloadPolicy = this.RELOAD_ALL;
    
    const trusted = this.jsPolicySites;
    const untrusted = this.untrustedSites;
    const global = this.jsEnabled;
    
    var snapshot = this._lastSnapshot;
    var lastTrusted = snapshot.trusted;
    var lastUntrusted = snapshot.untrusted;
    var lastGlobal = snapshot.global;
    var lastObjects = snapshot.objects || this.objectWhitelist;
    
    snapshot.global = global;
    snapshot.trusted = trusted.clone();
    snapshot.untrusted = untrusted.clone();
    snapshot.objects = this.objectWhitelist;
    
    this.initContentPolicy();
    
    if (!lastTrusted ||
        global == lastGlobal &&
        lastObjects == this.objectWhitelist && 
        trusted.equals(lastTrusted) &&
        untrusted.equals(lastUntrusted)
       ) 
      return;
    
    let mustReload = !(
        reloadPolicy === this.RELOAD_NO ||
        !this.getPref("autoReload") ||
        global != lastGlobal && !this.getPref("autoReload.global")
      );
    
    const currentTabOnly = reloadPolicy === this.RELOAD_CURRENT ||
      !this.getPref("autoReload.allTabs") ||
      global != lastGlobal && !this.getPref("autoReload.allTabsOnGlobal");
    
    var useHistory = this.getPref("xss.reload.useHistory", false);
    var useHistoryExceptCurrent = this.getPref("xss.reload.useHistory.exceptCurrent", true);
      
    
    
    const nsIWebNavigation = CI.nsIWebNavigation;
    const nsIURL = CI.nsIURL;
    const LOAD_FLAGS = nsIWebNavigation.LOAD_FLAGS_NONE;
 
    const untrustedReload = !this.getPref("xss.trustReloads", false);

    var bi = DOM.createBrowserIterator();
    var isCurrentTab = true;
    
    (function checkAndReload() {

      var browser;

      for (let ts = Date.now(), elapsed = 0; elapsed < 30 && (browser = bi.next()); elapsed = Date.now() - ts) {
        
        let sites = this.getSites(browser);
        let noFrames = sites.docSites.length === 1;
        
        for (j = 0, len = sites.length; j < len; j++) {
          let site = sites[j];
          
          let checkTop;
          
          if (j === 0 && (noFrames || !isCurrentTab)) // top level, if unchanged and forbidden we won't reload
          {
            checkTop = sites.topSite === site;
            if (!checkTop) {
              checkTop = true;
              site = sites.topSite;
              j = sites.indexOf(site);
              if (j > -1) {
                sites.splice(j, 1, sites[0]);
                sites[j = 0] = site;
              } else {
                len++;
                sites.unshift(site);
              }
            }
          } else checkTop = false;
          
          let prevStatus = !(lastGlobal
            ? this.alwaysBlockUntrustedContent && lastUntrusted.matches(site)
            : !(lastTrusted.matches(site) || this.checkShorthands(site, lastTrusted)) || lastUntrusted.matches(site)
          );
          let currStatus = this.isJSEnabled(site) || !!this.checkShorthands(site);
          
          if (currStatus != prevStatus) {
            let forceReload = mustReload;
            const win =  browser.contentWindow;
            const wu = win.QueryInterface(CI.nsIInterfaceRequestor)
                     .getInterface(CI.nsIDOMWindowUtils);
            const rw = this.requestWatchdog;
            
            
            let canSuppressEvents = "suppressEventHandling" in wu;
            if (canSuppressEvents) wu.suppressEventHandling(true);
            // check XSS
            
            let xss = this.traverseDocShells(function(docShell) {
              let site = this.getSite(docShell.currentURI.spec);
         
              // is this a newly allowed docShell?
              if ((this.isJSEnabled(site) || this.checkShorthands(site)) &&
                  (lastGlobal
                    ? this.alwaysBlockUntrustedContent && lastUntrusted.matches(site)
                    : !(lastTrusted.matches(site) || this.checkShorthands(site, lastTrusted)) || lastUntrusted.matches(site)
                  )                          
                ) {
                
                let channel = docShell.currentDocumentChannel;
                if (channel instanceof CI.nsIHttpChannel) {
                  try {
                    ts = 0; // checking XSS may be time consuming, let's spin events
                    const url = channel.URI.spec;
                    const uploadStream = (channel instanceof CI.nsIUploadChannel) && channel.uploadStream;
                    if (uploadStream && (uploadStream instanceof CI.nsISeekableStream)) {
                      uploadStream.seek(0, 0); // rewind
                    }
                    const abeReq = new ABERequest(channel);
                    rw.setUntrustedReloadInfo(browser, true);
                    rw.filterXSS(abeReq);
                    if (url != channel.URI.spec || uploadStream && uploadStream != channel.uploadStream) {
                      // XSS!
                      channel.URI.spec = url;
                      if (uploadStream) {
                        uploadStream.seek(0, 0);
                        channel.setUploadStream(uploadStream, "", -1);
                      }
                      return true;
                    }
                  } catch (e) {
                    if (this.consoleDump) this.dump("Error checkin in permission change XSS checks, " + e + " - " + e.stack);
                    return true; // better err on the safe side
                  }
                }
              }
              return false;
            }, this, browser);
            
            if (xss) {
              forceReload = true;
              useHistoryExceptCurrent = true;
              if (!canSuppressEvents) { // Fx 3.0, let's erase the document
                let de = win.document.documentElement;
                while (de.firstChild) de.removeChild(de.firstChild);
              }
            } else {
              if (canSuppressEvents) wu.suppressEventHandling(false);
            }
            
            rw.setUntrustedReloadInfo(browser, true);
            
            let webNav = browser.webNavigation;
            let uri = webNav.currentURI;
            if (uri.schemeIs("http") || uri.schemeIs("https")) {
              rw.noscriptReload = uri.spec;
            }
            try {
              webNav = webNav.sessionHistory.QueryInterface(nsIWebNavigation);
              if (currStatus && webNav.index && untrustedReload) {
                try {
                  site = this.getSite(webNav.getEntryAtIndex(webNav.index - 1, false).URI.spec);
                  this.requestWatchdog.setUntrustedReloadInfo(browser, site != sites[j] && !trusted.matches(site));
                } catch(e) {}
              }
              
              if (useHistory && forceReload) {
                if (useHistoryExceptCurrent) {
                  useHistoryExceptCurrent = false;
                } else if(!(uri instanceof nsIURL && uri.ref || uri.spec.substring(uri.spec.length - 1) == "#")) {
                  if (useHistoryCurrentOnly) useHistory = false;
                  webNav.gotoIndex(webNav.index);
                  break;
                }
              }
            } catch(e) {}
            try {
              if (forceReload) browser.webNavigation.reload(LOAD_FLAGS); // can fail, e.g. because a content policy or an user interruption
            } catch(e) {}
            break;
          } else if (checkTop && !currStatus) {
            // top level, unchanged and forbidden: don't reload
            j = len;
            break;
          }
        }
        
        if (mustReload && j === len) { 
          // check plugin objects
          if (this.consoleDump & LOG_CONTENT_BLOCK) {
            this.dump("Checking object permission changes...");
            try {
              this.dump(sites.toSource() + ", " + lastObjects.toSource());
            } catch(e) {}
          }
          if (this.checkObjectPermissionsChange(sites, lastObjects)) {
             this.quickReload(browser.webNavigation);
          }
        }
        
        if (currentTabOnly) {
          mustReload = false;
          continue;
        }
        
        isCurrentTab = false;
      }
      
      if (browser) Thread.delay(checkAndReload, 1, this);
      
    }).apply(this);
    
  },
  
  
  reloadAllowedObjects: function(browser) {
    if (this.getPref("autoReload.onMultiContent", false)) {
      this.quickReload(browser.webNavigation);
      return;
    }
    var reloadEmbedders = this.getPref("autoReload.embedders");
    var canReloadPage = reloadEmbedders == 1 ? this.getPref("autoReload") : !!(reloadEmbedders);
    
    var sites = this.getSites(browser);
    var egroup, j, e;
    for each (egroup in sites.pluginExtras) {
      for (j = egroup.length; j-- > 0;) {
        e = egroup[j];
        if (this.isAllowedObject(e.url, e.mime, e.site, e.originSite)) {
          if (e.placeholder && e.placeholder.parentNode) {
            e.skipConfirmation = true;
            this.checkAndEnablePlaceholder(e.placeholder);
          } else if (!(e.allowed || e.embed) && canReloadPage) {
            if (e.document) {
              this.quickReload(DOM.getDocShellForWindow(e.document.defaultView));
              break;
            } else {
              this.quickReload(browser.webNavigation);
              return;
            }
          }
        }
      }
    }
  },

  checkObjectPermissionsChange: function(sites, snapshot) {
    if(this.objectWhitelist == snapshot) return false;
    for (let url in snapshot) {
      let s = this.getSite(url);
      if (!(s in snapshot)) snapshot[s] = snapshot[url];
    }
    for each (let s in sites.pluginSites) {
      s = this.objectKey(s);
      if ((s in snapshot) && !(s in this.objectWhitelist)) {
        return true;
      }
    }
 
     for each (let egroup in sites.pluginExtras) {
      for (let j = 0, len = egroup.length; j < len; j++) {
        let e = egroup[j];
        let url;
        if (!e.placeholder && e.url && ((url = this.objectKey(e.url)) in snapshot) && !(url in this.objectWhitelist)) {
          return true;
        }
      }
    }
    return false;
  },
  
  quickReload: function(webNav, checkNullCache) {
    if (!(webNav instanceof CI.nsIWebNavigation)) {
      webNav = DOM.getDocShellForWindow(webNav);
    }
    
    var uri = webNav.currentURI;
    
    if (checkNullCache && (webNav instanceof CI.nsIWebPageDescriptor)) {
      try {
        var ch = IOS.newChannel(uri.spec, null, null);
        if (ch instanceof CI.nsICachingChannel) {
          ch.loadFlags |= ch.LOAD_ONLY_FROM_CACHE;
          ch.cacheKey = webNav.currentDescriptor.QueryInterface(CI.nsISHEntry).cacheKey
          if (ch.open().available() == 0) {
            webNav.reload(webNav.LOAD_FLAGS_BYPASS_CACHE);
            return;
          }
        }
      } catch(e) {
        if (this.consoleDump) this.dump(e);
      } finally {
        try {
          ch.close();
        } catch(e1) {}
      }
    }
    

    if (uri.schemeIs("http") || uri.schemeIs("https")) {
      this.requestWatchdog.noscriptReload = uri.spec;
    }
    webNav.reload(webNav.LOAD_FLAGS_CHARSET_CHANGE);
  },
  
  getPermanentSites: function(whitelist, templist) {
    whitelist = (whitelist || this.jsPolicySites).clone();
    whitelist.remove((templist || this.tempSites).sitesList, true, true);
    return whitelist;
  },
  
  eraseTemp: function() {
    // remove temporary PUNCTUALLY: 
    // keeps ancestors because the may be added as permanent after the temporary allow;
    // keeps descendants because they may already have been made permanent before the temporary, and then shadowed
    this.jsPolicySites.remove(this.tempSites.sitesList, true, true);
    // if allowed in blacklist mode, put back temporarily allowed in blacklist
    if (this.untrustedSites.add(this.gTempSites.sitesList)) {
      this.persistUntrusted();
    }
    
    this.setPref("temp", ""); 
    this.setPref("gtemp", "");
    
    this.setJSEnabled(this.mandatorySites.sitesList, true); // add mandatory
    this.resetAllowedObjects();
    if (this.hasClearClickHandler) this.clearClickHandler.resetWhitelist();
  }
  
,
  _observingPolicies: false,
  _editingPolicies: false,
  setupJSCaps: function() {
    if (this._editingPolicies) return;
    this._editingPolicies = true;
    try {
      const POLICY_NAME = this.POLICY_NAME;
      var prefArray;
      var prefString = "", originalPrefString = "";
      var exclusive = this.getPref("excaps", true);
      try {
        
        prefArray = this.splitList(prefString = originalPrefString = 
          (this.caps.prefHasUserValue("policynames") 
            ? this.caps.getCharPref("policynames")
            : this.getPref("policynames") // saved value from dirty exit
          )
        );
        var pcount = prefArray.length;
        while (pcount-- > 0 && prefArray[pcount] != POLICY_NAME);
        if (pcount == -1) { // our policy is not installed, should always be so unless dirty exit
          this.setPref("policynames", originalPrefString);
          if (exclusive || prefArray.length == 0) {
            prefString = POLICY_NAME;
          } else {
            prefArray.push(POLICY_NAME);
            prefString = prefArray.join(' ');
          }
        }
        prefString = prefString.replace(/,/g, ' ').replace(/\s+/g, ' ').replace(/^\s+/, '').replace(/\s+$/, '');
      } catch(ex) {
        prefString = POLICY_NAME;
      }
      
      this.caps.setCharPref(POLICY_NAME + ".javascript.enabled", "allAccess");
      
      try {
        this.caps.clearUserPref("policynames");
      } catch(e) {}
      this.defaultCaps.setCharPref("policynames", prefString);

      
      if (!this._observingPolicies) {
        this.caps.addObserver("policynames", this, true);
        this._observingPolicies = true;
      }
    } catch(ex) {
      dump(ex.message);
    }
    this._editingPolicies = false;
  },
  resetJSCaps: function() {
    try {
      this.caps.clearUserPref("default.javascript.enabled");
    } catch(ex) {}
    if (this._observingPolicies) {
      this.caps.removeObserver("policynames", this, false);
      this._observingPolicies = false;
    }
    try {
      const POLICY_NAME = this.POLICY_NAME;
      var prefArray = SiteUtils.splitString(
        this.getPref("excaps", true) ? this.getPref("policynames", "") : this.caps.getCharPref("policynames")
      );
      var pcount = prefArray.length;
      const prefArrayTarget = [];
      for (var pcount = prefArray.length; pcount-- > 0;) {
        if (prefArray[pcount] != POLICY_NAME) prefArrayTarget[prefArrayTarget.length] = prefArray[pcount];
      }
      var prefString = prefArrayTarget.join(" ").replace(/\s+/g,' ').replace(/^\s+/,'').replace(/\s+$/,'');
      if (prefString) {
        this.caps.setCharPref("policynames", prefString);
      } else {
        try {
          this.caps.clearUserPref("policynames");
        } catch(ex1) {}
      }
      try {
        this.clearUserPref("policynames");
      } catch(ex1) {}
      
      this.eraseTemp();
      this.savePrefs(true);
    } catch(ex) {}
  }
,
  uninstallJob: function() {
    // this.resetJSCaps();
  },
  undoUninstallJob: function() {
    // this.setupJSCaps();
  }
,
  getPref: function(name, def) {
    const IPC = CI.nsIPrefBranch;
    const prefs = this.prefs;
    try {
      switch (prefs.getPrefType(name)) {
        case IPC.PREF_STRING:
          return prefs.getCharPref(name);
        case IPC.PREF_INT:
          return prefs.getIntPref(name);
        case IPC.PREF_BOOL:
          return prefs.getBoolPref(name);
      }
    } catch(e) {}
    return def || "";
  }
,
  setPref: function(name, value) {
    const prefs = this.prefs;
    try {
      switch (typeof(value)) {
        case "string":
            prefs.setCharPref(name,value);
            break;
        case "boolean":
          prefs.setBoolPref(name,value);
          break;
        case "number":
          prefs.setIntPref(name,value);
          break;
        default:
          throw new Error("Unsupported type " + typeof(value) + " for preference " + name);
      }
    } catch(e) {
      const IPC = CI.nsIPrefBranch;
      try {
        switch (prefs.getPrefType(name)) {
          case IPC.PREF_STRING:
            prefs.setCharPref(name, value);
            break;
          case IPC.PREF_INT:
            prefs.setIntPref(name, parseInt(value));
            break;
          case IPC.PREF_BOOL:
            prefs.setBoolPref(name, !!value && value != "false");
            break;
        }
      } catch(e2) {}
    }
  },
  
  get json() {
    delete this.json;
    var json;
    try {
      json = CC["@mozilla.org/dom/json;1"].createInstance(CI.nsIJSON);
    } catch(e) {
      json = null;
    }
    return this.json = json;
  },
  
  get placesSupported() {
    return !(this.builtInSync && this.getPref("sync.enabled")) && ("nsINavBookmarksService" in Components.interfaces);
  },
  

  get builtInSync() {
    var ret = false
    
    try {
      ret = this.prefService.getDefaultBranch("services.sync.prefs.sync.javascript.").getBoolPref("enabled");
    } catch (e) {}
    
    delete this.builtInSync;
    return this.builtInSync = ret;
  },
  
  _updateSync: function() {
    let t = Date.now();
    this._clearSync();
    if (this.builtInSync && this.getPref("sync.enabled")) this._initSync();
    if (this.consoleDump) this.dump("Sync prefs inited in " + (Date.now() - t));
  },
  _initSync: function() {
    
    try {
      let branch = this.prefService.getDefaultBranch("services.sync.prefs.sync.noscript.");
      for each (let key in this.prefs.getChildList("", {})) {
        switch (key) {
          case "version":
          case "preset":
          case "placesPrefs.ts":
          case "mandatory":
          case "default":
          case "ABE.wanIpAsLocal":
          case "ABE.migration":
          case "sync.enabled":
            break;
          default:
            branch.setBoolPref(key, true);
        }
      }
      this.prefService.getDefaultBranch("services.sync.prefs.sync.")
        .setBoolPref(this.policyPB.root + "sites", true);
    } catch(e) {
      this.dump(e);
    }
    
  },
  _clearSync: function() {
    try {
      this.prefService.getDefaultBranch("services.sync.prefs.sync.noscript.").deleteBranch("");
      this.prefService.getDefaultBranch("services.sync.prefs.sync." + this.policyPB.root).deleteBranch("");
    } catch(e) {
      this.dump(e);
    }
  },
  
  
  get canSerializeConf() { return !!this.json },
  _dontSerialize: ["version", "temp", "preset", "placesPrefs.ts", "mandatory", "default"],
  serializeConf: function(beauty) {
    if (!this.json) return '';
    
    const exclude = this._dontSerialize;
    const prefs = {};
    for each (let key in this.prefs.getChildList("", {})) {
      if (exclude.indexOf(key) === -1) {
        prefs[key] = this.getPref(key);
      }
    }
    
    const conf = this.json.encode({
      prefs: prefs,
      whitelist: this.getPermanentSites().sitesString,
      V: this.VERSION
    });
    
    return beauty ? conf.replace(/([^\\]"[^"]*[,\{])"/g, "$1\r\n\"").replace(/},?(?:\n|$)/g, "\r\n$&") : conf;
  },
  
  restoreConf: function(s) {
    try {
      const json = this.json.decode(s.replace(/[\n\r]/g, ''));
      if (json.ABE) ABE.restoreJSONRules(json.ABE);
      
      const prefs = json.prefs;
      const exclude = this._dontSerialize;
      for (let key in prefs) {
        if (exclude.indexOf(key) === -1) {
          this.setPref(key, prefs[key]);
        }
      }
      
      if (prefs.global != ns.jsEnabled) ns.jsEnabled = prefs.global;
      
      this.flushCAPS(json.whitelist);
      this.setPref("temp", ""); 
      this.setPref("gtemp", "");
      
      return true;
    } catch(e) {
      this.dump("Cannot restore configuration: " + e);
      return false;
    }
  }
,
  applyPreset: function(preset) {
   
    this.resetDefaultPrefs(this.prefs, ['version', 'temp', 'untrusted', 'preset']);
    
    switch(preset) {
      case "off":
        this.setPref("ABE.enabled", false);
        this.setPref("filterXGet", false);
        this.setPref("filterXPost", false);
        this.setPref("clearClick", 0);
      case "low":
        this.jsEnabled = true;
      break;
      case "high":
        this.setPref("contentBlocker", true);
      case "medium":
        this.jsEnabled = false;
      break;
      default:
        return;
    }
    
    this.setPref("preset", preset);
    this.savePrefs();
  }
,
  _sound: null,
  playSound: function(url, force) {
    if (force || this.getPref("sound", false)) {
      var sound = this._sound;
      if (sound == null) {
        sound = CC["@mozilla.org/sound;1"].createInstance(CI.nsISound);
        sound.init();
        this._sound = sound;
      }
      try {
        sound.play(IOS.newURI(url, null, null));
      } catch(ex) {
        //dump(ex);
      }
    }
  },
  _soundNotified: {},
  soundNotify: function(url) {
    if (this.getPref("sound.oncePerSite", true)) {
      const site = this.getSite(url);
      if (this._soundNotified[site]) return;
      this._soundNotified[site] = true;
    }
    this.playSound(this.getPref("sound.block"));
  }
,
  readFile: function(file) {
    return IO.readFile(file);
  }
,
  writeFile: function(file, content) {
    IO.writeFile(file, content);
  }
,
  
  getAllowObjectMessage: function(extras) {
    let url = SiteUtils.crop(extras.url);
    let details= extras.mime + " " + (extras.tag || "<OBJECT>") + " / " + extras.originSite; 
    return this.getString("allowTemp", [url + "\n(" + details + ")\n"]);
  }
,
  get dom() {
    delete this.dom;
    return this.dom = DOM;
  },
  get wan() {
    delete this.wan;
    ABE; // kickstart
    return this.wan = WAN;
  },
  
  os: OS,
  siteUtils: SiteUtils,
  mimeService: null,
 
  shouldLoad: CP_NOP,
  shouldProcess: CP_NOP,
  
  initContentPolicy: function() {
    const last = this.getPref("cp.last");
    const catman = Module.categoryManager;
    const cat = "content-policy"; 
    if (last) catman.deleteCategoryEntry(cat, SERVICE_CTRID, false);
    
    var delegate = this.disabled ||
        (this.globalJS &&
          !(this.alwaysBlockUntrustedContent || this.contentBlocker || this.httpsForced))   
      ? NOPContentPolicy
      : MainContentPolicy;
      
    for (var p in delegate) this[p] = delegate[p];
    
    if (delegate != NOPContentPolicy) {
      // removing and adding the category late in the game allows to be the latest policy to run,
      // and nice to AdBlock Plus
      catman.addCategoryEntry(cat, SERVICE_CTRID, SERVICE_CTRID, false, true);
    }
    
    if (!this.mimeService) {
      this.safeToplevel = this.getPref("safeToplevel", true);
      this.initSafeJSRx();
      this.mimeService = CC['@mozilla.org/uriloader/external-helper-app-service;1']
        .getService(CI.nsIMIMEService);
    }
  },
 
  
  guessMime: function(uriOrExt) {
    try {
      var ext = (uriOrExt instanceof CI.nsIURL) ? uriOrExt.fileExtension : uriOrExt;
      return ext && this.mimeService.getTypeFromExtension(ext) || "";
    } catch(e) {
      return "";
    }
  },
  
  pluginForMime: function(mimeType) {
    if (!mimeType) return null;
    try {
      var w = DOM.mostRecentBrowserWindow;
      if (!(w && w.navigator)) return null;
      var mime = w.navigator.mimeTypes.namedItem(mimeType);
      return mime && mime.enabledPlugin || null;
    } catch(e) { return null; }
  },
  
  _mediaTypeRx: /^(?:vide|audi)o\/|\/ogg$/i,
  isMediaType: function(mimeType) {
    return this._mediaTypeRx.test(mimeType);
  },
  
  versionComparator: CC["@mozilla.org/xpcom/version-comparator;1"].getService(CI.nsIVersionComparator),
  geckoVersion: ("@mozilla.org/xre/app-info;1" in  CC) ? CC["@mozilla.org/xre/app-info;1"].getService(CI.nsIXULAppInfo).platformVersion : "0.0",
  geckoVersionCheck: function(v) {
    return this.versionComparator.compare(this.geckoVersion, v);
  },
  
  
  _bug453825: true,
  _bug472495: true,

  cpConsoleFilter: [2, 5, 6, 7, 15],
  cpDump: function(msg, aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aInternalCall) {
    this.dump("Content " + msg + " -- type: " + aContentType + ", location: " + (aContentLocation && aContentLocation.spec) + 
      ", origin: " + (aRequestOrigin && aRequestOrigin.spec) + ", ctx: " + 
        ((aContext instanceof CI.nsIDOMHTMLElement) ? "<HTML Element>" // try not to cause side effects of toString() during load
          : aContext)  + 
        ", mime: " + aMimeTypeGuess + ", " + aInternalCall);
  },
  reject: function(what, args /* [aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aInternalCall] */) {
    
    if (this.consoleDump) {
      if(this.consoleDump & LOG_CONTENT_BLOCK && args.length == 6) {
        this.cpDump("BLOCKED " + what, args[0], args[1], args[2], args[3], args[4], args[5]);
      }
      if(this.consoleDump & LOG_CONTENT_CALL) {
        this.dump(new Error().stack);
      }
    }
    switch(args[0]) {
      case 9:
        // our take on https://bugzilla.mozilla.org/show_bug.cgi?id=387971
        args[1].spec = this.nopXBL;
        return CP_OK;
      case 5:
        args[3].__noscriptBlocked = true;
    }
    
    PolicyState.cancel(args);
    
    let win = DOM.findWindow(args[3]);
    this.recordBlocked(this.getSite(args[1].spec), this.getSite(win && win.top.location.href || args[2].spec));
    
    return CP_REJECT;
  },
  
  nopXBL: "chrome://global/content/bindings/general.xml#basecontrol",
  
  _domNodeRemoved: function(ev) {
    if (ns.consoleDump) ns.dump("Removing DOMNodeRemoved listener");
    ev.currentTarget.removeEventListener(ev.type, arguments.callee, true);
  },
  
  _emptyDataDoc: /^data:[\w\/]+,$/,
  forbiddenJSDataDoc: function(locationURL, originSite, aContext) {
     return !this.isSafeJSURL(locationURL) &&
        (this.forbidData && !this.isFirebugJSURL(locationURL) || locationURL == "javascript:") && 
        (!originSite || originSite.indexOf("moz-nullprincipal:") === 0)
          ? aContext && (
                    (aContext instanceof CI.nsIDOMWindow) 
                      ? aContext
                      : aContext.ownerDocument.defaultView
                  ).isNewToplevel
          : this.forbidData && !(this.isJSEnabled(originSite) ||
              (aContext instanceof CI.nsIDOMHTMLFrameElement ||
               aContext instanceof CI.nsIDOMHTMLIFrameElement) &&
              (
              this._emptyDataDoc.test(locationURL) ||
              this.isPluginDocumentURL(locationURL, "iframe") ||
              this.isPluginDocumentURL(locationURL, "embed") ||
              this.isPluginDocumentURL(locationURL, "video") ||
              this.isPluginDocumentURL(locationURL, "audio")
              )
            );
  },
  
  forbiddenXMLRequest: function(aRequestOrigin, aContentLocation, aContext, forbidDelegate) {
    let originURL, locationURL;
    if (aContentLocation.schemeIs("chrome") || !aRequestOrigin || 
         // GreaseMonkey Ajax comes from resource: hidden window
         // Google Toolbar Ajax from about:blank
           aRequestOrigin.schemeIs("chrome") || aRequestOrigin.schemeIs("resource") ||
           aRequestOrigin.schemeIs("about") ||
           // Web Developer extension "appears" to XHR towards about:blank
           (locationURL = aContentLocation.spec) == "about:blank"
          ) return false;
    
    let locationSite = this.getSite(locationURL);
    if (this.ignorePorts && this.portRx.test(locationSite) &&
        this.isJSEnabled(locationSite.replace(this.portRx, '')) && this.autoTemp(locationSite))
      return false;
    
    var win = aContext && aContext.defaultView;
    if(win) this.getExpando(win.top.document, "codeSites", []).push(locationSite);
    
    return forbidDelegate.call(this, originURL, locationURL);
  },
  
  addFlashVars: function(url, embed) {
    // add flashvars to have a better URL ID
    if (embed instanceof CI.nsIDOMElement) try {
      var flashvars = embed.getAttribute("flashvars");
      if (!flashvars) {
        let params = embed.getElementsByTagName("param");
        for (let j = 0, p; (p = params[j]); j++)
          if (p.name && p.name.toLowerCase() === "flashvars")
            flashvars = p.value;
      }
      if (flashvars) url += "#!flashvars#" + encodeURI(flashvars); 
    } catch(e) {
      if (this.consoleDump) this.dump("Couldn't add flashvars to " + url + ":" + e);
    }
    return url;
  },
  
  addObjectParams: function(url, embed) {
    if (embed instanceof CI.nsIDOMElement) try {
      var params = embed.getElementsByTagName("param");
      if (!params.length) return url;
      
      var pp = [];
      for(let j = params.length; j-- > 0;) {
        pp.push(encodeURIComponent(params[j].name) + "=" + encodeURIComponent(params[j].value));
      }
      url += "#!objparams#" + pp.join("&");
    } catch (e) {
      if (this.consoleDump) this.dump("Couldn't add object params to " + url + ":" + e);
    }
    return url;
  },
  
  tagWindowlessObject: function(o) {
    const rx = /opaque|transparent/i;
    var b;
    try {
      if (o instanceof CI.nsIDOMHTMLEmbedElement) {
        b = rx.test(o.getAttribute("wmode"));
      } else if (o instanceof CI.nsIDOMHTMLObjectElement) {
        var params = o.getElementsByTagName("param");
        const wmodeRx = /wmode/i;
        for(var j = params.length; j-- > 0 &&
            !(b = wmodeRx.test(params[j].name && rx.test(params[j].value)));
        );
      }
      if (b) this.setExpando(o, "windowless", true);
    } catch (e) {
      if (this.consoleDump) this.dump("Couldn't tag object for window mode.");
    }
  },
  
  isWindowlessObject: function(o) {
    return this.getExpando(o, "windowless") || o.settings && o.settings.windowless;
  },
  
  resolveSilverlightURL: function(uri, embed) {
    if(!uri) return "";
    
    
    if (embed instanceof CI.nsIDOMElement) try {
      
      var url = "";
      var params = embed.getElementsByTagName("param");
      if (!params.length) return uri.spec;
      
      var name, value, pp = [];
      for (var j = params.length; j-- > 0;) { // iteration inverse order is important for "source"!
        name = params[j].name;
        value = params[j].value;
        if(!(name && value)) continue;
        
        if (!url && name.toLowerCase() == "source") {
          try {
             url = uri.resolve(value);
             continue;
          } catch(e) {
            if (this.consoleDump)  
              this.dump("Couldn't resolve Silverlight URL " + uri.spec + " + " + value + ":" + e);
            url = uri.spec;
          }
        }
        pp.push(encodeURIComponent(name) + "=" + encodeURIComponent(value));
      }
      return (url || uri.spec) + "#!objparams#" + pp.join("&");
    } catch(e1) {
      if (this.consoleDump)  this.dump("Couldn't resolve Silverlight URL " + uri.spec + ":" + e1);
    }
    return uri.spec;
  },
  
  tagForReplacement: function(embed, pluginExtras) {
    try {
      var doc = embed.ownerDocument;
      if(!doc) {
        if (embed instanceof CI.nsIDOMDocumentView) {
          pluginExtras.document = (doc = embed);
          pluginExtras.url = this.getSite(pluginExtras.url);
          this._collectPluginExtras(this.findPluginExtras(doc), pluginExtras);
        }
      } else {
        var node = embed;
        while((node = node.parentNode))
          if (node.__noScriptBlocked)
            return;

        var pe = this.getExpando(doc, "pe");
        if (pe === null) this.setExpando(doc, "pe", pe = []);
        pe.push({embed: embed, pluginExtras: pluginExtras});
      }
      try {
        this.syncUI(doc);
      } catch(noUIex) {
        if(this.consoleDump) this.dump(noUIex);
      }
    } catch(ex) {
      if(this.consoleDump) this.dump(
        "Error tagging object [" + pluginExtras.mime + " from " + pluginExtras.url +
        " - top window " + win + ", embed " + embed +
        "] for replacement: " + ex);
    }
  },
  
  blockLegacyFrame: function(frame, uri, sync) {

    var verbose = this.consoleDump & LOG_CONTENT_BLOCK;
    if(verbose) {
      this.dump("Redirecting blocked legacy frame " + uri.spec + ", sync=" + sync);
    }
    
    
    var url = this.createPluginDocumentURL(uri.spec, "iframe");
    
    if(sync) {
      if (verbose) dump("Legacy frame SYNC, setting to " + url + "\n");
      frame.contentWindow.location = url;
    } else {
      frame.ownerDocument.defaultView.addEventListener("load", function(ev) {
          if(verbose) dump("Legacy frame ON PARENT LOAD, setting to " + url + "\n");
          ev.currentTarget.removeEventListener("load", arguments.callee, false);
          frame.contentWindow.location = url;
      }, false);
    }
    return true;
  
  },
  
  
  isPluginDocumentURL: function(url, tag) {
    try {
      return url.replace(/(src%3D%22).*?%22/i, '$1%22') == this.createPluginDocumentURL('', tag)
    } catch(e) {}
    return false;
  },
  
  createPluginDocumentURL: function(url, tag) {
    tag = tag ? tag.toLowerCase() : "embed";
    return 'data:text/html;charset=utf-8,' +
        encodeURIComponent('<html><head></head><body style="padding: 0px; margin: 0px"><' +
          tag + ' src="' + url + '" width="100%" height="100%"></' +
          tag + '></body></html>');
  },
  
  forbiddenIFrameContext: function(originURL, locationURL) {
    if (this.isForbiddenByHttpsStatus(originURL)) return false;
    var domain = this.getDomain(locationURL, true);
    if (!domain) return false;
    switch (this.forbidIFramesContext) {
      case 0: // all IFRAMES
        return true;
      case 3: // different 2nd level domain or either untrusted parent or origin
        if (!(this.untrustedSites.matches(this.getSite(locationURL)) ||
            this.untrustedSites.matches(this.getSite(originURL)))) 
          return this.getBaseDomain(this.getDomain(originURL, true)) != 
            this.getBaseDomain(domain);
      case 2: // different domain (unless forbidden by HTTPS status)
        if (this.getDomain(originURL, true) != domain) return true;
        // if we trust only HTTPS both sites must have the same scheme
        if (!this.isForbiddenByHttpsStatus(locationURL.replace(/^https:/, 'http:'))) return false;
      case 1: // different site
        return this.getSite(originURL) != this.getSite(locationURL);
     }
     return false;
  },
  
  forbiddenXBLContext: function(originURL, locationURL) {
    if (locationURL == this.nopXBL) return false; // always allow our nop binding
    
    var locationSite = this.getSite(locationURL);
    var originSite = this.getSite(originURL);
   
    switch (this.forbidXBL) {
      case 4: // allow only XBL from the same trusted site or chrome (default)
        if (locationSite != originSite) return true; // chrome is checked by the caller checkXML
      case 3: // allow only trusted XBL on trusted sites
        if (!locationSite) return true;
      case 2: // allow trusted and data: (Fx 3) XBL on trusted sites
        if (!(this.isJSEnabled(originSite) ||
            locationSite.indexOf("file:") === 0 // we trust local files to allow Linux theming
             )) return true;
      case 1: // allow trusted and data: (Fx 3) XBL on any site
        if (!(this.isJSEnabled(locationSite) || /^(?:data|file|resource):/.test(locationURL))) return true;
      case 0: // allow all XBL
        return false;
    }
    return true;
  },
  
  forbiddenXHRContext: function(originURL, locationURL) {
    var locationSite = this.getSite(locationURL);
    // var originSite = this.getSite(originURL);
    switch (this.forbidXHR) {
      case 3: // forbid all XHR
        return true;
      case 2: // allow same-site XHR only
        if (locationSite != originSite) return true;
      case 1: // allow trusted XHR targets only
        if (!(this.isJSEnabled(locationSite))) return true;
      case 0: // allow all XBL
        return false;
    }
    return true;
  },
  
  
  safeJSRx: false,
  initSafeJSRx: function() {
    try {
      this.safeJSRx = new RegExp("^\\s*" + this.getPref("safeJSRx", "") + "\\s*;?\\s*$");
    } catch(e) {
      this.safeJSRx = false;
    }
  },
  isSafeJSURL: function(url) {
    var js = url.replace(/^javascript:/i, "");
    return this.safeJSRx && js != url && this.safeJSRx.test(js);
  },
  
  isFirebugJSURL: function(url) {
    return url == "javascript: eval(__firebugTemp__);"
  },
  
  isExternalScheme: function(scheme) {
    try {
      return IOS.getProtocolHandler(scheme).scheme != scheme;
    } catch(e) {
      return false;
    }
  },
  normalizeExternalURI: function(uri) {
    var uriSpec = uri.spec;
    var uriValid = URIValidator.validate(uriSpec);
    var fixURI = this.getPref("fixURI", true) && 
      this.getPref("fixURI.exclude", "").split(/[^\w\-]+/)
          .indexOf(uri.scheme) < 0;
    var msg;
    if (!uriValid) {
      if (fixURI) {
        uriSpec = uriSpec
            .replace(/[\s\x01-\x1f\0]/g, " ") // whitespace + null + control chars all to space
            .replace(/%[01][\da-f]/gi, "%20"); // ditto for already encoded items
        if (uriSpec != uri.spec) {
          if (this.consoleDump) this.dump("Fixing URI: " + uri.spec + " into " + uriSpec);
          if (uriValid !== false || (uriValid = URIValidator.validate(uriSpec))) {
            uri.spec = uriSpec;
          }
        }
      }
      if (uriValid === false) {
        msg = "Rejected invalid URI: " + uriSpec;
        if (this.consoleDump) this.dump(msg);
        this.log("[NoScript URI Validator] " + msg);
        return false;
      }
    }
    // encode all you can (i.e. don't touch valid encoded and delims)
    if (fixURI) {
      try {
        uriSpec = uriSpec.replace(/[^%]|%(?![\da-f]{2})/gi, encodeURI); 
        if (uriSpec != uri.spec) {
          if (this.consoleDump) this.dump("Encoded URI: " + uri.spec + " to " + uriSpec);
          uri.spec = uriSpec;
        }
      } catch(ex) {
        msg = "Error assigning encoded URI: " + uriSpec + ", " + ex;
        if (this.consoleDump) this.dump(msg);
        this.log("[NoScript URI Validator] " + msg);
        return false;
      }
    }
    return true;
  },
  
  syncUI: function(document) {
    this.os.notifyObservers(document.defaultView.top, "noscript:sync-ui", null);
  },
  
  objectWhitelist: {},
  ALL_TYPES: ["*"],
  objectWhitelistLen: 0,
  _objectKeyRx: /^((?:\w+:\/\/)?[^\.\/\d]+)\d+(\.[^\.\/]+\.)/,
  objectKey: function(url, originSite) {
    return (originSite || '') + ">" + IOUtil.anonymizeURL(url.replace(this._objectKeyRx, '$1$2'));
  },
  anyAllowedObject: function(site, mime) {
    let key = this.objectKey(site);
    if (key in this.objectWhitelist) return true;
    key += '/';
    for (let s in this.objectWhitelist) {
      if (s.indexOf(site) === 0) return true;
    }
    return false;
  },
  isAllowedObject: function(url, mime, site, originSite) {
    let types = this.objectWhitelist[this.objectKey(url, originSite)] || this.objectWhitelist[this.objectKey(url)];
    if (types && (types == this.ALL_TYPES || types.indexOf(mime) > -1)) 
      return true;
    
    
    if (typeof(site) === "undefined") site = this.getSite(url);
    
    for (;site;) {
      types = this.objectWhitelist[this.objectKey(site, originSite)] || this.objectWhitelist[this.objectKey(site)];
      if (types && (types == this.ALL_TYPES || types.indexOf(mime) > -1))
        return true;

      if (!this._moreURLPartsRx.test(site)) break;
      let s = site.replace(this._chopURLPartRx, '');
      if (s === site) break;
      site = s;
    }
        
    return false;
  },
  _moreURLPartsRx: /\..*\.|:\//,
  _chopURLPartRx: /.*?(?::\/+|\.)/,
  
  // Fire.fm compatibility shim :(
  setAllowedObject: function(url, mime) {
    this.allowObject(url, mime);
  },
  
  allowObject: function(url, mime, originSite) {
    let key = this.objectKey(url, originSite);
    if (key in this.objectWhitelist) {
      let types = this.objectWhitelist[key];
      if(mime === "*") {
        if(types === this.ALL_TYPES) return;
        types = this.ALL_TYPES;
      } else {
        if (types.indexOf(mime) > -1) return;
        types.push(mime);
      }
    } else {
      this.objectWhitelist[key] = mime == "*" ? this.ALL_TYPES : [mime];
    }
    this.objectWhitelistLen++;
  },
  isAllowedObjectById: function(id, objectURL, parentURL, mime, site, originSite) {
    var url = this.getObjectURLWithId(id, objectURL, parentURL);
    return url && this.isAllowedObject(url, mime, site, originSite || this.getSite(parentURL));
  },
  allowObjectById: function(id, objectURL, parentURL, mime, originSite) {
    var url = this.getObjectURLWithId(id, objectURL, parentURL);
    if (url) this.allowObject(url, mime, originSite || this.getSite(parentURL));
  },
  getObjectURLWithId: function(id, objectURL, parentURL) {
    return id && objectURL.replace(/[\?#].*/, '') + "#!#" + id + "@" + encodeURIComponent(parentURL);
  },
  resetAllowedObjects: function() {
    this.objectWhitelist = {};
    this.objectWhitelistLen = 0;
  },
  
  
  countObject: function(embed, site) {

    if(!site) return;
    var doc = embed.ownerDocument;
    
    if (doc) {
      var topDoc = doc.defaultView.top.document;
      var os = this.getExpando(topDoc, "objectSites");
      if(os) {
        if(os.indexOf(site) < 0) os.push(site);
      } else {
        this.setExpando(topDoc, "objectSites", [site]);
      }
    }
  },
  
  getPluginExtras: function(obj) {
    return this.getExpando(obj, "pluginExtras");
  },
  setPluginExtras: function(obj, extras) {
    this.setExpando(obj, "pluginExtras", extras);
    if (this.consoleDump & LOG_CONTENT_BLOCK) {
      try {
        this.dump("Setting plugin extras on " + obj + " -> " + (this.getPluginExtras(obj) == extras)
          + ", " + (extras && extras.toSource())  );
      } catch(e) {
        this.dump("Setting plugin extras");
      }
    }
      
    return extras;
  },
  
  getExpando: function(domObject, key, defValue) {
    return domObject && domObject.__noscriptStorage && domObject.__noscriptStorage[key] || 
           (defValue ? this.setExpando(domObject, key, defValue) : null);
  },
  setExpando: function(domObject, key, value) {
    if (!domObject) return null;
    if (!domObject.__noscriptStorage) domObject.__noscriptStorage = {};
    if (domObject.__noscriptStorage) domObject.__noscriptStorage[key] = value;
    else if(this.consoleDump) this.dump("Warning: cannot set expando " + key + " to value " + value);
    return value;
  },
  
  cleanupBrowser: function(browser) {
    delete browser.__noscriptStorage;
  },
  
  hasVisibleLinks: function(document) {
    const w = document.defaultView;
    if (!w) return false;
    
    const links = document.links;
    const toBeChecked = [];
    for (let j = 0, l; (l = links[j]); j++) {
      if (l && l.href && l.href.indexOf("http") === 0) {
        if (l.offsetWidth || l.offsetHeight) return true;
        toBeChecked.push(l);
      }
    }
    for (let j = toBeChecked.length; j-- > 0;) {
      let l = toBeChecked[j];
      let style = w.getComputedStyle(l, '');
      if (!style) return true; // this means we're inside an invisible frame, no reason to loose time here
      
      if (parseInt(style.width) || parseInt(style.height)) return true; 
      
      let position;
      try {
        position = l.style.position;
        l.style.position = "absolute";
        if(l.offsetHeight) return true;
      } finally {
        l.style.position = position;
      }
      if (/\b__noscriptPlaceholder__\b/.test(l.className)) return true;
    }
    if (document.embeds[0] || document.getElementsByTagName("object")[0]) return true;
    let form = document.forms[0];
    if (form && form.offsetHeight) return true;
    return false;
  },
  detectJSRedirects: function(document) {
    if (this.jsredirectIgnore) return 0;
    
    try {
      if (document.documentURI.indexOf("http") !== 0) return 0;
      var hasVisibleLinks = this.hasVisibleLinks(document);
      if (!this.jsredirectForceShow && hasVisibleLinks) 
        return 0;
      
      var seen = [];
      const body = document.body;
      var cstyle = document.defaultView.getComputedStyle(body, "");
      if (cstyle) {
        if (cstyle.visibility != "visible") {
          body.style.visibility = "visible";
        }
        if (cstyle.display == "none") {
          body.style.display = "block";
        }
      }
      if (!hasVisibleLinks && (document.links[0] || document.forms[0])) {
        let links = document.links;
        for (let j = 0, len = links.length; j < len; j++) {
          let l = links[j];
          if (!(l.href && l.href.indexOf("http") === 0)) continue;
          l = body.appendChild(l.cloneNode(true));
          l.style.visibility = "visible";
          l.style.display = "block";
          seen.push(l.href);
        }
        

        for (let forms = document.forms, j = 0, f; f = forms[j]; j++) {
          if (f.action) {
            let e;
            for (let els = f.elements, k = 0; e = els[k]; k++) {
              if (e.type === "submit") break;
            }
            if (!e) {
              e = document.createElement("input");
              e.type = "submit";
              e.value = f.action.substring(0, 47);
              if (f.action.length > 48) e.value += "...";
              f.appendChild(e);
            }
          }
        }
      }
      
      var code;
      var container = null;
      var window;
      
      code = body && body.getAttribute("onload");
      const sources = code ? [code] : [];
      var scripts = document.getElementsByTagName("script");
      for (let j = 0, len = scripts.length; j < len; j++)
        sources.push(scripts[j].innerHTML);
      
      scripts = null;
      
      if (!sources[0]) return 0;
      
      var follow = false;
      const findURL = /(?:(?:\b(?:open|replace)\s*\(|(?:\b(?:href|location|src|path|pathname|search)|(?:[Pp]ath|UR[IL]|[uU]r[il]))\s*=)\s*['"]|['"](?=https?:\/\/\w|\w*[\.\/\?]))([\?\/\.\w\-%\&][^\s'"]*)/g;
      const MAX_TIME = 1000;
      const MAX_LINKS = 30;
      const ts = Date.now();
      outerLoop:
      for (let j = 0, len = sources.length; j < len; j++) {
        findURL.lastIndex = 0;
        code = sources[j];
        for (let m; m = findURL.exec(code);) {
          
          if (!container) {
            container = document.createElementNS(HTML_NS, "div");
            with (container.style) {
              backgroundImage = 'url("' + this.pluginPlaceholder + '")';
              backgroundRepeat = "no-repeat";
              backgroundPosition = "2px 2px";
              padding = "4px 4px 4px 40px";
              display = "block";
              minHeight = "32px";
              textAlign = "left";
            }
            window = document.defaultView;
            follow = this.jsredirectFollow && window == window.top &&  
              !window.frames[0] &&
              !document.evaluate('//body[normalize-space()!=""]', document, null, 
                CI.nsIDOMXPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            document.body.appendChild(container);
          }
          let url = m[1];
          let a = document.createElementNS(HTML_NS, "a");
          a.href = url;
          container.appendChild(a);
          if (a.href.toLowerCase().indexOf("http") != 0 || seen.indexOf(a.href) > -1) {
             container.removeChild(a);
             continue;
          }
          seen.push(a.href);
          a.appendChild(document.createTextNode(a.href));
          container.appendChild(document.createElementNS(HTML_NS, "br"));
          
          if (seen.length >= MAX_LINKS || Date.now() - ts > MAX_TIME) break outerLoop;
        }
        
        if (follow && seen.length == 1) {
          this.log("[NoScript Following JS Redirection]: " + seen[0] + " FROM " + document.location.href); 
          
          this.doFollowMetaRefresh({
            uri: seen[0],
            document: document
          });  
        }
        
        if (Date.now() - ts > MAX_TIME) break;
      }
      return seen.length;
    } catch(e) { 
      this.dump(e.message + " while processing JS redirects");
      return 0; 
    }
  }
,
  processScriptElements: function(document, sites, docSite) {
    const scripts = document.getElementsByTagName("script");
    var scount = scripts.length;
    var surrogates = this.getExpando(document, "surrogates", {});
    if (scount) {
      const HTMLElement = CI.nsIDOMHTMLElement;
      sites.scriptCount += scount;
      let nselForce = this.nselForce && this.isJSEnabled(docSite);
      let isHTMLScript;
      while (scount-- > 0) {
        let script = scripts.item(scount);
        isHTMLScript = script instanceof HTMLElement;
        if (isHTMLScript) {
          scriptSrc = script.src;
        } else if(script) {
          scriptSrc = script.getAttribute("src");
          if (!/^[a-z]+:\/\//i.test(scriptSrc)) continue;
        } else continue;
        
        let scriptSite = this.getSite(scriptSrc);
        if (scriptSite) {
          sites.push(scriptSite);
          
          if (scriptSrc in surrogates) continue;
          
          if (nselForce && isHTMLScript &&
              !(script.__nselForce ||
                this.isJSEnabled(scriptSite) ||
                this.isUntrusted(scriptSite))) {
            
            this.showNextNoscriptElement(script);
          }
        }
      }
    }
  }
,
  
  
  showNextNoscriptElement: function(script) { 
    const HTMLElement = CI.nsIDOMHTMLElement;
    var child, el, j, doc, docShell;
    try {
      for (var node = script; (node = node.nextSibling);) {

        if (node instanceof HTMLElement) {
          script.__nselForce = true;
          
          tag = node.tagName.toUpperCase();
          if (tag == "SCRIPT") {
            if (node.src) return;
            script = node;
            continue;
          }
          if (tag != "NOSCRIPT")
            return;
         
          child = node.firstChild;
          if (child.nodeType != 3) break;
          
          if (!doc) {
            doc = node.ownerDocument;
            docShell = this.dom.getDocShellForWindow(doc.defaultView);
            if (docShell.allowMetaRedirects) {
              docShell.allowMetaRedirects = false;
            } else {
              docShell = null;
            }
          }
          this.setExpando(doc, "nselForce", true);
          el = doc.createElementNS(HTML_NS, "span");
          el.__nselForce = true;

          el.innerHTML = child.nodeValue;
          node.replaceChild(el, child);
          node.className = "noscript-show";
        }
      }
    } catch(e) {
      this.dump(e.message + " while showing NOSCRIPT element");
    } finally {
      if (docShell) docShell.allowMetaRedirects = true;
    }
  },
  
  metaRefreshWhitelist: {},
  processMetaRefresh: function(document, notifyCallback) {
    var docShell = DOM.getDocShellForWindow(document.defaultView);
    if (!this.forbidMetaRefresh ||    
       this.metaRefreshWhitelist[document.documentURI] ||
       this.isJSEnabled(this.getSite(document.documentURI)) ||
       !document.getElementsByTagName("noscript")[0]
       ) {
      if (!docShell.allowMetaRedirects) this.disableMetaRefresh(docShell); // refresh blocker courtesy
      return;
    }
    try {
      var refresh, content, timeout, uri;
      var rr = document.getElementsByTagName("meta");
      if (!rr[0]) return;
      
      var html5;
      try {
        html5 = this.prefService.getBoolPref("html5.enable");
      } catch(e) {
        html5 = false;
      }

      var node, nodeName;
      const refreshRx = /refresh/i; 
      for (var j = 0; (refresh = rr[j]); j++) {
        if (!refreshRx.test(refresh.httpEquiv)) continue;
        if (html5) { // older parser moves META outside the NOSCRIPT element if not in HEAD
          for (node = refresh; (node = node.parentNode);) {
            if (node.localName == "noscript")
              break;
          }
          if (node == null) continue;
        }
        content = refresh.content.split(/[,;]/, 2);
        uri = content[1];
        if (uri) {
          if (notifyCallback && !(document.documentURI in this.metaRefreshWhitelist)) {
            timeout = parseInt(content[0]) || 0;
            uri = uri.replace (/^\s*URL\s*=\s*/i, "");
            var isQuoted = /^['"]/.test(uri);
            uri = isQuoted ? uri.match(/['"]([^'"]*)/)[1] : uri.replace(/\s[\s\S]*/, ''); 
            try {
              notifyCallback({ 
                docShell: docShell,
                document: document,
                baseURI: docShell.currentURI,
                uri: uri, 
                timeout: timeout
              });
            } catch(e) {
              dump("[NoScript]: " + e + " notifying meta refresh at " + document.documentURI + "\n");
            }
          }
          document.defaultView.addEventListener("pagehide", function(ev) {
              ev.currentTarget.removeEventListener(ev.type, arguments.callee, false);
              docShell.allowMetaRedirects = true;
              document = docShell = null;
          }, false);
          this.disableMetaRefresh(docShell);
          return;
        }
      }
    } catch(e) {
      dump("[NoScript]: " + e + " processing meta refresh at " + document.documentURI + "\n");
    }
  },
  doFollowMetaRefresh: function(metaRefreshInfo, forceRemember) {
    var document = metaRefreshInfo.document;
    if (forceRemember || this.getPref("forbidMetaRefresh.remember", false)) {
      this.metaRefreshWhitelist[document.documentURI] = metaRefreshInfo.uri;
    }
    var docShell = metaRefreshInfo.docShell || DOM.getDocShellForWindow(document.defaultView); 
    this.enableMetaRefresh(docShell);
    if (docShell instanceof CI.nsIRefreshURI) {
      var baseURI = metaRefreshInfo.baseURI || IOS.newURI(document.documentURI, null, null);
      docShell.setupRefreshURIFromHeader(baseURI, "0;" + metaRefreshInfo.uri);
    }
  },
  doBlockMetaRefresh: function(metaRefreshInfo) {
    if (this.getPref("forbidMetaRefresh.remember", true)) {
      var document = metaRefreshInfo.document;
      this.metaRefreshWhitelist[document.documentURI] = null;
    }
  },
  
  enableMetaRefresh: function(docShell) {
    if (docShell) {
      docShell.allowMetaRedirects = true;
      docShell.resumeRefreshURIs();
      // if(this.consoleDump) dump("Enabled META refresh on " + (docShell.currentURI && docShell.currentURI.spec) + "\n");
    }
  },
  disableMetaRefresh: function(docShell) {
    if (docShell) {
      docShell.suspendRefreshURIs();
      docShell.allowMetaRedirects = false;
      if (docShell instanceof CI.nsIRefreshURI) {
        docShell.cancelRefreshURITimers();
      }
      // if(this.consoleDump) dump("Disabled META refresh on " + (docShell.currentURI && docShell.currentURI.spec) + "\n");
    }
  },
  

  // These catch both Paypal's variant,
  // if (parent.frames.length > 0){ top.location.replace(document.location); }
  // and the general concise idiom with its common reasonable permutations,
  // if (self != top) top.location = location
  _frameBreakNoCapture: /\bif\s*\(\s*(?:(?:(?:window|self|top)\s*\.\s*)*(?:window|self|top)\s*!==?\s*(?:(?:window|self|top)\s*\.\s*)*(?:window|self|top)|(?:(?:window|self|parent|top)\s*\.\s*)*(?:parent|top)\.frames\.length\s*(?:!==?|>)\s*0)\s*\)\s*\{?\s*(?:window\s*\.\s*)?top\s*\.\s*location\s*(?:\.\s*(?:replace|assign)\s*\(|(?:\s*\.\s*href\s*)?=)\s*(?:(?:document|window|self)\s*\.\s*)?location(?:\s*.\s*href)?\s*\)?\s*;?\s*\}?/,
  _frameBreakCapture: /^\(function\s[^\{]+\{\s*if\s*\(\s*(?:(?:(?:window|self|top)\s*\.\s*)*(window|self|top)\s*!==?\s*(?:(?:window|self|top)\s*\.\s*)*(window|self|top)|(?:(?:window|self|parent|top)\s*\.\s*)*(?:parent|top)\.frames\.length\s*(?:!==?|>)\s*0)\s*\)\s*\{?\s*(?:window\s*\.\s*)?top\s*\.\s*location\s*(?:\.\s*(?:replace|assign)\s*\(|(?:\s*\.\s*href\s*)?=)\s*(?:(?:document|window|self)\s*\.\s*)?location(?:\s*.\s*href)?\s*\)?\s*;?\s*\}?/,
  doEmulateFrameBreak: function(w) {
    // If JS is disabled we check the top 5 script elements of the page searching for the first inline one:
    // if it starts with a frame breaker, we honor it.
    var d = w.document;
    var url = d.URL;
    if (url.indexOf("http") !== 0 || this.isJSEnabled(this.getSite(url))) return false;
    var ss = d.getElementsByTagName("script");
    var sc, m, code;
    for (var j = 0, len = 5, s; j < len && (s = ss[j]); j++) {
      code = s.innerHTML;
      if (code && /\S/.test(code)) {
        if (this._frameBreakNoCapture.test(code)) {
          try {
            sc = sc || new SyntaxChecker();
            var m;
            if (sc.check(code) && 
                (m = sc.lastFunction.toSource().match(this._frameBreakCapture)) && 
                (!m[1] || (m[1] == "top" || m[2] == "top") && m[1] != m[2])) {
              var top = w.top;

              var docShell = DOM.getDocShellForWindow(top);
              var allowJavascript = docShell.allowJavascript;
              var allowPlugins = docShell.allowPlugins;
              if (allowJavascript) { // temporarily disable JS & plugins on the top frame to prevent counter-busting 
                docShell.allowJavascript = docShell.allowPlugins = false;
                top.addEventListener("pagehide", function(ev) {
                  ev.currentTarget.removeEventListener(ev.type, arguments.calle, false);
                  docShell.allowJavascript = allowJavascript;
                  docShell.allowPlugins = allowPlugins;
                }, false);
              }
              top.location.href = url;
              var body = d.body;
              if (body) while(body.firstChild) body.removeChild(body.firstChild);
              return true;
            }
          } catch(e) {
            this.dump("Error checking " + code + ": " + e.message);
          }
        }
        break; // we want to check the first inline script only
      }
    }
    return false;
  },
  
  knownFrames: {
    _history: {},
    add: function(url, parentSite) {
      var f = this._history[url] || (this._history[url] = []);
      if (f.indexOf(parentSite) > -1) return;
      f.push(parentSite);
    },
    isKnown: function(url, parentSite) {
      var f = this._history[url];
      return f && f.indexOf(parentSite) > -1;
    },
    reset: function() {
      this._history = {}
    }
  },
  
  frameContentLoaded: function(w) {
    if (this.emulateFrameBreak && this.doEmulateFrameBreak(w)) return; // we're no more framed

    if ((this.forbidIFrames && w.frameElement instanceof CI.nsIDOMHTMLIFrameElement ||
         this.forbidFrames  && w.frameElement instanceof CI.nsIDOMHTMLFrameElement) &&
        this.getPref("rememberFrames", false)) {
      this.knownFrames.add(w.location.href, this.getSite(w.parent.location.href));
    }
  },
  
  
  handleBookmark: function(url, openCallback) {
    if (!url) return true;
    const allowBookmarklets = !this.getPref("forbidBookmarklets", false);
    const allowBookmarks = this.getPref("allowBookmarks", false);
    if (!this.jsEnabled && 
      (allowBookmarks || allowBookmarklets)) {
      try {
        var site;
        if (allowBookmarklets && /^\s*(?:javascript|data):/i.test(url)) {
          var ret = this.executeJSURL(url, openCallback);
        } else if (allowBookmarks && !(this.isJSEnabled(site = this.getSite(url)) || this.isUntrusted(site))) {
          this.setJSEnabled(site, true);
          this.savePrefs();
        }
        return ret;
      } catch(e) {
        if (ns.consoleDump) ns.dump(e + " " + e.stack);
      }
    }
    return false;
  },
  
  // applied to Places(UI)Utils
  placesCheckURLSecurity: function(node) {
    if(!this.__originalCheckURLSecurity(node)) return false;
    var method = arguments.callee;
    if(method._reentrant) return true;
    try {
      method._reentrant = true;
      const url = node.uri;
      node = null;
      var self = this;
      return !this.__ns.handleBookmark(url, function(url) {
        method.caller.apply(self, patch.caller.arguments);
        self = null;
      });
    } finally {
      method._reentrant = false;
    }
  },
  
  
  executeJSURL: function(url, openCallback, fromURLBar) {
    var browserWindow = DOM.mostRecentBrowserWindow;
    var browser = browserWindow.noscriptOverlay.currentBrowser;
    if(!browser) return false;
    
    var window = browser.contentWindow;
    if(!window) return false;
    
    var site = this.getSite(window.document.documentURI) || this.getExpando(browser, "jsSite");
    if (this.mozJSEnabled && !this.jsEnabled) {
      if(this.consoleDump) this.dump("Executing JS URL " + url + " on site " + site);
    
      var docShell = DOM.getDocShellForWindow(window);
    
      var snapshots = {
        docJS: docShell.allowJavascript,
        siteJS: this.isJSEnabled(site)
      };
    
      var doc = window.document;
      
      let blurListener = null, focusListener = null;
      
      try {

        docShell.allowJavascript = true;
        if (!(this.jsEnabled = ns.getPref(fromURLBar ? "allowURLBarImports" : "allowBookmarkletImports"))) {
          if (!snapshots.siteJS) 
            this.setJSEnabled(site, true);
        } else {
          window.addEventListener("blur", blurListener = function() {
            ns.jsEnabled = false;
            if (!focusListener) window.addEventListener("focus", focusListener = function() {
              ns.jsEnabled = true;
            }, true);
          }, true);
        }
        
        if (Thread.canSpin) { // async evaluation, after bug 351633 landing
          Thread.runWithQueue(function() {
            try {
              this.executingJSURL(doc, 1);
              if (!(snapshots.siteJS && snapshots.docJS)) {
                this._patchTimeouts(window, true);
              }
              
              window.location.href = url;
              
              Thread.yieldAll();
              if (!(snapshots.siteJS && snapshots.docJS)) {
                this._patchTimeouts(window, false);
              }
              
            } catch(e) {
              this.logError(e, true, "Bookmarklet or location scriptlet");
            }
          }, this);
        } else {
          if (!openCallback) return false;
          openCallback(url);
        }
        return true;
      } finally {
        
        this.setExpando(browser, "jsSite", site);
        if (!docShell.isLoadingDocument && docShell.currentURI &&  
            this.getSite(docShell.currentURI.spec) == site)
          docShell.allowJavascript = snapshots.docJS;
        
        Thread.asap(function() {
          if (doc.defaultView && this.executingJSURL(doc) > 1) {
            this.delayExec(arguments.callee, 100);
            return;
          }
          
          this.executingJSURL(doc, 0);
          if (focusListener) window.removeEventListener("focus", focusListener, true);
          if (this.jsEnabled) {
            this.jsEnabled = false;
          }
          if (blurListener) window.removeEventListener("blur", blurListener, true);
          
          if (!snapshots.siteJS)
              this.setJSEnabled(site, false);
          
          if (this.consoleDump & LOG_JS)
            this.dump("Restored snapshot permissions on " + site + "/" + (docShell.isLoadingDocument ? "loading" : docShell.currentURI.spec));
        }, this);
      }
    }
    
    return false;
  },
  
  _patchTimeouts: function(w, start) {
     this._runJS(w, start
      ? "if (!('__runTimeouts' in window)) (" +
        function() {
          var tt = [];
          window.setTimeout = window.setInterval = function(f, d, a) {
            if (typeof(f) != 'function') f = new Function(f || '');
            tt.push({f: f, d: d, a: a});
            return 0;
          };
          window.__runTimeouts = function() {
            var t, count = 0;
            while (tt.length && count++ < 50) { // let's prevent infinite pseudo-loops
              tt.sort(function(b, a) { return a.d < b.d ? -1 : (a.d > b.d ? 1 : 0); });
              t = tt.pop();
              t.f.call(window, t.a);
            }
            delete window.__runTimeouts;
            delete window.setTimeout;
          };
        }.toSource()
        + ")()"
      : "if (('__runTimeouts' in window) && typeof(window.__runTimeouts) == 'function') window.__runTimeouts()"
    );
  },
  
  _runJS: function(window, s) {
    window.location.href = "javascript:" + encodeURIComponent(s + "; void(0);");
  },
  
  bookmarkletImport: function(scriptElem, src) {
    var doc = scriptElem.ownerDocument;
    ns.executingJSURL(doc, 1);
    var w = doc.defaultView;
    try {
      ns._patchTimeouts(w, true);
      var xhr = ns.createCheckedXHR("GET", src, false);
      xhr.send(null);
      
      this._runJS(doc.defaultView, xhr.responseText);
      var ev = doc.createEvent("HTMLEvents");
      ev.initEvent("load", false, true);
    } catch(e) {
      ns.dump(e);
    } finally {
      Thread.asap(function() {
        try {
          scriptElem.dispatchEvent(ev);
          ns._patchTimeouts(w, false);
        } catch(e) {}
        ns.executingJSURL(doc, -1);
      });
    }
  },
  
  executingJSURL: function(doc, n) {
    const VAR = "JSURLExec";
    var v = this.getExpando(doc, VAR) || 0;
    if (typeof(n) === "number") {
      this.setExpando(doc, VAR, n === 0 ? 0 : v += n);
    }
    return v;
  },
  
  isCheckedChannel: function(c) {
    return IOUtil.extractFromChannel(c, "noscript.checkedChannel", true);
  },
  setCheckedChannel: function(c, v) {
    IOUtil.attachToChannel(c, "noscript.checkedChannel", v ? DUMMYOBJ : null);
  },
  
  createCheckedXHR: function(method, url, async) {
    if (typeof(async) == "undefined") async = true;
    var xhr = CC["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(CI.nsIXMLHttpRequest);
    xhr.open(method, url, async);
    this.setCheckedChannel(xhr.channel, true);
    return xhr;
  },
  
  mimeEssentials: function(mime) {
     return mime && mime.replace(/^application\/(?:x-)?/, "") || "";
  },
  urlEssentials: function(s) {
    // remove query, hash and intermediate path
    return s.replace(/[#\?].*/g, '').replace(/(.*?\w\/).+?(\/[^\/]+)$/, '$1...$2');
  },
  cssMimeIcon: function(mime, size) {
    return mime == "application/x-shockwave-flash"
    ? // work around for Windows not associating a sane icon to Flash
      'url("' + this.skinBase + "flash" + size + '.png")'
    : /^application\/x-java\b/i.test(mime)
      ? 'url("' + this.skinBase + "java" + size + '.png")'
      : /^application\/x-silverlight\b/.test(mime)
        ? 'url("' + this.skinBase + "somelight" + size + '.png")'
        : /^font\b/i.test(mime)
          ? 'url("' + this.skinBase + 'font.png")'
          : 'url("moz-icon://noscript?size=' + size + '&contentType=' + mime.replace(/[^\w-\/]/g, '') + '")';
  },
  
  
  findPluginExtras: function(document) {
    return this.getExpando(document, "pluginExtras", []);
  },
  
  appliesHere: function(pref, url) {
    return pref && ((ANYWHERE & pref) == ANYWHERE ||
       (this.isJSEnabled(this.getSite(url))
        ? (WHERE_TRUSTED & pref) : (WHERE_UNTRUSTED & pref)
       )
      );
  },
  
  _preprocessObjectInfo: function(doc) {
    const EMBED = CI.nsIDOMHTMLEmbedElement,
          OBJECT = CI.nsIDOMHTMLObjectElement;

    const pe = this.getExpando(doc, "pe");
    if (!pe) return null;
    this.setExpando(doc, "pe", null);
    var ret = [], o, node, embed;
    for (var j = pe.length; j-- > 0;) {
      o = pe[j];
      try {
        if (this.getExpando(o, "silverlight")) {
          o.embed = this._attachSilverlightExtras(o.embed, o.pluginExtras);
          if (!o.embed) continue; // skip unconditionally to prevent in-page Silverlight placeholders
        }
        
        embed = o.embed;
        
        if (embed instanceof OBJECT || embed instanceof EMBED) {
          node = embed;
          while ((node = node.parentNode) && !node.__noscriptBlocked)
            //  if (node instanceof OBJECT) o.embed = embed = node
            ;
          
          if (node !== null) {
            pe.splice(j, 1);
            continue;
          }
        }
        
        this.countObject(embed, o.pluginExtras.site);
        
        this.setPluginExtras(embed, o.pluginExtras);
        if (embed.ownerDocument) ret.push(o);
       } catch(e1) { 
         if(this.consoleDump & LOG_CONTENT_BLOCK) 
           this.dump("Error setting plugin extras: " + 
             (o && o.pluginExtras && o.pluginExtras.url) + ", " + e1); 
       }
    }
    return ret;
  },
    
  processObjectElements: function(document, sites, loaded) {
    const pluginExtras = this.findPluginExtras(document);
    sites.pluginCount += pluginExtras.length;
    sites.pluginExtras.push(pluginExtras);
    
    const objInfo = this._preprocessObjectInfo(document);
    if (!objInfo) return;
    
    var count = objInfo.length;
    if (count === 0) return;
    
    sites.pluginCount += count;
    
    const minSize = this.getPref("placeholderMinSize"),
          longTip = this.getPref("placeholderLongTip");
    
    var replacements = null,
        collapse = this.collapseObject,
        forcedCSS = ";",
        pluginDocument = false;
    
    try {
      pluginDocument = count == 1 && (objInfo[0].pluginExtras.url == document.URL) && !objInfo[0].embed.nextSibling;
      if (pluginDocument) {
        collapse = false;
        forcedCSS = ";outline-style: none !important;-moz-outline-style: none !important;";
      }
    } catch(e) {}
    
    var win = document.defaultView;

    while (count--) {
      let oi = objInfo[count];
      let object = oi.embed;
      let extras = oi.pluginExtras;
      let objectTag = object.tagName;
      
      try {
        extras.site = this.getSite(extras.url);
        
        if(!this.showUntrustedPlaceholder && this.isUntrusted(extras.site))
          continue;
        
        extras.tag = "<" + (this.isLegacyFrameReplacement(object) ? "FRAME" : objectTag.toUpperCase()) + ">";
        extras.title =  extras.tag + ", " +  
            this.mimeEssentials(extras.mime) + "@" +
            (longTip ? extras.url : extras.url.replace(/[#\?].*/, ''));
        
        if ((extras.alt = object.getAttribute("alt")))
          extras.title += ' "' + extras.alt + '"'
        
        
        let anchor = document.createElementNS(HTML_NS, "a");
        anchor.id = object.id;
        anchor.href = extras.url;
        anchor.setAttribute("title", extras.title);
        
        this.setPluginExtras(anchor, extras);
        this.setExpando(anchor, "removedNode", object);
     
        (replacements = replacements || []).push({object: object, placeholder: anchor, extras: extras });

        if (this.showPlaceholder) {
          if (!pluginExtras.overlayListener) {
            pluginExtras.overlayListener = true;
            win.addEventListener("click", this.bind(this.onOverlayedPlaceholderClick), true);
          }
          anchor.addEventListener("click", this.bind(this.onPlaceholderClick), true);
          anchor.className = "__noscriptPlaceholder__ __noscriptObjectPatchMe__";
        } else {
          anchor.className = "";
          if(collapse) anchor.style.display = "none";
          else anchor.style.visibility = "hidden";
          continue;
        }
        
        object.className += " __noscriptObjectPatchMe__";
        
        let innerDiv = document.createElementNS(HTML_NS, "div");
        innerDiv.className = "__noscriptPlaceholder__1";
        
        with (anchor.style) {
          padding = margin = borderWidth = "0px";
          outlineOffset = MozOutlineOffset = "-1px"; 
          display = "inline";
        }
        
        let cssDef = "",
            restrictedSize,
            style = win.getComputedStyle(oi.embed, null);
        
        if (style) {
          for (let cssCount = 0, cssLen = style.length; cssCount < cssLen; cssCount++) {
            let cssProp = style.item(cssCount);
            cssDef += cssProp + ": " + style.getPropertyValue(cssProp) + ";";
          }
          
          innerDiv.setAttribute("style", cssDef + forcedCSS);
          
          restrictedSize = (collapse || style.display === "none" || style.visibility === "hidden");
          
          if (!restrictedSize && style.height == "100%") {
            anchor.style.display = "block";
            anchor.style.height = "100%";
          }
          
        } else restrictedSize = collapse;
        
        if (restrictedSize) {
          innerDiv.style.maxWidth = anchor.style.maxWidth = "32px";
          innerDiv.style.maxHeight = anchor.style.maxHeight = "32px";
        }
        
        innerDiv.style.visibility = "visible";

        anchor.appendChild(innerDiv);
        
        // icon div
        innerDiv = innerDiv.appendChild(document.createElementNS(HTML_NS, "div"));
        innerDiv.className = "__noscriptPlaceholder__2";
        
        let iconSize;
        
        if(restrictedSize || style && (64 > (parseInt(style.width) || 0) || 64 > (parseInt(style.height) || 0))) {
          innerDiv.style.backgroundPosition = "bottom right";
          iconSize = 16;
          let w = parseInt(style.width) || 0,
              h = parseInt(style.height) || 0;
          if (minSize > w || minSize > h) {
            var rect = DOM.computeRect(object);
            with (innerDiv.parentNode.style) {
              let isTop = !win.frameElement;
              w = minWidth = Math.max(w, isTop ? minSize : Math.min(document.documentElement.offsetWidth - rect.left, minSize)) + "px";
              h = minHeight = Math.max(h, isTop ? minSize : Math.min(document.documentElement.offsetHeight - rect.top, minSize)) + "px";
            }

            with (anchor.style) {
              overflow = "visible";
              display = "block";
              minWidth = w + "px";
              minHeight = h + "px";
            }
            anchor.style.float = "left";
          }
        } else {
          iconSize = 32;
          innerDiv.style.backgroundPosition = "center";
        }
        innerDiv.style.backgroundImage = this.cssMimeIcon(extras.mime, iconSize);
        
      } catch(objectEx) {
        ns.dump(objectEx + " processing plugin " + count + "@" + document.documentURI + "\n");
      }
      
    }

    if (replacements) {
      if (this.isJSEnabled(this.getSite(document.URL))) this.patchObjects(document);
      this.delayExec(this.createPlaceholders, 0, replacements, pluginExtras, document);
    }
  },
  
  get _objectPatch() {
    delete this._objectPatch;
    return this._objectPatch = "(" + function() {
      const els = document.getElementsByClassName("__noscriptObjectPatchMe__");
      const DUMMYFUNC = function() {};
      var el;
      for (var j = els.length; j-- > 0;) {
        el = els[j];
        el.setAttribute("class",
          el.getAttribute("class").replace(/\b__noscriptObjectPatchMe__\b/, '').replace(/\s+/, ' ')
        );
        el.__noSuchMethod__ = DUMMYFUNC;
      }
    }.toSource() + ")()";
  },
  
  patchObjects: function(document) {
    delete this.patchObjects;
    return (this.patchObjects = ("getElementsByClassName" in document)
      ? function(document) { ScriptSurrogate.executeDOM(document, this._objectPatch); }
      : DUMMYFUNC).call(this, document);
  },
  
  createPlaceholders: function(replacements, pluginExtras, document) {
    for each (var r in replacements) {
      try {
        if (r.extras.pluginDocument) {
          this.setPluginExtras(r.object, null);
          if (r.object.parentNode) r.object.parentNode.insertBefore(r.placeholder, r.object);
        } else {
          if (r.object.parentNode) r.object.parentNode.replaceChild(r.placeholder, r.object);
        }
        r.extras.placeholder = r.placeholder;
        this._collectPluginExtras(pluginExtras, r.extras);
       
        ns.patchObjects(document);
      } catch(e) {
        this.dump(e);
      }
    }
    this.syncUI(document);
  },
  
  bind: function(f) {
    return "_bound" in f ? f._bound : f._bound = (function() { return f.apply(ns, arguments); });
  },
  
  stackIsMine: function() {
    var s = Components.stack.caller;
    while((s = s.caller)) {
      if (s.filename && !/^chrome:\/\/noscript\/content\//.test(s.filename)) return false;
    }
    return true;
  },
  
  onPlaceholderClick: function(ev, anchor) {
    if (ev.button || !this.stackIsMine()) return;
    anchor = anchor || ev.currentTarget
    const object = this.getExpando(anchor, "removedNode");
    
    if (object) try {
      if (ev.shiftKey) {
        anchor.style.display = "none";
        anchor.id = anchor.className = "";
        return;
      }
      this.checkAndEnablePlaceholder(anchor, object);
    } finally {
      ev.preventDefault();
      ev.stopPropagation();
    }
  },
  
  onOverlayedPlaceholderClick: function(ev) {
    var el = ev.originalTarget;
    var d = el.ownerDocument;
    var style = d.defaultView.getComputedStyle(el, "");
    if (style.position == "absolute") {
      var pluginExtras = this.findPluginExtras(d);
      if (!pluginExtras) return;
      var p = { x: ev.clientX, y: ev.clientY };
      for (var j = pluginExtras.length; j-- > 0;) {
        pe = pluginExtras[j];
        if (pe.placeholder) try {
          if (DOM.elementContainsPoint(pe.placeholder, p)) {
            var object = this.getExpando(pe.placeholder, "removedNode");
            if (object && !(object instanceof CI.nsIDOMHTMLAnchorElement))
              this.setExpando(object, "overlay", el);
            this.onPlaceholderClick(ev, pe.placeholder);
            return;
          }
        } catch(e) {
          if (ns.consoleDump) ns.dump(e);
        }
      }
    }
  },
  
  checkAndEnablePlaceholder: function(anchor, object) {
    if (!(object || (object = this.getExpando(anchor, "removedNode")))) {
      if (ns.consoleDump) ns.dump("Missing node on placeholder!");
      return;
    }
    
    if (ns.consoleDump) ns.dump("Enabling node from placeholder...");
    
    const extras = this.getPluginExtras(anchor);
    const browser = DOM.findBrowserForNode(anchor);
 
    if (!(extras && extras.url && extras.mime // && cache
      )) return;
   
    this.delayExec(this.checkAndEnableObject, 1,
      {
        browser: browser,
        window: browser.ownerDocument.defaultView,
        extras: extras,
        anchor: anchor,
        object: object
      });
  },
  
  confirmEnableObject: function(win, extras) {
    return extras.skipConfirmation || win.noscriptUtil.confirm(
      this.getAllowObjectMessage(extras), 
      "confirmUnblock"
    );
  },
  
  isLegacyFrameDocument: function(doc) {
    return (doc.defaultView.frameElement instanceof CI.nsIDOMHTMLFrameElement) && this.isPluginDocumentURL(doc.URL, "iframe");
  },
  isLegacyFrameReplacement: function(obj) {
     return (obj instanceof CI.nsIDOMHTMLIFrameElement || obj instanceof CI.nsIDOMHTMLAnchorElement) &&
           (obj.ownerDocument.defaultView.frameElement instanceof CI.nsIDOMHTMLFrameElement) &&
           obj.ownerDocument.URL == this.createPluginDocumentURL(obj.src || obj.href, "iframe");
  },
  
  checkAndEnableObject: function(ctx) {
    var extras = ctx.extras;
    if (this.confirmEnableObject(ctx.window, extras)) {

      var mime = extras.mime;
      var url = extras.url;
      
      this.allowObject(url, mime, extras.originSite);
      var doc = ctx.anchor.ownerDocument;
      
      var isLegacyFrame = this.isLegacyFrameReplacement(ctx.object);
       
      if (isLegacyFrame || (mime == doc.contentType && 
          (ctx.anchor == doc.body.firstChild && 
           ctx.anchor == doc.body.lastChild ||
           (ctx.object instanceof CI.nsIDOMHTMLEmbedElement) && ctx.object.src != url))
        ) { // stand-alone plugin or frame
          doc.body.removeChild(ctx.anchor); // TODO: add a throbber
          if (isLegacyFrame) {
            this.setExpando(doc.defaultView.frameElement, "allowed", true);
            // doc.defaultView.frameElement.src = url;
            doc.defaultView.location.replace(url);
          } else this.quickReload(doc.defaultView, true);
      } else if (this.requireReloadRegExp && this.requireReloadRegExp.test(mime) || this.getExpando(ctx, "requiresReload")) {
        this.quickReload(doc.defaultView);
      } else if (this.getExpando(ctx, "silverlight")) {
        this.allowObject(doc.documentURI, mime);
        this.quickReload(doc.defaultView);
      } else {
        this.setExpando(ctx.anchor, "removedNode", null);
        extras.allowed = true;
        extras.placeholder = null;
        this.delayExec(function() {
          try {
           
            var jsEnabled = ns.isJSEnabled(ns.getSite(doc.documentURI));
            var obj = ctx.object.cloneNode(true);
            
            function reload() {
              ns.allowObjectById(obj.id, url, doc.documentURI, mime);
              ns.quickReload(doc.defaultView);
            }
            
            var isMedia = ("nsIDOMHTMLVideoElement" in CI) && (obj instanceof CI.nsIDOMHTMLVideoElement || obj instanceof CI.nsIDOMHTMLAudioElement);
            
            if (isMedia) {
              if (jsEnabled && !obj.controls) {
                // we must reload, since the author-provided UI likely had no chance to wire events
                reload();
                return;
              }
              obj.autoplay = true;
            }
            
            if (ctx.anchor.parentNode) {
              this.setExpando(obj, "allowed", true);
              ctx.anchor.parentNode.replaceChild(obj, ctx.anchor);
              var style = doc.defaultView.getComputedStyle(obj, '');
              if (jsEnabled && ((obj.offsetWidth || parseInt(style.width)) < 2 || (obj.offsetHeight || parseInt(style.height)) < 2))
                Thread.delay(function() {
                  if (obj.offsetWidth < 2 || obj.offsetHeight < 2) reload();
                }, 500); // warning, asap() or timeout=0 won't always work!
              ns.syncUI(doc);
            } else {
              reload();
            }
            
          } finally {
            ctx = null;
          }
        }, 10);
        return;
      }
    }
    ctx = null;
  },

  getSites: function(browser) {
    var sites = [];
    sites.scriptCount = 0;
    sites.pluginCount = 0;
    sites.pluginExtras = [];
    sites.pluginSites = [];
    sites.docSites = [];
    try {
      sites = this._enumerateSites(browser, sites);
    } catch(ex) {
      if (this.consoleDump) this.dump("Error enumerating sites: " + ex + "," + ex.stack);
    }
    return sites;
  },
  
  
  _collectPluginExtras: function(pluginExtras, extras) {
    for (var e, j = pluginExtras.length; j-- > 0;) {
      e = pluginExtras[j];
      if (e == extras) return false;
      if (e.mime == extras.mime && e.url == extras.url) {
        if (!e.placeholder) {
          pluginExtras.splice(j, 1, extras);
          return true;
        }
        if (e.placeholder == extras.placeholder)
          return false;
      }
    }
    pluginExtras.push(extras);
    return true;
  },
  
  _silverlightPatch: function() {
    HTMLObjectElement.prototype.__defineGetter__("IsVersionSupported", function() {
      return (/^application\/x-silverlight\b/.test(this.type))
        ? function(n) { return true; } : undefined;
    });
  }.toSource(),
  
  _flashPatch: function() {
    var type = "application/x-shockwave-flash";
    var ver;
    var setAttribute = HTMLObjectElement.prototype.setAttribute;
    HTMLObjectElement.prototype.setAttribute = function(n, v) {
      if (n == "type" && v == type && !this.data) {
        this._pendingType = v;
        
       
        this.SetVariable = function() {}; // can't use DUMMYFUNC, we're in content context
        this.GetVariable = function(n) {
          if (n !== "$version") return undefined;
          
          if (!ver) {
            ver = navigator.plugins["Shockwave Flash"]
              .description.match(/(\d+)\.(\d+)(?:\s*r(\d+))?/); 
            ver.shift();
            ver.push('99');
            ver = "WIN " + ver.join(",");
          }
          
          return ver;
        }
      }
      
      setAttribute.call(this, n, v);
      if (n === "data" && ("_pendingType" in this) && this._pendingType === type) {
        setAttribute.call(this, "type", type);
        this._pendingType = null;
      }
    };

  }.toSource(),
  
  applyPluginPatches: function(doc) {
    try {
      if (this.getExpando(doc, "pluginPatches")) return;
      this.setExpando(doc, "pluginPatches", true);
      
      if (!this.isJSEnabled(this.getSite(doc.URL)))
        return;
          
      var patches;
      
      if (this.forbidFlash && this.flashPatch) {
        (patches = patches || []).push(this._flashPatch);
        if (this.consoleDump & LOG_CONTENT_BLOCK) this.dump("Patching HTMLObject for SWFObject compatibility.");
      }
      if (this.forbidSilverlight && this.silverlightPatch) {
        (patches = patches || []).push(this._silverlightPatch);
        if (this.consoleDump & LOG_CONTENT_BLOCK) this.dump("Patching HTMLObject for Silverlight compatibility.");
      }
      
      if (!patches) return;

      ScriptSurrogate.executeDOM(doc, "(" + patches.join(")();(") + ")();");
    } catch(e) {
       if (this.consoleDump) this.dump(e + ", " + e.stack);
    }
  },
  
  _attachSilverlightExtras: function(embed, extras) {
    extras.silverlight = true;
    var pluginExtras = this.findPluginExtras(embed.ownerDocument);
    if (this._collectPluginExtras(pluginExtras, extras)) {
      extras.site = this.getSite(extras.url);
      try {
        // try to work around the IsInstalled() Silverlight machinery
        if (!embed.firstChild) { // dummy embed
          exras.dummy = true;
          return null;
        }
        extras.dummy = false;
      } catch(e) {
        if(this.consoleDump) this.dump(e);
      }
    }
    return embed;
  },
  
  
  traverseObjects: function(callback, self, browser) {
    return this.traverseDocShells(function(docShell) {
      let document = docShell.document;
      if (document) {
        for each (let t in ["object", "embed"]) {
          for each (let node in Array.slice(document.getElementsByTagName(t), 0)) {
            if (callback.call(self, node, browser))
              return true;
          }
        };
      }
      return false;
    }, self, browser);
  },
  
  traverseDocShells: function(callback, self, browser) {
    if (!browser) {
      const bi = DOM.createBrowserIterator(); 
      while((browser = bi.next()))
        if (this.traverseDocShells(callback, self, browser))
          return true;
      
      return false;
    }
    
    const docShells = browser.docShell.getDocShellEnumerator(
        CI.nsIDocShellTreeItem.typeContent,
        browser.docShell.ENUMERATE_FORWARDS
    );
    
    const nsIDocShell = CI.nsIDocShell;
    const nsIWebNavigation = CI.nsIWebNavigation;

    while (docShells.hasMoreElements()) {
      let docShell = docShells.getNext();
      if (docShell instanceof nsIDocShell && docShell instanceof nsIWebNavigation) {
        try {
          if (callback.call(self, docShell))
            return true;
        } catch (e) {
          if (this.consoleDump) this.dump("Error while traversing docshells: " + e + ", " + e.stack);
        }
      }
    }
    return false;
  },
  
  _enumerateSites: function(browser, sites) {

    const nsIDocShell = CI.nsIDocShell;
    const nsIWebProgress = CI.nsIWebProgress;
    
    var top;
    
    this.traverseDocShells(function(docShell) {
    
      let document = docShell.document;
      if (!document) return;
      
      // Truncate title as needed
      if (this.truncateTitle && document.title.length > this.truncateTitleLen) {
        document.title = document.title.substring(0, this.truncateTitleLen);
      }
      
      // Collect document / cached plugin URLs
      let win = document.defaultView;
      let docURI = docURI = document.documentURI;
      let url = this.getSite(docURI);
      
      if (url) {
        try {
          let domain = document.domain
          if (domain && domain != this.getDomain(url, true) && url != "chrome:" && url != "about:blank") {
           // temporary allow changed document.domain on allow page
            if (this.getExpando(browser, "allowPageURL") == browser.docShell.currentURI.spec &&
                this.getBaseDomain(domain).length >= domain.length &&
                !(this.isJSEnabled(domain) || this.isUntrusted(domain))) {
             this.setTemp(domain, true);
             this.setJSEnabled(domain, true);
             this.quickReload(win);
           }
           sites.unshift(domain);
          }
        } catch(e) {}
        
        sites.docSites.push(url);
        sites.push(url);

        for each(let redir in this.getRedirCache(browser, docURI)) {
          sites.push(redir.site);
        }
      }

      let domLoaded = !!this.getExpando(document, "contentLoaded");
      
      if (win === (top || (top = win.top))) {
        sites.topSite = url;
        if (domLoaded) this.setExpando(browser, "allowPageURL", null);
      }

      let loaded = !((docShell instanceof nsIWebProgress) && docShell.isLoadingDocument);
      if (!(domLoaded || loaded))
        return;
      
      this.processObjectElements(document, sites);
      this.processScriptElements(document, sites, url);
      
    }, this, browser);

    let document = top.document;
    let cache = this.getExpando(document, "objectSites");
    if(cache) {
      if(this.consoleDump & LOG_CONTENT_INTERCEPT) {
        try { // calling toSource() can throw unexpected exceptions
          this.dump("Adding plugin sites: " + cache.toSource() + " to " + sites.toSource());
        } catch(e) {
          this.dump("Adding " + cache.length + " cached plugin sites");
        }
      }
      if (!this.contentBlocker || this.alwaysShowObjectSources)
        sites.push.apply(sites, cache);
      
      sites.push.apply(sites.pluginSites, cache);
    }
    
    cache = this.getExpando(document, "codeSites");
    if(cache) sites.push.apply(sites, cache);

    const removeBlank = !(this.showBlankSources || sites.topSite == "about:blank");
    
    for (let j = sites.length; j-- > 0;) {
      let url = sites[j];
      if (/:/.test(url) &&
          (removeBlank && url == "about:blank" ||
            !(
              /^(?:file:\/\/|[a-z]+:\/*[^\/\s]+)/.test(url) ||
             // doesn't this URL type support host?
              this.getSite(url + "x") == url
            )
          ) && url != "about:"
        ) {
        sites.splice(j, 1); // reject scheme-only URLs
      }
    }
    
    
    if (!sites.topSite) sites.topSite = sites[0] || '';
    
    return this.sortedSiteSet(sites); 
  },
  
  findOverlay: function(browser) {
    return browser && browser.ownerDocument.defaultView.noscriptOverlay;
  },
  

  // nsIChannelEventSink implementation
  asyncOnChannelRedirect: function(oldChan, newChan, flags, redirectCallback) {
    this.onChannelRedirect(oldChan, newChan, flags);
    redirectCallback.onRedirectVerifyCallback(0);
  },
  onChannelRedirect: function(oldChan, newChan, flags) {
    const rw = this.requestWatchdog;
    const uri = newChan.URI;
    
    HTTPS.forceChannel(newChan);
    
    IOUtil.attachToChannel(newChan, "noscript.redirectFrom", oldChan.URI);
    
    ABE.updateRedirectChain(oldChan, newChan);
    
    const ph = PolicyState.detach(oldChan);
    try {
      if (ph) {
        // 0: aContentType, 1: aContentLocation, 2: aRequestOrigin, 3: aContext, 4: aMimeTypeGuess, 5: aInternalCall
        
        ph.contentLocation = uri;
        
        var ctx = ph.context;
        var type = ph.contentType;
           
        if (type != 11 && !this.isJSEnabled(oldChan.URI.spec)) 
          ph.requestOrigin = oldChan.URI;
        
        try {
          ph.mimeType = newChan.contentType || oldChan.contentType || ph.mimeType;
        } catch(e) {}
        
        var browser, win;
     
        
        if(type == 2 || type == 9) { // script redirection? cache site for menu
          try {
            var site = this.getSite(uri.spec);
            win = IOUtil.findWindow(newChan) || ctx && ((ctx instanceof CI.nsIDOMWindow) ? ctx : ctx.ownerDocument.defaultView); 
            browser = win && DOM.findBrowserForNode(win);
            if (browser) {
              this.getRedirCache(browser, win.top.document.documentURI)
                  .push({ site: site, type: type });
            } else {
              if (this.consoleDump) this.dump("Cannot find window for " + uri.spec);
            }
          } catch(e) {
            if (this.consoleDump) this.dump(e);
          }
          
          if (type == 7) {
            ph.extra = CP_FRAMECHECK;
            if (win && win.frameElement && ph.context != win.frameElement) {
              // this shouldn't happen
              if (this.consoleDump) this.dump("Redirected frame change for destination " + uri.spec);
              ph.context = win.frameElement;
            }
          }
          
        }
        
        if (this.shouldLoad.apply(this, ph.toArray()) != CP_OK) {
          if (this.consoleDump) {
            this.dump("Blocked " + oldChan.URI.spec + " -> " + uri.spec + " redirection of type " + type);
          }
          throw "NoScript aborted redirection to " + uri.spec;
        }
        
        PolicyState.save(uri, ph);
      }
    } finally {
      PolicyState.reset();
    }
    
    // Document transitions
  
    if ((oldChan.loadFlags & rw.DOCUMENT_LOAD_FLAGS) || (newChan.loadFlags & rw.DOCUMENT_LOAD_FLAGS) && oldChan.URI.prePath != uri.prePath) {
      if (newChan instanceof CI.nsIHttpChannel)
        HTTPS.onCrossSiteRequest(newChan, oldChan.URI.spec,
                               browser || DOM.findBrowserForNode(IOUtil.findWindow(oldChan)), rw);
      
      // docshell JS state management
      win = win || IOUtil.findWindow(oldChan);
      this._handleDocJS2(win, oldChan);
      this._handleDocJS1(win, newChan);
    }
    
  },
  
  getRedirCache: function(browser, uri) {
    var redirCache = this.getExpando(browser, "redirCache", {});
    return redirCache[uri] || (redirCache[uri] = []);
  },
  
  recentlyBlocked: [],
  _recentlyBlockedMax: 40,
  recordBlocked: function(site, origin) {
    const l = this.recentlyBlocked;
    let pos = l.length;
    while (pos-- > 0) if (l[pos].site === site) break;
    
    let entry;
    if (pos > -1) {
      entry = l[pos];
      origins = entry.origins;
      if (origins.indexOf(origin) == -1) origins.push(origin);
      if (pos == l.length - 1) return;
      l.splice(pos, 1);
    } else entry = { site: site, origins: [origin] };
    
    l.push(entry);
    if (l.length > this._recentlyBlockedMax) {
      this.recentlyBlocked = l.slice(- this._recentlyBlockedMax / 2);
    }
  },
  
  // nsIWebProgressListener implementation
  onLinkIconAvailable: DUMMYFUNC, // tabbrowser.xml bug?
  onStateChange: function(wp, req, stateFlags, status) {
    var ph;
    
    if (stateFlags & WP_STATE_START) {
      if (req instanceof CI.nsIChannel) { 
        // handle docshell JS switching and other early duties

        if (PolicyState.isChecking(req.URI)) {
          // ContentPolicy couldn't complete! DOS attack?
          PolicyState.removeCheck(req.URI);
          IOUtil.abort(req);
          ns.log("Aborted " + req.name + " on start, possible DOS attack against content policy.");
          return;
        }
        
        
        if ((stateFlags & WP_STATE_START_DOC) == WP_STATE_START_DOC) {
          if (req.URI.spec == "about:blank" && !IOUtil.extractInternalReferrer(req) ) {
           // new tab, we shouldn't touch its window otherwise we break stuff like newTabURL
           return;
          }
          
          // ns.dump(req.URI.spec + " state " + stateFlags + ", " + req.loadFlags +  ", pending " + req.isPending());
          
          var w = wp.DOMWindow;
          
          if (w) {
            
            if (w != w.top && w.frameElement) {
              ph = ph || PolicyState.extract(req);
              if (ph && this.shouldLoad(7, req.URI, ph.requestOrigin, w.frameElement, '', CP_FRAMECHECK) != CP_OK) { // late frame/iframe check
                IOUtil.abort(req);
                return;
              }
            }

            this._handleDocJS1(w, req);
            
          }
  
        } else try {

          ph = ph || PolicyState.extract(req); 
          
          if (!ph && req instanceof CI.nsIHttpChannel && wp.DOMWindow.document instanceof CI.nsIDOMXULDocument
                  && !/^(?:chrome|resource):/i.test(wp.DOMWindow.document.documentURI)) {
            if (!this.isJSEnabled(req.URI.prePath)) {
              IOUtil.abort(req);
              if (this.consoleDump & LOG_CONTENT_BLOCK) this.dump("Aborted XUL script " + req.URI.spec);
            }
          }
        } catch(e) {}
      }
    } else if ((stateFlags & WP_STATE_STOP))  {
      // STOP REQUEST
      if (req instanceof CI.nsIHttpChannel) {
        this.cleanupRequest(req);
      
        if (status === NS_ERROR_CONNECTION_REFUSED || status === NS_ERROR_NOT_AVAILABLE ||
            status === NS_ERROR_UNKNOWN_HOST) { // evict host from DNS cache to prevent DNS rebinding
          try {
            var host = req.URI.host;
            if (host) {
              if (status === NS_ERROR_UNKNOWN_HOST) {
                DNS.invalidate(host);
              } else {
                DNS.evict(host);
              }
            }
          } catch(e) {}
        }
      }
    }
  },
  
  onLocationChange: function(wp, req, location) {
    if (req && (req instanceof CI.nsIChannel)) try {        
      this._handleDocJS2(wp.DOMWindow, req);
      
      if (this.consoleDump & LOG_JS)
        this.dump("Location Change - req.URI: " + req.URI.spec + ", window.location: " +
                (wp.DOMWindow && wp.DOMWindow.location.href) + ", location: " + location.spec);

      this.onBeforeLoad(req, wp.DOMWindow, location);
    } catch(e) {
      if (this.consoleDump) this.dump(e);
    }
  },
  onStatusChange: function(wp, req, status, msg) {
    if (status == 0x804b0003 && (req instanceof CI.nsIChannel) && !ABE.isDeferred(req)) { // DNS resolving, check if we need to clear the cache
      try {
        var host = req.URI.host;
        if (host) {
          var loadFlags = req.loadFlags;
          var cached = DNS.getCached(host);
          if (!cached || cached.expired ||
              loadFlags & LF_VALIDATE_ALWAYS ||
              loadFlags & LF_LOAD_BYPASS_ALL_CACHES) {
            if (cached) DNS.evict(host);
            
            ABE.log("Repeating ABE checks after DNS refresh for " + req.URI.spec);
            var abeReq = new ABERequest(req);
            this.requestWatchdog.handleABE(abeReq, loadFlags & req.LOAD_DOCUMENT_URI);
            
          }
        }
      } catch (e) {}
    }
  },
  onSecurityChange: DUMMYFUNC, 
  onProgressChange: DUMMYFUNC,
  onRefreshAttempted: function(wp, uri, delay, sameURI) {
    if (delay == 0 && !sameURI)
      return true; // poor man's redirection
    
    var pref = this.getPref("forbidBGRefresh");
    try {
      if (!pref || this.prefService.getBoolPref("accessibility.blockautorefresh"))
        return true; // let the browser do its thing
    } catch(e) {}
    
    var win = wp.DOMWindow;
    var currentURL = win.location.href;
    if (!this.appliesHere(pref, currentURL))
      return true;

    var browserWin = DOM.mostRecentBrowserWindow;
    if (!(browserWin && "noscriptOverlay" in browserWin))
      return true; // not a regular browser window
    
    var exceptions = new AddressMatcher(this.getPref("forbidBGRefresh.exceptions"));
    if (exceptions && exceptions.test(currentURL))
      return true;
    
    var browser = DOM.findBrowserForNode(win);
    var currentBrowser = browserWin.noscriptOverlay.currentBrowser;
    var docShell = DOM.getDocShellForWindow(win);
        
    var uiArgs = Array.slice(arguments);
    
    var ts = Date.now();
    
    if (browser == currentBrowser) {
      win.addEventListener("blur", function(ev) {
        ev.currentTarget.removeEventListener(ev.type, arguments.callee, false);
        docShell.suspendRefreshURIs();
        hookFocus(false);
      }, false);
      return true; // OK, this is the foreground tab
    }
    
    
     function hookFocus(bg) {
      ns.log("[NoScript] Blocking refresh on unfocused tab, " + currentURL + "->" + uri.spec, false);
      win.addEventListener("focus", function(ev) {
        ev.currentTarget.removeEventListener(ev.type, arguments.callee, false);
        if ((docShell instanceof CI.nsIRefreshURI) &&
            (bg || docShell.refreshPending)) {
          var toGo = Math.round((delay - (Date.now() - ts)) / 1000);
          if (toGo < 1) toGo = 1;
          docShell.setupRefreshURIFromHeader(docShell.currentURI,  toGo + ";" + uri.spec);
          docShell.resumeRefreshURIs();
        }
       
      }, false);
    }
    hookFocus(true);
    return false;
  }
  ,
  
  cleanupRequest: DUMMYFUNC,
  
  get _inclusionTypeInternalExceptions() {
    delete this._inclusionTypeInternalExceptions;
    return this._inclusionTypeInternalExceptions = new AddressMatcher("https://*.ebaystatic.com/*");
  },
  
  hasNoSniffHeader: function(channel) {
    for (let x = true, header = "X-Content-Type-Options";;) {
      try {
        return channel.getResponseHeader(header).toLowerCase() === "nosniff";
        break;
      } catch(e) {}
      if (x) {
        header = header.substring(2);
        x = false;
      } else {
        return false;
      }
    }
  },
  
  checkInclusionType: function(channel) {
    try {
      if (channel instanceof CI.nsIHttpChannel &&
          Math.round(channel.responseStatus / 100) != 3) {
        var ph = PolicyState.extract(channel);
        if (ph) {
          let ctype = ph.contentType;

          // 2 JS, 4 CSS
          if (!(ctype === 2 || ctype === 4)) return true;

          let nosniff = ns.nosniff && ctype === 2;
          
          if (nosniff) nosniff = this.hasNoSniffHeader(channel);
          
          if (!(nosniff || ns.inclusionTypeChecking))
            return true;
          
          let origin = ABE.getOriginalOrigin(channel) || ph.requestOrigin;
          
          if (nosniff || origin && this.getBaseDomain(origin.host) !== this.getBaseDomain(channel.URI.host)) {

            var mime;
            try {
              mime = channel.contentType;
            } catch (e) {
              mime = "UNKNOWN";
            }

            let okMime =
              ctype === 3
              ? !nosniff || /\bimage\//i.test(mime)
              : (ctype === 2
                ? (nosniff
                    ? /(?:script|\bjs(?:on)?)\b/i // strictest
                    : /(?:script|\b(?:js(?:on)?)|css)\b/i) // allow css mime on js
                : (PolicyUtil.isXSL(ph.context) ? /\bx[ms]l/i : /\bcss\b/i)
              ).test(mime);
            
            if (okMime) return true;
            
            let uri = channel.URI; 
            let url = uri.spec;
            

            let disposition;
            try {
              disposition = channel.getResponseHeader("Content-disposition");
            } catch(e) {}

            
            if (!disposition) {
             
              let ext;
              if (uri instanceof CI.nsIURL) {
                ext = uri.fileExtension;
                if (!ext) {
                  var m = uri.directory.match(/\.([a-z]+)\/$/);
                  if (m) ext = m[1];
                }
              } else ext = '';

              if (ext &&
                  (ctype === 2 && /^js(?:on)?$/i.test(ext) ||
                   ctype === 4 && (ext == "css" || ext == "xsl" && (PolicyUtil.isXSL(ph.context))))
                ) {
                // extension matches and not an attachment, likely OK
                return true; 
              }
              
              // extension doesn't match, let's check the mime
              
             
             if ((/^text\/.*ml$|unknown/i.test(mime) || 
                    mime === "text/plain" && !(ext && /^(?:asc|log|te?xt)$/.test(ext)) // see Apache's magic file, turning any unkown ext file containing JS style comments into text/plain
                  ) && !this.getPref("inclusionTypeChecking.checkDynamic", false)) {
                // text/html or xml or text/plain with non-text ext, let's assume a misconfigured dynamically served script/css
                if (this.consoleDump) this.dump(
                      "Warning: mime type " + mime + " for " +
                      (ctype == 2 ? "Javascript" : "CSS") + " served from " +
                     uri.spec);
                return true;
              }
            } else mime = mime + ", " + disposition;
            
            if (this._inclusionTypeInternalExceptions.test(url) ||
              new AddressMatcher(this.getPref("inclusionTypeChecking.exceptions", "")).test(url))
            return true;
            
            // every check failed, this is a fishy cross-site mistyped inclusion
           
            this.log("[NoScript] Blocking " + (nosniff ? "nosniff " : "cross-site ") +
                     (ctype === 2 ? "Javascript" : ctype === 3 ? "image" : "CSS") +
                     " served from " +
                     url +
                     " with wrong type info " + mime + " and included by " + (origin && origin.spec));
            IOUtil.abort(channel);
            return false;
          }
        }
      }
    } catch(e) {
      if (this.consoleDump) this.dump("Error checking inclusion type for " + channel.name + ": " + e);
    }
    return true;
  },

  onContentSniffed: function(req) {
    try {
      let nosniff = this.nosniff && this.hasNoSniffHeader(req);
      try {
        if (!req.contentType || req.contentType === "application/x-unknown-content-type") {
          if (nosniff) nosniff = !req.getResponseHeader("Content-type");
        } else nosniff = false;

        if (this.consoleDump & LOG_SNIFF)
          this.dump("OCS: " + req.name + ", " + req.contentType);
      } catch(e) {
        this.dump("OCS: " + req.name + ", CONTENT TYPE UNAVAILABLE YET");
        if (!nosniff) return;  // we'll check later in http-on-examine-merged-response
      }
      if (nosniff) {
        try {
          req.contentType = "text/plain";
          ns.log("[NoScript] Force text/plain for missing content-type on " + req.name);
        } catch(e) {
          ns.dump(e);
        }
      }
      
      var isObject;
      
      const domWindow = IOUtil.findWindow(req);
      if (domWindow && domWindow == domWindow.top) {
        var ph = PolicyState.extract(req);
        if (!(ph && (ph.context instanceof CI.nsIDOMHTMLObjectElement)))
          return; // for top windows we call onBeforeLoad in onLocationChange
        isObject = true;
      }
      
      var status = req.responseStatus;
      if (status >= 300 && status < 400) // redirect, wait for ultimate destination, see http://forums.informaction.com/viewtopic.php?f=7&t=2630
        return;
      
      // X-Frame-Options
      if (((req.loadFlags & req.LOAD_DOCUMENT_URI) || // must be a subdocument
            isObject && /\b(?:text|xml|html)\b/.test(req.contentType)) &&
          ABE.checkFrameOpt(domWindow, req) &&
          this.getPref("frameOptions.enabled") &&
          !new AddressMatcher("about: chrome: resource: " + this.getPref("frameOptions.parentWhitelist"))
            .test(domWindow.parent.location.href)
          ) {
        IOUtil.abort(req);
        this.showFrameOptError(domWindow, req.URI.spec);
        return; // canceled by frame options
      }
      
      if (!isObject) this.onBeforeLoad(req, domWindow, req.URI);
      
    } catch(e) {
      if (this.consoleDump) this.dump(e);
    }
  },
  
  loadErrorPage: function(w, errPageURL) {
    DOM.getDocShellForWindow(w).loadURI(errPageURL,
      ((this.geckoVersionCheck("1.9.1") < 0 ? 0x8000 : 0x0001) << 16) | 1,
      null, null, null);
  },
  
  showFrameOptError: function(w, url) {
    this.log("X-FRAME-OPTIONS: blocked " + url, true);
    var f = w && w.frameElement;
    if (!f) return;
    
    var browser = DOM.findBrowserForNode(w);
    if (browser)
      this.getRedirCache(browser, w.top.document.documentURI).push({site: this.getSite(url), type: 7});
    
    const errPageURL = this.contentBase + "frameOptErr.xhtml";
    f.addEventListener("load", function(ev) {
      f.removeEventListener(ev.type, arguments.callee, false);
      if (f.contentWindow && errPageURL == f.contentWindow.location.href)
        f.contentWindow.document.getElementById("link")
          .setAttribute("href", url);
    }, false);
    
    this.loadErrorPage(w, errPageURL);
  },

  
  onBeforeLoad: function(req, domWindow, location) {
    
    if (!domWindow) return;
    
    const uri = location;
    
    var docShell = null;
    
     
    var contentType;
    try {
      contentType = req.contentType;
    } catch(e) {
      contentType = "";
    }
    
    var contentDisposition = "";
    
    var isHTTP = req instanceof CI.nsIHttpChannel
    
    if (isHTTP) {
      
      try {
        contentDisposition = req.getResponseHeader("Content-disposition");
      } catch(e) {}
      

      if (domWindow.document)
        this.filterUTF7(req, domWindow, docShell = DOM.getDocShellForWindow(domWindow)); 
    }
    
    const topWin = domWindow == domWindow.top;

    var browser = null;
    var overlay = null;
    var xssInfo = null;
    

    if (topWin) {
      
      if (domWindow instanceof CI.nsIDOMChromeWindow) return;
    
      browser = DOM.findBrowserForNode(domWindow);
      overlay = this.findOverlay(browser);
      if (overlay) {
        overlay.setMetaRefreshInfo(null, browser);
        if (isHTTP) {
          xssInfo = IOUtil.extractFromChannel(req, "noscript.XSS");
          if (xssInfo) xssInfo.browser = browser;
          this.requestWatchdog.unsafeReload(browser, false);
          if (!this.getExpando(browser, "clearClick")) {
            this.setExpando(browser, "clearClick", true);
            this.clearClickHandler.install(browser);
          }
        }
      }
    }
    
    if (this.onWindowSwitch && docShell &&
        (topWin || !this.executeEarlyScripts))
      this.onWindowSwitch(uri.spec, domWindow, docShell);
      
    
    

    if (!/^attachment\b/i.test(contentDisposition) &&
        this.shouldLoad(7, uri, uri, domWindow.frameElement || domWindow, contentType,
                        domWindow.frameElement ? CP_FRAMECHECK : CP_SHOULDPROCESS) != CP_OK) {
      
      req.loadFlags |= req.INHIBIT_CACHING;
      
      if (this.consoleDump & LOG_CONTENT_INTERCEPT)
        this.dump("Media document content type detected");

      if(!topWin) {
        // check if this is an iframe
        
        if (domWindow.frameElement && !(domWindow.frameElement instanceof CI.nsIDOMHTMLFrameElement)
            && this.shouldLoad(5, uri, IOS.newURI(domWindow.parent.location.href, null, null),
                domWindow.frameElement, contentType, CP_SHOULDPROCESS) == CP_OK)
            return;
        
        if (this.consoleDump & LOG_CONTENT_BLOCK) 
          this.dump("Deferring framed media document");
        
        var url = uri.spec;
        
        browser = browser || DOM.findBrowserForNode(domWindow);
        this.getRedirCache(browser, domWindow.top.document.documentURI).push({site: this.getSite(url), type: 7});
        // defer separate embed processing for frames
        
        
       
        docShell = docShell || DOM.getDocShellForWindow(domWindow);
        docShell.loadURI("data:" + req.contentType + ",",
                             CI.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY,
                             null, null, null);
        Thread.asap(function() {
          IOUtil.abort(req);
          if (docShell) {
            var doc = docShell.document;
            docShell.stop(0);
            docShell.loadURI(ns.createPluginDocumentURL(url,
              doc.body && doc.body.firstChild && doc.body.firstChild.tagName),
                             CI.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY,
                             null, null, null);
          }
        });
        
        return;
      }
      
      if (this.consoleDump & LOG_CONTENT_BLOCK) 
        this.dump("Blocking top-level plugin document");

      IOUtil.abort(req);
      
      
      ["embed", "video", "audio"].forEach(function(tag) {
        var embeds = domWindow.document.getElementsByTagName(tag);
        var eType = "application/x-noscript-blocked";
        var eURL = "data:" + eType + ",";
        var e;
        for (var j = embeds.length; j-- > 0;) {
          e = embeds.item(j);
          if (this.shouldLoad(5, uri, null, e, contentType, CP_SHOULDPROCESS) != CP_OK) {
            e.src = eURL;
            e.type = eType;
          }
        }
      }, this);
      
      if (xssInfo) overlay.notifyXSS(xssInfo);
      
      return;

    } else {
      if (topWin) {
        if (xssInfo) overlay.notifyXSSOnLoad(xssInfo);
      }
    }
  },
  
  hasClearClickHandler: false,
  get clearClickHandler() {
      delete this.clearClickHandler;
      this.hasClearClickHandler = true;
      return this.clearClickHandler = new ClearClickHandler(this);
  },
  
  _handleDocJS1: function(win, req) {
    
    const abeSandboxed = (req instanceof CI.nsIHttpChannel) && ABE.isSandboxed(req);
    const docShellJSBlocking = this.docShellJSBlocking || abeSandboxed;
        
    if (!docShellJSBlocking || (win instanceof CI.nsIDOMChromeWindow)) return;

    try {
      
      var docShell = DOM.getDocShellForWindow(win) ||
                     DOM.getDocShellForWindow(IOUtil.findWindow(req));
      
      var url = req.URI.spec;
      if (!/^https?:/.test(url)) url = req.originalURI.spec;

      if (!docShell) {
        if (this.consoleDump) this.dump("DocShell not found for JS switching in " + url);
        return;
      }
      
      if (abeSandboxed) {
        ABE.sandbox(docShell);
        return;
      }
      
      var jsEnabled;
      if (docShellJSBlocking & 2) { // block not whitelisted
        jsEnabled = url && this.isJSEnabled(this.getSite(url)) || /^about:/.test(url);
      } else if (docShellJSBlocking & 1) { // block untrusted only
        var site = this.getSite(url);
        jsEnabled = !(this.isUntrusted(site) || this.isForbiddenByHttpsStatus(site));
      } else return;
      
      const dump = this.consoleDump & LOG_JS;
      const prevStatus = docShell.allowJavascript;
      
      // Trying to be kind with other docShell-level blocking apps (such as Tab Mix Plus), we
      // check if we're the ones who actually blocked this docShell, or if this channel is out of our control
      var prevBlocked = this.getExpando(win.document, "prevBlocked");
      prevBlocked = prevBlocked ? prevBlocked.value : "?";

      if (dump)
        this.dump("DocShell JS Switch: " + url + " - " + jsEnabled + "/" + prevStatus + "/" + prevBlocked);
      
      if (jsEnabled && !prevStatus) {
        
        // be nice with other blockers
        if (!prevBlocked) return;
        
        // purge body events
        try {
          var aa = win.document.body && win.document.body.attributes;
          if (aa) for (var j = aa.length; j-- > 0;) {
            if(/^on/i.test(aa[j].name)) aa[j].value = "";
          }
        } catch(e1) {
          if (this.consoleDump & LOG_JS)
            this.dump("Error purging body attributes: " + e2);
        }
      }
      let dsjsBlocked = { value: // !jsEnabled && (prevBlocked || prevStatus)
                        // we're the cause of the current disablement if
                        // we're disabling and (was already blocked by us or was not blocked)
                        !(jsEnabled || !(prevBlocked || prevStatus)) // De Morgan for the above, i.e.
                        // we're the cause of the current disablement unless
                        // we're enabling or (was already blocked by someone else = was not (blocked by us or enabled))
                        // we prefer the latter because it coerces to boolean
                };
      dsjsBlocked.wrappedJSObject = dsjsBlocked;
      IOUtil.attachToChannel(req, "noscript.dsjsBlocked", dsjsBlocked);
      
      docShell.allowJavascript = jsEnabled;
    } catch(e2) {
      if (this.consoleDump & LOG_JS)
        this.dump("Error switching docShell JS: " + e2);
    }
  },
  
  _handleDocJS2: function(win, req) {
    // called at the beginning of onLocationChange
    if (win)
      this.setExpando(win.document, "prevBlocked",
        IOUtil.extractFromChannel(req, "noscript.dsjsBlocked")
      );
  },
  
  _pageModMaskRx: /^(?:chrome|resource|view-source):/,
  onWindowSwitch: function(url, win, docShell) {
    const doc = docShell.document;
    const flag = "__noScriptEarlyScripts__";
    if (flag in doc && doc[flag] === url) return;
    doc[flag] = url;
    
    const site = this.getSite(url);
    var jsBlocked = !(docShell.allowJavascript && (this.jsEnabled || this.isJSEnabled(site)));
    
    if (!((docShell instanceof CI.nsIWebProgress) && docShell.isLoadingDocument)) {
      // likely a document.open() page
      url = "wyciwyg:";// don't execute on document.open() pages with a misleading URL
      jsBlocked = false;
    }
    
    if (this._pageModMaskRx.test(url)) return; 
    
    var scripts;
    
    if (jsBlocked) {
      if (this.getPref("fixLinks")) {
        const newWin = doc.defaultView;
        newWin.addEventListener("click", this.bind(this.onContentClick), true);
        newWin.addEventListener("change", this.bind(this.onContentChange), true);
      }
    } else {
    
      if (this.implementToStaticHTML && !("toStaticHTML" in doc.defaultView)) {
        scripts = [this._toStaticHTMLDef];
        doc.addEventListener("NoScript:toStaticHTML", this._toStaticHTMLHandler, false, true);
      }
      
      if (this.contentBlocker && this.liveConnectInterception && this.forbidJava &&
          !this.isAllowedObject(site, "application/x-java-vm", site)) {
        (doc.defaultView.wrappedJSObject || doc.defaultView).disablePlugins = this._disablePlugins;
        if (!scripts) scripts = [this._liveConnectInterceptionDef];
        else scripts.push(this._liveConnectInterceptionDef);
      }
      
      try {
        if(this.jsHackRegExp && this.jsHack && this.jsHackRegExp.test(url)) {
          if (!scripts) scripts = [this.jsHack];
          else scripts.push(this.jsHack);
        }
      } catch(e) {}
    
    }
    
    ScriptSurrogate.apply(doc, url, url, jsBlocked, scripts);
    
  },
  
  beforeScripting: function(subj, url) {
    this.executeEarlyScripts = this.onWindowSwitch;
    // replace legacy code paths
    if (subj.defaultView) { // we got document element inserted
      OS.removeObserver(this, "content-document-global-created");
      this.onWindowSwitch = null;
    } 
    this.beforeScripting = this._beforeScriptingReal;
    this.beforeScripting(subj, url);
  },
  _beforeScriptingReal: function(subj, url) {
    const win = subj.defaultView || subj;
    const docShell = this.dom.getDocShellForWindow(win);
    if (docShell) this.executeEarlyScripts(docShell.document.documentURI, win, docShell);
  },
  
  
  get unescapeHTML() {
    delete this.unescapeHTML;
    return this.unescapeHTML = CC["@mozilla.org/feed-unescapehtml;1"].getService(CI.nsIScriptableUnescapeHTML)
  },
  
  get implementToStaticHTML() {
    delete this.implementToStaticHTML;
    return this.implementToStaticHTML = this.getPref("toStaticHTML");
  },
  
  _toStaticHTMLHandler:  function(ev) {
    try {
      var t = ev.target;
      var doc = t.ownerDocument;
      t.parentNode.removeChild(t);
      var s = t.getAttribute("data-source");
      t.appendChild(ns.unescapeHTML.parseFragment(s, false, null, t));
      // remove attributes from forms
      var f, a;
      for each (f in Array.slice(t.getElementsByTagName("form"))) {
        for each(a in Array.slice(f.attributes)) {
          f.removeAttribute(a.name);
        }
      }
    } catch(e){ if (ns.consoleDump) ns.dump(e) }
  },
  get _toStaticHTMLDef() {
    delete this._toStaticHTMLDef;
    return this._toStaticHTMLDef =
    "window.toStaticHTML = " +
    (
      function toStaticHTML(s) {
        var t = document.createElement("toStaticHTML");
        t.setAttribute("data-source", s);
        document.documentElement.appendChild(t);
        var ev = document.createEvent("Events");
        ev.initEvent("NoScript:toStaticHTML", true, false);
        t.dispatchEvent(ev);
        return t.innerHTML;
      }
    ).toString();
  },
  
  liveConnectInterception: true,
  get _liveConnectInterceptionDef() {
    delete this._liveConnectInterceptionDef;
    return this._liveConnectInterceptionDef = "(" + (function() {
      const w = window;
      var dp = w.disablePlugins;
      delete w.disablePlugins;
      const g = function() {
        const d = document;
        const o = d.createElement("object");
        o.type = "application/x-java-vm";
        o.data = "data:" + o.type + ",";
        d.body.appendChild(o);
        d.body.removeChild(o);
        const k = function() {};
        w.__defineGetter__("java", k);
        w.__defineGetter__("Packages", k);
      }
      
      try {
        dp(true);
        w.__defineGetter__("java", g);
        w.__defineGetter__("Packages", g);
      } finally {
        dp(false);
      }
    }).toString()
    + ")()";
  },
  
  _disablePlugins: function(b) {
    ns.plugins.disabled = b;
  },
  
  get plugins() {
    delete this.plugins;
    INCLUDE("Plugins");
    return this.plugins = Plugins;
  },
  
  beforeManualAllow: function(win) {
    // reset prevBlock info, to forcibly allow docShell JS
    this.setExpando(win.document, "prevBlocked", { value: "m" });
  },
  
  handleErrorPage: function(win, uri) {
    win = win && win.contentWindow || win;
    if (!win) return;
    var docShell = DOM.getDocShellForWindow(win);
    if (!docShell) return;
    
    docShell.allowJavascript = true;
    
    if (!this.getPref("STS.expertErrorUI"))
      STS.patchErrorPage(docShell, uri);
  },
  
  // end nsIWebProgressListener
  
  filterUTF7: function(req, window, docShell) {
    try {
      if (!docShell) return;
      var as = CC["@mozilla.org/atom-service;1"].getService(CI.nsIAtomService);
      if(window.document.characterSet == "UTF-7" ||
        !req.contentCharset && (docShell.documentCharsetInfo.parentCharset + "") == "UTF-7") {
        if(this.consoleDump) this.dump("Neutralizing UTF-7 charset!");
        docShell.documentCharsetInfo.forcedCharset = as.getAtom("UTF-8");
        docShell.documentCharsetInfo.parentCharset = docShell.documentCharsetInfo.forcedCharset;
        docShell.reload(docShell.LOAD_FLAGS_CHARSET_CHANGE); // neded in Gecko > 1.9
      }
    } catch(e) { 
      if(this.consoleDump) this.dump("Error filtering charset on " + req.name + ": " + e) 
    }
  },
  
  _attemptNavigationInternal: function(doc, destURL, callback) {
    var cs = doc.characterSet;
    var uri = IOS.newURI(destURL, cs, IOS.newURI(doc.documentURI, cs, null));
    
    if (/^https?:\/\//i.test(destURL)) callback(doc, uri);
    else {
      var req = ns.createCheckedXHR("HEAD", uri.spec);
      var done = false;
      req.onreadystatechange = function() {
        
        if (req.readystate < 2) return;
        try {
          if (!done && req.status) {
            done = true;
            if (req.status == 200) callback(doc, uri);
            req.abort();
          }
        } catch(e) {}
      }
      req.send(null);
    }
  },
  attemptNavigation: function(doc, destURL, callback) {
    // delay is needed on Gecko < 1.9 to detach browser context
    this.delayExec(this._attemptNavigationInternal, 0, doc, destURL, callback);
  },
  
  // simulate onchange on selects if options look like URLs
  onContentChange: function(ev) {
    var s = ev.originalTarget;
    if (!(s instanceof CI.nsIDOMHTMLSelectElement) ||
        s.hasAttribute("multiple") ||
        !/open|nav|location|\bgo|load/i.test(s.getAttribute("onchange"))) return;
    
    var doc = s.ownerDocument;
    var url = doc.documentURI;
    if (this.isJSEnabled(this.getSite(url))) return;
    
    var opt = s.options[s.selectedIndex];
    if (!opt) return;
    
    if (/[\/\.]/.test(opt.value) && opt.value.indexOf("@") < 0) {
      this.attemptNavigation(doc, opt.value, function(doc, uri) {
        doc.defaultView.location.href = uri.spec;
      });
      ev.preventDefault();
    }
  },
  
  onContentClick: function(ev) {
    
    if (ev.button == 2) return;
    
    var a = ev.originalTarget;
    
    if (a.__noscriptFixed) return;
    
    var doc = a.ownerDocument;
    var url = doc.documentURI;
    if (this.isJSEnabled(this.getSite(url))) return;
    
    var onclick;
    
    while (!(a instanceof CI.nsIDOMHTMLAnchorElement || a instanceof CI.nsIDOMHTMLAreaElement)) {
      if (typeof(a.getAttribute) == "function" && (onclick = a.getAttribute("onclick"))) break;
      if (!(a = a.parentNode)) return;
    }
    
    const href = a.getAttribute("href");
    // fix JavaScript links
    var jsURL;
    if (href) {
      jsURL = /^javascript:/i.test(href);
      if (!(jsURL || href == "#")) return;
    } else {
      jsURL = "";
    }
    
    onclick = onclick || a.getAttribute("onclick");
    var fixedHref = (onclick && this.extractJSLink(onclick)) || 
                     (jsURL && this.extractJSLink(href)) || "";
    
    onclick = onclick || href;
    
    if (/\bsubmit\s*\(\s*\)/.test(onclick)) {
      var form;
      if (fixedHref) {
        form = doc.getElementById(fixedHref); // youtube
        if (!(form instanceof CI.nsIDOMHTMLFormElement)) {
          form = doc.forms.namedItem(fixedHref);   
        }
      }
      if (!form) {
        var m = onclick.match(/(?:(?:\$|document\.getElementById)\s*\(\s*["']#?([\w\-]+)[^;]+|\bdocument\s*\.\s*(?:forms)?\s*(?:\[\s*["']|\.)?([^\.\;\s"'\]]+).*)\.submit\s*\(\)/);
        form = m && (/\D/.test(m[1]) ? (doc.forms.namedItem(m[1]) || doc.getElementById(m[1])) : doc.forms.item(parseInt(m[1])));
        if (!(form && (form instanceof CI.nsIDOMHTMLFormElement))) {
          while (form = a.parentNode && form != doc && !form instanceof CI.nsIDOMHTMLFormElement);
        }
      }
      if (form && (form instanceof CI.nsIDOMHTMLFormElement)) {
        form.submit();
        ev.preventDefault();
      }
      return;
    }
    
    if (fixedHref) {
      var callback;
      if (/^(?:button|input)$/i.test(a.tagName)) { // JS button
        if (a.type == "button" || (a.type == "submit" && !a.form)) {
          callback = function(doc, uri) { doc.defaultView.location.href = uri.spec; }; 
        } else return;
      } else {
        var evClone = doc.createEvent("MouseEvents");
        evClone.initMouseEvent("click",ev.canBubble, ev.cancelable, 
                           ev.view, ev.detail, ev.screenX, ev.screenY, 
                           ev.clientX, ev.clientY, 
                           ev.ctrlKey, ev.altKey, ev.shiftKey, ev.metaKey,
                           ev.button, ev.relatedTarget);
        callback =
          function(doc, uri) {
            a.setAttribute("href", fixedHref);
            var title = a.getAttribute("title");
            a.setAttribute("title", title ? "[js] " + title : 
              (onclick || "") + " " + href
            );
            a.dispatchEvent(ev = evClone); // do not remove "ev = " -- for some reason, it works this way only :/
          };
        a.__noscriptFixed = true;
      }
      if (callback) {
        this.attemptNavigation(doc, fixedHref, callback);
        ev.preventDefault();
      }
    } else { // try processing history.go(n) //
      if(!onclick) return;
      
      jsURL = onclick.match(/history\s*\.\s*(?:go\s*\(\s*(-?\d+)\s*\)|(back|forward)\s*\(\s*)/);
      jsURL = jsURL && (jsURL = jsURL[1] || jsURL[2]) && (jsURL == "back" ? -1 : jsURL == "forward" ? 1 : jsURL); 

      if (!jsURL) return;
      // jsURL now has our relative history index, let's navigate

      var docShell = DOM.getDocShellForWindow(doc.defaultView);
      if (!docShell) return;
      var sh = docShell.sessionHistory;
      if (!sh) return;
      
      var idx = sh.index + jsURL;
      if (idx < 0 || idx >= sh.count) return; // out of history bounds 
      docShell.gotoIndex(idx);
      ev.preventDefault(); // probably not needed
    }
  },
  
  extractJSLink: function(js) {
    const findLink = /(['"])([\/\w-\?\.#%=&:@]+)\1/g;
    findLink.lastIndex = 0;
    var maxScore = -1;
    var score; 
    var m, s, href;
    while ((m = findLink.exec(js))) {
      s = m[2];
      if (/^https?:\/\//.test(s)) return s;
      score = 0;
      if (s.indexOf("/") > -1) score += 2;
      if (s.indexOf(".") > 0) score += 1;
      if (score > maxScore) {
        maxScore = score;
        href = s;
      }
    }
    return href || "";
  },
  
  createXSanitizer: function() {
    return new XSanitizer(this.filterXGetRx, this.filterXGetUserRx);
  },
  
  get externalFilters() {
    delete this.externalFilters;
    if ("nsITraceableChannel" in CI && // Fx >= 3.0 
        ("nsIProcess2" in CI || // Fx 3.5
         "runAsync" in CC["@mozilla.org/process/util;1"].createInstance(CI.nsIProcess) // Fx >= 3.6 
        )) {
      INCLUDE("ExternalFilters");
      this.externalFilters = ExternalFilters;
      this.externalFilters.initFromPrefs("noscript.ef.");
    } else this.externalFilters = { enabled: false, supported: false };
    return this.externalFilters;
  },
  
  callExternalFilters: function(ch, cached) {
    var ph = PolicyState.extract(ch);
    if (ph) {
      switch (ph.contentType) {
        case 5: case 12:
        this.externalFilters.handle(ch, ph.mimeType, ph.context, cached);
      }
    }
  },
  
  switchExternalFilter: function(filterName, domain, enabled) {
    var f = this.externalFilters.byName(filterName);
    if (!f) return;
    
    var done;
    if (enabled) {
      done = f.removeDomainException(domain);
    } else {
      done = f.addDomainException(domain);
    }
    if (!done) return;
    
    this.delayExec(this.traverseObjects, 0,
      function(p) {
        const info = this.externalFilters.getObjFilterInfo(p);
        if (!info) return;
        
        if (this.getBaseDomain(this.getDomain(info.url)) == domain) {
          this.externalFilters.log("Reloading object " + info.url);
          var anchor = p.nextSibling;
          p.parentNode.removeChild(p);
          anchor.parentNode.insertBefore(p, anchor);
        }
      }, this);
  },
  
  get compatEvernote() {
    delete this.compatEvernote;
    return this.compatEvernote = ("IWebClipper3" in CI) && this.getPref("compat.evernote") && {
      onload: function(ev) {
        var f = ev.currentTarget;
        if ((f.__evernoteLoadCount = (f.__evernoteLoadCount || 0) + 1) >= 7) {
          f.removeEventListener(ev.type, arguments.callee, false);
          var id = f.id.replace(/iframe/g, "clipper");
          for (var box = f.parentNode; box && box.id != id; box = box.parentNode);
          if (box) box.parentNode.removeChild(box);
        }
      }
    }
  },
  
  get compatGNotes() {
    delete this.compatGNotes;
    return this.compatGNotes = ("@google.com/gnotes/app-context;1" in CC) && this.getPref("compat.gnotes") &&
      "http://www.google.com/notebook/static_files/blank.html";
  },
  
  consoleService: CC["@mozilla.org/consoleservice;1"].getService(CI.nsIConsoleService),
  
  log: function(msg, dump) {
    this.consoleService.logStringMessage(msg);
    if (dump) this.dump(msg, true);
  },
  
  logError: function(e, dump, cat) {
    var se = CC["@mozilla.org/scripterror;1"].createInstance(CI.nsIScriptError);
    se.init(e.message, e.fileName, /^javascript:/i.test(e.fileName) ? e.fileName : null,
            e.lineNumber, 0, 0, cat || "Component JS");
    if (dump && this.consoleDump) this.dump(e.message, true);
    this.consoleService.logMessage(se);
  },
 
  dump: function(msg, noConsole) {
    msg = "[NoScript] " + msg;
    dump(msg + "\n");
    if(this.consoleLog && !noConsole) this.log(msg);
  },
  
  ensureUIVisibility: function() {
    const window =  DOM.mostRecentBrowserWindow;
    try {
      const document = window.document;
      const addonBar = document.getElementById("addon-bar");
      if (!addonBar) return false;
      
      const tbbId = "noscript-tbb";
      let tbb = document.getElementById(tbbId);
      if (tbb) return false;
      
      let navBar = document.getElementById("nav-bar");
      
      let [bar, refId] =
        addonBar.collapsed && navBar && !navBar.collapsed || !this.getPref("statusIcon", true)
        ? [navBar, "urlbar-container"]
        : [addonBar, "status-bar"];
      
      set = bar.currentSet.split(/\s*,\s*/);
      if (set.indexOf(tbbId) > -1) return false;
      
      set.splice(set.indexOf(refId), 0, tbbId);
      
      bar.setAttribute("currentset", bar.currentSet = set.join(","));
      document.persist(bar.id, "currentset");
      try {
        window.BrowserToolboxCustomizeDone(true);
      } catch (e) {}
      return true;
    } catch(e) {
      this.dump(e);
      return false;
    }
  },
  
  versionChecked: false,
  checkVersion: function() {
    if (this.versionChecked) return;
    this.versionChecked = true;
    
    if (!this.getPref("visibleUIChecked", false) && this.ensureUIVisibility()) {
      this.setPref("visibleUIChecked", true);
    }
    const ver =  this.VERSION;
    const prevVer = this.getPref("version", "");
    if (prevVer != ver) {
      this.setPref("version", ver);
      this.savePrefs();
      const betaRx = /(?:a|alpha|b|beta|pre|rc)\d*$/; // see http://viewvc.svn.mozilla.org/vc/addons/trunk/site/app/config/constants.php?view=markup#l431
      if (prevVer.replace(betaRx, "") != ver.replace(betaRx, "")) {
        if (this.getPref("firstRunRedirection", true)) {
          const name = EXTENSION_NAME;
          const domain = name.toLowerCase() + ".net";

          IOS.newChannel("http://" + domain + "/-", null, null).asyncOpen({ // DNS prefetch
            onStartRequest: function() {},
            onStopRequest: function() {
              var browser = DOM.mostRecentBrowserWindow.getBrowser();
              if (typeof(browser.addTab) != "function") return;
             
              
              var url = "http://" + domain + "/?ver=" + ver;
              var hh = "X-IA-Post-Install: " + name + " " + ver;
              if (prevVer) {
                url += "&prev=" + prevVer;
                hh += "; updatedFrom=" + prevVer;
              }
              hh += "\r\n";
              
              var hs = CC["@mozilla.org/io/string-input-stream;1"] .createInstance(CI.nsIStringInputStream);
              hs.setData(hh, hh.length); 
              
              
              var b = (browser.selectedTab = browser.addTab()).linkedBrowser;
              b.stop();
              b.webNavigation.loadURI(url, CI.nsIWebNavigation.LOAD_FLAGS_NONE, null, null, hs);
              
            },
            onDataAvailable: function() {}
          }, {});
        }
      }
    }
  },
  
  checkSubscriptions: function() {
    var lastCheck = this.getPref("subscription.last_check");
    var checkInterval = this.getPref("subscription.checkInterval", 24) * 60000;
    var now = Date.now();
    if (lastCheck + checkInterval > now) {
      this.delayExec(checkSubscriptions, lastCheck + checkInterval - now + 1000);
      return;
    }
    
    function load(list, process, goOn) {
      var url = ns.getPref("subscription." + list + "URL");
      if (!url) {
        goOn();
        return;
      }
      var xhr = ns.createCheckedXHR("GET", url, true);
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          if (xhr.status == 0 || xhr.status == 200) {
            var lists = xhr.responseText.split("[UNTRUSTED]");
            try {
              process(lists[0], lists[1]);
              ns.dump(list + " list at " + url + " loaded.");
            } catch(e) {
              ns.dump(e);
            }
          }
          goOn();
        }
      }
      xhr.send(null);
    }
    
    load("untrusted",
      function(trusted, untrusted) {
        ns.untrustedSites.sitesString += " " + untrusted;
        ns.persistUntrusted();
      },
      function() {
        load("trusted", function(trusted, untrusted) {
          var trustedSites = new PolicySites(trusted);
          trustedSites.remove(ns.untrustedSites.sitesList, true, false);
          ns.flushCAPS(ns.jsPolicySites.sitesString + " " + trustedSites.sitesString);
        }, function() {
          ns.setPref("subscription.lastCheck", Date.now());
          ns.savePrefs(true);
          ns.delayExec(ns.checkSubscriptions, checkInterval);
        });
      }
    );
  }
}

ns.wrappedJSObject = ns;
ns.register();
