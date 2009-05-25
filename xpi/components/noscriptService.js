/***** BEGIN LICENSE BLOCK *****

NoScript - a Firefox extension for whitelist driven safe JavaScript execution
Copyright (C) 2004-2009 Giorgio Maone - g.maone@informaction.com

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA

***** END LICENSE BLOCK *****/

const CI = Components.interfaces;
const CC = Components.classes;
const WP_STATE_START = CI.nsIWebProgressListener.STATE_START;
const WP_STATE_STOP = CI.nsIWebProgressListener.STATE_STOP;
const WP_STATE_TRANSFERRING = CI.nsIWebProgressListener.STATE_TRANSFERRING;
const WP_STATE_DOC = CI.nsIWebProgressListener.STATE_IS_DOCUMENT;
const WP_STATE_START_DOC = WP_STATE_START | WP_STATE_DOC;
const WP_STATE_TRANSFERRING_DOC = WP_STATE_TRANSFERRING | WP_STATE_DOC;

const NS_BINDING_ABORTED = 0x804B0002;
const NS_ERROR_REDIRECT_LOOP = 0x804B001f;

const CP_OK = 1;
const CP_NOP = function() { return CP_OK };
const CP_FRAMECHECK = 2;
const CP_SHOULDPROCESS = 4;
const CP_EXTERNAL = 0;

const LOG_CONTENT_BLOCK = 1;
const LOG_CONTENT_CALL = 2;
const LOG_CONTENT_INTERCEPT = 4;
const LOG_CHROME_WIN = 8;
const LOG_XSS_FILTER = 16;
const LOG_INJECTION_CHECK = 32;
const LOG_DOM = 64;
const LOG_JS = 128;
const LOG_LEAKS = 1024;
const LOG_SNIFF = 2048;
const LOG_CLEARCLICK = 4096;

const NOSCRIPT_HOST = "...noscript...";

const HTML_NS = "http://www.w3.org/1999/xhtml";

const WHERE_UNTRUSTED = 1;
const WHERE_TRUSTED = 2;
const ANYWHERE = 3;

const ABID = "@mozilla.org/adblockplus;1";

// XPCOM scaffold
const EXTENSION_ID="{73a6fe31-595d-460b-a920-fcc0f8843232}";
const SERVICE_NAME="NoScript Service";
const SERVICE_ID="{31aec909-8e86-4397-9380-63a59e0c5ff5}";
const SERVICE_CTRID = "@maone.net/noscript-service;1";
const SERVICE_CONSTRUCTOR = NoscriptService;

// interfaces implemented by this component
const SERVICE_IIDS = 
[ 
CI.nsIObserver,
CI.nsISupports,
CI.nsISupportsWeakReference,
CI.nsIContentPolicy,
CI.nsIWebProgressListener,
CI.nsIChannelEventSink
];

// categories which this component is registered in
const SERVICE_CATS = ["app-startup", "content-policy"];


const LOADER = CC["@mozilla.org/moz/jssubscript-loader;1"].getService(CI.mozIJSSubScriptLoader);
const INCLUDE = function(name) {
  if (arguments.length > 1)
    for (var j = 0, len = arguments.length; j < len; j++)
      arguments.callee(arguments[j]);
  else
    LOADER.loadSubScript("chrome://noscript/content/"+ name + ".js");
}

INCLUDE('XPCOM', 'Sites', 'DOM');

var ns; // singleton
function NoscriptService() {
  this.wrappedJSObject = ns = this;
  this.register();
}

