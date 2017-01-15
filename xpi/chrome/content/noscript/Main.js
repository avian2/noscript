const CLASS_NAME="NoScript Service";
const SERVICE_CTRID = "@maone.net/noscript-service;1";
const SERVICE_ID = "{31aec909-8e86-4397-9380-63a59e0c5ff5}";
const EXTENSION_ID = "{73a6fe31-595d-460b-a920-fcc0f8843232}";

const CP_OK = 1;
const CP_REJECT = -2; // CP_REJECT_TYPE doesn't cause the -moz-suppressed CSS pseudo class to be added
const CP_NOP = () => CP_OK;
const CP_FRAMECHECK = 2;
const CP_SHOULDPROCESS = 4;
const CP_OBJECTARC = 8;
const CP_EXTERNAL = 0;

const nsIWebProgress = Ci.nsIWebProgress;
const nsIWebProgressListener = Ci.nsIWebProgressListener;
const WP_STATE_START = nsIWebProgressListener.STATE_START;
const WP_STATE_STOP = nsIWebProgressListener.STATE_STOP;
const WP_STATE_DOC = nsIWebProgressListener.STATE_IS_DOCUMENT;
const WP_STATE_START_DOC = WP_STATE_START | WP_STATE_DOC;
const WP_STATE_RESTORING = nsIWebProgressListener.STATE_RESTORING;

const LF_VALIDATE_ALWAYS = Ci.nsIRequest.VALIDATE_ALWAYS;
const LF_LOAD_BYPASS_ALL_CACHES = Ci.nsIRequest.LOAD_BYPASS_CACHE | Ci.nsICachingChannel.LOAD_BYPASS_LOCAL_CACHE;

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
const LOG_IPC = 16384;

const HTML_NS = "http://www.w3.org/1999/xhtml";

const WHERE_UNTRUSTED = 1;
const WHERE_TRUSTED = 2;
const ANYWHERE = 3;

const DUMMY_OBJ = {};
DUMMY_OBJ.wrappedJSObject = DUMMY_OBJ;
const DUMMY_FUNC = function() {};
const DUMMY_ARRAY = [];

const SERVICE_IIDS =
[
Ci.nsIContentPolicy,
Ci.nsIObserver,
Ci.nsISupportsWeakReference,
Ci.nsIChannelEventSink,
nsIWebProgressListener,
Ci.nsIWebProgressListener2,
Ci.nsIFactory
];

INCLUDE("e10sIPC", "SiteUtils", "AddressMatcher");

function nsISupportsWrapper(wrapped) {
  this.wrappedJSObject = wrapped;
}
nsISupportsWrapper.prototype = {
  QueryInterface: XPCOMUtils.generateQI([])
};

LAZY_INCLUDE(
  "Bug",
  "DNS",
  "HTTPS",
  "ScriptSurrogate",
  "DOM",
  "URIValidator",
  "ClearClickHandler",
  "ChannelReplacement",
  "WinScript",
  "JSURL",
  "IOUtil",
  "Thread",
  "SyntaxChecker",
  "RequestWatchdog",
  "InjectionChecker",
  "Entities",
  "DoNotTrack",
  "WebGLInterception",
  "MSEInterception"
);

this.__defineGetter__("ABE", function() {
  if (ns.consoleDump) ns.dump("ABE kickstart at " + (new Error().stack));
  delete this.ABE;
  INCLUDE("ABE");
  ABE.consoleDump = !!(ns.consoleDump & LOG_ABE);
  ABE.init("noscript.");
  DNS.logEnabled = ns.getPref("logDNS");
  return ABE;
});