NoscriptService.prototype = {
  VERSION: "1.9.3.3"
,
  QueryInterface: xpcom_generateQI(SERVICE_IIDS),
  generateQI: xpcom_generateQI
,
  // nsIObserver implementation 
  observe: function(subject, topic, data) {
    // dump(SERVICE_NAME+" notified of "+subject+","+topic+","+data); //DEBUG
    if (subject instanceof CI.nsIPrefBranch2) {
      this.syncPrefs(subject, data);
    } else {
      switch (topic) {
        case "xpcom-shutdown":
          this.unregister();
          break;
        case "profile-before-change": 
          this.dispose();
          break;
        case "profile-after-change":
          try {
            this.init();
          } catch(e) {
            this.dump("Init error -- " + e.message);
          }
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
      }
    }
  },
  
  registerToplevel: function(window) {
    
    if ((window instanceof CI.nsIDOMChromeWindow) && !window.opener &&
       (window instanceof CI.nsIDOMNSEventTarget)) {
      window.isNewToplevel = true;
      if (this.consoleDump & LOG_CHROME_WIN) {
        this.dump("Toplevel register, true");
      }
      this.handleToplevel.ns = this;
      window.addEventListener("load", this.handleToplevel, false);
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
  
  register: function() {
    const osvr = CC['@mozilla.org/observer-service;1'].getService(CI.nsIObserverService);
    osvr.addObserver(this, "profile-before-change", true);
    osvr.addObserver(this, "xpcom-shutdown", true);
    osvr.addObserver(this, "profile-after-change", true);
    osvr.addObserver(this, "toplevel-window-ready", true);
  }
,
  unregister: function() {
    try {
      const osvr = CC['@mozilla.org/observer-service;1'].getService(CI.nsIObserverService);
      osvr.removeObserver(this, "profile-before-change");
      osvr.removeObserver(this, "xpcom-shutdown");
      osvr.removeObserver(this, "profile-after-change");
      osvr.removeObserver(this, "toplevel-window-ready");
    } catch(e) {
      this.dump(e + " while unregistering.");
    }
  }
,
  
  // Preference driven properties
  autoAllow: false,

  blockCrossIntranet: true,
  blockNSWB: false,
  
  consoleDump: 0,
  consoleLog: false,
  
  truncateTitle: true,
  truncateTitleLen: 255,
  
  showPlaceholder: true,
  showUntrustedPlaceholder: true,
  collapseObject: false,
  abpRemoveTabs: false,
  opaqueObject: 1,
  clearClick: 3,

  
  forbidSomeContent: false,
  contentBlocker: false,
  
  forbidChromeScripts: false,
  forbidData: true,
  
  forbidJarDocuments: true,
  forbidJarDocumentsExceptions: null,
  
  forbidJava: true,
  forbidFlash: false,
  forbidFlash: true,
  forbidPlugins: false,
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
  silverlightPatch: false,
  
  nselNever: false,
  nselForce: true,

  filterXGetRx: "(?:<+(?=[^<>=\\d\\. ])|[\\\\'\"\\x00-\\x07\\x09\\x0B\\x0C\\x0E-\\x1F\\x7F])",
  filterXGetUserRx: "",
  
  
  whitelistRegExp: null,
  allowedMimeRegExp: null, 
  hideOnUnloadRegExp: null,
  requireReloadRegExp: null,
  ignorePorts: true,

  
  resetDefaultPrefs: function(prefs, exclude) {
    exclude = exclude || [];
    var children = prefs.getChildList("", {});
    for (var j = children.length; j-- > 0;) {
      if (exclude.indexOf(children[j]) < 0) {
        if (prefs.prefHasUserValue(children[j])) {
          dump("Resetting noscript." + children[j] + "\n");
          try {
            prefs.clearUserPref(children[j]);
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
        try {
          this.jsPolicySites.fromPref(this.policyPB);
        } catch(ex) {
          this.resetDefaultSitePrefs();
        }
        break;
      case "temp":
        this.tempSites.sitesString = this.getPref(name, "");
      break;
      case "gtemp":
        this.gTempSites.sitesString = this.getPref(name, "");
      break;
      case "untrusted":
        this.untrustedSites.sitesString = this.getPref(name, "");
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
      case "forbidIFrames":
      case "forbidFrames":
        this[name]=this.getPref(name, this[name]);
        this.forbidSomeContent = this.forbidJava || this.forbidFlash ||
           this.forbidSilverlight || this.forbidPlugins ||
            this.forbidIFrames || this.forbidFrames;
      break;
      
      case "abp.removeTabs":
        this.abpRemoveTabs = this.abpInstalled && this.getPref(name);
      break;
    
      case "emulateFrameBreak":
      case "filterXPost":
      case "filterXGet":
      case "blockXIntranet":
      case "safeToplevel":
      case "autoAllow":
      case "contentBlocker":
      case "docShellJSBlocking":
      case "showUntrustedPlaceholder":
      case "collapseObject":
      case "truncateTitle":
      case "truncateTitleLen":
      case "forbidChromeScripts":
      case "forbidData":
      case "forbidJarDocuments":
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
      case "silverlightPatch":
      case "allowHttpsOnly":
        this[name] = this.getPref(name, this[name]);  
      break;
      
      case "clearClick.exceptions":
      case "clearClick.subexceptions":
        ClearClickHandler.prototype[name.split('.')[1]] = URIPatternList.create(this.getPref(name, ''));
      break;
      
      case "secureCookies":
      case "allowHttpsOnly":
        HTTPS[name] = this.getPref(name, HTTPS[name]);  
      break;
      
    
    
      case "secureCookiesExceptions":
      case "secureCookiesForced":
      case "httpsForced":
      case "httpsForcedExceptions":
        HTTPS[name] = URIPatternList.create(this.getPref(name, ''));
      break;

      case "consoleDump":
        this[name] = this.getPref(name, this[name]);
        this.injectionChecker.logEnabled = this.consoleDump & LOG_INJECTION_CHECK;
        DOM.consoleDump = this.consoleDump & LOG_DOM;
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
      case "forbidJarDocumentsExceptions":
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
      case "opacizeObject":
      case "clearClick":
        this.updateCssPref(name);
        if ((name == "nselNever") && this.getPref("nselNever") && !this.blockNSWB) {
          this.setPref("blockNSWB", true);
        }
      break;
      
      case "policynames":
        this.setupJSCaps();
      break;
    }
  },
  
  rxParsers: {
    simple: function(s, flags) {
      return new RegExp(s, flags);
    },
    multi: function(s, flags) {
      var anchor = /\^/.test(flags);
      if(anchor) flags = flags.replace(/\^/g, '');
       
      var lines = s.split(/[\n\r]+/);
      var rxx = [];
      var l;
      for (var j = lines.length; j-- > 0;) {
        l = lines[j];
        if (/\S/.test(l)) {
          if(anchor && l[0] != '^') {
            l = '^' + l + '$';
          }
          rxx.push(new RegExp(l, flags));
        } else {
          lines.splice(j, 1);
        }
      }
      if (!rxx.length) return null;
      
      rxx.test = function(s) {
        for (var j = this.length; j-- > 0;) {
          if (this[j].test(s)) return true;
        }
        return false;
      }
      rxx.toString = function() { return lines.join("\n"); }
      return rxx;
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
    var value = this[name] = this.getPref(name, value);
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
        sheet = '.__noscriptPlaceholder__ > .__noscriptPlaceholder__1 { display: block !important; ' +
                'outline-color: #fc0 !important; -moz-outline-color: #fc0 !important; outline-style: solid !important; -moz-outline-style: solid !important; outline-width: 1px !important; -moz-outline-width: 1px !important; outline-offset: -1px !important; -moz-outline-offset: -1px !important;' +
                'cursor: pointer !important; background: #ffffe0 url("' + 
                    this.pluginPlaceholder + '") no-repeat left top !important; opacity: 0.6 !important; margin-top: 0px !important; margin-bottom: 0px !important;} ' +
                '.__noscriptPlaceholder__1 > .__noscriptPlaceholder__2 { display: block !important; background-repeat: no-repeat !important; background-color: transparent !important; width: 100%; height: 100%; display: block; margin: 0px; border: none } ' +
                'noscript .__noscriptPlaceholder__ { display: inline !important; }';
        break;
      case "clearClick":
      case "opaqueObject":
        sheet = ".__noscriptOpaqued__ { opacity: 1 !important; visibility: visible; } " +
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
    };
    this.updateStyleSheet(sheet, value);
  },
   
  updateStyleSheet: function(sheet, enabled) {
    const sssClass = CC["@mozilla.org/content/style-sheet-service;1"];
    if (!sssClass) return;
    
    const sss = sssClass.getService(CI.nsIStyleSheetService);
    const uri = SiteUtils.ios.newURI("data:text/css;charset=utf8," + sheet, null, null);
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
    delete this.__proto__.getString;
    INCLUDE('Strings');
    const ss = new Strings("noscript");
    return this.__proto__.getString = function(name, parms) { return ss.getString(name, parms) };
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
    const ios = SiteUtils.ios;
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
    try {
      SiteUtils.ios.newChannel("chrome://noscript/content/", null, null).open().close();
    } catch(e) {
      this.disabled = true;
      dump("NoScript disabled on this profile\n");
      return false;
    }
    this._inited = true;
    
    this._initResources();

    this.initTldService();
    
    this.xcache = new XCache();
    
    const osvr = CC['@mozilla.org/observer-service;1'].getService(CI.nsIObserverService);
    if (!this.requestWatchdog) {
      osvr.addObserver(this.requestWatchdog = new RequestWatchdog(this), "http-on-modify-request", true);
      osvr.addObserver(this.requestWatchdog, "http-on-examine-response", true);
    }
    osvr.addObserver(this, "em-action-requested", true);
    
    const dls = CC['@mozilla.org/docloaderservice;1'].getService(CI.nsIWebProgress);
    dls.addProgressListener(this, CI.nsIWebProgress.NOTIFY_LOCATION | CI.nsIWebProgress.NOTIFY_STATE_REQUEST);


    const prefserv = this.prefService = CC["@mozilla.org/preferences-service;1"]
      .getService(CI.nsIPrefService).QueryInterface(CI.nsIPrefBranch);

    const PBI = CI.nsIPrefBranch2;
    this.caps = prefserv.getBranch("capability.policy.").QueryInterface(PBI);
    this.defaultCaps = prefserv.getDefaultBranch(this.caps.root);

    this.policyPB = prefserv.getBranch("capability.policy." + this.POLICY_NAME + ".").QueryInterface(PBI);
    this.prefs = prefserv.getBranch("noscript.").QueryInterface(PBI);
    
    this.policyPB.addObserver("sites", this, true);
    
    this.prefs.addObserver("", this, true);
    this.mozJSPref = prefserv.getBranch("javascript.").QueryInterface(PBI);
    this.mozJSPref.addObserver("enabled", this, true);
    
    this.mandatorySites.sitesString = this.getPref("mandatory", "chrome: about: resource:");
    
    this.captureExternalProtocols();
    
    for each(var p in [
      "autoAllow",
      "allowClipboard", "allowLocalLinks",
      "allowedMimeRegExp", "hideOnUnloadRegExp", "requireReloadRegExp",
      "blockCrossIntranet",
      "blockNSWB",
      "consoleDump", "consoleLog", "contentBlocker",
      "docShellJSBlocking",
      "filterXPost", "filterXGet", 
      "filterXGetRx", "filterXGetUserRx", 
      "filterXExceptions",
      "forbidChromeScripts",
      "forbidJarDocuments", "forbidJarDocumentsExceptions",
      "forbidJava", "forbidFlash", "forbidSilverlight", "forbidPlugins", 
      "forbidIFrames", "forbidIFramesContext", "forbidFrames", "forbidData",
      "forbidMetaRefresh",
      "forbidXBL", "forbidXHR",
      "alwaysBlockUntrustedContent",
      "global", "ignorePorts",
      "injectionCheck", "injectionCheckSubframes",
      "jsredirectIgnore", "jsredirectFollow", "jsredirectForceShow",
      "jsHack", "jsHackRegExp",
      "emulateFrameBreak",
      "nselNever", "nselForce",
      "clearClick", "clearClick.exceptions", "clearClick.subexceptions", "opaqueObject",
      "showPlaceholder", "showUntrustedPlaceholder", "collapseObject", "abp.removeTabs",
      "temp", "untrusted", "gtemp",
      "silverlightPatch",
      "secureCookies", "secureCookiesExceptions", "secureCookiesForced",
      "httpsForced", "httpsForcedExceptions", "allowHttpsOnly",
      "truncateTitle", "truncateTitleLen",
      "whitelistRegExp",
      ]) {
      try {
        this.syncPrefs(this.prefs, p);
      } catch(e) {
        dump("[NoScript init error] " + e.stack + " setting " + p + "\n");
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
    
    this.reloadWhereNeeded(); // init snapshot
    
    this.savePrefs(true); // flush preferences to file

    // hook on redirections (non persistent, otherwise crashes on 1.8.x)
    CC['@mozilla.org/categorymanager;1'].getService(CI.nsICategoryManager)
      .addCategoryEntry("net-channel-event-sinks", SERVICE_CTRID, SERVICE_CTRID, false, true);
    
    if (this.abpInstalled) try {
      // remove the NoScript Development Support Filterset if it exists
      CC[ABID].createInstance().wrappedJSObject.removeExternalSubscription("NoScript.net");
    } catch(e) {
      this.dump(e);
    }
    
    return true;
  },
  
  
  
  dispose: function() {
    try {
      if(!this._inited) return;
      this._inited = false;
      
      this.shouldLoad = this.shouldProcess = CP_NOP;
      
      CC['@mozilla.org/categorymanager;1'].getService(CI.nsICategoryManager)
        .deleteCategoryEntry("net-channel-event-sinks", SERVICE_CTRID, SERVICE_CTRID, false);
      
      const osvr = CC['@mozilla.org/observer-service;1'].getService(CI.nsIObserverService);
      if (this.requestWatchdog) {
        osvr.removeObserver(this.requestWatchdog, "http-on-modify-request");
        osvr.removeObserver(this.requestWatchdog, "http-on-examine-response");
        this.requestWatchdog = null;
      }
      osvr.removeObserver(this, "em-action-requested");
            
      const dls = CC['@mozilla.org/docloaderservice;1'].getService(CI.nsIWebProgress);
      dls.removeProgressListener(this);
      
      this.prefs.removeObserver("", this);
      this.mozJSPref.removeObserver("enabled", this);
      this.resetJSCaps();
      this.resetPolicyState();
      
      if (this.placesPrefs) this.placesPrefs.dispose();
      
      if(this.consoleDump & LOG_LEAKS) this.reportLeaks();
    } catch(e) {
      this.dump(e + " while disposing.");
    }
  },
  
 
  reportLeaks: function() {
    // leakage detection
    this.dump("DUMPING " + this.__parent__);
    for(var v in this.__parent__) {
      this.dump(v + " = " + this.__parent__[v] + "\n");
    }
  },
  
  captureExternalProtocols: function() {
    try {
      const ph = this.prefService.getDefaultBranch("network.protocol-handler.");
      if (this.getPref("fixURI", true)) {
        try {
          ph.setBoolPref("expose-all", true);
        } catch(e1) {}
        var prots = [];
        for each(var key in ph.getChildList("expose.", {})) {
          try {
            ph.setBoolPref(key, true);
            prots.push(key.replace("expose.", ""));
            if (ph.prefHasUserValue(key)) ph.clearUserPref(key);
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
      ) this.setPref(p, sites[p].sitesString);
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
    this.setPref("untrusted", snapshot || this.untrustedSites.sitesString);
  },
  
  manualSites: new PolicySites(),
  isManual: function(s) {
    return !!this.manualSites.matches(s);
  },
  setManual: function(s, b) {
    if (b) this.manualSites.add(s);
    else this.manualSites.remove(s, true);
    return b;
  },
  
  autoTemp: function(site) {
    if (!(this.isUntrusted(site) || this.isManual(site))) {
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
  isForbiddenByHttpsStatus: function(s) {
    return HTTPS.allowHttpsOnly && HTTPS.shouldForbid(s);
  }
,
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
      if (this.forbidImpliesUntrust) {
        this.setUntrusted(site, true);
      } else {
        this.setManual(site, true);
      }
    }
    this.flushCAPS();
    return is;
  },
  
  get forbidImpliesUntrust() {
    return this.globalJS || this.autoAllow || this.getPref("forbidImpliesUntrust", false);
  }
,
  checkShorthands: function(site, map) {
    if (this.whitelistRegExp && this.whitelistRegExp.test(site)) {
      return true;
    }
    
    map = map || this.jsPolicySites.sitesMap;
    
    if (/:\d+$/.test(site)) {
      if (this.ignorePorts) {
        // default match ignoring port
        if (this.isJSEnabled(site.replace(/:\d+$/, ''))) return true;
      } else {
        // port matching, with "0" as port wildcard  and * as nth level host wildcard
        var key = site.replace(/\d+$/, "0");
        if (map[key] || map[site]) return true;
        var keys = site.split(".");
        if (keys.length > 1) {
          var prefix = keys[0].match(/^https?:\/\//i)[0] + "*.";
          while (keys.length > 2) {
            keys.shift();
            key = prefix + keys.join(".");
            if (map[key] || map[key.replace(/\d+$/, "0")]) return true;
            if (map[prefix + keys.join(".")]) return true;
          }
        }
      }
    }
    // check IP leftmost portion up to 2nd byte (e.g. [http://]192.168 or [http://]10.0.0)
    var m = site.match(/^(https?:\/\/)((\d+\.\d+)\.\d+)\.\d+(?::\d|$)/);
    return m && (map[m[2]] || map[m[3]] || map[m[1] + m[2]] || map[m[1] + m[3]]);
  }
,
  flushCAPS: function(sitesString) {
    const ps = this.jsPolicySites;
    if (sitesString) ps.sitesString = sitesString;
    
    // dump("Flushing " + ps.sitesString);
    ps.toPref(this.policyPB);
  }
,
  get injectionChecker() {
    return InjectionChecker;
  }
,
  splitList: function(s) {
    return s?/^[,\s]*$/.test(s)?[]:s.split(/\s*[,\s]\s*/):[];
  }
,
  get placesPrefs() {
    if (!this.getPref("placesPrefs", false)) return null; 
    delete this.__proto__.placesPrefs;
    try {
      INCLUDE('PlacesPrefs');
      PlacesPrefs.init();
    } catch(e) {
      PlacesPrefs = null;
    }
    return this.__proto__.placesPrefs = PlacesPrefs;
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
      const url = (site instanceof CI.nsIURL) ? site : SiteUtils.ios.newURI(site, null, null);
      const host = url.host;
      return force || (this.ignorePorts || url.port == -1) && host[host.length - 1] != "." && 
            (host.lastIndexOf(".") > 0 || host == "localhost") ? host : '';
    } catch(e) {
      return '';
    }
  },
  
  _tldService: null,
  initTldService: function() {
      var srv = null;
      try {
        if (CI.nsIEffectiveTLDService) {
          var srv = CC["@mozilla.org/network/effective-tld-service;1"]
                  .getService(CI.nsIEffectiveTLDService);
          if (typeof(srv.getBaseDomainFromHost) == "function"
              && srv.getBaseDomainFromHost("bbc.co.uk") == "bbc.co.uk" // check, some implementations are "fake" (e.g. Songbird's)
            ) {
            return this._tldService = srv;
          }
        }
        INCLUDE('EmulatedTLDService');
        return this._tldService = EmulatedTLDService;
      } catch(ex) {
        this.dump(ex);
      }
      return null;
  },

  getBaseDomain: function(domain) {
    if (!domain || /^[\d\.]+$/.test(domain)) return domain; // IP
    
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
    } catch(e) {
      return "";
    }
  }
,

  delayExec: function(callback, delay) {
    const timer = CC["@mozilla.org/timer;1"].createInstance(
      CI.nsITimer);
     var args = Array.prototype.slice.call(arguments, 2);
     timer.initWithCallback({ 
         notify: this.delayedRunner,
         context: { callback: callback, args: args, self: this }
      },  delay || 1, 0);
  },
  delayedRunner: function() {
    var ctx = this.context;
    try {
       ctx.callback.apply(ctx.self, ctx.args);
     } catch(e) {
        if(ns.consoleDump) ns.dump("Delayed Runner error: " + e);
     }
     finally {
       ctx.args = null;
       ctx.callback = null;
     }
  }
,
  RELOAD_NO: -1,
  RELOAD_CURRENT: 1,
  RELOAD_ALL: 0,
  safeCapsOp: function(callback, reloadPolicy) {
    this.delayExec(function() {
      try {
        callback(this);
        this.savePrefs();
        if (reloadPolicy != this.RELOAD_NO) {
          this.reloadWhereNeeded(reloadPolicy == this.RELOAD_CURRENT);
        }
      } catch(e) {
        this.dump("FAILED TO SAVE PERMISSIONS! " + e);
      }
     }, 0);
  }
,
  _lastSnapshot: null,
  _lastGlobal: false,
  _lastObjects: null,
  reloadWhereNeeded: function(currentTabOnly) {
    var snapshot = this._lastSnapshot;
    const ps = this.jsPolicySites;
    const global = this.jsEnabled;
    var lastGlobal = this._lastGlobal;
    this._lastGlobal = global;
    this._lastSnapshot = global ? this.untrustedSites.clone() : ps.clone();
    

    var lastObjects = this._lastObjects || this.objectWhitelist;
    this._lastObjects = this.objectWhitelist;
    
    this.initContentPolicy();
    
    if (!snapshot ||
        global == lastGlobal && lastObjects == this.objectWhitelist && 
        ps.equals(snapshot)
        ) 
      return false;
  
    
    if (!this.getPref("autoReload", true)) return false;
    if (global != lastGlobal && !this.getPref("autoReload.global", true)) return false;
    
    currentTabOnly = currentTabOnly || !this.getPref("autoReload.allTabs", true) ||
      global != lastGlobal && !this.getPref("autoReload.allTabsOnGlobal", false);
    
    var useHistory = this.getPref("xss.reload.useHistory", false);
    var useHistoryExceptCurrent = this.getPref("xss.reload.useHistory.exceptCurrent", true);
      
    var ret = false;
    var docSites, site;
    var prevStatus, currStatus;
    
    var webNav, url;
    const nsIWebNavigation = CI.nsIWebNavigation;
    const nsIURL = CI.nsIURL;
    const LOAD_FLAGS = nsIWebNavigation.LOAD_FLAGS_NONE;
 
    const untrustedReload = !this.getPref("xss.trustReloads", false);

    var bi = DOM.createBrowserIterator();
    for (var browser, j; browser = bi.next();) {
      docSites = this.getSites(browser);
      
      
      
      for (j = docSites.length; j-- > 0;) {
 
        prevStatus = lastGlobal ? !(this.alwaysBlockUntrustedContent && snapshot.matches(docSites[j])) : !!snapshot.matches(docSites[j]);
        currStatus = this.isJSEnabled(docSites[j]) || !!this.checkShorthands(docSites[j]);
        if (currStatus != prevStatus) {
          ret = true;
          if (currStatus) 
            this.requestWatchdog.setUntrustedReloadInfo(browser, true);
          
          webNav = browser.webNavigation;
          url = webNav.currentURI;
          if (url.schemeIs("http") || url.schemeIs("https")) {
            this.requestWatchdog.noscriptReload = url.spec;
          }
          try {
            webNav = webNav.sessionHistory.QueryInterface(nsIWebNavigation);
            if (currStatus && webNav.index && untrustedReload) {
              try {
                site = this.getSite(webNav.getEntryAtIndex(webNav.index - 1, false).URI.spec);
                this.requestWatchdog.setUntrustedReloadInfo(browser, site != docSites[j] && !ps.matches(site));
              } catch(e) {}
            }
            
            if (useHistory) {
              if (useHistoryExceptCurrent) {
                useHistoryExceptCurrent = false;
              } else if(!(url instanceof nsIURL && url.ref || url.spec.substring(url.spec.length - 1) == "#")) {
                if (useHistoryCurrentOnly) useHistory = false;
                webNav.gotoIndex(webNav.index);
                break;
              }
            }
          } catch(e) {}
          browser.webNavigation.reload(LOAD_FLAGS);
          break;
        }
      }
      
      if(j < 0) { 
        // check plugin objects
        if (this.consoleDump & LOG_CONTENT_BLOCK) {
          this.dump("Checking object permission changes...");
          try {
            this.dump(docSites.toSource() + ", " + lastObjects.toSource());
          } catch(e) {}
        }
        if (this.checkObjectPermissionsChange(docSites, lastObjects)) {
           ret = true;
           this.quickReload(browser.webNavigation);
        }
      }
      
      if (currentTabOnly) break;
    }
    bi.dispose();
    bi = null;
    return ret;
  },
  
  reloadAllowedObjects: function(browser) {
    if (this.getPref("autoReload.onMultiContent", false)) {
      this.quickReload(browser.webNavigation);
      return;
    }
    
    var sites = this.getSites(browser);
    var egroup, e;
    for each (egroup in sites.pluginExtras) {
      for each (e in egroup) {
        if (e.placeholder && this.isAllowedObject(e.url, e.mime, e.site)) {
          e.skipConfirmation = true;
          this.checkAndEnablePlaceholder(e.placeholder);
        }
      }
    }
  },
  
  checkObjectPermissionsChange: function(sites, snapshot) {
    if(this.objectWhitelist == snapshot) return false;
    var s, url;
    for (url in snapshot) {
      s = this.getSite(url);
      if (!(s in snapshot)) snapshot[s] = snapshot[url];
    }
    for each (var s in sites.pluginSites) {
      if ((s in snapshot) && !(s in this.objectWhitelist)) {
        return true;
      }
    }
    var egroup, e;
    for each (egroup in sites.pluginExtras) {
      for each (e in egroup) {
        if (!e.placeholder && (e.url in snapshot) && !(e.url in this.objectWhitelist)) {
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
        var ch = SiteUtils.ios.newChannel(uri.spec, null, null);
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
  
  getPermanentSites: function() {
    var whitelist = this.jsPolicySites.clone();
    whitelist.remove(this.tempSites.sitesList, true, true);
    return whitelist;
  },
  
  eraseTemp: function() {
    // remove temporary PUNCTUALLY: 
    // keeps ancestors because the may be added as permanent after the temporary allow;
    // keeps descendants because they may already have been permanent before the temporary, and then shadowed
    this.jsPolicySites.remove(this.tempSites.sitesList, true, true);
    // if allowed in blacklist mode, put back temporarily allowed in blacklist
    if (this.untrustedSites.add(this.gTempSites.sitesList)) {
      this.persistUntrusted();
    }
    
    this.setPref("temp", ""); 
    this.setPref("gtemp", "");
    
    this.setJSEnabled(this.mandatorySites.sitesList, true); // add mandatory
    this.resetAllowedObjects();
    if (this.clearClickHandler) this.clearClickHandler.resetWhitelist();
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
          throw new Error("Unsupported type " + typeof(value) + " for preference "+name);
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
    delete this.__proto__.json;
    var json;
    try {
      json = CC["@mozilla.org/dom/json;1"].createInstance(CI.nsIJSON);
    } catch(e) {
      json = null;
    }
    return this.__proto__.json = json;
  },
  
  get placesSupported() {
    return "nsINavBookmarksService" in Components.interfaces;
  },
  
  get canSerializeConf() { return !!this.json },
  serializeConf: function(beauty) {
    if (!this.json) return '';
    
    var exclude = ["version", "temp", "placesPrefs.ts"];
    var prefs = {};
    for each (var key in this.prefs.getChildList("", {})) {
      if (exclude.indexOf(key) < 0) {
        prefs[key] = this.getPref(key);
      }
    }
    
    var conf = this.json.encode({
      prefs: prefs,
      whitelist: this.getPermanentSites().sitesString,
      V: this.VERSION
      });
    
    return beauty ? conf.replace(/([^\\]"[^"]*[,\{])"/g, "$1\r\n\"").replace(/},?(?:\n|$)/g, "\r\n$&") : conf;
  },
  
  restoreConf: function(s) {
    try {
      var json = this.json.decode(s.replace(/[\n\r]/g, ''));
      var prefs = json.prefs;
      for (var key in prefs) this.setPref(key, prefs[key]); 
      this.policyPB.setCharPref("sites", json.whitelist);
      this.setPref("temp", ""); 
      this.setPref("gtemp", "");
      return true;
    } catch(e) {
      this.dump("Cannot restore configuration: " + e);
      return false;
    }
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
        sound.play(SiteUtils.ios.newURI(url, null, null));
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
    const is = CC["@mozilla.org/network/file-input-stream;1"].createInstance(
          CI.nsIFileInputStream );
    is.init(file ,0x01, 0400, null);
    const sis = CC["@mozilla.org/scriptableinputstream;1"].createInstance(
      CI.nsIScriptableInputStream );
    sis.init(is);
    const res=sis.read(sis.available());
    is.close();
    return res;
  }
,
  writeFile: function(file, content) {
    const unicodeConverter = CC["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(
    CI.nsIScriptableUnicodeConverter);
    unicodeConverter.charset = "UTF-8";
    content=unicodeConverter.ConvertFromUnicode(content);
    const os=CC["@mozilla.org/network/file-output-stream;1"].createInstance(
      CI.nsIFileOutputStream);
    os.init(file, 0x02 | 0x08 | 0x20,0664,0);
    os.write(content,content.length);
    os.close();
  }
,
  
  getAllowObjectMessage: function(url, mime) {
    url = SiteUtils.crop(url);
    return this.getString("allowTemp", [url + "\n(" + mime + ")\n"]);
  }
,
  lookupMethod: DOM.lookupMethod,
  dom: DOM,
  siteUtils: SiteUtils,

  mimeService: null,
  xcache: null,
 
  shouldLoad: CP_NOP,
  shouldProcess: CP_NOP,
  initContentPolicy: function() {
    const last = this.getPref("cp.last");
    const catman = Module.categoryManager;
    const cat = "content-policy"; 
    if (last) catman.deleteCategoryEntry(cat, SERVICE_CTRID, false);
    
    var delegate = this.disabled || (this.globalJS && !(this.alwaysBlockUntrustedContent || this.contentBlocker))   
      ? this.noopContentPolicy
      : this.mainContentPolicy;
    this.shouldLoad = delegate.shouldLoad;
    this.shouldProcess = delegate.shouldProcess;
    
    if (last && delegate != this.noopContentPolicy) {
      // removing and adding the category late in the game allows to be the latest policy to run,
      // and nice to AdBlock Plus
      catman.addCategoryEntry(cat, SERVICE_CTRID, SERVICE_CTRID, true, true);
    }
    
    if (!this.mimeService) {
      
      this.rejectCode = typeof(/ /) == "object" ? -4 : -3;
      this.safeToplevel = this.getPref("safeToplevel", true);
      this.initSafeJSRx();
      this.mimeService = CC['@mozilla.org/uriloader/external-helper-app-service;1']
                                   .getService(CI.nsIMIMEService);
    }
  },
 
  
  guessMime: function(uri) {
    try {
      var ext =  (uri instanceof CI.nsIURL) && uri.fileExtension;
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
  
  checkForbiddenChrome: function(url, origin) {
    var f, browserChromeDir, chromeRegistry;
    try {
      browserChromeDir = CC["@mozilla.org/file/directory_service;1"].getService(CI.nsIProperties)
                       .get("AChrom", CI.nsIFile);
      chromeRegistry = CC["@mozilla.org/chrome/chrome-registry;1"].getService(CI.nsIChromeRegistry);
      
      f = function(url, origin) {
        if(origin && !/^(?:chrome|resource|about)$/.test(origin.scheme)) {
          switch(url.scheme) {
            case "chrome":
              var packageName = url.host;
              if (packageName == "browser") return false; // fast path for commonest case
              exception = this.getPref("forbidChromeExceptions." + packageName, false);
              if (exception) return false;
              var chromeURL = chromeRegistry.convertChromeURL(url);
              if (chromeURL instanceof CI.nsIJARURI) 
                chromeURL = chromeURL.JARFile;
                    
              return chromeURL instanceof CI.nsIFileURL && !browserChromeDir.contains(chromeURL.file, true);
             
            case "resource":
              if(/\.\./.test(unescape(url.spec))) return true;
          }
        }
        return false;
      }
    } catch(e) {
      f = function() { return false; }
    }
    this.checkForbiddenChrome = f;
    return this.checkForbiddenChrome(url, origin);
  },
  
  // nsIContentPolicy interface
  // we use numeric constants for performance sake: 
  // TYPE_OTHER = 1
  // TYPE_SCRIPT = 2
  // TYPE_IMAGE = 3
  // TYPE_STYLESHEET = 4
  // TYPE_OBJECT = 5
  // TYPE_DOCUMENT = 6
  // TYPE_SUBDOCUMENT = 7
  // TYPE_REFRESH = 8
  // TYPE_XBL = 9
  // TYPE_PING = 10
  // TYPE_XMLHTTPREQUEST = 11
  // TYPE_OBJECT_SUBREQUEST = 12
  // REJECT_SERVER = -3
  // ACCEPT = 1
  
  
  versionComparator: CC["@mozilla.org/xpcom/version-comparator;1"].createInstance(CI.nsIVersionComparator),
  geckoVersion: ("nsIXULAppInfo" in  Components.interfaces) ? CC["@mozilla.org/xre/app-info;1"].getService(CI.nsIXULAppInfo).platformVersion : "0.0",
  geckoVersionCheck: function(v) {
    return this.versionComparator.compare(this.geckoVersion, v);
  },
  
  
  _bug453825: true,
  _bug472495: true,
  /*
  get _bug472495() {
    delete this.__proto__._bug472495;
    return this.__proto__._bug472495 = this.geckoVersionCheck("1.9.0.9") < 0;
  },
  */
  
  POLICY_XBL: "TYPE_XBL" in CI.nsIContentPolicy,
  POLICY_OBJSUB: "TYPE_OBJECT_SUBREQUEST" in CI.nsIContentPolicy,
  noopContentPolicy: {
    shouldLoad: CP_NOP,
    shouldProcess: CP_NOP
  },
  cpConsoleFilter: [2, 5, 6, 7, 15],
  cpDump: function(msg, aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aInternalCall) {
    this.dump("Content " + msg + " -- type: " + aContentType + ", location: " + (aContentLocation && aContentLocation.spec) + 
      ", origin: " + (aRequestOrigin && aRequestOrigin.spec) + ", ctx: " + 
        ((aContext instanceof CI.nsIDOMHTMLElement) ? "<HTML Element>" // try not to cause side effects of toString() during load
          : aContext)  + 
        ", mime: " + aMimeTypeGuess + ", " + aInternalCall);
  },
  reject: function(what, args) {
    this.resetPolicyState();
    if (this.consoleDump) {
      if(this.consoleDump & LOG_CONTENT_BLOCK && args.length == 6) {
        this.cpDump("BLOCKED " + what, args[0], args[1], args[2], args[3], args[4], args[5]);
      }
      if(this.consoleDump & LOG_CONTENT_CALL) {
        this.dump(new Error().stack);
      }
    }
    switch(args[0]) {
      case 6: case 7: 
        this.xcache.pickOrigin(args[1], true); 
        break;
      case 9:
        // our take on https://bugzilla.mozilla.org/show_bug.cgi?id=387971
        args[1].spec = this.nopXBL;
        return CP_OK;
    }
    return this.rejectCode;
  },
  
  get nopXBL() {
    const v = this.POLICY_XBL
      ? "chrome://global/content/bindings/general.xml#basecontrol"
      : this.contentBase + "noscript.xbl#nop";
    this.__defineGetter__("nopXBL", function() { return v; });
    return v;
  },
  
  mainContentPolicy: {
    shouldLoad: function(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aInternalCall) {
      
      var originURL, locationURL, originSite, locationSite, scheme,
          forbid, isScript, isJava, isFlash, isSilverlight,
          isLegacyFrame, blockThisIFrame, contentDocument,
          logIntercept, logBlock;
      
      logIntercept = this.consoleDump;
      if(logIntercept) {
        logBlock = logIntercept & LOG_CONTENT_BLOCK;
        logIntercept = logIntercept & LOG_CONTENT_INTERCEPT;
      } else logBlock = false;
      
      try {
        if (aContentType == 1 && !this.POLICY_OBJSUB) { // compatibility for type OTHER
          if (aContext instanceof CI.nsIDOMHTMLDocument) {
            aContentType = arguments.callee.caller ? 11 : 9;
          } else if ((aContext instanceof CI.nsIDOMHTMLElement)) {
            if ((aContext instanceof CI.nsIDOMHTMLEmbedElement || aContext instanceof CI.nsIDOMHTMLObjectElement)) {
              aContentType = 12;
            } else if (aContext.getAttribute("ping")) {
              aContentType = 10;
            }
          }
          arguments[0] = aContentType;
        }
        
        scheme = aContentLocation.scheme;
        if (HTTPS.httpsForced && !aInternalCall &&
              (aContentType != 6 && aContentType != 7
                || !this.POLICY_OBJSUB // Gecko < 1.9, early check for documents as well
            ) && scheme == "http"
          && HTTPS.forceHttpsPolicy(aContentLocation, aContext, aContentType))
          return this.reject("Non-HTTPS", arguments);
        
        if (logIntercept && this.cpConsoleFilter.indexOf(aContentType) > -1) {
          this.cpDump("processing", aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aInternalCall);
          if (this.consoleDump & LOG_CONTENT_CALL)
             this.dump(new Error().stack);
        }

        
        switch (aContentType) {
          case 9: // XBL - warning, in 1.8.x could also be XMLHttpRequest...
            return this.forbidXBL && 
              this.forbiddenXMLRequest(aRequestOrigin, aContentLocation, aContext, this.forbiddenXBLContext) 
              ? this.reject("XBL", arguments) : CP_OK;
          
          case 11: // in Firefox 3 we check for cross-site XHR
            return this.forbidXHR && 
              this.forbiddenXMLRequest(aRequestOrigin, aContentLocation, aContext, this.forbiddenXHRContext) 
               ? this.reject("XHR", arguments) : CP_OK;
          
          case 10: // TYPE_PING
            if (this.jsEnabled || !this.getPref("noping", true) || 
                aRequestOrigin && this.isJSEnabled(this.getSite(aRequestOrigin.spec))
              )
              return CP_OK;
              
            return this.reject("Ping", arguments);
              
          case 2:
            if (this.forbidChromeScripts && this.checkForbiddenChrome(aContentLocation, aRequestOrigin)) {
              return this.reject("Chrome Access", arguments);
            }
            forbid = isScript = true;
            break;
          case 3: // IMAGES
            if (this.blockNSWB && aContext instanceof CI.nsIDOMHTMLImageElement) {
              try {
                for (var parent = aContext; (parent = parent.parentNode);) {
                  if (parent.nodeName.toUpperCase() == "NOSCRIPT")
                    return this.reject("Tracking Image", arguments);
                }
              } catch(e) {
                this.dump(e)
              }
            }

            this.resetPolicyState();
            return CP_OK;
          
          case 4: // STYLESHEETS
            if (aContext && !(aContext instanceof CI.nsIDOMHTMLLinkElement || aContext instanceof CI.nsIDOMHTMLStyleElement) &&
                /\/x/.test(aMimeTypeGuess) &&
                !/chrome|resource/.test(aContentLocation.scheme) &&
                  this.getPref("forbidXSLT", true)) {
              forbid = isScript = true; // we treat XSLT like scripts
              break;
            }
            return CP_OK;
            
          case 5: 
          case 15:
            if (aContentLocation && aRequestOrigin && 
                (locationURL = aContentLocation.spec) == (originURL = aRequestOrigin.spec) && 
                (aContext instanceof CI.nsIDOMHTMLEmbedElement) &&
                aMimeTypeGuess && 
                this.isAllowedObject(locationURL, aMimeTypeGuess)
                ) {
              if (logIntercept) this.dump("Plugin document " + locationURL);
              return CP_OK; // plugin document, we'll handle it in our webprogress listener
            }
            
            if (this.checkJarDocument(aContentLocation, aContext)) 
              return this.reject("Plugin content from JAR", arguments);
            
            if (aMimeTypeGuess) // otherwise let's treat it as an iframe
              break;
            
            
            
          case 7:
            locationURL = aContentLocation.spec;
            originURL = aRequestOrigin && aRequestOrigin.spec;
            if (locationURL == "about:blank" || /^chrome:/.test(locationURL)
              || !originURL && (aContext instanceof CI.nsIDOMXULElement)  // custom browser like in Stumbleupon discovery window
            ) return CP_OK;
            
            if (!aMimeTypeGuess) {
              aMimeTypeGuess = this.guessMime(aContentLocation);
              if (logIntercept)
                this.dump("Guessed MIME '" + aMimeTypeGuess + "' for location " + locationURL);
            }
            
            if (aContentType == 15) break; // we just need to guess the Mime for video/audio
            
            isLegacyFrame = aContext instanceof CI.nsIDOMHTMLFrameElement;
       
            if(isLegacyFrame
               ? this.forbidFrames || // we shouldn't allow framesets nested inside iframes, because they're just as bad
                                      this.forbidIFrames &&
                                      (aContext.ownerDocument.defaultView.frameElement instanceof CI.nsIDOMHTMLIFrameElement) &&
                                      this.getPref("forbidMixedFrames", true)
               : this.forbidIFrames
               ) {
              try {
                contentDocument = aContext.contentDocument;
              } catch(e) {}
           
              blockThisIFrame = aInternalCall == CP_FRAMECHECK && !(
                      this.knownFrames.isKnown(locationURL, originSite = this.getSite(originURL)) ||
                      /^(?:chrome|resource|wyciwyg):/.test(locationURL) ||
                      locationURL == this._silverlightInstalledHack ||
                      locationURL == this.compatGNotes ||
                      (
                        originURL
                          ? (/^chrome:/.test(originURL) ||
                             /^(?:data|javascript):/.test(locationURL) &&
                              (contentDocument && (originURL == contentDocument.URL
                                                    || /^(?:data:|javascript:|about:blank$)/.test(contentDocument.URL)
                              ) || this.isFirebugJSURL(locationURL)
                             )
                            )
                          : contentDocument && 
                            this.getSite(contentDocument.URL) == (locationSite = this.getSite(locationURL))
                       )
                  ) && this.forbiddenIFrameContext(originURL || (originURL = aContext.ownerDocument.URL), locationURL);
            }
            
          case 6:
    
            if (this.checkJarDocument(aContentLocation, aContext)) 
              return this.reject("JAR Document", arguments);
            
           
            
            if (aRequestOrigin && aRequestOrigin != aContentLocation) {
              
              if (this.safeToplevel && (aContext instanceof CI.nsIDOMChromeWindow) &&
                  aContext.isNewToplevel &&
                  !(/^(?:chrome|resource|file)$/.test(scheme) ||
                    this.isSafeJSURL(aContentLocation.spec))
                    ) {
                return this.reject("Top Level Window Loading", arguments);
              }
           
              if (/^https?$/.test(scheme)) {
                if (aRequestOrigin.prePath != aContentLocation.prePath) {
                  if (aRequestOrigin.schemeIs("chrome") && aContext && aContext.ownerDocument &&
                    aContext.ownerDocument.defaultView.isNewToplevel){
                    this.requestWatchdog.externalLoad = aContentLocation.spec;
                  }
                  this.xcache.storeOrigin(aRequestOrigin, aContentLocation);
                }
              } else if(/^(?:data|javascript)$/.test(scheme)) {
                //data: and javascript: URLs
                locationURL = locationURL || aContentLocation.spec;
                if (!(this.isSafeJSURL(locationURL) || this.isPluginDocumentURL(locationURL, "iframe")) &&
                  ((this.forbidData && !this.isFirebugJSURL(locationURL) || locationURL == "javascript:") && 
                    this.forbiddenJSDataDoc(locationURL, originSite = this.getSite(originURL = originURL || aRequestOrigin.spec), aContext) ||
                    aContext && (
                      (aContext instanceof CI.nsIDOMWindow) 
                        ? aContext
                        : aContext.ownerDocument.defaultView
                    ).isNewToplevel
                  )
                 ) {
                  return this.reject("JavaScript/Data URL", arguments);
                }
              } else if(scheme != aRequestOrigin.scheme && 
                  scheme != "chrome" && // faster path for common case
                  this.isExternalScheme(scheme)) {
                // work-around for bugs 389106 & 389580, escape external protocols
                if (aContentType != 6 && !aInternalCall && 
                    this.getPref("forbidExtProtSubdocs", true) && 
                    !this.isJSEnabled(originSite = this.getSite(originURL = originURL || aRequestOrigin.spec)) &&
                    (!aContext.contentDocument || aContext.contentDocument.URL != originURL)
                    ) {
                  return this.reject("External Protocol Subdocument", arguments);
                }
                if (!this.normalizeExternalURI(aContentLocation)) {
                  return this.reject("Invalid External URL", arguments);
                }
              } else if(aContentType == 6 && scheme == "chrome" &&
                this.getPref("lockPrivilegedUI", false) && // block DOMI && Error Console
                /^(?:javascript:|chrome:\/\/(?:global\/content\/console|inspector\/content\/inspector|venkman\/content\/venkman)\.xul)$/
                  .test(locationURL)) {
                return this.reject("Locked Privileged UI", arguments);
              }
            }
            
            if (!(this.forbidSomeContent || this.alwaysBlockUntrustedContent) ||
                  !blockThisIFrame && (
                    !aMimeTypeGuess 
                    || aMimeTypeGuess.substring(0, 5) == "text/"
                    || aMimeTypeGuess == "application/xml" 
                    || aMimeTypeGuess == "application/xhtml+xml"
                    || aMimeTypeGuess.substring(0, 6) == "image/"
                    || !this.pluginForMime(aMimeTypeGuess)
                  )
              ) {
              
              if (aContext instanceof CI.nsIDOMElement) {
                // this is alternate to what we do in countObject, since we can't get there
                // this.delayExec(this.opaqueIfNeeded, 0, aContext); // TODO uncomment
              }
              
              if (logBlock)
                this.dump("Document OK: " + aMimeTypeGuess + "@" + (locationURL || aContentLocation.spec) + 
                  " --- PGFM: " + this.pluginForMime(aMimeTypeGuess));
              
              
              
              return CP_OK;
            }
            break;
          
          case 12:
            // Silverlight mindless activation scheme :(
            if (!this.forbidSilverlight 
                || !this.getExpando(aContext, "silverlight") || this.getExpando(aContext, "allowed"))
              return CP_OK;

            aMimeTypeGuess = "application/x-silverlight";
            break;
          default:
            return CP_OK;
        }
        

        locationURL = locationURL || aContentLocation.spec;
        locationSite = locationSite || this.getSite(locationURL);
        var untrusted = this.isUntrusted(locationSite);
        
        
        if(logBlock)
          this.dump("[CP PASS 2] " + aMimeTypeGuess + "*" + locationURL);

        if (isScript) {
          
          originSite = originSite || aRequestOrigin && this.getSite(aRequestOrigin.spec);
          
          // we must guess the right context here, see https://bugzilla.mozilla.org/show_bug.cgi?id=464754
          
          aContext = aContext && aContext.ownerDocument || aContext; // this way we always have a document
          
          if (aContentType == 2) { // "real" JavaScript include
          
            // Silverlight hack
            
            if (this.contentBlocker && this.forbidSilverlight && this.silverlightPatch &&
                  originSite && /^(?:https?|file):/.test(originSite)) {
              this.applySilverlightPatch(aContext);
            }
                    
            if (originSite && locationSite == originSite) return CP_OK;
          } else isScript = false;
          
          if (aContext) // XSLT comes with no context sometimes...
            this.getExpando(aContext.defaultView.top, "codeSites", []).push(locationSite);
          
          
          forbid = !this.isJSEnabled(locationSite);
          if (forbid && this.ignorePorts && /:\d+$/.test(locationSite)) {
            forbid = !this.isJSEnabled(locationSite.replace(/:\d+$/, ''));
          }

          if ((untrusted || forbid) && aContentLocation.scheme != "data") {
            if (isScript) ScriptSurrogate.apply(aContext, locationURL);
            return this.reject(isScript ? "Script" : "XSLT", arguments);
          } else {
            return CP_OK;
          }
        }

        
        if (!(forbid || locationSite == "chrome:")) {
          var mimeKey = aMimeTypeGuess || "application/x-unknown"; 
          
          forbid = blockThisIFrame || untrusted && this.alwaysBlockUntrustedContent;
          if (!forbid && this.forbidSomeContent) {
            if (aMimeTypeGuess && !(this.allowedMimeRegExp && this.allowedMimeRegExp.test(aMimeTypeGuess))) {
              forbid = 
                (
                  (isFlash = /^application\/(?:x-shockwave-flash|futuresplash)/i.test(aMimeTypeGuess)) ||
                  (isJava = /^application\/x-java\b/i.test(aMimeTypeGuess)) || 
                  (isSilverlight = /^application\/x-silverlight\b/i.test(aMimeTypeGuess)) 
                ) &&
                isFlash && this.forbidFlash || 
                isJava && this.forbidJava || 
                isSilverlight && this.forbidSilverlight;
              
              // see http://heasman.blogspot.com/2008/03/defeating-same-origin-policy-part-i.html
              if (isJava && /(?:[^\/\w\.\$\:]|^\s*\/\/)/.test(aContext.getAttribute("code") || "")) {
                return this.reject("Illegal Java code attribute " + aContext.getAttribute("code"), arguments);
              }
              
              if (forbid) {
                if (isSilverlight) {
                  if (logIntercept) this.dump("Silverlight " + aContentLocation.spec + " " + typeof(aContext) + " " + aContentType + ", " + aInternalCall);
                 
                  
                  forbid = aContentType == 12 || !this.POLICY_OBJSUB;
                  this.setExpando(aContext, "silverlight", aContentType != 12);
                  if (!forbid) return CP_OK;
                  
                  locationURL = this.resolveSilverlightURL(aRequestOrigin, aContext);
                  locationSite = this.getSite(locationURL);
                  
                  if (!this.POLICY_OBJSUB)  forbid = locationURL != (aRequestOrigin && aRequestOrigin.spec);
                  
                  if(!forbid || this.isAllowedObject(locationURL, mimeKey, locationSite)) {
                    if (logIntercept && forbid) this.dump("Silverlight " + locationURL + " is whitelisted, ALLOW");
                    return CP_OK;
                  }
                } else if (isFlash) {
                  locationURL = this.addFlashVars(locationURL, aContext);
                }
              } else {
                forbid = this.forbidPlugins && !(isJava || isFlash || isSilverlight);
                if (forbid) {
                  locationURL = this.addObjectParams(locationURL, aContext);
                }
              }
            }
          }
        }
        
        
        
        
        
        if(forbid && !this.contentBlocker) {
          
          originURL = originURL || (aRequestOrigin && aRequestOrigin.spec);
          originSite = originSite || this.getSite(originURL);
        
          var originOK = originSite 
            ? this.isJSEnabled(originSite) 
            : /^(?:javascript|data):/.test(originURL); // if we've got such an origin, parent should be trusted
          
          var locationOK = locationSite 
                ? this.isJSEnabled(locationSite) 
                : // use origin for javascript: or data:
                  /^(?:javascript|data):/.test(locationURL) && originOK
          ;
          
          if (!locationOK && locationSite && this.ignorePorts && /:\d+$/.test(locationSite)) {
            if (this.isJSEnabled(locationSite.replace(/:\d+$/, ''))) {
              locationOK = this.autoTemp(locationSite);
            }
          }
          
          forbid = !(locationOK && (originOK || 
            !this.getPref(blockThisIFrame 
            ? "forbidIFramesParentTrustCheck" : "forbidActiveContentParentTrustCheck", true)
            ));
        }
         
        if (/\binnerHTML\b/.test(new Error().stack)) {
          if (this._bug453825) {
            aContext.ownerDocument.location.href = 'javascript:window.__defineGetter__("top", (Window.prototype || window).__lookupGetter__("top"))';
            if (this.consoleDump) this.dump("Locked window.top (bug 453825 work-around)");
          }
          if (this._bug472495) {
            aContext.ownerDocument.defaultView.addEventListener("DOMNodeRemoved", this._domNodeRemoved, true);
            if (this.consoleDump) this.dump("Added DOMNodeRemoved (bug 472495 work-around)");
          }
        }
        
        
        this.delayExec(this.countObject, 0, aContext, locationSite); 
        
        forbid = forbid && !(/^file:\/\/\//.test(locationURL) && /^resource:/.test(originURL || (aRequestOrigin && aRequestOrigin.spec || ""))); // fire.fm work around
        
        if (forbid) {
          try {  // moved here because of http://forums.mozillazine.org/viewtopic.php?p=3173367#3173367
            if (this.getExpando(aContext, "allowed") || 
              this.isAllowedObject(locationURL, mimeKey, locationSite)) {
              this.setExpando(aContext, "allowed", true);
              return CP_OK; // forceAllow
            }
          } catch(ex) {
            this.dump("Error checking plugin per-object permissions:" + ex);
          }
          
          if (isLegacyFrame) { // inject an embed and defer to load
            if (this.blockLegacyFrame(aContext, aContentLocation, aInternalCall || blockThisIFrame))
              return this.reject("Deferred Legacy Frame " + locationURL, arguments);
          } else {
            try {
              if ((aContext instanceof CI.nsIDOMNode) && (aContentType == 5 || aContentType == 7 || aContentType == 12 || aContentType == 15)) {
                
                if (this.consoleDump & LOG_CONTENT_BLOCK)
                  this.dump("tagForReplacement");
                  
                this.delayExec(this.tagForReplacement, 0, aContext, {
                  url: locationURL,
                  mime: mimeKey
                });
              } else if (this.consoleDump & LOG_CONTENT_BLOCK) this.dump("Context is not a DOMNode? " + aContentType);
            } catch(ex) {
              if(this.consoleDump) this.dump(ex);
            } finally {
              return this.reject("Forbidden " + (contentDocument ? ("IFrame " + contentDocument.URL) : "Content"), arguments);
            }
          }
        } else {
          

          if (isSilverlight) {
            this.setExpando(aContext, "silverlight", aContentType != 12);
          }
          if (this.consoleDump & LOG_CONTENT_CALL) {
            this.dump(locationURL + " Allowed, " + new Error().stack);
          }
        }
      } catch(e) {
        return this.reject("Content (Fatal Error, " + e  + " - " + e.stack + ")", arguments);
      } finally {
        this.currentPolicyURI = aContentLocation;
        this.currentPolicyHints = arguments;
      }
      return CP_OK;
    },
    shouldProcess: function(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeType, aExtra) {
      return this.shouldLoad(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeType, CP_SHOULDPROCESS);
    },
    check: function() {
      return false;
    }
  },
  
  _domNodeRemoved: function(ev) {
    dump("Removing DOMNodeRemoved listener\n");
    ev.currentTarget.removeEventListener(ev.type, arguments.callee, true);
  },
  
  forbiddenJSDataDoc: function(locationURL, originSite, aContext) {
    return !(!originSite || /^moz-nullprincipal:/.test(originSite) || this.isJSEnabled(originSite));
  },
  
  forbiddenXMLRequest: function(aRequestOrigin, aContentLocation, aContext, forbidDelegate) {
    var originURL, locationURL;
    if (aContentLocation.schemeIs("chrome") || !aRequestOrigin || 
         // GreaseMonkey Ajax comes from resource: hidden window
         // Google Toolbar Ajax from about:blank
           /^(?:chrome:|resource:|about:blank)/.test(originURL = aRequestOrigin.spec) ||
           // Web Developer extension "appears" to XHR towards about:blank
           (locationURL = aContentLocation.spec) == "about:blank"
          ) return false;
    var win = aContext.defaultView;
    if(win) {
      this.getExpando(win.top, "codeSites", []).push(this.getSite(locationURL));
    }
    return forbidDelegate.call(this, originURL, locationURL);
  },
  
  addFlashVars: function(url, embed) {
    // add flashvars to have a better URL ID
    if (embed instanceof CI.nsIDOMElement) try {
      var flashvars = embed.getAttribute("flashvars");
      if (flashvars) url += "#!flashvars#" + encodeURI(flashvars); 
    } catch(e) {
      if (this.consoleDump) this.dump("Couldn't add flashvars to " + url + ":" + e);
    }
    return url;
  },
  
  addObjectParams: function(url, embed) {
    if (embed instanceof CI.nsIDOMElement) try {
      var params = embed.getElementsByTagName("param");
      if(!params.length) return url;
      
      var pp = [];
      for(var j = params.length; j-- > 0;) {
        pp.push(encodeURIComponent(params[j].name) + "=" + encodeURIComponent(params[j].value));
      }
      url += "#!objparams#" + pp.join("&");
    } catch(e) {
      if (this.consoleDump) this.dump("Couldn't add object params to " + url + ":" + e);
    }
    return url;
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
      if(!doc) return;
      this.getExpando(doc, "pe",  []).push({embed: embed, pluginExtras: pluginExtras});
      try {
        this.syncUI(doc.defaultView.top);
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
      this.dump("Redirecting blocked legacy frame " + uri.spec);
    }
    
    
    var url = this.createPluginDocumentURL(uri.spec, "iframe");
    
    if(sync) {
      if(verbose) dump("Legacy frame SYNC, setting to " + url + "\n");
      frame.src = url;
    } else {
      frame.ownerDocument.defaultView.addEventListener("load", function(ev) {
          if(verbose) dump("Legacy frame ON PARENT LOAD, setting to " + url + "\n");
          ev.currentTarget.removeEventListener("load", arguments.callee, false);
          frame.src = url;
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
    if (!tag) tag = "embed";
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
      case 3: // different 2nd level domain
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
              /^file:/.test(locationURL) // we trust local files to allow Linux theming
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
      return SiteUtils.ios.getProtocolHandler(scheme).scheme != scheme;
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
  
  syncUI: function(domNode) {
    const browser = DOM.findBrowserForNode(domNode);
    if (browser && (browser.docShell instanceof CI.nsIWebProgress) && !browser.docShell.isLoadingDocument) {
      var overlay = this.findOverlay(browser);
      if(overlay) overlay.syncUI(browser.contentWindow);
    }
  },
  
  objectWhitelist: {},
  ALL_TYPES: ["*"],
  objectWhitelistLen: 0,
  isAllowedObject: function(url, mime, site) {
    var types = this.objectWhitelist[url] || null;
    if (types && (types == this.ALL_TYPES || types.indexOf(mime) > -1)) 
      return true;
    
    if (arguments.length < 3) site = this.getSite(url);
    
    var types = site && this.objectWhitelist[site] || null;
    return types && (types == this.ALL_TYPES || types.indexOf(mime) > -1);
  },
  
  allowObject: function(url, mime) {
    if (url in this.objectWhitelist) {
      var types = this.objectWhitelist[url];
      if(mime == "*") {
        if(types == this.ALL_TYPES) return;
        types = this.ALL_TYPES;
      } else {
        if(types.indexOf(mime) > -1) return;
        types.push(mime);
      }
    } else {
      this.objectWhitelist[url] = mime == "*" ? this.ALL_TYPES : [mime];
    }
    this.objectWhitelistLen++;
  },
  
  resetAllowedObjects: function() {
    this.objectWhitelist = {};
    this.objectWhitelistLen = 0;
  },
  
  
  countObject: function(embed, site) {

    if(!site) return;
    var doc = embed.ownerDocument;
    
    var win = doc.defaultView.top;
    var os = this.getExpando(win, "objectSites");
    if(os) {
      if(os.indexOf(site) < 0) os.push(site);
    } else {
      this.setExpando(win, "objectSites", [site]);
    }
    
    this.opaqueIfNeeded(embed, doc);
  },
  
  getPluginExtras: function(obj) {
    return this.getExpando(obj, "pluginExtras");
  },
  setPluginExtras: function(obj, extras) {
    this.setExpando(obj, "pluginExtras", extras);
    if (this.consoleDump & LOG_CONTENT_BLOCK) this.dump("Setting plugin extras on " + obj + " -> " + (this.getPluginExtras(obj) == extras)
      + ", " + (extras && extras.toSource())  );
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
    var links = document.links;
    var position;
    for (var j = 0, l; (l = links[j]); j++) {
      if (l && l.href && /^https?/i.test(l.href) && l.firstChild) {
        if(l.offsetWidth && l.offsetHeight) return true;
        position = l.style.position;
        try {
          l.style.position = "absolute";
          if(l.offsetWidth && l.offsetHeight) return true;
        } finally {
          l.style.position = position;
        }
      }
    }
    return false;
  },
  detectJSRedirects: function(document) {
    if (this.jsredirectIgnore || this.jsEnabled) return 0;
    try {
      if (!/^https?:/.test(document.documentURI)) return 0;
      var hasVisibleLinks = this.hasVisibleLinks(document);
      if (!this.jsredirectForceShow && hasVisibleLinks ||
          this.isJSEnabled(this.getSite(document.documentURI))) 
        return 0;
      var j, len;
      var seen = [];
      var body = document.body;
      var cstyle = document.defaultView.getComputedStyle(body, "");
      if (cstyle) {
        if (cstyle.visibility != "visible") {
          body.style.visibility = "visible";
        }
        if (cstyle.display == "none") {
          body.style.display = "block";
        }
      }
      if (!hasVisibleLinks && document.links[0]) {
        var links = document.links;
        var l;
        for (j = 0, len = links.length; j < len; j++) {
          l = links[j];
          if (!(l.href && /^https?/.test(l.href))) continue;
          l = body.appendChild(l.cloneNode(true));
          l.style.visibility = "visible";
          l.style.display = "block";
          seen.push(l.href);
        }
      }
      
      var code, m, url, a;
      var container = null;
      var window;
      
      code = body && body.getAttribute("onload");
      const sources = code ? [code] : [];
      var scripts = document.getElementsByTagName("script");
      for (j = 0, len = scripts.length; j < len; j++) sources.push(scripts[j].innerHTML);
      scripts = null;
      
      if (!sources[0]) return 0;
      var follow = false;
      const findURL = /(?:(?:\b(?:open|replace)\s*\(|(?:\b(?:href|location|src|path|pathname|search)|(?:[Pp]ath|UR[IL]|[uU]r[il]))\s*=)\s*['"]|['"](?=https?:\/\/\w|\w*[\.\/\?]))([\?\/\.\w\-%\&][^\s'"]*)/g;
      const MAX_TIME = 1000;
      const MAX_LINKS = 30;
      const ts = new Date().getTime();
      outerLoop:
      for (j = 0, len = sources.length; j < len; j++) {
        findURL.lastIndex = 0;
        code = sources[j];
        while ((m = findURL.exec(code))) {
          
          if (!container) {
            container = document.createElementNS(HTML_NS, "div");
            with(container.style) {
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
          url = m[1];
          a = document.createElementNS(HTML_NS, "a");
          a.href = url;
          container.appendChild(a);
          if (a.href.toLowerCase().indexOf("http") != 0 || seen.indexOf(a.href) > -1) {
             container.removeChild(a);
             continue;
          }
          seen.push(a.href);
          a.appendChild(document.createTextNode(a.href));
          container.appendChild(document.createElementNS(HTML_NS, "br"));
          
          if (seen.length >= MAX_LINKS || new Date().getTime() - ts > MAX_TIME) break outerLoop;
        }
        
        if (follow && seen.length == 1) {
          this.log("[NoScript Following JS Redirection]: " + seen[0] + " FROM " + document.location.href); 
          
          this.doFollowMetaRefresh({
            uri: seen[0],
            document: document
          });  
        }
        
        if (new Date().getTime() - ts > MAX_TIME) break;
      }
      return seen.length;
    } catch(e) { 
      this.dump(e.message + " while processing JS redirects");
      return 0; 
    }
  }
,
  processScriptElements: function(document, sites) {
    var scripts = document.getElementsByTagName("script");
    var scount = scripts.length;
    if (scount) {
      const HTMLElement = CI.nsIDOMHTMLElement;
      sites.scriptCount += scount;
      var script, scriptSrc;
      var nselForce = this.nselForce && sites.length && this.isJSEnabled(sites[sites.length - 1]);
      var isHTMLScript;
      while (scount-- > 0) {
        script = scripts.item(scount);
        isHTMLScript = script instanceof HTMLElement;
        if (isHTMLScript) {
          scriptSrc = script.src;
        } else if(script) {
          scriptSrc = script.getAttribute("src");
          if (!/^[a-z]+:\/\//i.test(scriptSrc)) continue;
        } else continue;
        
        scriptSrc = this.getSite(scriptSrc);
        if (scriptSrc) {
          sites.push(scriptSrc);
          if (nselForce && isHTMLScript && !this.isJSEnabled(scriptSrc)) {
            this.showNextNoscriptElement(script);
          }
        }
      }
    }
  },
  
  showNextNoscriptElement: function(script, doc) { 
    const HTMLElement = CI.nsIDOMHTMLElement;
    var child, el, ss, j;
    for (var node = script; node = node.nextSibling;) {
      try {
        if (node instanceof HTMLElement) {
          if (node.tagName.toUpperCase() != "NOSCRIPT") return;
          if (node.getAttribute("class") == "noscript-show") return;
          node.setAttribute("class", "noscript-show");
          child = node.firstChild;
          if (child.nodeType != 3) return;
          el = node.ownerDocument.createElementNS(HTML_NS, "span");
          el.className = "noscript-show";
          el.innerHTML = child.nodeValue;
          // remove noscript script children, see evite.com bug 
          ss = el.getElementsByTagName("script");
          for(j = ss.length; j-- > 0;) el.removeChild(ss[j]);
          node.replaceChild(el, child);
        }
      } catch(e) {
        this.dump(e.message + " while showing NOSCRIPT element");
      }
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
      for (var j = 0; (refresh = rr[j]); j++) {
        if (!/refresh/i.test(refresh.httpEquiv)) continue;
        content = refresh.content.split(/[,;]/, 2);
        uri = content[1];
        if (uri) {
          if (notifyCallback && !(document.documentURI in this.metaRefreshWhitelist)) {
            timeout = content[0];
            uri = uri.replace (/^\s*/, "").replace (/^URL/i, "URL").split("URL=", 2)[1];
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
              ev.currentTarget.removeEventListener("pagehide", arguments.callee, false);
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
      var baseURI = metaRefreshInfo.baseURI || SiteUtils.ios.newURI(document.documentURI, null, null);
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
  _frameBreakNoCapture: /\bif\s*\(\s*(?:(?:window\s*\.\s*)?(?:window|self|top)\s*!=\s*(?:window\s*\.\s*)?(?:window|self|top)|(?:parent|top)\.frames\.length\s*(?:!=|>)\s*0)\s*\)\s*\{?\s*(?:window\s*\.\s*)?top\s*\.\s*location\s*(?:\.\s*(?:replace|assign)\s*\(|(?:\s*\.\s*href\s*)?=)\s*(?:(?:document|window|self)\s*\.\s*)?location(?:\s*.\s*href)?\s*\)?\s*;?\s*\}?/,
  _frameBreakCapture: /^\(function\s[^\{]+\{\s*if\s*\(\s*(?:(?:window\s*\.\s*)?(window|self|top)\s*!=\s*(?:window\s*\.\s*)?(window|self|top)|(?:parent|top)\.frames\.length\s*(?:!=|>)\s*0)\s*\)\s*\{?\s*(?:window\s*\.\s*)?top\s*\.\s*location\s*(?:\.\s*(?:replace|assign)\s*\(|(?:\s*\.\s*href\s*)?=)\s*(?:(?:document|window|self)\s*\.\s*)?location(?:\s*.\s*href)?\s*\)?\s*;?\s*\}?/,
  doEmulateFrameBreak: function(w) {
    // If JS is disabled we check the top 5 script elements of the page searching for the first inline one:
    // if it starts with a frame breaker, we honor it.
    var d = w.document;
    var url = d.URL;
    if (!/^https?:/.test(url) || this.isJSEnabled(this.getSite(url))) return false;
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
              w.top.location.href = url;
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
      return f && f.indexOf(parentSite);
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
        if (allowBookmarklets && /^\s*(?:javascript|data):/i.test(url)) {
          var ret = this.executeJSURL(url, openCallback);
        } else if(allowBookmarks) {
          this.setJSEnabled(this.getSite(url), true);
        }
        
        return ret;
      } catch(e) {
        if (ns.consoleDump) ns.dump(e + " " + e.stack);
      }
    }
    return false;
  },
  
  executeJSURL: function(url, openCallback) {
    var browserWindow = DOM.mostRecentBrowserWindow;
    var browser = browserWindow.noscriptOverlay.currentBrowser;
    if(!browser) return false;
    
    var window = browser.contentWindow;
    if(!window) return false;
    
    var site = this.getSite(window.document.documentURI) || this.getExpando(browser, "jsSite");
    if (!this.isJSEnabled(site)) {
      url = url.replace(/\b(?:window\.)?setTimeout\s*\(([^\(\)]+),\s*\d+\s*\)/g, '$1()'); // make simple timeouts synchronous
      if(this.consoleDump) this.dump("Executing JS URL " + url + " on site " + site);
      var snapshots = {
        trusted: this.jsPolicySites.sitesString,
        untrusted: this.untrustedSites.sitesString,
        docJS: browser.webNavigation.allowJavascript
      };
      var async = Components.utils && (!openCallback || /^\s*data:/i.test(url) || typeof(/ /) == "object"); // async evaluation, after bug 351633 landing
      var doc = window.document;
      var nh = this._EJSU_nodeHandler;
      var ets = ["DOMNodeInserted", "DOMAttrModified"];
      try {
        ets.forEach(function(et) { doc.addEventListener(et, nh, false) });
        browser.webNavigation.allowJavascript = true;
        this.setTemp(site, true);
        this.setJSEnabled(site, true)
        if (async) {
          var sandbox = Components.utils.Sandbox(window);
          sandbox.window = window;
          function run(s) {
            sandbox.__jsURL__ = "javascript:" + encodeURIComponent(s + "; void(0);");
            Components.utils.evalInSandbox("window.location.href = __jsURL__", sandbox);
          }
          run("window.setTimeout = function(f, d, a) { if (typeof(f) != 'function') f = new Function(f || ''); f(a); }"), 
          sandbox.__jsURL__ = url,
          Components.utils.evalInSandbox(openCallback ? "window.location.href = __jsURL__"
                    : '(function() { var d = window.document; var s = d.createElement("script"); s.appendChild(d.createTextNode(__jsURL__)); d.documentElement.appendChild(s); })()',
                    sandbox);
          run("delete window.setTimeout");
        } else {
          openCallback(url);
        }
        return true;
      } finally {
        this.delayExec(function() {  ets.forEach(function(et) { doc.removeEventListener(et, nh, false) }); });
        if(async) {
          this.delayExec(this.postExecuteJSURL, 0, browser, site, snapshots);
        } else {
          this.postExecuteJSURL(browser, site, snapshots);
        }
      }
    }
    
    return false;
  },
  
  _EJSU_nodeHandler: function(ev) {
    var node = ev.target;
    if (!(node instanceof CI.nsIDOMHTMLScriptElement)) return;
    var url = node.src;
    var site = ns.getSite(url);
    switch(ns.getPref("bookmarklets.import")) {
      case 0:
        return;
      case 1:
        if (!ns.isJSEnabled(site)) return;
        break;
      default:
        if (ns.isUntrusted(site)) return;
    }
    
    var req = CC["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(CI.nsIXMLHttpRequest);
    req.open("GET", url);
    req.onreadystatechange = function() {
      if (req.readyState != 4) return;
      if (ns.consoleDump) ns.dump("Running bookmarklet import: " + url);
      ns.executeJSURL(req.responseText);
    };
    req.send(null);
  },
  
  postExecuteJSURL: function(browser, site, snapshots, dsJS) {
    if (this.consoleDump & LOG_JS)
      this.dump("Restoring snapshot permissions on " + site + "/" + (browser.webNavigation.isLoadingDocument ? "loading" : browser.webNavigation.currentURI.spec));
    this.persistUntrusted(snapshots.untrusted); 
    this.flushCAPS(snapshots.trusted);
    this.setExpando(browser, "jsSite", site);
    if (!browser.webNavigation.isLoadingDocument && this.getSite(browser.webNavigation.currentURI.spec) == site)
      browser.webNavigation.allowJavascript = snapshots.docJS;
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
      : mime == "application/x-silverlight"
        ? 'url("' + this.skinBase + "somelight" + size + '.png")'
        : 'url("moz-icon://noscript?size=' + size + '&contentType=' + mime.replace(/[^\w-\/]/g, '') + '")';
  },
  
  
  findObjectAncestor: function(embed) {
    const objType = CI.nsIDOMHTMLObjectElement;
    if (embed instanceof CI.nsIDOMHTMLEmbedElement || embed instanceof objType) {
      for (var o = embed; (o = o.parentNode);) {
        if (o instanceof objType) return o;
      }
    }
    return embed;
  },
  
  findPluginExtras: function(document) {
    var res = this.getExpando(document.defaultView, "pluginExtras", []);
    if ("opaqueHere" in res) return res;
    var url = document.defaultView.location.href;
    res.opaqueHere = this.appliesHere(this.opaqueObject, url) && /^(?:ht|f)tps?:/i.test(url);
    return res;
  },
  
  
  OpaqueHandlers: {
    
    getOpaqued: function(w) {
      const cs = "__noscriptOpaqued__";
      if (w.__noscriptOpaquedObjects) return w.__noscriptOpaquedObjects;
      var doc = w.document;
      if (doc.getElementsByClassName) return Array.slice(doc.getElementsByClassName(cs));
      var results = [];
      var query = doc.evaluate(
          "//*[contains(concat(' ', @class, ' '), ' " + cs + " ')]",
          w.document, null, CI.nsIDOMXPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
 	    for (var i = 0, len = query.snapshotLength; i < len; i++) {
	       results.push(query.snapshotItem(i));
 	    }
      return results;                                                     
    },
    
    get fixScrollers() {
      var self = this;
      var f = function(ev) {
        var w = ev.currentTarget;
        
        var o, s, cs;
        var oo = self.getOpaqued(w);
        var d = w.document;
        var de = d.documentElement;
        var db = d.body;
        var scrollers = [];
        for each(o in oo) {
          if (o == de || o == db) continue;
          try {
            s = w.getComputedStyle(o, '');
            if (s && s.display == "block" && s.overflow == "hidden" || /^(?:i?frame|object)$/i.test(o.tagName))
              scrollers.push(o);
          } catch(e) {
            dump(e + ", " + e.stack + "\n");
          }
        }
        for each(var o in scrollers) {
          DOM.addClass(o, "__noscriptScrolling__");
        }
        
        switch(ev.type) {
          case "timeout":
            w.setTimeout(arguments.callee, ev.timeout, ev);
            break;
          case "load":
            w.__noscriptOpaquedObjects = null;
          default:
            w.removeEventListener(ev.type, arguments.callee, false);
        }
      };
      delete this.fixScrollers;
      return this.fixScrollers = f;
    },
    
    scheduleFixScrollers: function(w, timeout) {
      var ev = { currentTarget: w, type: "timeout", timeout: timeout };
      w.setTimeout(this.fixScrollers, ev.timeout, ev);
    },
    
    getOpaquedObjects: function(w, noscroll) {
      var oo = w.__noscriptOpaquedObjects;
      if (!oo) {
        oo = [];
        w.__noscriptOpaquedObjects = oo;
        if (!noscroll) {
          w.addEventListener("load", this.fixScrollers, false);
          w.addEventListener("DOMContentLoaded", this.fixScrollers, false);
          this.scheduleFixScrollers(w, 3000);
        }
      }
      return oo;
    }
    
  },
  
  opaque: function(o, scrollNow) {
    if (o.__noscriptOpaqued) return;
    try {
      
      if (o.contentDocument && this.clearClickHandler.sameSiteParents(o.contentDocument.defaultView)) return;
      
      var d = o.ownerDocument;
      var w = d.defaultView;
      var oh = this.OpaqueHandlers;
      var oo = oh.getOpaquedObjects(w, scrollNow || this.clearClickHandler.isSupported(d) && this.appliesHere(this.clearClick, w.top.location.href));
      if (scrollNow) oh.scheduleFixScrollers(w, 1);
      do {
        o.__noscriptOpaqued = true;
        o.style.opacity = "";
        DOM.addClass(o, "__noscriptOpaqued__");
        oo.push(o);
        if (this.consoleDump & LOG_CLEARCLICK) this.dump("Opacizing " + o.tagName);
        o = o.parentNode;
      } while(o && o.style && !o.__noscriptOpaqued);
    } catch(e) {
      this.dump("Error opacizing " + o.tagName + ": " + e.message + ", " + e.stack);
    }
  },
  
  opaqueIfNeeded: function(o, doc) {
    if (this.findPluginExtras(doc || o.ownerDocument).opaqueHere)
      this.opaque(o);
  },
  
  appliesHere: function(pref, url) {
    return pref && ((ANYWHERE & pref) == ANYWHERE||
       (this.isJSEnabled(this.getSite(url))
        ? (WHERE_TRUSTED & pref) : (WHERE_UNTRUSTED & pref)
       )
      );
  },
  
  _preprocessObjectInfo: function(doc) {
    var pe = this.getExpando(doc, "pe");
    if (!pe) return null;
    this.setExpando(doc, "pe", null);
    var ret = [], o;
    for (var j = pe.length; j-- > 0;) {
      o = pe[j];
      try {
        if (this.getExpando(o, "silverlight")) {
          o.embed = this._attachSilverlightExtras(o.embed, o.pluginExtras);
          if (!o.embed) continue; // skip unconditionally to prevent in-page Silverlight placeholders
        }
        this.setPluginExtras(o.embed = this.findObjectAncestor(o.embed), o.pluginExtras);
        if (o.embed.ownerDocument) ret.push(o);
       } catch(e1) { 
         if(this.consoleDump & LOG_CONTENT_BLOCK) 
           this.dump("Error setting plugin extras: " + 
             (o && o.pluginExtras && o.pluginExtras.url) + ", " + e1); 
       }
    }
    return ret;
  },
  
  processObjectElements: function(document, sites, loaded) {
    var pluginExtras = this.findPluginExtras(document);
    sites.pluginCount += pluginExtras.length;
    sites.pluginExtras.push(pluginExtras);
    
    var objInfo = this._preprocessObjectInfo(document);
    if (!objInfo) return;
    var count = objInfo.length;
    sites.pluginCount += count;
    
    
    var collapse = this.collapseObject;

    var oi, object, objectTag;
    var anchor, innerDiv, iconSize;
    var extras;
    var cssLen, cssCount, cssProp, cssDef;
    var style, astyle;
    
    var replacements = null;
    var w, h;
    var opaque = pluginExtras.opaqueHere;
    
    var minSize = this.getPref("placeholderMinSize");
    
    
    var forcedCSS = ";";
    var pluginDocument = false;       
    try {
      pluginDocument = count == 1 && (objInfo[0].pluginExtras.url == document.URL) && !objInfo[0].embed.nextSibling;
      if (pluginDocument) {
        collapse = false;
        forcedCSS = ";outline-style: none !important;-moz-outline-style: none !important;";
      }
    } catch(e) {}
            

    while (count--) {
      oi = objInfo[count];
      object = oi.embed;
      extras = oi.pluginExtras;
      objectTag = object.tagName;
      
      try {

        extras.site = this.getSite(extras.url);
        
        if(!this.showUntrustedPlaceholder && this.isUntrusted(extras.site)) {
          this.removeAbpTab(object);
          continue;
        }
        
        extras.tag = "<" + (objectTag == "iframe" && this.isLegacyFrameDocument(document) ? "FRAME" : objectTag.toUpperCase()) + ">";
        extras.title =  extras.tag + ", " +  
            this.mimeEssentials(extras.mime) + "@" + extras.url;
        
       if ((extras.alt = object.getAttribute("alt")))
          extras.title += ' "' + extras.alt + '"'
        
        
        anchor = document.createElementNS(HTML_NS, "a");
        anchor.id = object.id;
        anchor.href = extras.url;
        anchor.setAttribute("title", extras.title);
        
        this.setPluginExtras(anchor, extras);
        this.setExpando(anchor, "removedPlugin", object);
     
        (replacements = replacements || []).push({object: object, placeholder: anchor, extras: extras });

        if (this.showPlaceholder) {
          anchor.addEventListener("click", this.bind(this.onPlaceholderClick), true);
          anchor.className = "__noscriptPlaceholder__";
          if (this.abpRemoveTabs) this.removeAbpTab(object);
        } else {
          anchor.className = "";
          if(collapse) anchor.style.display = "none";
          else anchor.style.visibility = "hidden";
          this.removeAbpTab(object); 
          continue;
        }
        
        innerDiv = document.createElementNS(HTML_NS, "div");
        innerDiv.className = "__noscriptPlaceholder__1";
        
        with(anchor.style) {
          padding = margin = borderWidth = "0px";
          outlineOffset = MozOutlineOffset = "-1px"; 
          display = "inline";
        }
        
        cssDef = "";
        style = document.defaultView.getComputedStyle(object, null);
        if (style) {
          for (cssCount = 0, cssLen = style.length; cssCount < cssLen; cssCount++) {
            cssProp = style.item(cssCount);
            cssDef += cssProp + ": " + style.getPropertyValue(cssProp) + ";";
          }
          
          innerDiv.setAttribute("style", cssDef + forcedCSS);
          
          if (style.width == "100%" || style.height == "100%") {
            anchor.style.width = style.width;
            anchor.style.height = style.height;
            anchor.style.display = "block";
          }
        }
        
        if (collapse || style.display == "none" || style.visibility == "hidden") {
          innerDiv.style.maxWidth = anchor.style.maxWidth = "32px";
          innerDiv.style.maxHeight = anchor.style.maxHeight = "32px";
        }
        
        // if (innerDiv.style.display != "none") innerDiv.style.display = "block";
        innerDiv.style.visibility = "visible";

        anchor.appendChild(innerDiv);
        
        // icon div
        innerDiv = innerDiv.appendChild(document.createElementNS(HTML_NS, "div"));
        innerDiv.className = "__noscriptPlaceholder__2";
        
        if(collapse || style && (parseInt(style.width) < 64 || parseInt(style.height) < 64)) {
          innerDiv.style.backgroundPosition = "bottom right";
          iconSize = 16;
          w = parseInt(style.width);
          h = parseInt(style.height);
          if (minSize > w || minSize > h) {
            with (innerDiv.parentNode.style) {
              minWidth = Math.max(w, Math.min(document.documentElement.clientWidth - object.offsetLeft, minSize)) + "px";
              minHeight = Math.max(h, Math.min(document.documentElement.clientHeight - object.offsetTop, minSize)) + "px";
            }
            with (anchor.style) {
              overflow = "visible";
              display = "block";
              width = w + "px";
              height = h + "px";
            }
            anchor.style.float = "left";
          }
        } else {
          iconSize = 32;
          innerDiv.style.backgroundPosition = "center";
        }
        innerDiv.style.backgroundImage = this.cssMimeIcon(extras.mime, iconSize);
        
      } catch(objectEx) {
        dump("NoScript: " + objectEx + " processing plugin " + count + "@" + document.documentURI + "\n");
      }
      
    }

    if (replacements) {
      this.delayExec(this.createPlaceholders, 0, replacements, pluginExtras);
    }
  },
  
  createPlaceholders: function(replacements, pluginExtras) {
    for each (var r in replacements) {
      try {
        if (r.extras.pluginDocument) {
          this.setPluginExtras(r.object, null);
        }
        if (r.extras.pluginDocument) {
          this.setPluginExtras(r.object, null);
          if (r.object.parentNode) r.object.parentNode.insertBefore(r.placeholder, r.object);
        } else {
          if (r.object.parentNode) r.object.parentNode.replaceChild(r.placeholder, r.object);
        }
        r.extras.placeholder = r.placeholder;
        this._collectPluginExtras(pluginExtras, r.extras);
        if (this.abpInstalled && !this.abpRemoveTabs)
          this.adjustAbpTab(r.placeholder);
      } catch(e) {
        this.dump(e);
      }
    }
    
    
  },
  
  bind: function(f) {
    if (f.bound) return f.bound;
    var self = this;
    return (function() { return f.apply(self, arguments); });
  },
  
  onPlaceholderClick: function(ev) {
    if (ev.button) return;
    const anchor = ev.currentTarget
    const object = this.getExpando(anchor, "removedPlugin");
    
    if (object) try {
      if (ev.shiftKey) {
        anchor.style.display = "none";
        this.removeAbpTab(anchor);
        return;
      }
      this.checkAndEnablePlaceholder(anchor, object);
    } finally {
      ev.preventDefault();
      ev.stopPropagation();
    }
  },
  
  get abpInstalled() {
    delete this.__proto__.abpInstalled;
    return this.__proto__.abpInstalled = ABID in CC;
  },
  
  grabAbpTab: function(ref) {
    if (!this.abpInstalled) return null;
    var ot = ref.previousSibling;
    return (ot && (ot instanceof CI.nsIDOMHTMLAnchorElement) && !ot.firstChild && /\babp-objtab-/.test(ot.className))
      ? ot : null; 
  },
  
  removeAbpTab: function(ref) {
    var ot = this.grabAbpTab(ref);
    if (ot) {
      ot.parentNode.removeChild(ot);
    }
  },
  
  adjustAbpTab: function(ref) {
    var ot = this.grabAbpTab(ref);
    if (ot) {
      var style = ot.style;
      style.setProperty("left", ref.offsetWidth + "px", "important");
      if (!/\bontop\b/.test(ot.className)) {
        style.setProperty("top", ref.offsetHeight + "px", "important");
      }
    }
  },
  
  checkAndEnablePlaceholder: function(anchor, object) {
    if (!(object || (object = this.getExpando(anchor, "removedPlugin")))) 
      return;
    
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
      this.getAllowObjectMessage(extras.url, 
          (extras.tag || "<OBJECT>") + ", " + extras.mime), 
      "confirmUnblock"
    );
  },
  
  isLegacyFrameDocument: function(doc) {
    return (doc.defaultView.frameElement instanceof CI.nsIDOMHTMLFrameElement) && this.isPluginDocumentURL(doc.URL, "iframe");
  },
  
  checkAndEnableObject: function(ctx) {
    var extras = ctx.extras;
    if (this.confirmEnableObject(ctx.window, extras)) {

      var mime = extras.mime;
      var url = extras.url;
      
      this.allowObject(url, mime);
      var doc = ctx.anchor.ownerDocument;
      
      
      var isLegacyFrame = this.isLegacyFrameDocument(doc);
       
      if (isLegacyFrame || (mime == doc.contentType && 
          (ctx.anchor == doc.body.firstChild && 
           ctx.anchor == doc.body.lastChild ||
           (ctx.object instanceof CI.nsIDOMHTMLEmbedElement) && ctx.object.src != url))
        ) { // stand-alone plugin or frame
          doc.body.removeChild(ctx.anchor); // TODO: add a throbber
          if (isLegacyFrame) {
            this.setExpando(doc.defaultView.frameElement, "allowed", true);
            doc.defaultView.frameElement.src = url;
          } else this.quickReload(doc.defaultView, true);
      } else if (this.requireReloadRegExp && this.requireReloadRegExp.test(mime)) {
        this.quickReload(doc.defaultView);
      } else if (this.getExpando(ctx, "silverlight")) {
        this.allowObject(doc.documentURI, mime);
        this.quickReload(doc.defaultView);
      } else {
        this.setExpando(ctx.anchor, "removedPlugin", null);
        extras.placeholder = null;
        this.delayExec(function() {
          this.removeAbpTab(ctx.anchor);
          var obj = ctx.object.cloneNode(true);
          
          ctx.anchor.parentNode.replaceChild(obj, ctx.anchor);
          this.setExpando(obj, "allowed", true);
          var pluginExtras = this.findPluginExtras(ctx.ownerDocument);
          if(pluginExtras) {
            var pos = pluginExtras.indexOf(extras);
            if(pos > -1) pluginExtras.splice(pos, 1);
          }
          ctx = null;
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
        return false;
      }
    }
    pluginExtras.push(extras);
    return true;
  },
 
  _silverlightInstalledHack: null,
  applySilverlightPatch: function(doc) {
    try {
      if(!this._silverlightInstalledHack) {
        this._silverlightInstalledHack = "HTMLObjectElement.prototype.IsVersionSupported = function(n) { return this.type == 'application/x-silverlight'; };";
      }
     
      if (this.getExpando(doc, "silverlightHack")) return;
      if (this.consoleDump & LOG_CONTENT_BLOCK) this.dump("Emulating SilverlightControl.IsVersionSupported()");
      this.setExpando(doc, "silverlightHack", true);
      ScriptSurrogate.execute(doc, this._silverlightInstalledHack);
    } catch(e) {
       if (this.consoleDump) this.dump(e);
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
  
  _enumerateSites: function(browser, sites) {

    
    const nsIDocShell = CI.nsIDocShell;
    const nsIWebProgress = CI.nsIWebProgress;
    
    const docShells = browser.docShell.getDocShellEnumerator(
        CI.nsIDocShellTreeItem.typeContent,
        browser.docShell.ENUMERATE_FORWARDS
    );
    
    var loading = false, loaded = false, domLoaded = false;
    
    var docShell, docURI, url, win;

    var cache, redir, tmpPluginCount;
    
    var document, domain;
    while (docShells.hasMoreElements()) {
       
      docShell = docShells.getNext();
      document = (docShell instanceof nsIDocShell) &&
                 docShell.contentViewer && docShell.contentViewer.DOMDocument;
      if (!document) continue;
      
      // Truncate title as needed
      if (this.truncateTitle && document.title.length > this.truncateTitleLen) {
        document.title = document.title.substring(0, this.truncateTitleLen);
      }
      
      // Collect document / cached plugin URLs
      win = document.defaultView;
      url = this.getSite(docURI = document.documentURI);
      
      if (url) {
        try {
          if (document.domain && document.domain != this.getDomain(url, true) && url != "chrome:" && url != "about:blank") {
           // temporary allow changed document.domain on allow page
            if (this.getExpando(browser, "allowPageURL") == browser.docShell.currentURI.spec &&
                this.getBaseDomain(document.domain).length >= document.domain.length &&
                !(this.isJSEnabled(document.domain) || this.isUntrusted(document.domain))) {
             this.setTemp(document.domain, true);
             this.setJSEnabled(document.domain, true);
             this.quickReload(win);
           }
           sites.unshift(document.domain);
          }
        } catch(e) {}
        
        sites.docSites.push(url);
        sites.push(url);

        for each(redir in this.getRedirCache(browser, docURI)) {
          sites.push(redir.site);
        }
      }
       
       
      tmpPluginCount = 0;
      
      domLoaded = this.getExpando(win, "contentLoaded");
      
      if (win == win.top) {
        cache = this.getExpando(win, "objectSites");
        if(cache) {
          if(this.consoleDump & LOG_CONTENT_INTERCEPT) this.dump("Adding plugin sites: " + cache.toSource());
          sites.push.apply(sites, cache);
          tmpPluginCount = cache.length;
          sites.pluginSites.push.apply(sites, cache);
        }
        
        cache = this.getExpando(win, "codeSites");
        if(cache) sites.push.apply(sites, cache);
        
        if (domLoaded) this.setExpando(browser, "allowPageURL", null);
      }
      
       // plugins
      this.processObjectElements(document, sites);
      
      loaded = !((docShell instanceof nsIWebProgress) && docShell.isLoadingDocument);
      if (!(domLoaded || loaded)) {
        sites.pluginCount += tmpPluginCount;
        loading = true;
        continue;
      }

       // scripts
      this.processScriptElements(document, sites);
    }
   
    var j;
    for (j = sites.length; j-- > 0;) {
      url = sites[j];
      if (/:/.test(url) && !(
          /^(?:file:\/\/|[a-z]+:\/*[^\/\s]+)/.test(url) || 
          this.getSite(url + "x") == url // doesn't this URL type support host?
        )) {
        sites.splice(j, 1); // reject scheme-only URLs
      }
    }
    
    
    sites.topURL = sites[0] || '';
    
    if (loading) try {
      browser.ownerDocument.defaultView.noscriptOverlay.syncUI();
    } catch(e) {}
    
    return this.sortedSiteSet(sites);
    
  },
  
  findOverlay: function(browser) {
    return browser && browser.ownerDocument.defaultView.noscriptOverlay;
  },
  

  // nsIChannelEventSink implementation

  onChannelRedirect: function(oldChannel, newChannel, flags) {
    const rw = this.requestWatchdog;
    const uri = newChannel.URI;
    
     if (HTTPS.isRedir(newChannel)) {
      ns.log("HTTPS->HTTP redirect loop detected, aborting...");
      oldChannel.cancel(NS_ERROR_REDIRECT_LOOP);
      newChannel.cancel(NS_ERROR_REDIRECT_LOOP);
      throw NS_ERROR_REDIRECT_LOOP;
    }

    ChanUtil.attachToChannel(newChannel, "noscript.redirectFrom", oldChannel.URI);
    
    const ph = ChanUtil.extractFromChannel(oldChannel, "noscript.policyHints");
    try {
      if (ph) {
        // 0: aContentType, 1: aContentLocation, 2: aRequestOrigin, 3: aContext, 4: aMimeTypeGuess, 5: aInternalCall
        
        ph[1] = uri;
        
        var ctx = ph[3];
        
        if (!this.isJSEnabled(oldChannel.URI.spec)) ph[2] = oldChannel.URI;
        try {
          ph[4] = newChannel.contentType || oldChannel.contentType || ph[4];
        } catch(e) {}
        
        var browser, win;
        var type = ph[0];
        if(type != 6) { // not a document load? try to cache redirection for menus
          try {
            var site = this.getSite(uri.spec);
            win = DOM.findWindowForChannel(newChannel) || ctx && ((ctx instanceof CI.nsIDOMWindow) ? ctx : ctx.ownerDocument.defaultView); 
            browser = win && DOM.findBrowserForChannel(newChannel, win);
            if (browser) {
              this.getRedirCache(browser, win.document.documentURI)
                  .push({ site: site, type: type });
            } else {
              if (this.consoleDump) this.dump("Cannot find window for " + uri.spec);
            }
          } catch(e) {
            if (this.consoleDump) this.dump(e);
          }
          
          if (type == 7) {
            ph[5] = CP_FRAMECHECK;
            if (win && win.frameElement && ph[3] != win.frameElement) {
              // this shouldn't happen
              if (this.consoleDump) this.dump("Redirected frame change for destination " + uri.spec);
              ph[3] = win.frameElement;
            }
          }
          
        }
        
        if ((type == 6 || type == 7) && HTTPS.forceHttps(newChannel)) throw "NoScript aborted non-HTTPS redirection to " + uri.spec;
        
        var scheme = uri.scheme;
        if (this.shouldLoad.apply(this, ph) != CP_OK
            || scheme != uri.scheme // forced HTTPS policy
            ) {
          if (this.consoleDump) {
            this.dump("Blocked " + oldChannel.URI.spec + " -> " + uri.spec + " redirection of type " + type);
          }
          throw "NoScript aborted redirection to " + uri.spec;
        }
        
        ChanUtil.attachToChannel(newChannel, "noscript.policyHints", ph);
      } else {
        // no Policy Hints, likely an image loading
        if (!uri.schemeIs("https") && HTTPS.forceHttpsPolicy(uri.clone())) throw "NoScript aborted non-HTTPS background redirection to " + uri.spec;
      }
    } finally {
      this.resetPolicyState();
    }
    
    // Document transitions
  
    if ((oldChannel.loadFlags & rw.DOCUMENT_LOAD_FLAGS) || (newChannel.loadFlags & rw.DOCUMENT_LOAD_FLAGS) && oldChannel.URI.prePath != uri.prePath) {
      if (newChannel instanceof CI.nsIHttpChannel)
        HTTPS.onCrossSiteRequest(newChannel, oldChannel.URI.spec,
                               browser || DOM.findBrowserForChannel(oldChannel), rw);
      
      // docshell JS state management
      win = win || DOM.findWindowForChannel(oldChannel);
      this._handleDocJS2(win, oldChannel);
      this._handleDocJS1(win, newChannel);
    }
    
  },
  
  getRedirCache: function(browser, uri) {
    var redirCache = this.getExpando(browser, "redirCache", {});
    return redirCache[uri] || (redirCache[uri] = []);
  },
  
  currentPolicyURI: null,
  currentPolicyHints: null,
  resetPolicyState: function() {
    this.currentPolicyURI = this.currentPolicyHints = null;
  },
  
  // nsIWebProgressListener implementation
  onLinkIconAvailable: function(x) {}, // tabbrowser.xml bug?
  onStateChange: function(wp, req, stateFlags, status) {
    var ph, w;

    if (stateFlags & WP_STATE_START) {
      if (req instanceof CI.nsIHttpChannel) {
        if (this.currentPolicyURI == req.URI) {
          ChanUtil.attachToChannel(req, "noscript.policyHints", ph = this.currentPolicyHints);
          this.resetPolicyState();
        }
      }
      
      // handle docshell JS switching and other early duties
      if ((stateFlags & WP_STATE_START_DOC) == WP_STATE_START_DOC && req instanceof CI.nsIChannel) {
        
        if (!(req.loadFlags & req.LOAD_INITIAL_DOCUMENT_URI) &&
            req.URI.spec == "about:blank" // new tab, we shouldn't touch it otherwise we break stuff like newTabURL
          ) 
          return;
        
        w = wp.DOMWindow;
  
        if (w && w.frameElement) {
          ph = ph || ChanUtil.extractFromChannel(req, "noscript.policyHints", true);
          if (ph && this.shouldLoad(7, req.URI, ph[2], w.frameElement, '', CP_FRAMECHECK) != CP_OK) { // late frame/iframe check
            req.cancel(NS_BINDING_ABORTED);
            return;
          }
        }
        
        this._handleDocJS1(w, req);
        if (HTTPS.forceHttps(req, w)) {
          this._handleDocJS2(w, req);
        }
      } else try {
        ph = ph || ChanUtil.extractFromChannel(req, "noscript.policyHints", true); 
  
        if (ph) {
          if (ph[0] == 2 && (req instanceof CI.nsIHttpChannel)) {
            var originSite = (ChanUtil.extractInternalReferrer(req) || ph[2]).prePath;
            var scriptSite = req.URI.prePath;
            if (scriptSite != originSite && this.getPref("checkHijackings"))
              new RequestFilter(req, new HijackChecker(this));
          } 
        } else if (req instanceof CI.nsIHttpChannel && wp.DOMWindow.document instanceof CI.nsIDOMXULDocument
                   && !/^(?:chrome|resource):/i.test(wp.DOMWindow.document.documentURI)) {
          if (!this.isJSEnabled(req.URI.prePath)) {
            req.cancel(NS_BINDING_ABORTED);
            if (this.consoleDump & LOG_CONTENT_BLOCK) this.dump("Aborted script " + req.URI.spec);
          }
        }
      } catch(e) {}
    } else if (stateFlags & WP_STATE_STOP) {
      ChanUtil.extractFromChannel(req, "noscript.policyHints"); // release hints
    } else if ((stateFlags & WP_STATE_TRANSFERRING_DOC) == WP_STATE_TRANSFERRING_DOC) {
      w = wp.DOMWindow;
      if (w && w != w.top && (req instanceof CI.nsIHttpChannel)) {
        this.onBeforeLoad(req, w, req.URI);
      } 
    }
  },
  
  onLocationChange: function(wp, req, location) {
    try {
      
      if (req && (req instanceof CI.nsIChannel)) {
        
        this._handleDocJS2(wp.DOMWindow, req);
        
        if (this.consoleDump & LOG_JS)
          this.dump("Location Change - req.URI: " + req.URI.spec + ", window.location: " +
                  (wp.DOMWindow && wp.DOMWindow.location.href) + ", location: " + location.spec);

        this.onBeforeLoad(req, wp.DOMWindow, location);
      }
    } catch(e) {
      if (this.consoleDump) this.dump(e);
    }
  },
  onStatusChange: function() {},
  onSecurityChange: function() {}, 
  onProgressChange: function() {},
  
  // accessory hacks
  onContentSniffed: function(req) {
    try {
      if(this.consoleDump & LOG_SNIFF) {
        try {
          this.dump("OCS: " + req.URI.spec + ", " + req.contentType);
        } catch(e) {
          this.dump("OCS: " + req.URI.spec + ", CONTENT TYPE UNAVAILABLE YET");
        }
      }
     
      const domWindow = DOM.findWindowForChannel(req);
      if (domWindow && domWindow == domWindow.top) {
        return; // for top windows we call onBeforeLoad in onLocationChange
      }
      if (ABE.checkFrameOpt(domWindow, req)) {
        req.cancel(NS_BINDING_ABORTED);
        this.showFrameOptError(domWindow, req.URI.spec);
        return; // canceled by frame options
      }
    } catch(e) {
      if (this.consoleDump) this.dump(e);
    }
  },
  
  showFrameOptError: function(w, url) {
    this.log("X-FRAME-OPTIONS: blocked " + url, true);
    var f = w && w.frameElement;
    if (!f) return;
    const errPage = this.contentBase + "frameOptErr.xhtml";
    f.addEventListener("load", function(ev) {
      f.removeEventListener(ev.type, arguments.callee, false);
      if (errPage == f.contentWindow.location.href)
        f.contentWindow.document.getElementById("link")
          .setAttribute("href", url);
    }, false);
    f.contentWindow.location.replace(errPage);
  },

  
  onBeforeLoad: function(req, domWindow, location) {
    
    if (!domWindow) return;
    
    const uri = location;
    
    var docShell = null;
    
      
    if (domWindow.document && (uri.schemeIs("http") || uri.schemeIs("https"))) {
      this.filterUTF7(req, domWindow, docShell = DOM.getDocShellForWindow(domWindow)); 
    }
    
    if (this.checkJarDocument(uri, domWindow)) {
      req.cancel(NS_BINDING_ABORTED);
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
        xssInfo = ChanUtil.extractFromChannel(req, "noscript.XSS");
        if (xssInfo) xssInfo.browser = browser;
        this.requestWatchdog.unsafeReload(browser, false);
        
        if (!this.getExpando(browser, "clearClick")) {
          this.setExpando(browser, "clearClick", true);
          this.clearClickHandler.install(browser);
        }
      }
    }
    
    
    
    this._handleDocJS3(uri.spec, domWindow, docShell);
    
    var contentType;
    try {
      contentType = req.contentType;
    } catch(e) {
      contentType = "";
    }
    
    if (this.shouldLoad(7, uri, uri, domWindow, contentType, CP_SHOULDPROCESS) != CP_OK) {
      
      req.loadFlags |= req.INHIBIT_CACHING;
      
      if (this.consoleDump & LOG_CONTENT_INTERCEPT)
        this.dump("Plugin document content type detected");

      if(!topWin) { 
        // check if this is an iframe
        
        if (domWindow.frameElement && !(domWindow.frameElement instanceof CI.nsIDOMHTMLFrameElement)
            && this.shouldLoad(5, uri, SiteUtils.ios.newURI(domWindow.parent.location.href, null, null),
                domWindow.frameElement, contentType, CP_SHOULDPROCESS) == CP_OK)
            return;
        
        if (this.consoleDump & LOG_CONTENT_BLOCK) 
          this.dump("Deferring framed plugin document");
        
        req.cancel(NS_BINDING_ABORTED);
        
        browser = browser || DOM.findBrowserForNode(domWindow);
        this.getRedirCache(browser, uri.spec).push({site: this.getSite(domWindow.top.document.documentURI), type: 7});
        // defer separate embed processing for frames
        domWindow.location.replace(this.createPluginDocumentURL(uri.spec));
        return;
      }
      
      if (this.consoleDump & LOG_CONTENT_BLOCK) 
        this.dump("Blocking top-level plugin document");

      req.cancel(NS_BINDING_ABORTED);
      
      var embeds = domWindow.document.getElementsByTagName("embed");

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
      if (xssInfo) overlay.notifyXSS(xssInfo);
      
      return;

    } else {
      if (topWin) {
        if (xssInfo) overlay.notifyXSSOnLoad(xssInfo);
      }
    }
  },
  
  get clearClickHandler() {
      const cch = new ClearClickHandler(this);
      this.__defineGetter__("clearClickHandler", function() { return cch; })
      return cch;
  },
  
  _handleDocJS1: function(win, req) {
    
    const docShellJSBlocking = this.docShellJSBlocking;
    if (!docShellJSBlocking || (win instanceof CI.nsIDOMChromeWindow)) return;
    
    
    try {
      
      var url = req.URI.spec;
      if (!/^https?:/.test(url)) url = req.originalURI.spec;

      var jsEnabled;
      
      var docShell = DOM.getDocShellForWindow(win) ||
                     DOM.getDocShellForWindow(DOM.findWindowForChannel(req));
      
      if (!docShell) {
        if (this.consoleDump) this.dump("DocShell not found for JS switching in " + url);
        return;
      }
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
      
      ChanUtil.attachToChannel(req, "noscript.dsjsBlocked",
                { value: // !jsEnabled && (prevBlocked || prevStatus)
                        // we're the cause of the current disablement if
                        // we're disabling and (was already blocked by us or was not blocked)
                        !(jsEnabled || !(prevBlocked || prevStatus)) // De Morgan for the above, i.e.
                        // we're the cause of the current disablement unless
                        // we're enabling or (was already blocked by someone else = was not (blocked by us or enabled))
                        // we prefer the latter because it coerces to boolean
                });
      
      docShell.allowJavascript = jsEnabled;
    } catch(e2) {
      if (this.consoleDump & LOG_JS)
        this.dump("Error switching DS JS: " + e2);
    }
  },
  
  _handleDocJS2: function(win, req) {
    // called at the beginning of onLocationChange
    if (win)
      this.setExpando(win.document, "prevBlocked",
        ChanUtil.extractFromChannel(req, "noscript.dsjsBlocked")
      );
  },
  
  _handleDocJS3: function(url, win, docShell) {
    // called at the end of onLocationChange
    if (docShell && !docShell.allowJavascript || !(this.jsEnabled || this.isJSEnabled(this.getSite(url)))) {
      if (this.getPref("fixLinks")) {
        win.addEventListener("click", this.bind(this.onContentClick), true);
        win.addEventListener("change", this.bind(this.onContentChange), true);
      }
      return;
    }
    try {
      if(this.jsHackRegExp && this.jsHack && this.jsHackRegExp.test(url) && !win._noscriptJsHack) {
        try {
          win._noscriptJsHack = true;
          win.location.href = encodeURI("javascript:try { " + this.jsHack + " } catch(e) {} void(0)");
        } catch(jsHackEx) {}
      }
      ScriptSurrogate.apply(win.document, url, url);
    } catch(e) {}
    
  },
  

  
  beforeManualAllow: function(win) {
    // reset prevBlock info, to forcibly allow docShell JS
    this.setExpando(win.document, "prevBlock", { value: "m" });
  },
  
  checkJarDocument: function(uri, context) {
    if (this.forbidJarDocuments && (uri instanceof CI.nsIJARURI) &&
      !(/^(?:file|resource|chrome)$/.test(uri.JARFile.scheme) ||
          this.forbidJarDocumentsExceptions &&
          this.forbidJarDocumentsExceptions.test(uri.spec))
      ) {
               
      if (context && this.getPref("jarDoc.notify", true)) {
        var window = (context instanceof CI.nsIDOMWindow) && context || 
          (context instanceof CI.nsIDOMDocumentView) && context.defaultView || 
          (context instanceof CI.nsIDOMNode) && context.ownerDocument && context.ownerDocument.defaultView;
        if (window) {
          window.setTimeout(this.displayJarFeedback, 10, {
            context: context,
            uri: uri.spec
          });
        } else {
          this.dump("checkJarDocument -- window not found");
        }
      }
      this.log("[NoScript] " + this.getString("jarDoc.notify", [uri.spec]));
      return true;
    }
    return false;
  },
  
  displayJarFeedback: function(info) {
    var doc = (info.context instanceof CI.nsIDOMDocument) && info.context || 
      info.context.contentDocument || info.context.document || info.context.ownerDocument;
    if (!doc) {
      this.dump("displayJarFeedback -- document not found");
      return;
    }
    var browser = DOM.findBrowserForNode(doc);
    if (browser) {
      var overlay = ns.findOverlay(browser);
      if (overlay && overlay.notifyJarDocument({
          uri: info.uri,
          document: doc
      })) return;
    } else {
      this.dump("displayJarFeedback -- browser not found... falling back to content notify");
    }
    
    var message = ns.getString("jarDoc.notify", [SiteUtils.crop(info.uri)]) + 
      "\n\n" + ns.getString("jarDoc.notify.reference");
    
    var rootNode = doc.documentElement.body || doc.documentElement;
    const containerID = "noscript-jar-feedback";
    var container = doc.getElementById(containerID);
    if (container) container.parentNode.removeChild(container);
    container = rootNode.insertBefore(doc.createElementNS(HTML_NS, "div"), rootNode.firstChild || null);
    with(container.style) {
      backgroundColor = "#fffff0";
      borderBottom = "1px solid #444";
      color = "black";
      backgroundImage = "url(" + ns.pluginPlaceholder + ")";
      backgroundPosition = "left top";
      backgroundRepeat = "no-repeat";
      paddingLeft = "40px";
      margin = "0px";
      parring = "8px";
    }
    container.id = "noscript-jar-feedback";
    var description = container.appendChild(doc.createElementNS(HTML_NS, "pre"));
    description.appendChild(doc.createTextNode(message));
    description.innerHTML = description.innerHTML
    .replace(/\b(http:\/\/noscript.net\/faq#jar)\b/g, 
              '<a href="$1" title="NoScript JAR FAQ">$1</a>'); 
  },
  // end nsIWebProgressListener
  
  filterUTF7: function(req, window, ds) {
    try {
      var as = CC["@mozilla.org/atom-service;1"].getService(CI.nsIAtomService);
      if(window.document.characterSet == "UTF-7" ||
        !req.contentCharset && (ds.documentCharsetInfo.parentCharset + "") == "UTF-7") {
        if(this.consoleDump) this.dump("Neutralizing UTF-7 charset!");
        ds.documentCharsetInfo.forcedCharset = as.getAtom("UTF-8");
        ds.documentCharsetInfo.parentCharset = ds.documentCharsetInfo.forcedCharset;
      }
    } catch(e) { 
      if(this.consoleDump) this.dump("Error filtering charset: " + e) 
    }
  },
  
  _attemptNavigationInternal: function(doc, destURL, callback) {
    var cs = doc.characterSet;
    var uri = SiteUtils.ios.newURI(destURL, cs, SiteUtils.ios.newURI(doc.documentURI, cs, null));
    
    if (/^https?:\/\//i.test(destURL)) callback(doc, uri);
    else {
      var req = CC["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(CI.nsIXMLHttpRequest);
      req.open("HEAD", uri.spec);
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
      jsURL = /^javascript:/.test(href);
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
        var m = onclick.match(/\bdocument\s*\.\s*(?:forms)?\s*(?:\[\s*["']?)?([^\.\;\s"'\]]+).*\.submit\s*\(\)/);
        form = m && (/\D/.test(m[1]) ? (doc.forms.namedItem(m[1]) || doc.getElementById(m[1])) : doc.forms.item(parseInt(m[1])));
      }
      if (form) form.submit();
      else return;
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
        if (typeof(/ /) == "function") ev.preventDefault(); // Gecko < 1.9
        this.attemptNavigation(doc, fixedHref, callback);
        ev.preventDefault();
      }
    } else { // try processing history.go(n) //
      if(!onclick) return;
      
      jsURL = onclick.match(/history\s*\.\s*(?:go\s*\(\s*(-?\d+)\s*\)|(back|forward)\s*\(\s*)/);
      jsURL = jsURL && (jsURL = jsURL[1] || jsURL[2]) && (jsURL == "back" ? -1 : jsURL == "forward" ? 1 : jsURL); 

      if (!jsURL) return;
      // jsURL now has our relative history index, let's navigate

      var ds = DOM.getDocShellForWindow(doc.defaultView);
      if (!ds) return;
      var sh = ds.sessionHistory;
      if (!sh) return;
      
      var idx = sh.index + jsURL;
      if (idx < 0 || idx >= sh.count) return; // out of history bounds 
      ds.gotoIndex(idx);
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
  
  get compatEvernote() {
    delete this.__proto__.compatEvernote;
    return this.__proto__.compatEvernote = ("IWebClipper3" in CI) && this.getPref("compat.evernote") && {
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
    delete this.__proto__.compatGNotes;
    return this.__proto__.compatGNotes = ("@google.com/gnotes/app-context;1" in CC) && this.getPref("compat.gnotes") &&
      "http://www.google.com/notebook/static_files/blank.html";
  },
  
  consoleService: CC["@mozilla.org/consoleservice;1"].getService(CI.nsIConsoleService),
  
  log: function(msg, dump) {
    this.consoleService.logStringMessage(msg);
    if (dump) this.dump(msg, true);
  },
 
  dump: function(msg, noConsole) {
    msg = "[NoScript] " + msg;
    dump(msg + "\n");
    if(this.consoleLog && !noConsole) this.log(msg);
  }
};


INCLUDE('ChanUtil', 'XSS', 'HTTPS', 'ClearClickHandler', 'URIValidator', 'RequestFilters', 'ScriptSurrogate', 'ABE');