const ns = {
  VERSION: "@VERSION@",
  classDescription: CLASS_NAME,
	classID: Components.ID(SERVICE_ID),
	contractID: SERVICE_CTRID,
  QueryInterface: XPCOMUtils.generateQI(SERVICE_IIDS),

  categoryManager: Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager),
  get ABE() { return ABE; },

  // nsIFactory implementation
  createInstance: function(outer, iid) {
    if (outer)
      throw Cr.NS_ERROR_NO_AGGREGATION;
    return this;
  },
  // nsIObserver implementation
  observe: function(subject, topic, data) {

    switch (topic) {
      case "content-document-global-created":
        this.onWindowCreated(subject, data);
        return;
      case "document-element-inserted":
        this.beforeScripting(subject, data);
        return;
    }

    if (subject instanceof Ci.nsIPrefBranch2) {
      this.syncPrefs(subject, data);
    } else {
      switch (topic) {

        case "xpcom-shutdown":
          this.shutdown();
          break;

        case "profile-before-change":
          this._disposeE10s();
          this.dispose();
          break;

        case "profile-after-change":
          try {
            this.init();
          } catch(e) {
            this.dump("Init error -- " + e + "\n" + e.stack);
          }
          break;
        case "sessionstore-windows-restored":
          ns.checkVersion();
          INCLUDE("Removal");
          break;

        case "private-browsing":
          if (data == "enter") {
            if (!("_realDump_" in this)) this._realDump_ = this.dump;
            this.dump = DUMMY_FUNC;
          }
          if (data == "exit") {
            this.eraseTemp();
            this.dump = this._realDump_ || DUMMY_FUNC;
          }
        // break;
        case "browser:purge-session-history":
          this.eraseTemp();
        break;


      }
    }
  },

  bootstrap: function(childProcess = false) {
    this.childProcess = childProcess;

    let log = msg => this.log(msg);
    INCLUDE_MIXIN(this, "MainChild");
    if (!childProcess) {
      INCLUDE_MIXIN(this, "MainParent");
    }

    try {
      IPC.autoSync(this, "Main", ["setJSEnabled", "eraseTemp", "allowObject", "resetAllowedObjects"]);
    } catch (e) {
      log(e);
    }
    this.startup();
  },

  OBSERVED_TOPICS: ["profile-before-change", "xpcom-shutdown", "profile-after-change", "sessionstore-windows-restored",
                    "browser:purge-session-history", "private-browsing",
                    "content-document-global-created", "document-element-inserted"],
  startup: function() {
    for (let topic of this.OBSERVED_TOPICS) {
      let observer = this[topic] || this;
      OS.addObserver(observer, topic, observer instanceof Ci.nsISupportsWeakReference);
    }
  },
  shutdown: function() {
    for (let topic of this.OBSERVED_TOPICS) {
      try {
        OS.removeObserver(this[topic] || this, topic);
      } catch (e) {}
    }
  },

  // Preference driven properties
  autoAllow: false,

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

  forbidJava: true,
  forbidFlash: true,
  forbidPlugins: true,
  forbidMedia: true,
  forbidFonts: true,
  forbidWebGL: false,
  forbidIFrames: false,
  forbidIFramesContext: 2, // 0 = all iframes, 1 = different site, 2 = different domain, 3 = different base domain
  forbidFrames: false,

  alwaysBlockUntrustedContent: true,

  forbidXBL: 4,
  forbidXHR: 1,
  injectionCheck: 2,
  injectionCheckSubframes: true,

  jsredirectIgnore: false,
  jsredirectFollow: false,
  jsredirectForceShow: false,
  emulateFrameBreak: true,

  jsHack: null,
  jsHackRegExp: null,

  dropXssProtection: true,
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

  fakeScriptLoadEvents: {},

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
          } catch(e) {
            dump(`${e}\n`);
          }
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
        if (this.locked) try {
          this.defaultCaps.lockPref(this.POLICY_NAME + ".sites");
        } catch (e) {
        }
        if (!this.jsPolicySites.fromPref(this.policyPB)) {
          this.resetDefaultSitePrefs();
        }
        this.jsPolicySites.add(this.tempSites.sitesList);
        break;
      case "untrusted":
        this.untrustedSites.fromPref(branch, name);
      break;
      case "default.javascript.enabled":
        if (IPC.parent) {
          let dc = this.defaultCaps;
          if (dc.getCharPref(name) != "noAccess") {
            dc.unlockPref(name);
            dc.setCharPref(name, "noAccess");
          }
          dc.lockPref(name);
        }
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
      case "forbidWebGL":
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
      case "autoAllow":
      case "contentBlocker":
      case "alwaysShowObjectSources":

      case "showUntrustedPlaceholder":
      case "collapseObject":
      case "truncateTitle":
      case "truncateTitleLen":
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
      case "dropXssProtection":
      case "flashPatch":
      case "silverlightPatch":
      case "inclusionTypeChecking":
      case "nosniff":
      case "showBlankSources":
      case "audioApiInterception":
      case "allowHttpsOnly":
      case "restrictSubdocScripting":
      case "globalHttpsWhitelist":
        this[name] = this.getPref(name, this[name]);
      break;

      case  "cascadePermissions":
        this[name] = this.geckoVersionCheck("24") >= 0 && this.getPref(name, this[name]);
      break;

      case "fakeScriptLoadEvents.enabled":
      case "fakeScriptLoadEvents.onlyRequireJS":
      case "fakeScriptLoadEvents.exceptions":
      case "fakeScriptLoadEvents.docExceptions":
        let sub = name.split('.')[1];
        let value = this.getPref(name);
        this.fakeScriptLoadEvents[sub] = typeof value === "boolean" ? value : AddressMatcher.create(value);
      break;

      case "liveConnectInterception":
        this[name] = this.geckoVersionCheck("16.0") === -1 && this.getPref(name, this[name]);
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
        if (this.httpStarted) {
          this.injectionChecker.logEnabled = !!(this.consoleDump & LOG_INJECTION_CHECK);
          ABE.consoleDump = !!(this.consoleDump & LOG_ABE);
        }
        IPC.logger = (this.consoleDump & LOG_IPC) ? (...args) => ns.log(...args) : null;
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
        this.updateStyleSheet(`.${this.hideObjClassName} {display: none !important}`, true);
      case "requireReloadRegExp":
      case "whitelistRegExp":
        this.updateRxPref(name, "", "^", this.rxParsers.multi);
      break;

      case "allowedMimeRegExp":
        this.updateRxPref(name, "", "^i", this.rxParsers.multi);
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
      case "nselForce":
      case "nselNever":
      case "showPlaceholder":
      case "clearClick":
        this.updateCssPref(name);
      break;

      case "policynames":
        this.setupJSCaps();
      break;

      case "clearClick.exceptions":
      case "clearClick.subexceptions":
        ClearClickHandler.prototype[name.split('.')[1]] = AddressMatcher.create(this.getPref(name, ''));
      break;

      case "secureCookies":
      case "httpsDefWhitelist":
        HTTPS[name] = this.getPref(name, HTTPS[name]);
      break;
      case "secureCookiesExceptions":
      case "secureCookiesForced":
      case "httpsForced":
      case "httpsForcedExceptions":
      case "httpsForcedBuiltIn":
        HTTPS[name] = AddressMatcher.create(this.getPref(name, ''));
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
      var lines = s.split(anchor ? /\s+/ : /[\n\r]+/).filter(l => /\S/.test(l));
      return new RegExp((anchor ? lines.map(ns.rxParsers.anchor) : lines).join('|'),
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
    this[prefName] = enabled;
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
    if (!this._batchPrefs) {
      this.setupJSCaps();
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
      case "showPlaceholder":
        let bim = "background-image: -moz-image-rect(url(" + this.skinBase + "close.png),";
        sheet = '.__noscriptPlaceholder__ { direction: ltr !important; display: inline-block !important; } ' +
                '.__noscriptPlaceholder__ > .__noscriptPlaceholder__1 { display: inline-block !important; position: relative !important;' +
                'outline-color: #fc0 !important; outline-style: solid !important; outline-width: 1px !important; outline-offset: -1px !important;' +
                'cursor: pointer !important; background: #ffffe0 url("' +
                    this.pluginPlaceholder + '") no-repeat left top !important; opacity: 0.6 !important; margin-top: 0px !important; margin-bottom: 0px !important;} ' +
                '.__noscriptPlaceholder__1 > .__noscriptPlaceholder__2 { display: inline-block !important; background-repeat: no-repeat !important; background-color: transparent !important; width: 100%; height: 100%; display: block; margin: 0px; border: none } ' +
                'noscript .__noscriptPlaceholder__ { display: inline !important; }' +
                '.__noscriptPlaceholder__1 > .closeButton { display: block !important; position: absolute !important; top: 0 !important; right: 0 !important;' +
                bim + "0,25%,100%,0) !important; width: 16px !important; height: 16px !important; opacity: .8 !important}" +
                '.__noscriptPlaceholder__1 > .closeButton:hover {' + bim + '0,50%,100%,25%) !important; opacity: 1 !important}' +
                '.__noscriptPlaceholder__1 > .closeButton:hover:active {' + bim + '0,75%,100%,50%) !important; opacity: 1 !important}' +
                '.__noscriptPlaceholder__1 > .msg { text-align: center !important; bottom: 0 !important; left: 0 !important; width: 100% !important; position: absolute !important; font-size: 12px !important; font-weight: bold !important; font-family: sans-serif !important; }';
      break;
      case "clearClick":
        sheet = "body:not([id]) { cursor: auto !important } " +
                ".__noscriptOpaqued__ { opacity: 1 !important; visibility: visible; filter: none !important } " +
                "iframe.__noscriptOpaqued__ { display: block !important; } " +
                "object.__noscriptOpaqued__, embed.__noscriptOpaqued__ { display: inline !important } " +
                ".__noscriptJustOpaqued__ { opacity: 1 !important } " +
                ".__noscriptScrolling__ { overflow: auto !important; min-width: 52px !important; min-height: 52px !important } " +
                ".__noscriptNoScrolling__ { overflow: hidden !important } " +
                ".__noscriptHidden__ { visibility: hidden !important } " +
                ".__noscriptBlank__ { background-color: white !important; color: white !important; border-color: white !important; background-image: none !important }";

      break;
      default:
        return;
    }
    this.updateStyleSheet(sheet, value);
  },

  get sss() {
    delete this.sss;
    try {
      return (this.sss = Cc["@mozilla.org/content/style-sheet-service;1"]
                        .getService(Ci.nsIStyleSheetService));
    } catch(e) {
      return (this.sss = null);
    }
  },

  updateStyleSheet: function(sheet, enabled) {
    const sss = this.sss;
    if (!sss) return;
    const uri = IOS.newURI("data:text/css;charset=utf8," + encodeURIComponent(sheet), null, null);
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
    const ss = new this.Strings("noscript");
    return (this.getString = (name, parms) => ss.getString(name, parms));
  },

  get Strings() {
    delete this.Strings;
    INCLUDE('Strings');
    return (this.Strings = Strings);
  },

  _inited: false,
  POLICY_NAME: "maonoscript",
  prefService: null,
  caps: null,
  defaultCaps: null,
  policyPB: null,
  prefs: null,
  mozJSPref: null,
  mozJSEnabled: true,
  disabled: false,

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
    var resProt = ios.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
    var base;
    for (var r  of ["skin", "content"]) {
      base = "noscript_" + Math.random();
      resProt.setSubstitution(base, ios.newURI("chrome:noscript/" + r + "/", null, null));
      this[r + "Base"] = "resource://" + base + "/";
    }
    this.pluginPlaceholder = this.skinBase + "icon32.png";
  },

  childProcess: false,
  init: function() {
    if (this._inited) return false;

    let t = Date.now();

    Thread.hostRunning = true;

    this._inited = true;
    
    this.beforeInit();

    this._initResources();

    OS.addObserver(this, "em-action-requested", true);

    const prefSrv = this.prefService = Cc["@mozilla.org/preferences-service;1"]
      .getService(Ci.nsIPrefService).QueryInterface(Ci.nsIPrefBranch);

    const PBI = Ci.nsIPrefBranch2;
    this.caps = prefSrv.getBranch("capability.policy.").QueryInterface(PBI);
    this.defaultCaps = prefSrv.getDefaultBranch(this.caps.root);

    this.policyPB = prefSrv.getBranch("capability.policy." + this.POLICY_NAME + ".").QueryInterface(PBI);
    this.prefs = prefSrv.getBranch("noscript.").QueryInterface(PBI);

    this.policyPB.addObserver("sites", this, true);

    this.prefs.addObserver("", this, true);
    this.mozJSPref = prefSrv.getBranch("javascript.").QueryInterface(PBI);
    this.mozJSPref.addObserver("enabled", this, true);

    this.mandatorySites.sitesString = this.getPref("mandatory", "chrome: about: resource: [System Principal]");

    this.captureExternalProtocols();

    this._batchPrefs = true;
    for (var p  of [
      "autoAllow",
      "allowedMimeRegExp", "hideOnUnloadRegExp", "requireReloadRegExp",
      "consoleDump", "consoleLog", "contentBlocker", "alwaysShowObjectSources",
      "filterXPost", "filterXGet",
      "filterXGetRx", "filterXGetUserRx",
      "filterXExceptions",
      "forbidJava", "forbidFlash", "forbidSilverlight", "forbidPlugins", "forbidMedia", "forbidFonts", "forbidWebGL",
      "forbidIFrames", "forbidIFramesContext", "forbidFrames",
      "forbidMetaRefresh",
      "forbidXBL", "forbidXHR",
      "liveConnectInterception", "audioApiInterception",
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
      "dropXssProtection",
      "flashPatch", "silverlightPatch",
      "allowHttpsOnly",
      "truncateTitle", "truncateTitleLen",
      "whitelistRegExp", "proxiedDNS", "asyncNetworking",
      "fakeScriptLoadEvents.enabled", "fakeScriptLoadEvents.onlyRequireJS", "fakeScriptLoadEvents.exceptions", "fakeScriptLoadEvents.docExceptions",
      "restrictSubdocScripting", "cascadePermissions", "globalHttpsWhitelist"
      ]) {
      try {
        this.syncPrefs(this.prefs, p);
      } catch(e) {
        dump("[NoScript init error] " + e.message + ":" + e.stack + " setting " + p + "\n");
      }
    }
    this._batchPrefs = false;

    this.setupJSCaps();

    if (!this.locked) {
      // init jsPolicySites from prefs
      this.syncPrefs(this.policyPB, "sites");
    }

    this.syncPrefs(this.mozJSPref, "enabled");
    if (this.consoleDump) ns.dump("T1 " + (Date.now() - t));
    if (this.getPref("tempGlobal", false))
      this.jsEnabled = false;

    this.afterInit();

    if (this.consoleDump) this.dump(`Init done in ${Date.now() - t}`);
    return true;
  },


  onContentInit: function() {
    this._batchPrefs = true;
    ["allowClipboard", "allowLocalLinks"].forEach((p) => this.syncPrefs(this.pref, p), this);
    this._batchPrefs = false;
    this.setupJSCaps();
  },

  _disposalTasks: [],
  onDisposal: function(task) {
    this._disposalTasks.push(task);
  },
  dispose: function() {
    try {
      if(!this._inited) return;
      this._inited = false;

      for (let t of this.disposalTasks) t();
      
      this.shouldLoad = this.shouldProcess = CP_NOP;

      OS.removeObserver(this, "em-action-requested");

      if (this.httpStarted) {
        this.categoryManager.deleteCategoryEntry("net-channel-event-sinks", this.contractID, false);
        this.requestWatchdog.dispose();
        Cc['@mozilla.org/docloaderservice;1'].getService(nsIWebProgress).removeProgressListener(this);
      }

      this.prefs.removeObserver("", this);
      this.mozJSPref.removeObserver("enabled", this);
      this.resetJSCaps();
      this.eraseTemp();
      if (typeof PolicyState === "object") PolicyState.reset();
      this.savePrefs();
      if(this.consoleDump & LOG_LEAKS) this.reportLeaks();
    } catch(e) {
      this.dump(e + " while disposing.");
    } finally {
      Thread.hostRunning = false;
    }

  },


  onVersionChanged: function(prev) {
    let removalsOnly = !this.getPref("allowWhitelistUpdates");

    // update hacks
    var versions = {
      "2.1.1.2rc6": {
        "hotmail.com": "wlxrs.com", // required by Hotmail/Live webmail
        "google.com": "googleapis.com gstatic.com", // required by most Google services and also by external resources
        "addons.mozilla.org": "paypal.com paypalobjects.com" // required for the "Contribute" AMO feature not to break badly with no warning
      },

      "2.2.9rc2": {
        "addons.mozilla.org": "persona.org"
      },

      "2.4.9rc2": {
        "!browserid.org": "persona.org"
      },
      "2.5.9rc3": {
        "live.com": "gfx.ms afx.ms" // fully Microsoft-controlled (no user content), now required by MS mail services
      },
      "2.6.5.9rc2": {
        "live.com": "sfx.ms" // fully Microsoft-controlled (no user content), now required by MS mail services
      },
      "2.6.6rc5": {
        "live.com": "outlook.com live.net" // fully Microsoft-controlled (no user content), now required by MS mail services
      },
      "2.6.9.4rc1": {
        "vimeo.com": "vimeocdn.com" // no movie will play anymore without this
      },
      "2.6.9.19rc1": {
        "youtube.com": "googlevideo.com" // Youtube's HTML5 video player now requires this
      },
      "2.6.9.22rc1": {
        "prototypejs.org": "bootstrapcdn.com" // Used by many sites, mostly for styles and fonts
      },
      "2.6.9.27": {
        "!vjs.zendcdn.net": "" // removal
      },
      "2.6.9.28rc2": {
        "!googleapis.com": "ajax.googleapis.com" // storage.googleapis.com allows HTML files!
      },
      "2.6.9.30rc1": {
        "!mootools.net": ""
      },
      "2.6.9.30rc2": {
        "!cdnjs.cloudflare.com": "",
        "!prototypejs.org": "",
        "ajax.googleapis.com": "maps.googleapis.com"
      },
      "2.6.9.30rc4": {
        "about:blank": "about:pocket-signup about:pocket-save"
      },
      "2.6.9.30rc5": {
        "!about:packet-save": "about:pocket-saved",
        "!about:pocket-signup": "about:pocket-signup",
        "google.com": "ajax.googleapis.com maps.googleapis.com"
      },
      "2.6.9.35rc1": {
        "!about:pocket-save": "about:pocket-saved",
        "!about:pocket-signup": "about:pocket-signup",
        "google.com": "ajax.googleapis.com maps.googleapis.com"
      },
      "2.6.9.36rc1": {
        "netflix.com": "https://*.nflxvideo.net"
      }
    };

    for (let v in versions) {
      if (this.versionComparator.compare(prev, v) < 0) {
        let cascading = versions[v];
        for (let site in cascading) {
          let newSites = !removalsOnly && cascading[site].split(/\s+/).filter(function(s) {
            // check whether browser internal URIs are supported
            if (/^(?:about|chrome|resource):\w/.test(s))
              try {
                IOUtil.newChannel(s, null, null);
              } catch(e) {
                return false;
              }
            return true;
          });
          let replace = site[0] === "!";
          if (replace) site = site.substring(1);
          if (this.isJSEnabled(site)) {
            if (replace) this.jsPolicySites.remove(site, true, false);
            if (!removalsOnly && newSites[0]) {
              this.jsPolicySites.remove(newSites, true, false);
              this.setJSEnabled(newSites, true);
            }
          }
        }
      }
    }
  },

  global: this,
  reportLeaks: function() {
    for (let k of Object.keys(global)) {
      this.dump(`${k} = ${global[k]}\n`);
    }
  },

  get profiler() {
    delete this.profiler;
    INCLUDE("Profiler");
    return (this.profiler = Profiler);
  },

  httpStarted: false,
  get requestWatchdog() {
    if (ns.consoleDump) ns.dump("RW kickstart at " + new Error().stack);
    this.httpStarted = true;
    this.initContentPolicy(true);

    this.categoryManager.addCategoryEntry("net-channel-event-sinks", this.contractID, this.contractID, false, true);

    delete this.requestWatchdog;
    return (this.requestWatchdog = new RequestWatchdog());
  },

  captureExternalProtocols: function() {
    try {
      const pb = this.prefService.getDefaultBranch("network.protocol-handler.");
      if (this.getPref("fixURI", true)) {
        try {
          pb.setBoolPref("expose-all", true);
        } catch(e1) {}
        var prots = [];
        for (var key  of pb.getChildList("expose.", {})) {
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
  },
  
  tempSites: new PolicySites(),
  gTempSites: new PolicySites(),
  isTemp: function(s) {
    return s in (this.globalJS ? this.gTempSites : this.tempSites).sitesMap;
  },
  setTemp: function(s, b) {
    const sites = {
      "temp": this.tempSites,
      "gtemp": this.gTempSites
    };
    for (let p in sites) {
      if (b) {
        if (p[0] !== "g" || this.globalJS) {
          sites[p].add(s);
        }
      } else {
        sites[p].remove(s, true, true); // keeps up and down, see #eraseTemp()
      }
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
    if (typeof(snapshot) === "string") {
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
        this.manualSites.remove(ss);
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
  },

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
    return !((untrustedGranularity & 1) && !temp || (untrustedGranularity & 2) && temp) ||
      (untrustedGranularity & 4) && single && this.isUntrusted(site);
  },

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
  _isHttpsAndNotUntrusted: function(s) {
    return /^https:/i.test(s) && !this.isUntrusted(s);
  },
  isGlobalHttps: function(win, /*optional */ s) {
    let allow = false;
    if (s && !this._isHttpsAndNotUntrusted(s)) return false;

    for (;; win = win.parent) {
      let site = this.getSite(this.getPrincipalOrigin(this.getPrincipal(win.document)));
      if (!(allow = s && site === s || this._isHttpsAndNotUntrusted(site)) || win === win.parent)
        break;
      s = site;
    }

    return allow;
  },
  get proxyService() {
    delete this.proxyService;
    return (this.proxyService = Cc["@mozilla.org/network/protocol-proxy-service;1"].getService(Ci.nsIProtocolProxyService));
  },

  isProxied: function(site) {
    this.isProxied = "proxyConfigType" in this.proxyService ? this._isProxied : this._isProxiedSite;
    return this.isProxied();
  },
  _isProxied: function() {
    switch (this.proxyService.proxyConfigType) {
      case 0: // direct
      case 5: // system
        return false;
    }
    return true;
  },
  _isProxiedSite: function(uri) { // Gecko < 2 has no proxyConfigType, so we must resolve per URI
    try {
      if (!(uri instanceof Ci.nsIURI)) {
        uri = IOS.newURI(uri || "https://noscript.net/", null, null);
      }
      return this.proxyService.resolve(uri, 0).type != "direct";
    } catch(e) {
      return false;
    }
  },

  jsPolicySites: new PolicySites(),
  isJSEnabled: function (s, window) {
     if (this.globalJS) {
      return !(this.alwaysBlockUntrustedContent && this.untrustedSites.matches(s));
    }

    if (this.untrustedSites.matches(s) || this.isForbiddenByHttpsStatus(s)) return false;

    let enabled = !!(this.jsPolicySites.matches(s));

    if (window) {
      let top = window.top;
      enabled = enabled ||
               this.globalHttpsWhitelist && s.indexOf("https:") === 0 && (window === top || this.isGlobalHttps(window));
      if (enabled ? this.restrictSubdocScripting : this.cascadePermissions) {
        let topOrigin = this.getPrincipalOrigin(this.getPrincipal(top.document));
        if (this.isBrowserOrigin(topOrigin)) {
          enabled = true;
        } else {
          let topSite = this.getSite(topOrigin);
          if (topSite !== s) enabled = this.isJSEnabled(topSite, enabled && this.restrictSubdocScripting && window);
        }
      }
    }
    return enabled;
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

  _buggyIPV6rx: /^[^/:]+:\/\/[^[](?:[0-9a-f]*:){2}/,
  getPrincipal(nodeOrWindow) {
    return nodeOrWindow &&
      (nodeOrWindow.nodePrincipal || nodeOrWindow.document && nodeOrWindow.document.nodePrincipal) ||
      null;
  },
  getPrincipalOrigin(p) {
    let origin = p.originNoSuffix || p.origin;
    if (this._buggyIPV6rx.test(origin)) {
      try {
        let uri = p.URI;
        let hostPort = uri.hostPort;
        if (hostPort && hostPort[0] === '[') origin = uri.scheme + "://" + hostPort;
      } catch (e) {
        ns.log(e);
      }
    }
    return origin;
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
  },

  portRx: /:\d+$/,
  _ipShorthandRx: /^(https?:\/\/)((\d+\.\d+)\.\d+)\.\d+(?::\d|$)/,
  checkShorthands: function(site, policy) {
    if (!site) return false;

    if (this.whitelistRegExp && this.whitelistRegExp.test(site)) {
      return true;
    }

    if (!policy) policy = this.jsPolicySites;

    if (this.ignorePorts && policy.matches(site.replace(/:\d+$/, '')))
      return true;

    let map = policy.sitesMap;
    let portRx = this.portRx;
    let hasPort = portRx.test(site);

    // port matching, with "0" as port wildcard  and * as nth level host wildcard
    let key = hasPort ? site.replace(portRx, ":0") : site;
    if (key in map || site in map) return true;
    var keys = site.split(".");
    if (keys.length > 1) {
      let prefix = keys[0].match(/^(?:ht|f)tps?:\/\//i)[0] + "*.";
      while (keys.length > 2) {
        keys.shift();
        key = prefix + keys.join(".");
        if (key in map || hasPort && key.replace(portRx, ":0") in map) return true;
      }
    }

    // check IP leftmost portion up to 2nd byte (e.g. [http://]192.168 or [http://]10.0.0)
    let m = site.match(this._ipShorthandRx);
    return m && (m[2] in map || m[3] in map || (m[1] + m[2]) in map || (m[1] + m[3]) in map);
  },
  flushCAPS: function(sitesString) {
    const ps = this.getPermanentSites();
    if (sitesString) ps.sitesString = sitesString;
    try {
      ps.toPref(this.policyPB);
    } catch (e) {
      if (IPC.parent) throw e;
    }
  },
  get injectionChecker() { return this. requestWatchdog.injectionChecker; },

  splitList: function(s) {
    return s ?/^[,\s]*$/.test(s) ? [] : s.split(/\s*[,\s]\s*/) : [];
  },

  savePrefs: function() {
    var res = this.prefService.savePrefFile(null);
    return res;
  },

  sortedSiteSet: function(s) { return  SiteUtils.sortedSet(s); },
  globalJS: false,
  get jsEnabled() {
    return this.mozJSEnabled && this.globalJS;
  },

  set jsEnabled(enabled) {
    try {
      if (this.locked || this.prefs.prefIsLocked("global")) {
        enabled = false;
      }
    } catch (e) {}
    this.globalJS = enabled;
    const prefName = "default.javascript.enabled";
    try {
      this.caps.clearUserPref(prefName);
    } catch(e) {}
    
    this.setPref("global", enabled);
    if (enabled) {
      try {
        this.mozJSPref.setBoolPref("enabled", true);
      } catch (e) {}
    }
    return enabled;
  },

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
      let url = site;
      if (typeof site === "string") {
        if (site.endsWith(":")) return "";
        url = IOUtil.newURI(site);
      }
      const host = url.host;
      return force || (this.ignorePorts || url.port === -1) && host[host.length - 1] != "." &&
            (host.lastIndexOf(".") > 0 || host === "localhost") ? host : '';
    } catch(e) {
      return "";
    }
  },

  get _tldService() {
    delete this._tldService;
    return (this._tldService = IOUtil.TLDService);
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
  },

  delayExec: function(callback, time) {
    Thread.delay(callback, time, this, Array.slice(arguments, 2));
  },

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

    this.tempSites.sitesString = this.gTempSites.sitesString = "";

    this.setPref("temp", "");
    this.setPref("gtemp", "");

    this.setJSEnabled(this.mandatorySites.sitesList, true); // add mandatory
    this.resetAllowedObjects();
    if (this.hasClearClickHandler) this.clearClickHandler.resetWhitelist();
  },

  _observingPolicies: false,
  _editingPolicies: false,
  setupJSCaps: function() {
    if (this._editingPolicies) return;

    this.resetJSCaps();
    if (!(this.allowLocalLinks || this.allowClipboard)) return;
    
    this._editingPolicies = true;
    try {
      const POLICY_NAME = this.POLICY_NAME;
      var prefArray;
      var prefString = "", originalPrefString = "";
      var exclusive = this.getPref("excaps", true);
      try {

        prefArray = this.splitList(prefString = originalPrefString =
          (this.caps.prefHasUserValue("policynames") ? this.caps.getCharPref("policynames")
            : this.getPref("policynames") // saved value from dirty exit
          )
        );
        var pcount = prefArray.length;
        while (pcount-- > 0 && prefArray[pcount] != POLICY_NAME);
        if (pcount == -1) { // our policy is not installed, should always be so unless dirty exit
          this.setPref("policynames", originalPrefString);
          if (exclusive || prefArray.length === 0) {
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
      let POLICY_NAME = this.POLICY_NAME;
      let exclusive = this.getPref("excaps", true) && (this.allowLocalLinks || this.allowClipboard);
      let prefString = SiteUtils.splitString(
       exclusive ? this.getPref("policynames", "") : this.caps.getCharPref("policynames")
      ).filter((s) => s && s !== POLICY_NAME).join(" ");

      if (prefString) {
        this.caps.setCharPref("policynames", prefString);
      } else {
        try {
          this.caps.clearUserPref("policynames");
        } catch(ex) {}
      }
    } catch(ex) {}
  },

  getPref: function(name, def) {
    const PREFS = Ci.nsIPrefBranch;
    const prefs = this.prefs;
    try {
      switch (prefs.getPrefType(name)) {
        case PREFS.PREF_STRING:
          return prefs.getCharPref(name);
        case PREFS.PREF_INT:
          return prefs.getIntPref(name);
        case PREFS.PREF_BOOL:
          return prefs.getBoolPref(name);
      }
    } catch(e) {}
    return def || "";
  },

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
      const PREFS = Ci.nsIPrefBranch;
      try {
        switch (prefs.getPrefType(name)) {
          case PREFS.PREF_STRING:
            prefs.setCharPref(name, value);
            break;
          case PREFS.PREF_INT:
            prefs.setIntPref(name, parseInt(value));
            break;
          case PREFS.PREF_BOOL:
            prefs.setBoolPref(name, !!value && value != "false");
            break;
        }
      } catch(e2) {}
    }
  },

  getAllowObjectMessage: function(extras) {
    let url = SiteUtils.crop(extras.url).replace(/\S{80}/g, "$&\n");
    let details = extras.mime + " " + (extras.tag || (extras.mime === "WebGL" ? "<CANVAS>" : "<OBJECT>")) + " / " + extras.originSite;
    return this.getString("allowTemp", [url + "\n(" + details + ")\n"]);
  },

  get dom() {
    delete this.dom;
    return (this.dom = DOM);
  },
  get wan() {
    delete this.wan;
    ABE; // kickstart
    return (this.wan = WAN);
  },

  os: OS,
  siteUtils: SiteUtils,
  mimeService: null,

  shouldLoad: function(aContentType) {
    if (aContentType === 5) {
      this.requestWatchdog;
      return this.shouldLoad.apply(this, arguments);
    }
    return CP_OK;
  },
  shouldProcess: CP_NOP,

  initContentPolicy: function(force) {
    if (force) INCLUDE("Policy");
    else if (!this.httpStarted) return;

    const last = this.getPref("cp.last");
    const catMan = this.categoryManager;
    const cat = "content-policy";
    if (last)
      try {
        catMan.deleteCategoryEntry(cat, this.contractID, false);
      } catch (e) {}

    let cpMixin;

    if (this.httpStarted || force) {
      cpMixin = this.disabled ||
        (this.globalJS &&
          !(this.alwaysBlockUntrustedContent || this.contentBlocker || HTTPS.httpsForced)) ? NOPContentPolicy
      : MainContentPolicy;
      MIXIN(this, cpMixin);
    } else cpMixin = null;

    if (cpMixin !== NOPContentPolicy && (last || this.mimeService)) {
      // removing and adding the category late in the game allows to be the latest policy to run,
      // and nice to AdBlock Plus
      if (this.consoleDump) this.dump("Adding content policy.");
      catMan.addCategoryEntry(cat, this.contractID, this.contractID, false, true);
    } else this.dump("No category?!" + (cpMixin === NOPContentPolicy) + ", " + last + ", " + this.mimeService);


    if (!this.mimeService) {
      this.initSafeJSRx();
      INCLUDE(`MimeService${IPC.child ? '' : 'Parent'}`);
      this.mimeService = MimeService;
    }
  },


  reqData(req, remove = false) {
    return IOUtil.reqData(req, "net.noscript.channelData", remove);
  },

  guessMime: function(uriOrExt) {
    try {
      let ext = (uriOrExt instanceof Ci.nsIURL) ? uriOrExt.fileExtension
        : (uriOrExt instanceof Ci.nsIURI) ? ((ext = uriOrExt.path).includes(".") ? ext.split(".").pop() : "")
        : uriOrExt;
      return typeof ext === "string" && this.mimeService.getTypeFromExtension(ext) || "";
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

  versionComparator: Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator),
  geckoVersion: ("@mozilla.org/xre/app-info;1" in  Cc) ? Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo).platformVersion : "0.0",
  geckoVersionCheck: function(v) { return this.versionComparator.compare(this.geckoVersion, v) },

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

  syncUI: function(aContext) {
    let doc = aContext && (aContext instanceof Ci.nsIDOMDocument ? aContext : aContext.ownerDocument || aContext.document);
    if (doc) {
      let ev = doc.createEvent("Events");
      ev.initEvent("NoScript:syncUI", true, false);
      aContext.dispatchEvent(ev);
    }
  },

  objectWhitelist: {},
  ALL_TYPES: "*",
  objectWhitelistLen: 0,
  _objectKeyRx: /^((?:\w+:\/\/)?[^\.\/\d]+)\d+(\.[^\.\/]+\.)/,
  objectKey: function(url, originSite) {
    if (url.indexOf("id=") > 0) {
      let [path, query] = url.split("?");
      if (query) {
        let id = query.match(/(?:^|&)(?:video_?)?id=([^&]+)/);
        if (id) url = path + "?id=" + id[1];
      }
    }
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
    if (types && (types === this.ALL_TYPES || types.indexOf(mime) > -1))
      return true;


    if (typeof(site) === "undefined") site = this.getSite(url);

    for (;site;) {
      types = this.objectWhitelist[this.objectKey(site, originSite)] || this.objectWhitelist[this.objectKey(site)];
      if (types && (types === this.ALL_TYPES || types.indexOf(mime) > -1))
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
      if (types === this.ALL_TYPES) return;
      if(mime === "*") {
        types = this.ALL_TYPES;
      } else {
        if (types.indexOf(mime) > -1) return;
        types.push(mime);
      }
    } else {
      this.objectWhitelist[key] = mime === "*" ? this.ALL_TYPES : [mime];
    }
    this.objectWhitelistLen++;
  },
  isAllowedObjectByDOM: function(obj, objectURL, parentURL, mime, site, originSite) {
    var url = this.getObjectURLWithDOM(obj, objectURL, parentURL);
    return url && this.isAllowedObject(url, mime, site, originSite || this.getSite(parentURL));
  },
  allowObjectByDOM: function(obj, objectURL, parentURL, mime, originSite) {
    var url = this.getObjectURLWithDOM(obj, objectURL, parentURL);
    if (url) this.allowObject(url, mime, originSite || this.getSite(parentURL));
  },
  getObjectURLWithDOM:  function(obj, objectURL, parentURL) {
    let doc = obj.ownerDocument;
    let suffix = encodeURIComponent(parentURL);
    if (!doc) return objectURL + "#!#@" + suffix;

    let id = obj.id || "";
    let t = obj.tagName.toUpperCase();

    const ytFrameURL = "https://www.youtube.com/embed/";

    if ("IFRAME" === t && objectURL.substring(0, ytFrameURL.length) === ytFrameURL) {
      objectURL = ytFrameURL;
      id = "(ytFrame)";
    } else {
      objectURL = objectURL.replace(/[\?#].*/, '');
      if (!id) {
        let ee = doc.getElementsByTagName(t);

        for (let j = ee.length; j-- > 0;) {
          if (ee[j] === obj) {
            id = t + "(" + j + ")";
            break;
          }
        }
      }
    }
    return objectURL + "#!#" + id + "@" + suffix;
  },

  resetAllowedObjects: function() {
    this.objectWhitelist = {};
    this.objectWhitelistLen = 0;
  },

  isAllowedMime: function(mime, site) {
    return (this.allowedMimeRegExp && (
              this.allowedMimeRegExp.test(mime) ||
              this.allowedMimeRegExp.test(mime + "@" + site)));
  },
  countObject: function(embed, site) {
    if(!site) return;
    try {
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
    } catch (ex) {}
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
           (defValue ? this.setExpando(domObject, key, defValue) || defValue : null);
  },
  setExpando: function(domObject, key, value) {
    if (!domObject) return null;
    if (!domObject.__noscriptStorage) domObject.__noscriptStorage = {};
    if (domObject.__noscriptStorage) domObject.__noscriptStorage[key] = value;
    else if(this.consoleDump) this.dump("Warning: cannot set expando " + key + " to value " + value);
    return value;
  },

  hasVisibleLinks: function(document) {
    const w = document.defaultView;
    if (!w) return false;

    const links = document.links;
    let toBeChecked = null;
    for (let j = 0, l; (l = links[j]); j++) {
      if (l && l.href && l.href.indexOf("http") === 0) {
        if (l.offsetWidth) return true;
        if (!toBeChecked) toBeChecked = [];
        toBeChecked.push(l);
      }
    }
    if (!toBeChecked) return false;

    let hiddenAncestors = [];
    for (let j = toBeChecked.length; j-- > 0;) {
      let n = toBeChecked[j];
      if (n.firstChild) {
        let ancestors = [];
        for (;;) {
          if (hiddenAncestors.indexOf(n) !== -1) break;
          ancestors.push(n);
          let s = w.getComputedStyle(n, '');
          if (s.display === "none" || s.visibility === "hidden") {
            hiddenAncestors.push.apply(hiddenAncestors, ancestors);
            break;
          }
          if (!(n = n.parentNode)) return true;
        }
      }
    }

    if (document.embeds[0] || document.getElementsByTagName("object")[0]) return true;
    let form = document.forms[0];
    if (form && form.offsetHeight) return true;
    return false;
  },

  processScriptElements: function(document, sites, docSite) {
    const scripts = document.getElementsByTagName("script");
    var scount = scripts.length;
    var surrogates = this.getExpando(document, "surrogates", {});
    if (scount) {
      let win = document.defaultView;
      const HTMLElement = Ci.nsIDOMHTMLElement;
      sites.scriptCount += scount;
      let nselForce = this.nselForce && this.isJSEnabled(docSite, win);
      let isHTMLScript;
      while (scount-- > 0) {
        let script = scripts.item(scount);
        isHTMLScript = script instanceof HTMLElement;
        let scriptSrc;
        if (isHTMLScript) {
          scriptSrc = script.src;
        } else if(script) {
          scriptSrc = script.getAttribute("src");
          if (!/^[a-z]+:\/\//i.test(scriptSrc)) continue;
        } else continue;

        let scriptSite = this.getSite(scriptSrc);
        if (scriptSite) {
          sites.all.push(scriptSite);

          if (scriptSrc in surrogates) continue;

          if (nselForce && isHTMLScript &&
              !(script.__nselForce ||
                this.isJSEnabled(scriptSite, win) ||
                this.isUntrusted(scriptSite))) {

            this.showNextNoscriptElement(script);
          }
        }
      }
    }
  }
,


  showNextNoscriptElement: function(script) {
    const HTMLElement = Ci.nsIDOMHTMLElement;
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
          if (!(child && child.nodeType === 3)) break;

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


  handleBookmark: function(url, openCallback) {
    if (!url) return true;
    try {
      if (!this.getPref("forbidBookmarklets") && /^\s*(?:javascript|data):/i.test(url)) {
        return this.executeJSURL(url, openCallback);
      }
      if (!this.jsEnabled && this.getPref("allowBookmarks")) {
        let site = this.getSite(url);
        if (!(this.isJSEnabled(site) || this.isUntrusted(site))) {
          this.setJSEnabled(site, true);
          this.savePrefs();
        }
      }
    } catch(e) {
      if (ns.consoleDump) ns.dump(e + " " + e.stack);
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
        if (method.caller) method.caller.apply(self, method.caller.arguments);
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
    if (this.mozJSEnabled && (!this.jsEnabled || this.isUntrusted(site))) {
      if(this.consoleDump) this.dump("Executing JS URL " + url + " on site " + site);

      let docShell = DOM.getDocShellForWindow(window);

      let snapshots = {
        globalJS: this.globalJS,
        docJS: docShell.allowJavascript,
        siteJS: this.jsPolicySites.sitesString,
        untrusted: this.untrustedSites.sitesString
      };

      let siteJSEnabled = this.isJSEnabled(site, window);

      let doc = window.document;

      let focusListener = null;

      try {
        WinScript.unblock(window);
        docShell.allowJavascript = true;
        if (!(this.jsEnabled = doc.documentURI === "about:blank" || ns.getPref(fromURLBar ? "allowURLBarImports" : "allowBookmarkletImports"))) {
          if (site && !siteJSEnabled) {
            this.setJSEnabled(site, true);
          }
        } else {
          focusListener = function(ev) {
            ns.jsEnabled = DOM.mostRecentBrowserWindow.content == window;
          };
          for (let et  of ["focus", "blur"])
            browserWindow.addEventListener(et, focusListener, true);
        }

        try {
          this.executingJSURL(doc, 1);
          let noJS = !(siteJSEnabled && snapshots.docJS);
          if (noJS) {
            this._patchTimeouts(window, true);
          }

          let gecko24 = this.geckoVersionCheck("24") >= 0;
          if ((fromURLBar || noJS) && /^javascript:/i.test(url) && gecko24) {
            JSURL.load(url, doc);
          } else {
            if (gecko24) openCallback();
            else window.location.href = url;
          }
          Thread.yieldAll();
          if (noJS) {
            this._patchTimeouts(window, false);
          }

        } catch(e) {
          this.logError(e, true, "Bookmarklet or location scriptlet");
        }

        return true;
      } finally {
        if (!siteJSEnabled) try {
          WinScript.block(window);
        } catch (e) {
          ns.log(e);
        }
        this.setExpando(browser, "jsSite", site);
        if (!docShell.isLoadingDocument && docShell.currentURI &&
            this.getSite(docShell.currentURI.spec) == site)
          docShell.allowJavascript = snapshots.docJS;

        Thread.asap(function() {
          try {
            if (doc.defaultView && this.executingJSURL(doc) > 1) {
              this.delayExec(arguments.callee, 100);
              return;
            }
            this.executingJSURL(doc, 0);
          } catch (e) {} // the document could be dead, e.g. after a javascript: non-void expression evaluation

          if (focusListener)
            for (let et  of ["focus", "blur"])
              browserWindow.removeEventListener(et, focusListener, true);

          if (this.jsEnabled != snapshots.globalJS)
            this.jsEnabled = snapshots.globalJS;

          this.jsPolicySites.sitesString = snapshots.siteJS;
          this.untrustedSites.sitesString = snapshots.untrusted;

          this.flushCAPS();

          if (this.consoleDump & LOG_JS)
            this.dump("Restored snapshot permissions on " + site + "/" + (docShell.isLoadingDocument ? "loading" : docShell.currentURI.spec));
        }, this);
      }
    }

    return false;
  },

  _patchTimeouts: function(w, start) {
     this._runJS(w, start
      ? "if (!('__runTimeouts' in window)) " +
        (function() {
          var tt = [];
          window.setTimeout = window.setInterval = function(f, d, a) {
            if (typeof(f) != 'function') f = new Function(f || '');
            tt.push({f: f, d: d, a: a});
            return 0;
          };
          window.__runTimeouts = function() {
            var t, count = 0;
            while (tt.length && count++ < 200) { // let's prevent infinite pseudo-loops
              tt.sort(function(a, b) { return a.d < b.d ? -1 : (a.d > b.d ? 1 : 0); });
              t = tt.shift();
              t.f.call(window, t.a);
            }
            delete window.__runTimeouts;
            delete window.setTimeout;
          };
        }.toSource()) + "()"
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
      var xhr = ns.createCheckedXHR("GET", src, function() {
        if (xhr.readyState === 4) {
          ns._runJS(doc.defaultView, xhr.responseText);
          var ev = doc.createEvent("HTMLEvents");
          ev.initEvent("load", false, true);
          Thread.asap(function() {
            scriptElem.dispatchEvent(ev);
            dispose();
          });
        }
      }, w);
      xhr.send(null);
    } catch(e) {
      dispose();
      ns.dump(e);
    }

    function dispose() {
      Thread.asap(function() {
        try {
          ns._patchTimeouts(w, false);
        } catch(e) {}
        ns.executingJSURL(doc, -1);
      });
    };
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
    return ns.reqData(c).checked;
  },
  setCheckedChannel: function(c, v) {
    ns.reqData(c).checked = v;
  },

  createCheckedXHR: function(method, url, async, window) {
    if (typeof(async) == "undefined") async = true;
    var xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
    xhr.open(method, url, !!async);
    this.setCheckedChannel(xhr.channel, true);

    if (typeof(async) === "function")
      xhr.addEventListener("readystatechange", async, false);

    var privacyContext = window && window.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIWebNavigation);
    if ((privacyContext instanceof Ci.nsILoadContext) && ("usePrivateBrowsing" in privacyContext)
            && privacyContext.usePrivateBrowsing) {
      if (xhr.channel instanceof Ci.nsIPrivateBrowsingChannel) {
        xhr.channel.setPrivate(true);
      } else {
        xhr.channel.loadFlags |= xhr.channel.INHIBIT_PERSISTENT_CACHING;
      }
    }

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
    if (!mime) return;
    [mime] = mime.split(/[;\s]/);
    return mime == "application/x-shockwave-flash"
    ? // work around for Windows not associating a sane icon to Flash
      'url("' + this.skinBase + "flash" + size + '.png")'
    : /^application\/x-java\b/i.test(mime)
      ? 'url("' + this.skinBase + "java" + size + '.png")'
      : /^application\/x-silverlight\b/.test(mime)
        ? 'url("' + this.skinBase + "somelight" + size + '.png")'
        : /^font\b/i.test(mime)
          ? 'url("' + this.skinBase + 'font.png")'
          : mime === 'WebGL'
            ? 'url("' + this.skinBase + "webgl" + size + '.png")'
            : 'url("moz-icon://noscript?size=' + size + '&contentType=' + mime.replace(/[^\w-\/]/g, '') + '")';
  },

  _cachedObjectMimeRx: /^(?:text\/(?:javascript|css|x-c)|application\/(?:x-)?javascript)$/,
  isCachedObjectMime: function(mime) { return this._cachedObjectMimeRx.test(mime); },

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
    const EMBED = Ci.nsIDOMHTMLEmbedElement,
          OBJECT = Ci.nsIDOMHTMLObjectElement;

    const pe = this.getExpando(doc, "pe");
    if (!pe) return null;
    this.setExpando(doc, "pe", null);

    var ret = [];
    for (var j = pe.length; j-- > 0;) {
      let o = pe[j];
      try {
        if (this.getExpando(o.embed, "silverlight")) {
          o.embed = this._attachSilverlightExtras(o.embed, o.pluginExtras);
          if (!o.embed) continue; // skip unconditionally to prevent in-page Silverlight placeholders
        }

        let embed = o.embed;
        if (this.getExpando(embed, "processed")) continue;
        this.setExpando(embed, "processed", true);

        if (embed instanceof OBJECT || embed instanceof EMBED) {
          let node = embed;
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

    const skipCSS = /^(?:position|top|left|right|bottom)$/;

    var replacements = null,
        collapse = this.collapseObject,
        forcedCSS = ";",
        pluginDocument = false;

    try {
      pluginDocument = count == 1 && (
          objInfo[0].pluginExtras.url === document.URL && !objInfo[0].embed.nextSibling ||
          document.body.lastChild === objInfo[0].embed && document.body.lastChild === document.body.firstChild
        );
      if (pluginDocument) {
        collapse = false;
        forcedCSS = ";outline-style: none !important;-moz-outline-style: none !important; width: 100%";

      }
    } catch(e) {}

    var win = document.defaultView;

    while (count--) {
      let oi = objInfo[count];
      let object = oi.embed;
      let extras = oi.pluginExtras;

      try {
        extras.site = this.getSite(extras.url);

        if(!this.showUntrustedPlaceholder && this.isUntrusted(extras.site))
          continue;

        let msg = "";

        let objectTag = object.tagName.toUpperCase();
        if (objectTag === "VIDEO") {
          // Youtube HTML5 hack
          let player = document.getElementById("movie_player-html5");
          if (player) {
            let rx = /\bhtml5-before-playback\b/;
            if (rx.test(player.className)) player.className = player.className.replace(rx, '');
          }
        }

        extras.tag = "<" + (this.isLegacyFrameReplacement(object) ? "FRAME" : objectTag) + ">";
        extras.title =  extras.tag + ", " +
            this.mimeEssentials(extras.mime) + "@" +
            (longTip ? SiteUtils.crop(extras.url) : extras.url.replace(/[#\?].*/, ''));

        if ((extras.alt = object.getAttribute("alt")))
          extras.title += ' "' + extras.alt + '"'


        let anchor = document.createElementNS(HTML_NS, "a");
        anchor.id = object.id;
        anchor.href = /^(?:https?|ftp):/i.test(extras.url) ? extras.url : "#";
        anchor.setAttribute("title", extras.title);

        this.setPluginExtras(anchor, extras);
        this.setExpando(anchor, "removedNode", object);

        (replacements = replacements || []).push({object: object, placeholder: anchor, extras: extras });

        if (this.showPlaceholder && (object.offsetWidth || object.offsetHeight || !this.isCachedObjectMime(extras.mime))) {
          if (!pluginExtras.overlayListener) {
            pluginExtras.overlayListener = true;
            win.addEventListener("click", this.bind(this.onOverlayedPlaceholderClick), true);
          }
          anchor.addEventListener("click", this.bind(this.onPlaceholderClick), true);
          anchor.className = "__noscriptPlaceholder__ __noscriptObjectPatchMe__";
        } else {
          anchor.className = "__noscriptHidden__";
          if (collapse) anchor.style.display = "none";
          continue;
        }

        object.className += " __noscriptObjectPatchMe__";

        let innerDiv = document.createElementNS(HTML_NS, "div");
        innerDiv.className = "__noscriptPlaceholder__1";

        let cssDef = "",
            restrictedSize,
            style = win.getComputedStyle(oi.embed, null);

        if (style) {
          for (let cssCount = 0, cssLen = style.length; cssCount < cssLen; cssCount++) {
            let cssProp = style.item(cssCount);
            if (!skipCSS.test(cssProp))
              cssDef += cssProp + ": " + style.getPropertyValue(cssProp) + ";";
          }

          innerDiv.setAttribute("style", cssDef + forcedCSS);

          restrictedSize = (collapse || style.display === "none" || style.visibility === "hidden");

          anchor.style.width = style.width;
          anchor.style.height = style.height;
          if (style.position !== "static") {
            anchor.style.position = style.position;
            anchor.style.top = style.top;
            anchor.style.left = style.left;
            anchor.style.bottom = style.bottom;
            anchor.style.right = style.right;
          }
        } else restrictedSize = collapse;

        if (restrictedSize) {
          innerDiv.style.maxWidth = anchor.style.maxWidth = "32px";
          innerDiv.style.maxHeight = anchor.style.maxHeight = "32px";
        }

        innerDiv.style.visibility = "visible";

        let closeButton = innerDiv.appendChild(document.createElementNS(HTML_NS, "div"));
        closeButton.className = "closeButton";

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
            var rect = object.getBoundingClientRect();
            let aStyle = anchor.style, iStyle = innerDiv.parentNode.style;
            aStyle.overflow = "visible";
            aStyle.float = "left";

            let isTop = !win.frameElement;
            aStyle.minWidth = iStyle.minWidth = Math.max(w, isTop ? minSize : Math.min(document.documentElement.offsetWidth - rect.left, minSize)) + "px";
            aStyle.minHeight = iStyle.minHeight = Math.max(h, isTop ? minSize : Math.min(document.documentElement.offsetHeight - rect.top, minSize)) + "px";

          }
        } else {
          iconSize = 32;
          innerDiv.style.backgroundPosition = "center";
          if (msg) {
            let msgDiv = document.createElement("div");
            msgDiv.className = "msg";
            msgDiv.textContent = msg;
            anchor.firstChild.appendChild(msgDiv);
          }
        }
        innerDiv.style.backgroundImage = this.cssMimeIcon(extras.mime, iconSize);

      } catch(objectEx) {
        ns.dump(objectEx + " processing plugin " + count + "@" + document.documentURI + "\n");
      }

    }

    if (replacements) {
      if (this.isJSEnabled(this.getSite(document.URL), win)) this.patchObjects(document);
      this.delayExec(this.createPlaceholders, 0, replacements, pluginExtras, document);
    }
  },

  get _objectPatch() {
    delete this._objectPatch;
    return this._objectPatch = function() {
      const els = document.getElementsByClassName("__noscriptObjectPatchMe__");
      const DUMMY_FUNC = function() {};
      var el;
      for (var j = els.length; j-- > 0;) {
        el = els[j];
        el.setAttribute("class",
          el.getAttribute("class").replace(/\b__noscriptObjectPatchMe__\b/, '').replace(/\s+/, ' ')
        );
        el.__noSuchMethod__ = DUMMY_FUNC;
      }
    }.toSource() + "()";
  },

  patchObjects: function(document) {
    delete this.patchObjects;
    return (this.patchObjects = ("getElementsByClassName" in document)
      ? function(document) { ScriptSurrogate.executeDOM(document, this._objectPatch); }
      : DUMMY_FUNC).call(this, document);
  },

  createPlaceholders: function(replacements, pluginExtras, document) {
    for (let r  of replacements) {
      try {
        if (r.extras.pluginDocument) {
          this.setPluginExtras(r.object, null);
          if (r.object.parentNode) r.object.parentNode.insertBefore(r.placeholder, r.object);
        } else if (r.object.parentNode) {
          let p = r.placeholder;
          let o = r.object;
          o.parentNode.insertBefore(p, o);
          o._display = o.style.display;
          o.style.display = "none";
          if (p.style.position === "absolute") {
            let b = p.getBoundingClientRect();
            let el;
            if (b.width && b.height &&
                p !== (el = p.ownerDocument.defaultView
                  .QueryInterface(Ci.nsIInterfaceRequestor)
                  .getInterface(Ci.nsIDOMWindowUtils)
                  .elementFromPoint(
                    b.left + b.width / 2, b.top + b.height / 2, false, false)
                  ) && el && p.firstChild !== el && p.firstChild !== el.parentNode
              ) {
              let d = p.ownerDocument;
              let w = d.defaultView;
              p.style.top = (b.top + w.scrollY) + "px";
              p.style.left = (b.left + w.scrollX) + "px";
              p.style.zIndex = DOM.maxZIndex;
              d.body.appendChild(p);
            }
          }
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
    var f = s.filename.replace(/ line .*/, '');
    while((s = s.caller)) {
      if (s.filename && !(/^(?:resource|chrome):/.test(s.filename) || f === s.filename.replace(/ line .*/, ''))) {
        return false;
      }
    }
    return true;
  },

  onPlaceholderClick: function(ev, anchor) {
    if (ev.button) return;
    anchor = anchor || ev.currentTarget;
    const object = this.getExpando(anchor, "removedNode");

    if (object) try {
      if("isTrusted" in ev && !ev.isTrusted || !this.stackIsMine()) {
        return;
      }
      let shift = ev.shiftKey;
      let closeButton = ev.target.className === "closeButton";
      if (closeButton ? !shift : shift) {
        if (this.collapseObject ||
            this.getPref("placeholderCollapseOnClose", false)) {
          anchor.style.display = "none";
        } else {
          anchor.style.visibility = "hidden";
          anchor.style.width = anchor.offsetWidth + "px";
          anchor.style.height = anchor.offsetHeight + "px";
          anchor.removeChild(anchor.firstChild);
          anchor.style.display = "block";
        }
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
    var doc = el.ownerDocument;

    // check for cloned nodes, like on http://www.vmware.com/products/workstation/new.html
    for (let ph = el; ph.className && ph.className.indexOf("__noscriptPlaceholder__") !== -1; ph = ph.parentNode) {
      if (ph.href && ph.title) {
        if (this.getExpando(ph, "removedNode")) {
          this.onPlaceholderClick(ev, ph);
          return;
        }

        let pluginExtras = this.findPluginExtras(doc);
        if (pluginExtras) {
          for (let j = pluginExtras.length; j-- > 0;) {
            if (pluginExtras[j].title === ph.title) {
              let o = pluginExtras[j].placeholder;
              let n = this.getExpando(o, "removedNode");
              this.setExpando(ph, "removedNode", n);
              this.setPluginExtras(ph, this.getPluginExtras(n));
              this.onPlaceholderClick(ev, ph);
              return;
            }
          }
        }
        break;
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

    if (!(extras && extras.url && extras.mime // && cache
      )) return;

    this.delayExec(this.checkAndEnableObject, 1,
      {
        window: anchor.ownerDocument.defaultView,
        extras: extras,
        anchor: anchor,
        object: object
      });
  },

  confirmEnableObject: function(win, extras) {
    // work around for Linux tooltip obstructing the confirmation dialog
    Thread.delay(function() {
      win.QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIDOMWindowUtils)
        .sendMouseEvent("mousemove", win.document.body, 0, 0, 0, 0, 0);
    }, 100);
    return extras.skipConfirmation || this.confirm(
      this.getAllowObjectMessage(extras),
      "confirmUnblock", undefined, win
    );
  },
  get prompter() {
    delete this.prompter;
    return (this.prompter = Services.prompt);
  },
  confirm(msg, persistPref, title = "NoScript", window = DOM.mostRecentBrowserWindow) {
    var alwaysAsk = { value: this.getPref(persistPref) };
    if(!alwaysAsk.value &&  this.prefs.prefHasUserValue(persistPref) ||
        this.prompter.confirmCheck(window, title, msg,
          this.getString("alwaysAsk"), alwaysAsk)
     ) {
      this.setPref(persistPref, alwaysAsk.value);
      return true;
    }
    return false;
  },

  isLegacyFrameDocument: function(doc) {
    return (doc.defaultView.frameElement instanceof Ci.nsIDOMHTMLFrameElement) && this.isPluginDocumentURL(doc.URL, "iframe");
  },
  isLegacyFrameReplacement: function(obj) {
     return (obj instanceof Ci.nsIDOMHTMLIFrameElement || obj instanceof Ci.nsIDOMHTMLAnchorElement) &&
           (obj.ownerDocument.defaultView.frameElement instanceof Ci.nsIDOMHTMLFrameElement) &&
           obj.ownerDocument.URL == this.createPluginDocumentURL(obj.src || obj.href, "iframe");
  },
  isClickToPlay: (obj) => obj instanceof Ci.nsIObjectLoadingContent && ("playPlugin" in obj) && ("activated" in obj) && !obj.activated,
  handleClickToPlay: function(obj) {
    if (this.isClickToPlay(obj) && this.getPref("smartClickToPlay")) {
      Thread.asap(() => obj.playPlugin());
    }
  },

  checkAndEnableObject:  function(ctx) {
    var extras = ctx.extras;
    if (!this.confirmEnableObject(ctx.window, extras)) return;


    var mime = extras.mime;
    var url = extras.url;

    this.allowObject(url, mime, extras.originSite);
    let a = ctx.anchor;
    var doc = a.ownerDocument;


    var isLegacyFrame = this.isLegacyFrameReplacement(ctx.object);

    if (isLegacyFrame || (mime == doc.contentType && doc.body &&
        (a === doc.body.firstChild &&
         a === doc.body.lastChild ||
         (ctx.object instanceof Ci.nsIDOMHTMLEmbedElement) && ctx.object.src != url))
      ) { // stand-alone plugin or frame
        doc.body.removeChild(a); // TODO: add a throbber
        if (isLegacyFrame) {
          this.setExpando(doc.defaultView.frameElement, "allowed", true);
          // doc.defaultView.frameElement.src = url;
          doc.defaultView.location.replace(url);
        } else this.quickReload(doc.defaultView, true);
        return;
    } else if (this.requireReloadRegExp && this.requireReloadRegExp.test(mime) ||
               this.getExpando(ctx, "requiresReload") ||
               /#!flashvars#.*\b_YUIvid_=/.test(url)) {
      this.quickReload(doc.defaultView);
      return;
    } else if (mime === "WebGL" || mime && mime.endsWith(" (MSE)") || this.getExpando(ctx, "silverlight")) {
      this.allowObject(doc.documentURI, mime);
      if (mime === "WebGL") delete WebGLInterception.sites[this.getSite(doc.documentURI)];
      if (mime && mime.endsWith(" (MSE)")) delete MSEInterception.sites[this.getSite(doc.documentURI)];
      this.quickReload(doc.defaultView);
      return;
    }


    if (url == doc.URL) { // full page content, just reload
      this.quickReload(doc.defaultView);
      return;
    }

    this.setExpando(a, "removedNode", null);
    extras.allowed = true;
    extras.placeholder = null;
    this.delayExec(function() {
      var jsEnabled = ns.isJSEnabled(ns.getSite(doc.documentURI), doc.defaultView);
      if (ctx.object.parentNode) ctx.object.parentNode.removeChild(ctx.object);
      if ("_display" in ctx.object) ctx.object.style.display = ctx.object._display;
      var obj = ctx.object.cloneNode(true);


      function reload(slow) {
        ns.log(ns. getObjectURLWithDOM(obj, url, doc.documentURI));
        ns.allowObjectByDOM(obj, url, doc.documentURI, mime);
        if (slow) {
          ns.log("RELOAD")
          DOM.getDocShellForWindow(doc.defaultView).reload(0);
        } else {
          ns.quickReload(doc.defaultView);
        }
      }
      let win = doc.defaultView;
      let isMedia = win && ("HTMLMediaElement" in win) && (obj instanceof win.HTMLMediaElement);

      if (isMedia) {

        if (jsEnabled && !obj.controls
            && !/(?:=[^&;]{10,}.*){2,}/.test(this.objectKey(url)) // try to avoid infinite loops when more than one long parameter is present in the object key
          ) {
          // we must reload, since the author-provided UI likely had no chance to wire events

          let url = doc.URL;
          if (doc.getElementById("movie_player-html5")) {
            // Youtube HTML5 hack, autoclick thumbnail on page reload
            DOM.getDocShellForWindow(doc.defaultView)
              .chromeEventHandler.addEventListener("load", function(ev) {
              try {
                let w = ev.target.defaultView;
                if (w == w.top) {
                  ev.currentTarget.removeEventListener(ev.type, arguments.callee,  true);
                }
                if (ev.target.URL === url) {
                  let attempts = 10;
                  w.setTimeout(function() {
                    let node = w.document.getElementById("movie_player-html5");
                    if (node && (node = node.getElementsByClassName("video-thumbnail")[0])) {
                      node.click();
                    } else {
                      if (attempts-- > 0) w.setTimeout(arguments.callee, 500);
                    }
                  }, 500);
                }
              } catch(e) {}
            }, true);
          }

          reload(true); // normal reload because of http://forums.informaction.com/viewtopic.php?f=10&t=7195
          return;
        }
        obj.autoplay = true;
      }

      let parent = a.parentNode;

      if (parent && parent.ownerDocument == doc) {

        if (jsEnabled) {

          if (/IFRAME/i.test(extras.tag) && /^https:\/\/www\.youtube\.com\/embed\//.test(url)) {
            reload();
            return;
          }

          ScriptSurrogate.executeSandbox(doc,
            "env.a.__noSuchMethod__ = env.o.__noSuchMethod__ = function(m, a) { return env.n[m].apply(env.n, a) }",
            { a: a, o: ctx.object, n: obj }
          );
        }

        this.setExpando(obj, "allowed", true);
        parent.replaceChild(obj, a);
        var style = doc.defaultView.getComputedStyle(obj, '');

        let body = doc.body;
        if (body && body.clientWidth === obj.offsetWidth && body.clientHeight === obj.offsetHeight) {
          // full size applet/movie
          reload();
          return;
        }


        if (jsEnabled && ((obj.offsetWidth || parseInt(style.width)) < 2 || (obj.offsetHeight || parseInt(style.height)) < 2)
            && !/frame/i.test(extras.tag)) {
          let ds = DOM.getDocShellForWindow(doc.defaultView);
          let ch = ds.currentDocumentChannel;
          if (!(ch instanceof Ci.nsIHttpChannel && ch.requestMethod === "POST"))
            Thread.delay(function() {
              if (obj.offsetWidth < 2 || obj.offsetHeight < 2) reload();
            }, 500); // warning, asap() or timeout=0 won't always work!
        }
        ns.syncUI(doc);
      } else {
        reload();
      }
    }, 10);
    return;

  },

  getSites: function(browser) {
    var sites = {
      scriptCount: 0,
      pluginCount: 0,
      pluginExtras: [],
      pluginSites: [],
      docSites: [],
      all: []
    };
    if (browser) {
      if (browser.content) {
        try {
          sites = this._enumerateSites(browser, sites);
        } catch(ex) {
          if (this.consoleDump) this.dump("Error enumerating sites: " + ex + "," + ex.stack);
        }
      } else {
        sites = JSON.parse(JSON.stringify(this.getExpando(browser, "sites", sites)));
      }
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

  _silverlightPatch: 'HTMLObjectElement.prototype.__defineGetter__("IsVersionSupported", function() { return ((/^application\\/x-silverlight\\b/.test(this.type)) ? (n) => true : undefined); });',

  _protectNamePatch: "let x=__lookupSetter__(\"name\");__defineSetter__(\"name\",function(n){let s=document.currentScript;if(s&&/\\bname\\b/.test(s.textContent)){console.log(\"NoScript prevented \\\"\" + n + \"\\\" from being assigned to window.name\")}else{x.call(this,n);}})",
  get _flashPatch() {
    delete this._flashPatch;
    return this._flashPatch = function() {
      var type = "application/x-shockwave-flash";
      var ver;
      var setAttribute = HTMLObjectElement.prototype.setAttribute;
      HTMLObjectElement.prototype.setAttribute = function(n, v) {
        if (n == "type" && v == type && !this.data) {
          this._pendingType = v;


          this.SetVariable = (...args) => this.__proto__.SetVariable.apply(this, args);
          this.GetVariable = function(n) {
            if (n !== "$version") return this.__proto__.SetVariable.apply(this, arguments);

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

    }.toSource() + "()";
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
        for (let t  of ["object", "embed"]) {
          for (let node  of Array.slice(document.getElementsByTagName(t), 0)) {
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
        Ci.nsIDocShellTreeItem.typeContent,
        browser.docShell.ENUMERATE_FORWARDS
    );

    const nsIDocShell = Ci.nsIDocShell;
    const nsIWebNavigation = Ci.nsIWebNavigation;

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

    const nsIDocShell = Ci.nsIDocShell;

    let top;
    let all = sites.all;
    let docShell = browser.docShell;

    sites.docJSBlocked = !docShell.allowJavascript;
    try {
      sites.cspBlocked = /\b(?:sandbox|script-src\s+'none')\s*(?:[,;]|$)/
        .test(docShell.currentDocumentChannel.QueryInterface(Ci.nsIHttpChannel)
              .getResponseHeader("Content-Security-Policy"));
    } catch (e) {
      sites.cspBlocked = false;
    }

    this.traverseDocShells(function(docShell) {

      let document = docShell.document;
      if (!document) return;

      // Truncate title as needed
      if (this.truncateTitle && document.title.length > this.truncateTitleLen) {
        document.title = document.title.substring(0, this.truncateTitleLen);
      }

      // Collect document / cached plugin URLs
      let win = document.defaultView;
      let docURI = document.documentURI;
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
           all.unshift(domain);
          }
        } catch(e) {}

        sites.docSites.push(url);
        all.push(url);

        for (let redir  of this.getRedirCache(browser, docURI)) {
          all.push(redir.site);
        }
      }

      let domLoaded = !!this.getExpando(document, "domLoaded");

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
          this.dump("Adding plugin sites: " + cache.toSource() + " to " + all.toSource());
        } catch(e) {
          this.dump("Adding " + cache.length + " cached plugin sites");
        }
      }
      if (!this.contentBlocker || this.alwaysShowObjectSources)
        all.push.apply(sites.all, cache);

      all.push.apply(sites.pluginSites, cache);
    }

    cache = this.getExpando(document, "codeSites");
    if (cache) all.push.apply(sites.all, cache);

    const removeBlank = !(this.showBlankSources || sites.topSite == "about:blank");

    for (let j = all.length; j-- > 0;) {
      let url = all[j];
      if (/:/.test(url) &&
          (removeBlank && url == "about:blank" ||
            !(
              /^(?:file:\/\/|[a-z]+:\/*[^\/\s]+)/.test(url) ||
             // doesn't this URL type support host?
              this.getSite(url + "x") == url
            )
          ) && url != "about:"
        ) {
        all.splice(j, 1); // reject scheme-only URLs
      }
    }


    if (!sites.topSite) sites.topSite = all[0] || '';
    sites.all = this.sortedSiteSet(all);
    return sites;
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
    const uri = newChan.URI;

    if (flags === Ci.nsIChannelEventSink.REDIRECT_INTERNAL && oldChan.URI.spec === uri.spec)
      return;

    const rw = this.requestWatchdog;

    ns.reqData(newChan).redirectFrom = oldChan.URI;
    this.reqData(newChan).redirectFrom = oldChan.URI;
    ABE.updateRedirectChain(oldChan, newChan);

    const ph = PolicyState.detach(oldChan);

    var browser;

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


      let win;
      try {
        win = IOUtil.findWindow(newChan);
      } catch (e) {}

      switch(type) {
        case 2: case 9: // script redirection? cache site for menu
          try {
            var site = this.getSite(uri.spec);
            if (!win) win = ctx && ((ctx instanceof Ci.nsIDOMWindow) ? ctx : ctx.ownerDocument.defaultView);
            browser = win && (DOM.findBrowserForNode(win) || DOM.getFrameMM(win));
            if (browser) {
              this.getRedirCache(browser, win.top.document.documentURI)
                  .push({ site: site, type: type });
            } else {
              if (this.consoleDump) this.dump("Cannot find window for " + uri.spec);
            }
          } catch(e) {
            if (this.consoleDump) this.dump(e);
          }
          break;

        case 7: // frame

          ph.extra = CP_FRAMECHECK;
          if (win && win.frameElement && ph.context != win.frameElement) {
            // this shouldn't happen
            if (this.consoleDump) this.dump("Redirected frame change for destination " + uri.spec);
            ph.context = win.frameElement;
          }
          break;
      }

      if (this.shouldLoad.apply(this, ph.toArray()) != CP_OK) {
        if (this.consoleDump) {
          this.dump("Blocked " + oldChan.URI.spec + " -> " + uri.spec + " redirection of type " + type);
        }
        throw "NoScript aborted redirection to " + uri.spec;
      }
    }


    // Document transitions

    if ((oldChan.loadFlags & rw.DOCUMENT_LOAD_FLAGS) || (newChan.loadFlags & rw.DOCUMENT_LOAD_FLAGS) && oldChan.URI.prePath != uri.prePath) {
      if (newChan instanceof Ci.nsIHttpChannel)
        HTTPS.onCrossSiteRequest(newChan, oldChan.URI.spec,
                               browser || DOM.findBrowserForNode(IOUtil.findWindow(oldChan)), rw);

    }

  },

  getRedirCache: function(browser, uri) {
    var redirCache = this.getExpando(browser, "redirCache", {});
    return redirCache[uri] || (redirCache[uri] = []);
  },

  _recentlyBlockedMax: 40,
  recordBlocked: function(win, site, origin) {
    if (!(win && this.getPref("showRecentlyBlocked"))) return;
    let overlay = DOM.getChromeWindow(win).noscriptOverlay;
    if (!overlay) return;

    const l = overlay.recentlyBlocked;
    let pos = l.length;
    while (pos-- > 0) if (l[pos].site === site) break;

    let entry;
    if (pos > -1) {
      entry = l[pos];
      let origins = entry.origins;
      if (origins.indexOf(origin) == -1) origins.push(origin);
      if (pos == l.length - 1) return;
      l.splice(pos, 1);
    } else entry = { site: site, origins: [origin] };

    l.push(entry);
    if (l.length > this._recentlyBlockedMax) {
      overlay.recentlyBlocked = l.slice(- this._recentlyBlockedMax / 2);
    }
  },

  cleanupRequest: DUMMY_FUNC,

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
      if (channel instanceof Ci.nsIHttpChannel &&
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

          if (nosniff || origin && this.getBaseDomain(this.getDomain(origin)) !== this.getBaseDomain(channel.URI.host)) {

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
                : (PolicyUtil.isXSL(ph.context) || ph.mimeType.indexOf("/x") > 0) ? /\bx[ms]l/i : /\bcss\b/i
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
              if (uri instanceof Ci.nsIURL) {
                ext = uri.fileExtension;
                if (!ext) {
                  var m = uri.directory.match(/\.([a-z]+)\/$/);
                  if (m) ext = m[1];
                }
              } else ext = '';

              if (ext &&
                  (ctype === 2 && /^js(?:on)?$/i.test(ext) ||
                   ctype === 4 && (ext == "css" || ext == "xsl" && (PolicyUtil.isXSL(ph.context) || ph.mimeType.indexOf("/x") > 0)))
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
      let contentType;
      let nosniff = this.nosniff && this.hasNoSniffHeader(req);
      try {
        contentType = req.contentType;
        if (!contentType || contentType === "application/x-unknown-content-type") {
          contentType = req.getResponseHeader("Content-type");
          if (nosniff) {
            nosniff = !contentType;
          }
        } else {
          nosniff = false;
        }
        if (this.consoleDump & LOG_SNIFF) {
          this.dump("OCS: " + req.name + ", " + contentType);
        }
      } catch(e) {
        this.dump("OCS: " + req.name + ", CONTENT TYPE UNAVAILABLE YET");
        if (!nosniff) return;  // we'll check later in http-on-examine-merged-response
      }
      if (nosniff) {
        try {
          contentType = req.contentType = "text/plain";
          ns.log("[NoScript] Force text/plain for missing content-type on " + req.name);
        } catch(e) {
          ns.dump(e);
        }
      }
      if (IOUtil.isMediaDocOrFrame(req, contentType)) {
        IOUtil.suspendChannel(req);
        Thread.delay(() => IOUtil.resumeParentChannel(req), 100);
      }
      this.processXSSInfo(req);
    } catch(e) {
      if (this.consoleDump) this.dump(e);
    }
  },
 
  onBeforeLoad: function(win) {
    let docShell = DOM.getDocShellForWindow(win);
    if (!docShell) return;
    let channel = docShell.currentDocumentChannel;
    if (!channel) return;

    const uri = channel.URI;
    const originURI = ABE.getOriginalOrigin(channel);

    let contentType;
    try {
      contentType = channel.contentType;
    } catch(e) {
      contentType = "";
    }

    const topWin = win == win.top;

    if (ns.reqData(channel).checkWindowName) {
      InjectionChecker.checkWindowName(win, channel.URI.spec);
    }
    
    if (!IOUtil.isMediaDocOrFrame(channel, contentType)) {
      return;
    }
    
    try {
      if (this.shouldLoad(7, uri, topWin ? uri : originURI || uri, win.frameElement || win, contentType,
                          win.frameElement ? CP_FRAMECHECK : CP_SHOULDPROCESS) !== CP_OK) {

        channel.loadFlags |= channel.INHIBIT_CACHING;

        if (this.consoleDump & LOG_CONTENT_INTERCEPT)
          this.dump("Media document content type detected");

        if(!topWin) {
          // check if this is an iframe

          if (win.frameElement && !(win.frameElement instanceof Ci.nsIDOMHTMLFrameElement) &&
              this.shouldLoad(5, uri, originURI || IOS.newURI(win.parent.location.href, null, null),
                  win.frameElement, contentType, CP_SHOULDPROCESS) === CP_OK) {
            IOUtil.resumeParentChannel(channel);
            return;
          }

          if (this.consoleDump & LOG_CONTENT_BLOCK)
            this.dump("Deferring framed media document");

          var url = uri.spec;

          let browser = DOM.findBrowserForNode(win) || DOM.getFrameMM(win);
          this.getRedirCache(browser, win.top.document.documentURI).push({site: this.getSite(url), type: 7});
        

          Thread.asap(function() {
            IOUtil.abort(channel);
            if (docShell) {
              var doc = docShell.document;
              let tag = doc.body && doc.body.firstChild && doc.body.firstChild.tagName;
              if (tag) {
                docShell.loadURI(ns.createPluginDocumentURL(url,
                  tag ),
                                 Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY,
                                 null, null, null);
              }
            }
          });

          return;
        }

        this.dump("Blocking top-level plugin document");
        Thread.asap(() => {
          IOUtil.abort(channel);
          for (let tag  of ["embed", "video", "audio"]) {
            let embeds = win.document.getElementsByTagName(tag);
            if (embeds.length > 0 && (tag !== "embed" || this._abortPluginDocLoads)) {
              let eType = "application/x-noscript-blocked";
              let eURL = "data:" + eType + ",";
              for (let j = embeds.length; j-- > 0;) {
                let e = embeds.item(j);
                if (this.shouldLoad(5, uri, null, e, contentType, CP_SHOULDPROCESS) !== CP_OK) {
                  e.src = eURL;
                  e.type = eType;
                }
              }
            }
          }
        }, true);

        return;
      }
    } catch (e) {
      Cu.reportError(e);
      IOUtil.abort(channel);
    }
    IOUtil.resumeParentChannel(channel);
  },

  get _abortPluginDocLoads() {
    delete this._abortPluginDocLoads;
    return (this._abortPluginDocLoads = this.geckoVersionCheck("18.0.1") < 0);
  },
  
  processXSSInfo(req) {
    let browser = IOUtil.findBrowser(req);
    if (browser) {
      let overlay = this.findOverlay(browser);
      if (overlay) {
        overlay.setMetaRefreshInfo(null, browser);
        let xssInfo = ns.reqData(req).XSS;
        if (xssInfo) xssInfo.browser = browser;
        this.requestWatchdog.unsafeReload(browser, false);
        if (xssInfo) {
          this.delayExec(() => overlay.notifyXSS(xssInfo), 500);
        }
      }
    }
  },
  
  hasClearClickHandler: false,
  get clearClickHandler() {
      delete this.clearClickHandler;
      this.hasClearClickHandler = true;
      return this.clearClickHandler = new ClearClickHandler(this);
  },

  _pageModMaskRx: /^(?:chrome|resource|view-source):/,
  onWindowSwitch: function(url, win, docShell) {
    let channel = docShell.currentDocumentChannel;

    if (ns.reqData(channel).xssChecked &&
        this.filterBadCharsets(docShell)) return;

    const doc = docShell.document;
    const flag = "__noScriptEarlyScripts__";
    if (flag in doc && doc[flag] === url) return;
    doc[flag] = url;

    const site = this.getSite(url);
    var jsBlocked = !(docShell.allowJavascript && (this.jsEnabled || this.isJSEnabled(site, doc.defaultView)));



    if (!((docShell instanceof nsIWebProgress) && docShell.isLoadingDocument)) {
      // likely a document.open() page
      url = "wyciwyg:"; // don't execute on document.open() pages with a misleading URL
      jsBlocked = false;
    }
    
    if (channel) {
      this.setExpando(win, "docJSBlocked", ns.reqData(channel).docJBlocked);
    }

    if (this._pageModMaskRx.test(url)) return;

    var scripts;

    if (jsBlocked) {

      this.blockEvents(doc.defaultView);

      if (this.getPref("fixLinks")) {
        let newWin = doc.defaultView;
        newWin.addEventListener("click", this.bind(this.onContentClick), true);
        newWin.addEventListener("change", this.bind(this.onContentChange), true);
      }
    } else {

      if (this.implementToStaticHTML && !("toStaticHTML" in doc.defaultView)) {
        scripts = [this._toStaticHTMLDef];
        doc.addEventListener("NoScript:toStaticHTML", this._toStaticHTMLHandler, false, true);
      }

      let dntPatch = DoNotTrack.getDOMPatch(docShell);
      if (dntPatch) {
        (scripts || (scripts = [])).push(dntPatch);
      }

      if (this.forbidWebGL) {
        let script = WebGLInterception.hook(doc, site);
        if (script)  (scripts || (scripts = [])).push(script);
      }

      if (this.contentBlocker) {
        if (this.liveConnectInterception && this.forbidJava &&
            !this.isAllowedObject(site, "application/x-java-vm", site, site)) {
          (doc.defaultView.wrappedJSObject || doc.defaultView).disablePlugins = this._disablePlugins;
          (scripts || (scripts = [])).push(this._liveConnectInterceptionDef);
        }
        if (this.audioApiInterception && this.forbidMedia &&
            !this.isAllowedObject(site, "audio/ogg", site, site))
          (scripts || (scripts = [])).push(this._audioApiInterceptionDef);

        if (this.forbidMedia && this.contentBlocker) {
          let script = MSEInterception.hook(doc, site);
          if (script)  (scripts || (scripts = [])).push(script);
        }
      }

      if (this.forbidFlash && this.flashPatch)
        (scripts || (scripts = [])).push(this._flashPatch);

      if (this.forbidSilverlight && this.silverlightPatch)
        (scripts || (scripts = [])).push(this._silverlightPatch);

      if( this.jsHackRegExp && this.jsHack && this.jsHackRegExp.test(url))
          (scripts || (scripts = [])).push(this.jsHack);

      if (ns.reqData(channel).protectName && this.getPref("protectWindowNameXAssignment")) {
        (scripts || (scripts = [])).push(this._protectNamePatch);
      }
    }

    ScriptSurrogate.apply(doc, url, url, jsBlocked, scripts);
  },

  onWindowCreated: function(window, site) {
    if (this.consoleDump) this.dump(`1st onWindowCreated ${site}`);
    try {
      this.beforeScripting(window, site);
    } catch(e) {
      Cu.reportError(e);
    }
    (this.onWindowCreated = this._onWindowCreatedReal).apply(this, arguments);
  },

  isBrowserOrigin: (origin) => /^(?:\[System Principal\]$|moz-safe-about:)/.test(origin),

  mustBlockJS: function(window, site, blocker) {
    let document = window.document;
    let origin = this.getPrincipalOrigin(this.getPrincipal(document));
    if (this.isBrowserOrigin(origin)) return false;
    let blockIt;
    if (this.consoleDump) this.dump("Window created, origin: " + origin + ", site: " + site + ", URL: " + document.URL + ", location: " + window.location.href);

    site = this.getSite(origin || site);
    if (site === 'moz-nullprincipal:') {
      site = this.getSite(document.URL);

      if (!site) {
        // "special" URI (e.g. data:), let's use opener
        let docShell = DOM.getDocShellForWindow(window);
        let channel = docShell.currentDocumentChannel;
        if (channel) {
          let loadInfo = channel.loadInfo;
          if (loadInfo) {
            let principal = loadInfo.triggeringPrincipal || loadInfo.loadingPrincipal;
            if (principal) site = this.getSite(principal.origin);
          }
        }
      }
    }

    window._NoScriptSite = site;

    if (this.globalHttpsWhitelist && this.isGlobalHttps(window)) {
      blockIt = false;
    } else {
      if ((this.cascadePermissions || this.restrictSubdocScripting) && window.top !== window) {
        if (this.cascadePermissions) {
          blockIt = blocker.isBlocked(window.top) || this.isUntrusted(site);
          if (!blockIt) {
            let topSite = window.top._NoScriptSite;
            blockIt = !this.isJSEnabled(topSite);
          }
        } else if (this.restrictSubdocScripting && blocker.isBlocked(window.parent)) {
          blockIt = true;
        }
      }
    }

    if (typeof blockIt === "undefined")
      blockIt = !this.isJSEnabled(site);

    if (blockIt) try {
      // If the original content-type was */json but we morphed to text/html, JSON viewer kicked in
      let docShell = DOM.getDocShellForWindow(window);
      let channel = docShell.currentDocumentChannel;
      if (channel instanceof Ci.nsIHttpChannel) {
        let originalContentType = channel.getResponseHeader("Content-Type");
        if (/\/json(?:;|^)/i.test(originalContentType) && channel.contentType === "text/html") blockIt = false;
      }
    } catch (e) {
      this.log(e)
    }

    if (!blockIt && site.substring(0, 3) === "ftp") {
      blockIt = InjectionChecker.checkURL(document.URL);
    }

    return blockIt;
  },

  _onWindowCreatedReal: function(window, site) {
    this.onBeforeLoad(window);
    try {
      let mustBlock = this.mustBlockJS(window, site, WinScript);
      if (this.consoleDump) this.dump(`${mustBlock ? "Forbidding" : "Allowing"} ${site}`);
      if (mustBlock) {
        WinScript.block(window);
      } else {
        WinScript.unblock(window);
      }
    } catch(e) {
      Cu.reportError(e);
    }
  },

  beforeScripting: function(subj, url) { // early stub
    try {
      INCLUDE("ScriptlessBGThumbs");
    } catch(e) {
      Cu.reportError(e);
    }
    if (!this.httpStarted) {

      let url = subj.location || subj.documentURI;

      if (/^(?:about|resource|chrome|file|moz-nullprincipal):/.test(url)) {
        if (/^file|moz-/.test(url))
          this.initContentPolicy(true);
        return;
      }
      if (this.consoleDump) ns.dump(url);

    }
    this.executeEarlyScripts = this.onWindowSwitch;
    // replace legacy code paths
    if (subj.documentElement) { // we got document element inserted
      this.onWindowSwitch = null;
    }
    this.beforeScripting = this._beforeScriptingReal;
    this.beforeScripting(subj, url);
  },
  _beforeScriptingReal: function(subj, url) { // the real thing
    const win = subj.defaultView || subj;
    if (win instanceof Ci.nsIDOMChromeWindow) return;
    const docShell = this.dom.getDocShellForWindow(win);
    if (docShell) {
      this.executeEarlyScripts(docShell.document.documentURI, win, docShell);
    }
  },

  blockEvents: function(window) {
    let et = ["start", "finish", "bounce"],
        eh = function(e) {  e.preventDefault(); e.stopPropagation(); };

    return (this.blockEvents = function(window) {
      for (let t  of et) window.addEventListener(t, eh, true);
    })(window);
  },

  get sanitizeHTML() {
    delete this.sanitizeHTML;
    return this.sanitizeHTML = ("nsIParserUtils" in Ci)
      ? function(s, t) {
          t.innerHTML = Cc["@mozilla.org/parserutils;1"].getService(Ci.nsIParserUtils).sanitize(s, 0)
      }
      : function(s, t) {
          t.appendChild(Cc["@mozilla.org/feed-unescapehtml;1"].getService(Ci.nsIScriptableUnescapeHTML)
                        .parseFragment(s, false, null, t));
      };
  },
  get implementToStaticHTML() {
    delete this.implementToStaticHTML;
    return this.implementToStaticHTML = this.getPref("toStaticHTML");
  },
  sanitizeStaticDOM: function(el) {
     // remove attributes from forms
    for (let f  of Array.slice(el.getElementsByTagName("form"))) {
      for (let a  of Array.slice(f.attributes)) {
        f.removeAttribute(a.name);
      }
    }
    let doc = el.ownerDocument;
    // remove dangerous URLs (e.g. javascript: or data: or reflected XSS URLs)
    for (let a  of ['href', 'to', 'from', 'by', 'values']) {
      let res = doc.evaluate('//@' + a, el, null, Ci.nsIDOMXPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let j = res.snapshotLength; j-- > 0;) {
        let attr = res.snapshotItem(j);
        if (InjectionChecker.checkURL(attr.nodeValue))
          attr.nodeValue = "";
      }
    }
  },
  _toStaticHTMLHandler:  function(ev) {
    try {
      var t = ev.target;
      var doc = t.ownerDocument;
      t.parentNode.removeChild(t);
      var s = t.getAttribute("data-source");
      ns.sanitizeHTML(s, t);
      ns.sanitizeStaticDOM(t);
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
    return this._liveConnectInterceptionDef = function() {
      const w = window;
      var dp = w.disablePlugins;
      delete w.disablePlugins;
      const g = function() {
        const d = document;
        const o = d.createElement("object");
        o.type = "application/x-java-vm";
        o.data = "data:" + o.type + ",";
        d.documentElement.appendChild(o);
        d.documentElement.removeChild(o);
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
    }.toSource() + "()";
  },

  audioApiInterception: true,
  _audioApiInterceptionDef:
    ("defineProperty" in Object)
      ? 'Object.defineProperty(HTMLAudioElement.prototype, "mozWriteAudio", {value: function() {new Audio("data:,")}});'
      : "",
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

  },


  // start nsIWebProgressListener


  onLinkIconAvailable: DUMMY_FUNC,
  onStateChange: function(wp, req, stateFlags, status) {
    var ph;

    if (stateFlags & WP_STATE_START) {
      if (req instanceof Ci.nsIChannel) {
        // handle docshell JS switching and other early duties

        if (PolicyState.isChecking(req.URI)) {
          // ContentPolicy couldn't complete! DOS attack?
          PolicyState.removeCheck(req.URI);
          IOUtil.abort(req);
          this.log("Aborted " + req.URI.spec + " on start, possible DOS attack against content policy.");
          return;
        }

        PolicyState.attach(req); // this is needed after bug 797684 fix, because http observers are notified later

        if ((stateFlags & WP_STATE_START_DOC) == WP_STATE_START_DOC) {
          if (!(req instanceof Ci.nsIHttpChannel) && (
                // prevent about:newTab breakage
                req.URI.spec == "about:blank" && !IOUtil.extractInternalReferrer(req) && Bug.$771655 ||
                req.URI.schemeIs("data") &&  Bug.$789773 ||
                DOM.browserWinURI && req.URI.equals(DOM.browserWinURI)
              )
            ) return;

          let w = wp.DOMWindow;
          if (w) {

            if (w != w.top && w.frameElement) {
              ph = ph || PolicyState.extract(req);
              if (ph && this.shouldLoad(7, req.URI, ph.requestOrigin, w.frameElement, ph.mimeType, CP_FRAMECHECK) != CP_OK) { // late frame/iframe check
                IOUtil.abort(req);
                return;
              }
            }
          }
        }
      }
    } else if ((stateFlags & WP_STATE_STOP))  {
      // STOP REQUEST
      if (req instanceof Ci.nsIHttpChannel) {
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

  onLocationChange(wp, req, location) {},
  onLocationChange2(wp, req, location, flags) {},

  onStatusChange: function(wp, req, status, msg) {
    if (status == 0x804b0003 && (req instanceof Ci.nsIChannel) && !ABE.isDeferred(req)) { // DNS resolving, check if we need to clear the cache
      try {
        var host = req.URI.host;
        if (host) {
          var loadFlags = req.loadFlags;
          var cached = DNS.getCached(host);
          if (cached.expired ||
              loadFlags & LF_VALIDATE_ALWAYS ||
              loadFlags & LF_LOAD_BYPASS_ALL_CACHES) {
            DNS.evict(host);
          }
        }
      } catch (e) {}
    }
  },
  onSecurityChange: DUMMY_FUNC,
  onProgressChange: DUMMY_FUNC,
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
        if ((docShell instanceof Ci.nsIRefreshURI) &&
            (bg || docShell.refreshPending)) {
          var toGo = Math.round((delay - (Date.now() - ts)) / 1000);
          if (toGo < 1) toGo = 1;
          ns.setupRefresh(docShell, docShell.currentURI,  toGo + ";" + uri.spec);
          docShell.resumeRefreshURIs();
        }
      }, false);
    }
    hookFocus(true);
    return false;
  },
  // end nsIWebProgressListener

  _badCharsetRx: /\bUTF-?7\$|^armscii-8$/i,
  _goodCharsetRx: /^UTF-?8$/i,
  filterBadCharsets: function(docShell) {
    try {
      let charsetInfo = docShell.documentCharsetInfo || docShell;
      let cs;
      try {
        cs = charsetInfo.charset;
      } catch (e) {
        cs = docShell.document.characterSet;
      }

      if (this._goodCharsetRx.test(cs)) return false;

      if(this._badCharsetRx.test(cs)) {
        this.log("[NoScript XSS] Neutralizing bad charset " + cs);
      } else {
        let uri = docShell.currentURI;
        if (!(uri instanceof Ci.nsIURL)) return false;
        let url = unescape(uri.spec);
        try {
          let exceptions = this.getPref("xss.checkCharset.exceptions");
          if (exceptions && AddressMatcher.create(exceptions).test(url)) return false;
        } catch (e) {}

        let ic = this.injectionChecker;
        let unicode = /^UTF-?16/i.test(cs) && url.indexOf("\0") !== -1;
        let le = unicode && /LE$/i.test(cs);

        function decode(u) {
          if (unicode) {
            let pos = u.indexOf("\0");
            if (pos > -1) {
              if (le) pos--;
              return u.substring(0, pos) + ic.toUnicode(u.substring(pos), cs);
            }
          }
          return ic.toUnicode(u, cs);
        }

        let check = (original, decoded) => original === decoded || !ic.checkRecursive(decoded, 1);

        let [filePath, query, ref] = ["filePath", "query", "ref"].map((p) => unescape(uri[p]));

        if ( // check...
            // ...whole URL
            check(url, decode(url)) &&
            // ...whole path
            check(filePath, decode(filePath)) &&
            // ...path parts
            check(filePath,  uri.filePath.split("/").map((p) => decode(unescape(p))).join("/")) &&
            // ... whole query
            check(query, decode(query)) &&
            // ... query parts
            check(query, uri.query.split("&").map((p) => p.split("=").map((p) => decode(unescape(p))).join("=")).join("&")) &&
            // ... fragment
            check(ref, decode(ref))
          ) return false;

        this.log("[NoScript XSS] Potential XSS with charset " + cs + ", aborting request");
      }

      this.requestWatchdog.abortChannel(docShell.currentDocumentChannel);
      return true;
    } catch(e) {
      ns.log(e)
      if (this.consoleDump) this.dump("Error filtering charset " + e);
    }
    return false;
  },

  _attemptNavigationInternal: function(doc, destURL, callback) {
    var cs = doc.characterSet;
    var uri = IOS.newURI(destURL, cs, IOS.newURI(doc.documentURI, cs, null));

    if (/^https?:\/\//i.test(destURL)) callback(doc, uri);
    else {
      var done = false;
      var req = ns.createCheckedXHR("HEAD", uri.spec, function() {
        if (req.readyState < 2) return;
        try {
          if (!done && req.status) {
            done = true;
            if (req.status == 200) callback(doc, uri);
            req.abort();
          }
        } catch(e) {}
      }, doc.defaultView);
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
    if (!(s instanceof Ci.nsIDOMHTMLSelectElement) ||
        s.hasAttribute("multiple") ||
        !/open|nav|location|\bgo|load/i.test(s.getAttribute("onchange"))) return;

    var doc = s.ownerDocument;
    var url = doc.documentURI;
    if (this.isJSEnabled(this.getSite(url), doc.defaultView)) return;

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

    while (!(a instanceof Ci.nsIDOMHTMLAnchorElement || a instanceof Ci.nsIDOMHTMLAreaElement)) {
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
        if (!(form instanceof Ci.nsIDOMHTMLFormElement)) {
          form = doc.forms.namedItem(fixedHref);
        }
      }
      if (!form) {
        var m = onclick.match(/(?:(?:\$|document\.getElementById)\s*\(\s*["']#?([\w\-]+)[^;]+|\bdocument\s*\.\s*(?:forms)?\s*(?:\[\s*["']|\.)?([^\.\;\s"'\]]+).*)\.submit\s*\(\)/);
        form = m && (/\D/.test(m[1]) ? (doc.forms.namedItem(m[1]) || doc.getElementById(m[1])) : doc.forms.item(parseInt(m[1])));
        if (!(form && (form instanceof Ci.nsIDOMHTMLFormElement))) {
          while ((form = a.parentNode) && form != doc && !form instanceof Ci.nsIDOMHTMLFormElement);
        }
      }
      if (form && (form instanceof Ci.nsIDOMHTMLFormElement)) {
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
    const findLink = /(['"])(.*?)\1/g;
    const badURIChar = /[^\/\w-\?\.#%=&:@]/;
    findLink.lastIndex = 0;
    var maxScore = 0;
    var m, href;
    while ((m = findLink.exec(js))) {
      let s = m[2];
      if (/^https?:\/\//.test(s)) return s;
      let score = (badURIChar.test(s) ? 0 : 3) +
        (s.split("/").length - 1) * 2 +
        s.split("."). length - 1;
      if (score > maxScore) {
        maxScore = score;
        href = s;
      }
    }
    return href || "";
  },


  checkLocalLink: function(url, principal, fromPolicy) {

    if (!this.allowLocalLinks)
      return fromPolicy;

    if (url instanceof Ci.nsIURI) {
      if (!url.schemeIs("file")) return fromPolicy;
      url = url.spec;
    } else if (typeof url !== "string" || url.indexOf("file:///") !== 0) return fromPolicy;
    let site = principal.URI ? principal.URI.spec : this.getPrincipalOrigin(principal);

    if (!/^(ht|f)tps?:/.test(site)) return fromPolicy;

    let [to, from] = ["to", "from"].map(function(n) { return AddressMatcher.create(ns.getPref("allowLocalLinks." + n, "")) });

    return ((from
              ? from.test(site)
              : this.isJSEnabled(this.getSite(site)))
        && (!to || to.test(url))
      );
  },

  createXSanitizer: function() {
    return new XSanitizer(this.filterXGetRx, this.filterXGetUserRx);
  },

  get externalFilters() {
    delete this.externalFilters;
    if (("nsIProcess2" in Ci || // Fx 3.5
         "runAsync" in Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess) // Fx >= 3.6
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
    return this.compatEvernote = ("IWebClipper3" in Ci) && this.getPref("compat.evernote") && {
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
    return this.compatGNotes = ("@google.com/gnotes/app-context;1" in Cc) && this.getPref("compat.gnotes") &&
      "http://www.google.com/notebook/static_files/blank.html";
  },

  consoleService: Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService),

  log: function(msg, dump) {
    if (msg.stack) msg += msg.stack;
    this.consoleService.logStringMessage(msg);
    if (dump) this.dump(msg, true);
  },

  logError: function(e, dump, cat) {
    var se = Cc["@mozilla.org/scripterror;1"].createInstance(Ci.nsIScriptError);
    se.init(e.message, e.fileName, /^javascript:/i.test(e.fileName) ? e.fileName : null,
            e.lineNumber, 0, 0, cat || "Component JS");
    if (dump && this.consoleDump) this.dump(e.message, true);
    this.consoleService.logMessage(se);
  },

  dump: function(msg, noConsole) {
    if (!this.consoleDump) return;
    if (msg.stack) msg += msg.stack;
    msg = `[NoScript ${this.childProcess ? "C" : "P"}] ${msg}`;
    dump(`${msg}\n`);
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
      try {
        window.noscriptOverlay.initPopups();
      } catch(e) {}
      return true;
    } catch(e) {
      this.dump(e);
      return false;
    }
  },


}

ns.wrappedJSObject = ns;
ns.__global__ = this; // debugging helper necessary on Gecko >= 13
ns._e = function(f) {
  return eval("(" + f + ")()");
}
var Main = ns;


