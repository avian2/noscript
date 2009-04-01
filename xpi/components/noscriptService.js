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

// Scaffolding

const CI = Components.interfaces;
const CC = Components.classes;
const WP_STATE_START = CI.nsIWebProgressListener.STATE_START;
const WP_STATE_STOP = CI.nsIWebProgressListener.STATE_STOP;
const WP_STATE_TRANSFERRING = CI.nsIWebProgressListener.STATE_TRANSFERRING;
const WP_STATE_DOC = CI.nsIWebProgressListener.STATE_IS_DOCUMENT;
const WP_STATE_START_DOC = WP_STATE_START | WP_STATE_DOC;
const WP_STATE_TRANSFERRING_DOC = WP_STATE_TRANSFERRING | WP_STATE_DOC;

const NS_BINDING_ABORTED = 0x804B0002;
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
const LOG_DOMUTILS = 64;
const LOG_JS = 128;
const LOG_LEAKS = 1024;
const LOG_SNIFF = 2048;
const LOG_CLEARCLICK = 4096;

const NOSCRIPT_HOST = "...noscript...";

const HTML_NS = "http://www.w3.org/1999/xhtml";

const WHERE_UNTRUSTED = 1;
const WHERE_TRUSTED = 2;
const ANYWHERE = 3;

// component defined in this file
const EXTENSION_ID="{73a6fe31-595d-460b-a920-fcc0f8843232}";
const SERVICE_NAME="NoScript Service";
const SERVICE_ID="{31aec909-8e86-4397-9380-63a59e0c5ff5}";
const SERVICE_CTRID = "@maone.net/noscript-service;1";
const SERVICE_CONSTRUCTOR=NoscriptService;

const SERVICE_CID = Components.ID(SERVICE_ID);


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


// Factory object
const SERVICE_FACTORY = {
  _instance: null,
  createInstance: function (outer, iid) {
    if (outer != null)
        throw Components.results.NS_ERROR_NO_AGGREGATION;

    xpcom_checkInterfaces(iid, SERVICE_IIDS, Components.results.NS_ERROR_INVALID_ARG);
    // kept this for flexibility sake, but we're really adopting an
    // early instantiation and late init singleton pattern
    return this._instance==null ? this._instance=new SERVICE_CONSTRUCTOR() : this._instance;
  }
};

function xpcom_generateQI(iids) {
  var lines = [];
  for (var j = iids.length; j-- > 0;) {
    lines.push("if(CI." + iids[j].name + ".equals(iid)) return this;");
  }
  lines.push("throw Components.results.NS_ERROR_NO_INTERFACE;");
  return new Function("iid", lines.join("\n"));
}


function xpcom_checkInterfaces(iid,iids,ex) {
  for (var j = iids.length; j-- >0;) {
    if (iid.equals(iids[j])) return true;
  }
  throw ex;
}

var Module = {
  get categoryManager() {
    delete this.categoryManager;
    return this.categoryManager = CC['@mozilla.org/categorymanager;1'
        ].getService(CI.nsICategoryManager);
  },
  firstTime: true,
  registerSelf: function(compMgr, fileSpec, location, type) {
    if (this.firstTime) {
      compMgr.QueryInterface(CI.nsIComponentRegistrar
        ).registerFactoryLocation(SERVICE_CID,
        SERVICE_NAME,
        SERVICE_CTRID, 
        fileSpec,
        location, 
        type);
      const catman = this.categoryManager;
      for (var j=0, len = SERVICE_CATS.length; j < len; j++) {
        catman.addCategoryEntry(SERVICE_CATS[j],
          SERVICE_CTRID, SERVICE_CTRID, true, true);
      }
      this.firstTime = false;
    }
  },
  
  unregisterSelf: function(compMgr, fileSpec, location) {
    compMgr.QueryInterface(CI.nsIComponentRegistrar
      ).unregisterFactoryLocation(SERVICE_CID, fileSpec);
    const catman = this.categoryManager;
    for (var j = 0, len=SERVICE_CATS.length; j<len; j++) {
      catman.deleteCategoryEntry(SERVICE_CATS[j], SERVICE_CTRID, true);
    }
  },

  getClassObject: function (compMgr, cid, iid) {
    if (cid.equals(SERVICE_CID))
      return SERVICE_FACTORY;
  
    if (!iid.equals(CI.nsIFactory))
      throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
    
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  canUnload: function(compMgr) {
    return true;
  }
}
function NSGetModule(compMgr, fileSpec) {
  return Module;
}

// END XPCOM Scaffolding

const URIValidator = {
  
  QueryInterface: xpcom_generateQI([CI.nsIObserver, CI.nsISupportsWeakReference, CI.nsISupports]),
  
  // returns false if absolute URI is not valid, undefined if it cannot be validated (i.e. no validator is found for this scheme) 
  validate: function(uriSpec) {
    if (!uriSpec) return false;
    var parts = uriSpec.split(":");
    if (parts.length < 2) return false;
    var scheme = parts.shift().toLowerCase();
    if (!scheme) return false;
    var validator = this.validators[scheme];
    try {
      // using unescape rather than decodeURI for a reason:
      // many external URL (e.g. mailto) default to ISO8859, and we would fail,
      // but on the other hand rules marking as invalid non-null high unicode chars are unlikely (let's hope it) 
      return validator && validator.test(unescape(parts.join(":"))); 
    } catch(e) {
      return false;
    }
  },
  
  get validators() {
    delete this.validators;
    this._init();
    return this.validators;
  },
  
  prefs: null,
  _init: function() {
    this.validators = {};
    this.prefs = CC["@mozilla.org/preferences-service;1"].getService(CI.nsIPrefService)
      .getBranch("noscript.urivalid.").QueryInterface(CI.nsIPrefBranch2);
    for each(var key in this.prefs.getChildList("", {})) {
      this.parseValidator(key);
    }
    this.prefs.addObserver("", this, true);
  },
  parseValidator: function(key) {
    try {
      this.validators[key] = new RegExp("^" + this.prefs.getCharPref(key) + "$");
    } catch(e) {
      delete this.validators[key];
    }
  },
  observe: function(prefs, topic, key) {
    this.parseValidator(key);
  }
};

function Strings(chromeName) {
  this.chromeName = chromeName;
}

Strings.wrap = function(s, length, sep) {
  if (!sep) sep = ' ';
    
  function wrapPara(p) {
    if (!length) length = 80;
    if (p.length <= length) return p;
    chunks = [];
    var pos;
    while (p.length > length) {
      pos = p.lastIndexOf(sep, length);
      if (pos < 0) pos = p.indexOf(sep, length);
      if (pos < 0) break;
      chunks.push(p.substring(0, pos));
      p = p.substring(pos + 1);
    }

    if (chunks.length) {
      res  = chunks.join("\n");
      if (p.length) res += "\n" + p;
      return res;
    } else return p;
  }
  if (typeof(s) != "string") s = s.toString();
  var paras = s.split("\n");
  
  for (var j = 0; j < paras.length; j++) paras[j] = wrapPara(paras[j]);
  return paras.join("\n");
}

Strings.prototype = {
  bundles: {},
  getBundle: function(path) {
    if (path in this.bundles) return this.bundles[path];
    try {
      return this.bundles[path] = 
        CC["@mozilla.org/intl/stringbundle;1"]
                  .getService(CI.nsIStringBundleService)
                  .createBundle("chrome://" + this.chromeName +  "/" + path +
                                "/" + this.chromeName + ".properties");
    } catch(ex) {
      return this.bundles[path] = null;
    }
  },
  
 
  _stringFrom: function(bundle, name, parms) {
    try {
      return parms ? bundle.formatStringFromName(name, parms, parms.length) : bundle.GetStringFromName(name);
    } catch(ex) {
      return null;
    }
  }
,
  getString: function(name, parms) {
    var s=this._stringFrom(this.getBundle("locale"), name, parms);
    return s || this._stringFrom(this.getBundle("content/en-US"), name, parms) || name;
  }
  
}

const noscriptStrings = new Strings("noscript");

const SiteUtils = new function() {
  const _domainPattern = /^[\w\u0080-\uffff][\w\-\.\u0080-\uffff]*$/;
  
  const _ios = this.ios = CC["@mozilla.org/network/io-service;1"]
    .getService(CI.nsIIOService);
  
  const _uriFixup = this.uriFixup = CC["@mozilla.org/docshell/urifixup;1"]
    .getService(CI.nsIURIFixup);
  
  function sorter(a, b) {
    if (a == b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    const dp = _domainPattern;
    return dp.test(a) ?
        (dp.test(b) ? (a < b ? -1 : 1) : -1)
      : (dp.test(b) ? 1 : a < b ? -1 : 1);
  }
  
  this.sort = function(ss) {
    return ss.sort(sorter);
  };
  
  this.getSite = function(url) {
    if (!url || 
        url.charCodeAt(0) < 33  && // needs trimming
        !(url = url.replace(/^\s*(.*?)\s*$/, '$1'))) {
      return "";
    }
    
    if (url.indexOf(":") == -1) {
      return this.domainMatch(url);
    }
    
    var scheme;
    try {
      scheme = this.ios.extractScheme(url).toLowerCase();
      switch (scheme) {
        case "http": case "https": // commonest case first
          break;
        case "javascript": case "data": 
          return "";
        case "about":
          return url.split(/[\?#]/, 1)[0];
        case "chrome":
          return "chrome:";
      }
      scheme += ":";
      if (url == scheme) return url;
    } catch(ex) {
      return this.domainMatch(url);
    }
    try {
      // let's unwrap JAR uris
      var uri = _uriFixup.createExposableURI(_ios.newURI(url, null, null));
      if (uri instanceof CI.nsIJARURI) {
        uri = uri.JARFile;
        return uri ? this.getSite(uri.spec) : scheme;
      }
      try  {
        return scheme + "//" + uri.hostPort;
      } catch(exNoHostPort) {
        var host = uri.spec.substring(scheme.length);
        return /^\/\/[^\/]/.test(host) && (host = this.domainMatch(host.replace(/^\/\/([^\/]+).*/, "$1")))
          ? scheme + "//" + host
          : scheme;
      }
    } catch(ex) {
      return "";
    }
  };
  
  this.list2set = function(sl) {
    // kill duplicates
    var prevSite = "";
    var site;
    for (var j = sl.length; j--> 0;) {
      site = sl[j];
      if ((!site) || site == prevSite) { 
        sl.splice(j, 1);
      } else {
        prevSite = site;
      }
    }
    return sl;
  };
  
  this.sortedSet = function(sl) {
    return this.list2set(this.sort(sl));
  }
  
  this.splitString = function(s) {
    return s && /[^\s,]/.test(s) && s.split(/\s*[,\s]\s*/) || [];
  };
  
  this.domainMatch = function(url) {
     const m = url.match(_domainPattern);
     return m ? m[0].toLowerCase() : "";
  };
  
  this.sanitizeList = function(sl) {
    for (var j = sl.length; j-- > 0; ) {
      sl[j] = this.getSite(sl[j]);
    }
    return sl;
  };
  
  this.sanitizeMap = function(sm) {
    var site;
    delete sm[""];
    for (var url in sm) {
      site = this.getSite(url);
      if (site != url) {
        if (site) sm[site] = sm[url];
        delete sm[url];
      }
    }
    return sm;
  };
  
  this.sanitizeString = function(s) {
    // s = s.replace(/,/g,' ').replace(/\s{2,}/g,' ').replace(/(^\s+|\s+$)/g,'');
    return this.set2string(this.string2set(s)); 
  };
  
  this.string2set = function(s) {
    return this.sortedSet(this.sanitizeList(this.splitString(s)));
  };
  
  this.set2string = function(ss) {
    return ss.join(" ");
  };
  
  this.crop = function(url, width, max) {
    width = width || 100;
    if (url.length < width) return url;
    
    max = max || 2000;
    if (max > width && url.length > max) {
        return this.crop(url.substring(0, max / 2)) + "\n[...]\n" + 
          this.crop(url.substring(url.length - max / 2));
    }
    
    var parts = [];
   
    while (url.length > width) {
      parts.push(url.substring(0, width));
      url = url.substring(width);
    }
    parts.push(url);
    return parts.join("\n");
  };
}


const DOMUtils = {
  lookupMethod: Components.utils ? Components.utils.lookupMethod : Components.lookupMethod,
  consoleDump: false,
  dump: function(msg) {
    if(this.consoleDump) dump("[NoScript DOMUtils] " + msg + "\n");
  },
  findBrowser: function(chrome, win) {
    
    var overlay = chrome.noscriptOverlay;
    if (!overlay) return null;
    
    var browser = overlay.currentBrowser;
    if (browser.contentWindow == win) return browser;
    
    var browsers = overlay.browsers;
    if (!browsers) return null;
    
    for (var j = browsers.length; j-- > 0;) {
      browser = browsers[j];
      if (browser.contentWindow == win) return browser;
    }
    
    return null;
  },
  
  findBrowserForNode: function(ctx) {
    if (!ctx) return null;
    var bi = null;
    try {
      if (!(ctx instanceof CI.nsIDOMWindow)) {
        if (ctx instanceof CI.nsIDOMDocument) {
          ctx = ctx.defaultView;
        } else if(ctx instanceof CI.nsIDOMNode) {
          ctx = ctx.ownerDocument.defaultView;
        } else return null; 
      }
      if (!ctx) return null;
      try {
        ctx = this.lookupMethod(ctx, "top")();
      } catch(e) {
        ctx = ctx.top;
      }
      var bi = this.createBrowserIterator(this.getChromeWindow(ctx));
      
      for (var b; b = bi.next();) {
        try {
          if (b.contentWindow == ctx) return b;
        } catch(e1) {
          this.dump("Skipping browser iteration: " + e1);
        }
      }
      this.dump("Browser not found for " + ctx);
    } catch(e2) {
      this.dump("Can't find browser for " + ctx + ": " + e2);
    } finally {
      if (bi) bi.dispose();
      ctx = null;
    }
   
    return null;
  },
  
  
  
  getDocShellFromWindow: function(window) {
    try {
      return window.QueryInterface(CI.nsIInterfaceRequestor)
                   .getInterface(CI.nsIWebNavigation)
                   .QueryInterface(CI.nsIDocShell);
    } catch(e) {
      return null;
    }
  },
    
  getChromeWindow: function(window) {
    try {
      return this.getDocShellFromWindow(window)
        .QueryInterface(CI.nsIDocShellTreeItem).rootTreeItem
        .QueryInterface(CI.nsIInterfaceRequestor)
        .getInterface(CI.nsIDOMWindow).window;
    } catch(e) {
      return null;
    }
  },
  
  get windowMediator() {
    delete this.windowMediator;
    return this.windowMediator = CC['@mozilla.org/appshell/window-mediator;1']
                  .getService(CI.nsIWindowMediator);
  },
  
  _winType: null,
  perWinType: function(delegate) {
    var wm = this.windowMediator;
    var w = null;
    var aa = Array.prototype.slice.call(arguments);
    for each(var type in ['navigator:browser', 'emusic:window', 'Songbird:Main']) {
     aa[0] = type;
      w = delegate.apply(wm, aa);
      if (w) {
        this._winType = type;
        break;
      }
    }
    return w;
  },
  get mostRecentBrowserWindow() {
    var res = this._winType && this.windowMediator.getMostRecentWindow(this._winType, true);
    return res || this.perWinType(this.windowMediator.getMostRecentWindow, true);
  },
  
  get windowEnumerator() {
    var res = this._winType && this.windowMediator.getZOrderDOMWindowEnumerator(this._winType, true);
    return res || this.perWinType(this.windowMediator.getZOrderDOMWindowEnumerator, true);
  },
  createBrowserIterator: function(initialWin) {
    return new BrowserIterator(initialWin);
  },
  
  addClass: function(e, c) {
    var cur = e.className;
    if (cur) {
      var cc = cur.split(/\s+/);
      if (cc.indexOf(c) > -1) return;
      cc.push(c);
      e.className = cc.join(" ");
    } else e.className += " " + c;
  },
  removeClass: function(e, c) {
    var cur = e.className;
    if (cur) {
      var cc = cur.split(/\s+/);
      for (var pos; (pos = cc.indexOf(c)) > -1;)
        cc.splice(pos, 1);
      
      e.className = cc.join(" ");
    }
  },
  hasClass: function(e, c) {
    var cur = e.className;
    return cur && cur.split(/\s+/).indexOf(c) > -1;
  },
  
  _idCounter: Math.round(Math.random() * 9999),
  rndId: function() {
    return new Date().getTime().toString(32) + "_" + (this._idCounter++).toString(32) + "_" + Math.round(Math.random() * 9999999).toString(32);
  }
  
};

function BrowserIterator(initialWin) {
  if (!initialWin) {
    initialWin = DOMUtils.mostRecentBrowserWindow;
  }
  this.currentWin = this.initialWin = initialWin;
  this.initPerWin();
}
BrowserIterator.prototype = {
 
  initPerWin: function() {
    var overlay = this.currentWin && (this.currentWin.wrappedJSObject || this.currentWin).noscriptOverlay;
    if (overlay) {
      this.browsers = overlay.browsers;
      this.currentTab = overlay.currentBrowser;
    } else  {
      this.currentTab = this.currentWin = null;
      this.browsers = [];
    }
    this.mostRecentTab = this.currentTab;
    this.curTabIdx = 0;
  },
  
  next: function() {
    var ret = this.currentTab;
    this.currentTab = null;
    if(ret != null) return ret.wrappedJSObject || ret;
    if(!this.initialWin) return null;
    if (this.curTabIdx >= this.browsers.length) {
      if (!this.winEnum) {
        this.winEnum = DOMUtils.windowEnumerator;
      }
      if (this.winEnum.hasMoreElements()) {
        this.currentWin = this.winEnum.getNext();
        if (this.currentWin != this.initialWin){
           this.initPerWin();
        }
        return this.next();
      } else {
        this.dispose();
        return null;
      }
    }
    this.currentTab = this.browsers[this.curTabIdx++];
    if (this.currentTab == this.mostRecentTab) this.next();
    return this.next();
  },
  dispose: function() {
    if (!this.initialWin) return; // already disposed;
    this.initialWin = 
      this.currentWin = 
      this.browsers = 
      this.currentTab = 
      this.mostRecentTab = 
      this.winEnum = 
      null;
  },
  
  find: function(filter) {
    try {
      for (var b; b = this.next();) {
        if (filter(b)) {
          return b;
        }
      }
    } finally {
      this.dispose();
      filter = null;
    }
    return null;
  }
};

function PolicySites(sitesString) {
  if (sitesString) this.sitesString = sitesString;
}
PolicySites.prototype = {
  clone: function() {
    return new PolicySites(this.sitesString);
  }
,
  equals: function(other) {
    return other && (this.sitesString == other.sitesString);
  }
,
  _sitesString: "",
  get sitesString() {
    return this._sitesString;
  },
  set sitesString(s) {
    s = SiteUtils.sanitizeString(s);
    if (s != this._sitesString) {
      this._sitesString = s;
      this._sitesMap = null;
      this._sitesList = null;
    }
    return s;
  }
,
  _sitesList: null,
  get sitesList() {
    return this._sitesList ? this._sitesList : this._sitesList = SiteUtils.splitString(this.sitesString);
  },
  set sitesList(sl) {
    this.sitesString = SiteUtils.set2string(SiteUtils.sortedSet(SiteUtils.sanitizeList(sl)));
    return this.sitesList;
  }
,
  _sitesMap: null,
  get sitesMap() {
    if (!this._sitesMap) {
      const sm = {};
      const sl = SiteUtils.splitString(this.sitesString);
      if (sl) {
        for (var j = sl.length; j-- > 0;) {
          sm[sl[j]] = true;
        }
      }
      this._sitesMap = sm;
    }
    return this._sitesMap;
  },
  set sitesMap(sm) {
    sm = sm ? SiteUtils.sanitizeMap(sm) : {};
    var sl = [];
    for (var s in sm) {
      sl[sl.length] = s;
    }
    
    this._sitesString = SiteUtils.set2string(SiteUtils.sort(sl));
    this._sitesList = null;
    return this._sitesMap = sm;
  }
,
  fromPref: function(pref) {
   this.sitesString = pref.getCharPref("sites")
       .replace(/[^\u0000-\u007f]+/g, function($0) { return decodeURIComponent(escape($0)) });
  }
,
  settingPref: false,
  toPref: function(pref) {
    
    if (pref.prefIsLocked("sites")) {
      this.fromPref(pref);
      return;
    }
    var change;
    var s = this.sitesString.replace(/[^\u0000-\u007f]+/g,function($0) { return unescape(encodeURIComponent($0)) });
    try {
      change = s != pref.getCharPref("sites");
    } catch(ex) {
      change = true;
    }
    
    if (change) {
      this.settingPref = true;
      pref.setCharPref("sites", s);
      this.settingPref = false;
    }
  }
,
  // returns the shortest match for a site, or "" if no match is found
  matches: function(site) {
    if (!site) return "";
    const sm = this.sitesMap;
    var match;
    var dots; // track "dots" for (temporary) fix to 2nd level domain policy lookup flaw 
    var pos = site.indexOf(':') + 1;
    if (pos > 0 && (pos == site.length || site[pos] == '/')) {
      if (sm[match = site.substring(0, pos)]) return match; // scheme match
      if (++pos >= site.length || site[pos] != '/') return "";
      match = site.substring(pos + 1);
      dots = 0;
    } else {
      match = site;
      dots = 1;
    }

    var submatch;
    for (pos = match.lastIndexOf('.'); pos > 1; dots++) {
      pos = match.lastIndexOf('.', pos - 1);
      if ((dots || pos > -1) && sm[submatch = match.substring(pos + 1)]) {
        return submatch; // domain/subdomain match
      }
    }
    
    if (sm[match]) return match; // host match
    return sm[site] ? site : ""; // full match
  }
,


  _remove: function(site) {
    const sm = this.sitesMap;
    delete sm[site];
    if (site.indexOf(":") < 0 && site.indexOf(".") == site.lastIndexOf(".")) {
      // base domain hack
      delete sm["http://" + site];
      delete sm["https://" + site];
      delete sm["file://" + site];
    }
  },
  remove: function(sites, keepUp, keepDown) {
    if (!sites) return false;
    if (!(typeof(sites) == "object" && "push" in sites)) 
      return this.remove([sites], keepUp, keepDown);
    keepUp = keepUp || false;
    keepDown = keepDown || false;
    
    const sm = this.sitesMap;
    var change = false;
    var site, match;
    var tmp= keepDown ? null : new PolicySites();
    for (var j = sites.length; j-- > 0;) {
      site = sites[j];
      if (site[site.length-1] != ":") { // not a scheme only site
        if (!keepUp) {
          while ((match = this.matches(site)) && site != match) { // remove ancestors
            this._remove(match);
            change = true;
          }
        }
        if (!keepDown) {
          tmp.sitesString = site;
          for (match in sm) { // remove descendants
            if (tmp.matches(match)) {
              if (site != match) delete sm[match];
              change = true;
            }
          }
          this._remove(site);
        }
      }
    
      if (site in sm) {
        this._remove(site);
        change = true;
      }
    }
    if (change) this.sitesMap = this._sitesMap;
    return change;
  },
  
  _add: function(site) {
    return (site in this.sitesMap ? false : this.sitesMap[site] = true);
  },
  
  add: function(sites) {
    if (!sites) return false;
    if (!(typeof(sites) == "object" && "push" in sites)) 
      return this.add([sites]);
    
    var change = false;
    var site;
    for (var j = sites.length; j-- > 0;) {
      site = sites[j];
      if (site.indexOf(":") < 0 && site.indexOf(".") == site.lastIndexOf(".")) {
        // base domain hack
        if(this._add("http://" + site)) change = true;
        if(this._add("https://" + site)) change = true;
        if(this._add("file://" + site)) change = true;
      }
      if (this._add(site)) change = true;
    }
    if (change) this.sitesMap = this._sitesMap;
    return change;
  }
}

var singleton;

function NoscriptService() {
  singleton = this;
  this.register();
}

NoscriptService.prototype = {
  VERSION: "1.9.1.6",
  
  get wrappedJSObject() {
    return this;
  }
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
    const ns = callee.ns;
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
  
  secureCookies: true,
  secureCookiesExceptions: null,
  secureCookiesForced: null,
  httpsForced: null,
  httpsForcedExceptions: null,
  allowHttpsOnly: 0,
  
  resetDefaultPrefs: function(prefs, exclude) {
    exclude = exclude || [];
    var children = prefs.getChildList("", {});
    for (var j = children.length; j-- > 0;) {
      if (exclude.indexOf(children[j]) < 0) {
        if (prefs.prefHasUserValue( children[j])) {
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
      
      case "secureCookies":
        if (!(this[name] = this.getPref(name, this[name])))
          HTTPS.cookiesCleanup(); 
      break;
      
      case "clearClick.exceptions":
        ClearClickHandler.prototype.exceptions = URIPatternList.create(this.getPref(name, ''));
      break;

      case "secureCookiesExceptions":
      case "secureCookiesForced":
      case "httpsForced":
      case "httpsForcedExceptions":
      
        this[name] = URIPatternList.create(this.getPref(name, ''));
        if ("secureCookiesForced" == name) HTTPS.cookiesCleanup();
      break;

      case "consoleDump":
        this[name] = this.getPref(name, this[name]);
        this.injectionChecker.logEnabled = this.consoleDump & LOG_INJECTION_CHECK;
        this.domUtils.consoleDump = this.consoleDump & LOG_DOMUTILS;
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
    const uri = SiteUtils.ios.newURI("data:text/css," + sheet, null, null);
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
 
  getString: function(name, parms) { return noscriptStrings.getString(name, parms); },
  
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
  _initXBL: function() {
    try {
      const def = this.prefService.getDefaultBranch(this.prefs.root).getCharPref("default");
      if (!def) return;
      const bindNone = "{ -moz-binding: none !important }";
      var dd = function(a,s) { return "@-moz-document domain(" + a.join("),domain(") + "){" + s + "}" };
      this.updateStyleSheet(dd(def.match(/\w+[^r].\.n\w+|in\w+on\.c\w+/g).concat(this.getPref("xblHack", "").split(/\s*/)), "body iframe[name] " + bindNone), true);
      this.updateStyleSheet(dd(def.match(/\w+[^r].\.n\w+|\w+on\.c\w+/g), "body div.a\x64 " + bindNone), true);
    } catch (e) {}
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
    
    this.permanentSites.sitesString = this.getPref("mandatory", "chrome: about: resource:");
    
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
      "clearClick", "clearClick.exceptions", "opaqueObject",
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
    
    this.savePrefs(); // flush preferences to file
    
    this._initXBL();
    
    // hook on redirections (non persistent, otherwise crashes on 1.8.x)
    CC['@mozilla.org/categorymanager;1'].getService(CI.nsICategoryManager)
      .addCategoryEntry("net-channel-event-sinks", SERVICE_CTRID, SERVICE_CTRID, false, true);
    
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
  
  permanentSites: new PolicySites(),
  isPermanent: function(s) {
    return s && this.permanentSites.matches(s);
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
    return this.allowHttpsOnly && HTTPS.shouldForbid(s);
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
    if (fromScratch) ps.sitesString = this.permanentSites.sitesString;
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
  savePrefs: function() {
    return this.prefService.savePrefFile(null);
  }
,
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
        CC["@mozilla.org/moz/jssubscript-loader;1"]
            .getService(CI["mozIJSSubScriptLoader"])
            .loadSubScript('chrome://noscript/content/tldEmulation.js');
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
     } catch(e) {}
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
      callback();
      this.savePrefs();
      if (reloadPolicy != this.RELOAD_NO) {
        this.reloadWhereNeeded(reloadPolicy == this.RELOAD_CURRENT);
      }
     }, 1);
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

    var bi = new this.domUtils.createBrowserIterator();
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
      webNav = this.domUtils.getDocShellFromWindow(webNav);
    }
    
    var uri = webNav.currentURI;
    
    if (checkNullCache && (webNav instanceof CI.nsIWebPageDescriptor)) {
      try {
        var ch = this.siteUtils.ios.newChannel(uri.spec, null, null);
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
    
    this.setJSEnabled(this.permanentSites.sitesList, true); // add permanent
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
      this.savePrefs();
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
    url = this.siteUtils.crop(url);
    return this.getString("allowTemp", [url + "\n(" + mime + ")\n"]);
  }
,
  lookupMethod: DOMUtils.lookupMethod,
  domUtils: DOMUtils,
  siteUtils: SiteUtils,
  uriValidator: URIValidator
,

  
  mimeService: null,
  xcache: null,
 
  shouldLoad: CP_NOP,
  shouldProcess: CP_NOP,
  initContentPolicy: function() {
    const last = this.getPref("cp.last");
    const catman = Module.categoryManager;
    if (last) catman.deleteCategoryEntry("content-policy", SERVICE_CTRID, true);
    
    var delegate = this.disabled || (this.globalJS && !(this.alwaysBlockUntrustedContent || this.contentBlocker))   
      ? this.noopContentPolicy
      : this.mainContentPolicy;
    this.shouldLoad = delegate.shouldLoad;
    this.shouldProcess = delegate.shouldProcess;
    
    if (last && delegate != this.noopContentPolicy) {
      // removing and adding the category late in the game allows to be the latest policy to run,
      // and nice to AdBlock Plus
      catman.addCategoryEntry("content-policy",
          SERVICE_CTRID, SERVICE_CTRID, true, true);
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
      var w = DOMUtils.mostRecentBrowserWindow;
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
  
  POLICY_XBL: "TYPE_XBL" in CI.nsIContentPolicy,
  POLICY_OBJSUB: "TYPE_OBJECT_SUBREQUEST" in CI.nsIContentPolicy,
  noopContentPolicy: {
    shouldLoad: CP_NOP,
    shouldProcess: CP_NOP
  },
  cpConsoleFilter: [2, 5, 6, 7],
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
          forbid, isJS, isJava, isFlash, isSilverlight,
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
        if (this.httpsForced && !aInternalCall &&
              (aContentType != 6 && aContentType != 7
                || !this.POLICY_OBJSUB // Gecko < 1.9, early check for documents as well
            ) && scheme == "http")
          HTTPS.forceHttpsPolicy(aContentLocation, aContext, aContentType);
        
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
            forbid = isJS = true;
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
            if (/\/x/i.test(aMimeTypeGuess) && !/chrome|resource/.test(aContentLocation.scheme) && this.getPref("forbidXSLT", true)
              && !((this.isJSEnabled(this.getSite(aContentLocation.spec)) || aContentLocation.schemeIs("data")) && this.isJSEnabled(this.getSite(aRequestOrigin.spec))))
              return this.reject("XSLT", arguments);
            return CP_OK;
          
          case 5:
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

        if (isJS) {
          
          originSite = aRequestOrigin && this.getSite(aRequestOrigin.spec);
          
          // we must guess the right context here, see https://bugzilla.mozilla.org/show_bug.cgi?id=464754
          
          aContext = aContext.ownerDocument || aContext; // this way we always have a document
          
          // Silverlight hack
          
          if (this.contentBlocker && this.forbidSilverlight && this.silverlightPatch &&
                originSite && /^(?:https?|file):/.test(originSite)) {
            this.applySilverlightPatch(aContext);
          }
          
          
          
          
          if (originSite && locationSite == originSite) return CP_OK;
          
          this.getExpando(aContext.defaultView.top, "codeSites", []).push(locationSite);
          
          
          forbid = !this.isJSEnabled(locationSite);
          if (forbid && this.ignorePorts && /:\d+$/.test(locationSite)) {
            forbid = !this.isJSEnabled(locationSite.replace(/:\d+$/, ''));
          }

          if ((untrusted || forbid) && aContentLocation.scheme != "data") {
            ScriptSurrogate.apply(aContext, locationURL);
            return this.reject("Script", arguments);
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
                  /*
                  if(aContentType == 5) {
                    if (aContentLocation.schemeIs("data") && aContentLocation.spec != "data:application/x-silverlight,") {
                      try {
                        aContentLocation.spec = "data:application/x-silverlight,"; // normalize URL
                      } catch(normEx) {
                        if (this.consoleDump) this.dump("Couldn't normalize " + aContentLocation.spec + " to empty data URL - " + normEx);
                      }
                    }
                  }
                  */
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
          aContext.ownerDocument.location.href = 'javascript:window.__defineGetter__("top", (Window.prototype || window).__lookupGetter__("top"))';
          if (this.consoleDump) this.dump("Locked window.top (bug 453825 work-around)");
          aContext.ownerDocument.defaultView.addEventListener("DOMNodeRemoved", this._domNodeRemoved, true);
          if (this.consoleDump) this.dump("Added DOMNodeRemoved (bug 472495 work-around)");
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
              if (aContext && (aContentType == 5 || aContentType == 7 || aContentType == 12)) {
                if (aContext instanceof CI.nsIDOMNode) {
                 
                  this.delayExec(this.tagForReplacement, 0, aContext, {
                    url: locationURL,
                    mime: mimeKey
                  });
                  
                }
              }
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
      return this.siteUtils.ios.getProtocolHandler(scheme).scheme != scheme;
    } catch(e) {
      return false;
    }
  },
  normalizeExternalURI: function(uri) {
    var uriSpec = uri.spec;
    var uriValid = this.uriValidator.validate(uriSpec);
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
          if (uriValid !== false || (uriValid = this.uriValidator.validate(uriSpec))) {
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
    const browser = this.domUtils.findBrowserForNode(domNode);
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
    var docShell = this.domUtils.getDocShellFromWindow(document.defaultView);
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
    var docShell = metaRefreshInfo.docShell || this.domUtils.getDocShellFromWindow(document.defaultView); 
    this.enableMetaRefresh(docShell);
    if (docShell instanceof CI.nsIRefreshURI) {
      var baseURI = metaRefreshInfo.baseURI || this.siteUtils.ios.newURI(document.documentURI, null, null);
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
      } catch(silentEx) {
        dump(silentEx);
      }
    }
    return false;
  },
  
  executeJSURL: function(url, openCallback) {
    var browserWindow = DOMUtils.mostRecentBrowserWindow;
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
      var async = /^\s*data:/i.test(url) || Components.utils && typeof(/ /) == "object"; // async evaluation, after bug 351633 landing
      try {
        browser.webNavigation.allowJavascript = true;
        this.setTemp(site, true);
        this.setJSEnabled(site, true)
        if (async) {
          var sandbox = Components.utils.Sandbox(window);
          sandbox.window = window;
          sandbox.jsURL = url;
          Components.utils.evalInSandbox("window.location.href = jsURL", sandbox);
        } else {
          openCallback(url);
        }
        return true;
      } finally {
        if(async) {
          this.delayExec(this.postExecuteJSURL, 0, browser, site, snapshots);
        } else {
          this.postExecuteJSURL(browser, site, snapshots);
        }
      }
    }
    
    return false;
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
          DOMUtils.addClass(o, "__noscriptScrolling__");
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
        DOMUtils.addClass(o, "__noscriptOpaqued__");
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
  
  
  _objectTypes : {
    embed:  CI.nsIDOMHTMLEmbedElement, 
    applet: CI.nsIDOMHTMLAppletElement,
    iframe: CI.nsIDOMHTMLIFrameElement,
    frame: CI.nsIDOMHTMLFrameElement,
    object: CI.nsIDOMHTMLObjectElement
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
    
    const types = this._objectTypes;

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
        if (r.object.parentNode) r.object.parentNode.insertBefore(r.placeholder, r.object);
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
    return this.__proto__.abpInstalled = "@mozilla.org/adblockplus;1" in CC;
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
    const browser = this.domUtils.findBrowserForNode(anchor);
 
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
    const ph = ABE.extractFromChannel(oldChannel, "noscript.policyHints");
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
            win = rw.findWindow(newChannel) || ctx && ((ctx instanceof CI.nsIDOMWindow) ? ctx : ctx.ownerDocument.defaultView); 
            browser = win && rw.findBrowser(newChannel, win);
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
        
        ABE.attachToChannel(newChannel, "noscript.policyHints", ph);
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
                               browser || rw.findBrowser(oldChannel), rw);
      
      // docshell JS state management
      win = win || rw.findWindow(oldChannel);
      this._handleDocJS2(win, oldChannel);
      this._handleDocJS1(win, newChannel);
    }
    
  },
  
  getRedirCache: function(browser, uri) {
    var redirCache = this.getExpando(browser, "redirCache", {});
    return redirCache[uri] || (redirCache[uri] = []);
  },
  
  currentPolicyURI:null,
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
          ABE.attachToChannel(req, "noscript.policyHints", ph = this.currentPolicyHints);
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
          ph = ph || ABE.extractFromChannel(req, "noscript.policyHints", true);
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
        ph = ph || ABE.extractFromChannel(req, "noscript.policyHints", true); 
  
        if (ph) {
          if (ph[0] == 2 && (req instanceof CI.nsIHttpChannel)) {
            var originSite = (ABE.extractInternalReferrer(req) || ph[2]).prePath;
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
      ABE.extractFromChannel(req, "noscript.policyHints"); // release hints
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
      const rw = this.requestWatchdog;
      const domWindow = rw.findWindow(req);
      if (domWindow && domWindow == domWindow.top) return; // for top windows we call onBeforeLoad in onLocationChange
      
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
      this.filterUTF7(req, domWindow, docShell = this.domUtils.getDocShellFromWindow(domWindow)); 
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
    
      browser = this.domUtils.findBrowserForNode(domWindow);
      overlay = this.findOverlay(browser);
      if (overlay) {
        overlay.setMetaRefreshInfo(null, browser);
        xssInfo = ABE.extractFromChannel(req, "noscript.XSS");
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
            && this.shouldLoad(5, uri, this.siteUtils.ios.newURI(domWindow.parent.location.href, null, null),
                domWindow.frameElement, contentType, CP_SHOULDPROCESS) == CP_OK)
            return;
        
        if (this.consoleDump & LOG_CONTENT_BLOCK) 
          this.dump("Deferring framed plugin document");
        
        req.cancel(NS_BINDING_ABORTED);
        
        browser = browser || this.domUtils.findBrowserForNode(domWindow);
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
      
      var docShell = this.domUtils.getDocShellFromWindow(win) ||
                  this.domUtils.getDocShellFromWindow(this.requestWatchdog.findWindow(req));
      
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
      
      ABE.attachToChannel(req, "noscript.dsjsBlocked",
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
        ABE.extractFromChannel(req, "noscript.dsjsBlocked")
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
            ns: this,
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
    var ns = info.ns;
    var browser = ns.domUtils.findBrowserForNode(doc);
    if (browser) {
      var overlay = ns.findOverlay(browser);
      if (overlay && overlay.notifyJarDocument({
          uri: info.uri,
          document: doc
      })) return;
    } else {
      this.dump("displayJarFeedback -- browser not found... falling back to content notify");
    }
    
    var message = ns.getString("jarDoc.notify", [ns.siteUtils.crop(info.uri)]) + 
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
  
  attemptNavigation: function(doc, destURL, callback) {
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

      var ds = this.domUtils.getDocShellFromWindow(doc.defaultView);
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


function XCache() {
  this._cache = {};
}

XCache.prototype = {
  getEntry: function(targetURI, create) {
    const key = targetURI.spec;
    return this._cache[key] || (create && (this._cache[key] = []) || null);
  },
  pickOrigin: function(targetURI, remove) {
    var entry = this.getEntry(targetURI, false);
    return entry && this.findOriginInEntry(targetURI, entry, remove);
  },
  storeOrigin: function(originURI, targetURI) {
    var entry = this.getEntry(targetURI, true);
    if (!this.findOriginInEntry(targetURI, entry)) {
      entry.push({ origin: originURI, target: targetURI });
    }
  },
  findOriginInEntry: function(targetURI, entry, remove) {
    var o;
    for (var j = entry.length; j-- > 0;) {
      o = entry[j];
      if (entry[j].target === targetURI) {
        if (remove) {
          entry.splice(j, 1);
          if (entry.length == 0) {
            delete this._cache[targetURI.spec];
          }
        }
        return o.origin;
      }
    }
    return null;
  }
};

function RequestInfo(channel, url, origin, window) {
  this.channel = channel;
  this.sanitizedURI = url;
  this.window = window;
  this.unsafeRequest = {
    URI: url.clone(),
    postData: null,
    referrer: channel.referrer && channel.referrer.clone(),
    origin: origin,
    loadFlags: channel.loadFlags,
    issued: false,
    window: null
  }
}
RequestInfo.prototype = {
  xssMaybe: false 
}

function nsISupportWrapper(wrapped) {
  this.wrappedJSObject = wrapped;
}
nsISupportWrapper.prototype = {
  QueryInterface: xpcom_generateQI([CI.nsISupports])
}

function RequestWatchdog(ns) {
  this.ns = ns;
  this.siteUtils = ns.siteUtils;
  this.dns = CC["@mozilla.org/network/dns-service;1"]
                  .getService(CI.nsIDNSService);
}

RequestWatchdog.prototype = {
  ns: null,
  dns: null,
  callback: null,
  externalLoad: null,
  noscriptReload: null,
  DOCUMENT_LOAD_FLAGS: CI.nsIChannel.LOAD_DOCUMENT_URI
    | CI.nsIChannel.LOAD_CALL_CONTENT_SNIFFERS, // this for OBJECT subdocs
  
  get dummyPost() {
    const v = CC["@mozilla.org/io/string-input-stream;1"].createInstance();
    v.setData("", 0);
    this.__defineGetter__("dummyPost", function() { return v; });
    return v;
  },
  
  QueryInterface: xpcom_generateQI([CI.nsIObserver, CI.nsISupportsWeakReference, CI.nsISupports]),
  
  getUnsafeRequest: function(browser) {
    return this.ns.getExpando(browser, "unsafeRequest");
  },
  setUnsafeRequest: function(browser, request) {
    return this.ns.setExpando(browser, "unsafeRequest", request);
  },
  
  
  unsafeReload: function(browser, start) {
    this.ns.setExpando(browser, "unsafeReload", start);
    if (start) {
      const unsafeRequest = this.getUnsafeRequest(browser);
      if (unsafeRequest) {
        // should we figure out what to do with unsafeRequest.loadFlags?
        var wn = browser.webNavigation;
        if(unsafeRequest.window) {
          // a subframe...
          try {
            wn = this.ns.domUtils.getDocShellFromWindow(unsafeRequest.window).QueryInterface(CI.nsIWebNavigation);
          } catch(ex) {
            this.ns.dump(ex);
          }
          unsafeRequest.window = null;
        }
       
        wn.loadURI(unsafeRequest.URI.spec, 
              wn.LOAD_FLAGS_BYPASS_CACHE | 
              wn.LOAD_FLAGS_IS_REFRESH,
              unsafeRequest.referrer, unsafeRequest.postData, null);
        unsafeRequest.issued = true;
      } else {
        browser.reload();
      }
    }
    return start;
  },

  isUnsafeReload: function(browser) {
    return this.ns.getExpando(browser, "unsafeReload");
  },
  
  resetUntrustedReloadInfo: function(browser, channel) {
    if (!browser) return;
    var window = this.findWindow(channel);
    if (browser.contentWindow == window) {
      if (this.ns.consoleDump) this.dump(channel, "Top level document, resetting former untrusted browser info");
      this.setUntrustedReloadInfo(browser, false);
    }
  },
  setUntrustedReloadInfo: function(browser, status) {
    return this.ns.setExpando(browser, "untrustedReload", status);
  },
  getUntrustedReloadInfo: function(browser) {
    return this.ns.getExpando(browser, "untrustedReload");
  },
  
  
  
  detectBackFrame: function(prev, next, ds) {
    if (prev.ID != next.ID) return prev.URI.spec;
    if ((prev instanceof CI.nsISHContainer) &&
       (next instanceof CI.nsISHContainer) &&
       (ds instanceof CI.nsIDocShellTreeNode)
      ) {
      var uri;
      for (var j = Math.min(prev.childCount, next.childCount, ds.childCount); j-- > 0;) {
        uri = this.detectBackFrame(prev.GetChildAt(j),
                                   next.GetChildAt(j),
                                   ds.GetChildAt(j));
        if (uri) return uri.spec;
      }
    }
    return null;
  },
  
  traceBackHistory: function(sh, window, breadCrumbs) {
    var wantsBreadCrumbs = !breadCrumbs;
    breadCrumbs = breadCrumbs || [window.document.documentURI];
    
    var he;
    var uri = null;
    var site = '';
    for (var j = sh.index; j > -1; j--) {
       he = sh.getEntryAtIndex(j, false);
       if (he.isSubFrame && j > 0) {
         uri = this.detectBackFrame(sh.getEntryAtIndex(j - 1), h,
           this.ns.domUtils.getDocShellFromWindow(window)
         );  
       } else {
        // not a subframe navigation 
        if (window == window.top) {
          uri = he.URI.spec; // top frame, return history entry
        } else {
          window = window.parent;
          uri = window.document.documentURI;
        }
      }
      if (!uri) break;
      if (breadCrumbs[0] && breadCrumbs[0] == uri) continue;
      breadCrumbs.unshift(uri);
      var site = this.ns.getSite(uri);
      if (site) break;
    }
    return wantsBreadCrumbs ? breadCrumbs : site;
  },
  
  traceBack: function(channel, breadCrumbs) {
    try {
      var window = this.findWindow(channel);
      if (window instanceof CI.nsIInterfaceRequestor) {
        var webNav = window.getInterface(CI.nsIWebNavigation);
        const sh = webNav.sessionHistory;
        return sh ? this.traceBackHistory(sh, window, breadCrumbs || null) 
                  : webNav.currentURI && !webNav.currentURI.equals(channel.URI) 
                    ? webNav.currentURI.spec
                    : '';
      }
    } catch(e) {
      if (this.ns.consoleDump) this.dump(channel, "Error tracing back origin: " + e.message);
    }
    return '';
  },
  
  observe: function(subject, topic, data) {
    if((this.ns.consoleDump & LOG_SNIFF) && (subject instanceof CI.nsIHttpChannel)) {
      this.ns.dump(topic + ": " + subject.URI.spec + ", " + subject.loadFlags);
    }
    if (!((subject instanceof CI.nsIHttpChannel) && (subject.loadFlags & this.DOCUMENT_LOAD_FLAGS))) return;
    switch(topic) {
      case "http-on-modify-request":
        try {
          this.filterXSS(subject);
        } catch(e) {
          this.abort({ channel: subject, reason: e + " --- " + e.stack, silent: true });
        }
      break;
      case "http-on-examine-response":
        this.ns.onContentSniffed(subject);
        HTTPS.handleSecureCookies(subject);
      break;
    }
  },
  
  _listeners: [],
  addCrossSiteListener: function(l) {
    if (!this._listeners.indexOf(l) > -1) this._listeners.push(l);
  },
  removeCrossSiteListener: function(l) {
    var pos = this._listeners.indexOf(l);
    if (pos > -1) this._listeners.splice(pos);
  },
  
  onCrossSiteRequest: function(channel, origin, browser) {
    for each (l in this._listeners) {
      l.onCrossSiteRequest(channel, origin, browser, this);
    }
  },
  
  isHome: function(url) {
    return url instanceof CI.nsIURL &&
      this.getHomes().some(function(urlSpec) {
        try {
          return !url.getRelativeSpec(SiteUtils.ios.newURI(urlSpec, null, null));
        } catch(e) {}
        return false;
      });
  },
  getHomes: function(pref) {
    var homes;
    try {
      homes = this.ns.prefService.getComplexValue(pref || "browser.startup.homepage",
                         CI.nsIPrefLocalizedString).data;
    } catch (e) {
      return pref ? [] : this.getHomes("browser.startup.homepage.override");
    }
    return homes ? homes.split("|") : [];
  },
  
  checkWindowName: function(window) {
    var originalAttempt = window.name;
      
    if (/[%=\(\\]/.test(originalAttempt) && InjectionChecker.checkJS(originalAttempt)) {
      window.name = originalAttempt.replace(/[%=\(\\]/g, " ");
    }
    if (originalAttempt.length > 11) {
      try {
        if ((originalAttempt.length % 4 == 0)) { 
          var bin = window.atob(window.name);
          if(/[=\(\\]/.test(bin) && InjectionChecker.checkJS(bin)) {
            window.name = "BASE_64_XSS";
          }
        }
      } catch(e) {}
    }
    if (originalAttempt != window.name) {
      this.ns.log('[NoScript XSS]: sanitized window.name, "' + originalAttempt + '" to "' + window.name + '".');
    }
  },
  
  filterXSS: function(channel) {
    
    const ns = this.ns;
    const url = channel.URI;
    const originalSpec = url.spec;

    const xorigin = ns.xcache.pickOrigin(url, true); // picks and remove cached entry
    
    if (this.noscriptReload == originalSpec) {
      // fast cache route for NoScript-triggered reloads
      this.noscriptReload = null;
      try {
        if (ns.consoleDump) {
          this.dump(channel, "Fast reload, original flags: " + 
            channel.loadFlags + ", " + (channel.loadGroup && channel.loadGroup.loadFlags));
        }
        channel.loadFlags = (channel.loadFlags & ~CI.nsIChannel.VALIDATE_ALWAYS) | 
                    CI.nsIChannel.LOAD_FROM_CACHE | CI.nsIChannel.VALIDATE_NEVER;
        if (channel.loadGroup) {
          channel.loadGroup.loadFlags = (channel.loadGroup.loadFlags & ~CI.nsIChannel.VALIDATE_ALWAYS) | 
                  CI.nsIChannel.LOAD_FROM_CACHE | CI.nsIChannel.VALIDATE_NEVER;
        }
        if (ns.consoleDump) {
          this.dump(channel, "Fast reload, new flags: " + 
            channel.loadFlags + ", " + (channel.loadGroup && channel.loadGroup.loadFlags));
        }
      } catch(e) {
        // we may have a problem here due to something Firekeeper 0.2.11 started doing..
        ns.dump(e);
      }
    }
    
   
    var browser = null;
    var window = null;
    
    var origin = xorigin && xorigin.spec || 
        channel.originalURI.spec != originalSpec && channel.originalURI.spec 
        || ABE.extractInternalReferrerSpec(channel) || null;

    var untrustedReload = false;

    var originSite = null;
    
    if (!origin) {
      if ((channel instanceof CI.nsIHttpChannelInternal) && channel.documentURI) {
        if (originalSpec == channel.documentURI.spec) {
           var breadCrumbs = [originalSpec];
           originSite = this.traceBack(channel, breadCrumbs);
           if (originSite) {
              origin = breadCrumbs.join(">>>");
              if (ns.consoleDump) this.dump(channel, "TRACEBACK ORIGIN: " + originSite + " FROM " + origin);
              if ((channel instanceof CI.nsIUploadChannel) && channel.uploadStream) {
                if (ns.consoleDump) this.dump(channel, "Traceable upload with no origin, probably extension. Resetting origin!");
                origin = originSite = "";
              }
           } else {
             // check untrusted reload
             browser = this.findBrowser(channel);
             if (!this.getUntrustedReloadInfo(browser)) {
               if (ns.consoleDump) this.dump(channel, "Trusted reload");
               return;
             }
             origin = "";
             untrustedReload = true;
             if (ns.consoleDump) this.dump(channel, "Untrusted reload");
           }
        } else {
          origin = channel.documentURI.spec;
          if (ns.consoleDump) this.dump(channel, "ORIGIN (from channel.documentURI): " + origin);
        }
      } else {
        if (ns.consoleDump) this.dump(channel, "***** NO ORIGIN CAN BE INFERRED!!! *****");
      }
    } else {
      if (channel.loadFlags & channel.LOAD_INITIAL_DOCUMENT_URI && channel.originalURI.spec == channel.URI.spec) {
        // clean up after user action
        window = window || this.findWindow(channel);
        browser = browser || this.findBrowser(channel, window);
        this.resetUntrustedReloadInfo(browser, channel);
        var unsafeRequest = this.getUnsafeRequest(browser);
        if (unsafeRequest && unsafeRequest.URI.spec != channel.originalURI.spec && 
            (!window || window == window.top || window == unsafeRequest.window)) {
          this.setUnsafeRequest(browser, null);
        }
      }
      if (ns.consoleDump) this.dump(channel, "ORIGIN: " + origin + ", xorigin: " + (xorigin && xorigin.spec) + ", originalURI: " + channel.originalURI.spec);
    }
    
    const su = this.siteUtils;
    originSite = originSite || su.getSite(origin) || '';
    
    var host = channel.URI.host;
    if (host[host.length - 1] == "." && this.ns.getPref("canonicalFQDN", true)) {
      try {
        channel.URI.host = this.dns.resolve(host, 2).canonicalName;
      } catch(ex) {
        this.dump(channel, ex);
      }
    }
    
   
    var targetSite;
    const globalJS = ns.globalJS;
    var trustedTarget = globalJS;
    if(!trustedTarget) {
      if(ns.autoAllow) {
        window = window || this.findWindow(channel);
        if (window && window == window.top) {
          targetSite = ns.getQuickSite(originalSpec, ns.autoAllow);
          if(targetSite && !ns.isJSEnabled(targetSite)) {
            ns.autoTemp(targetSite);
          }
          targetSite = su.getSite(originalSpec);
        }
      }
      if(!trustedTarget) {
        targetSite = su.getSite(originalSpec);
        trustedTarget = ns.isJSEnabled(targetSite);
        if(!trustedTarget && ns.checkShorthands(targetSite)) {
          ns.autoTemp(targetSite);
          trustedTarget = true;
        }
      }
    }
    
    if (!(origin || (window = this.findWindow(channel)))) {
      if (ns.consoleDump) this.dump(channel, "-- This channel doesn't belong to any window/origin: internal browser or extension request, skipping. --");
      return;
    }
      
    if(!targetSite) targetSite = su.getSite(originalSpec);
    
    // noscript.injectionCheck about:config option adds first-line 
    // detection for XSS injections in GET requests originated by 
    // whitelisted sites and landing on top level windows. Value can be:
    // 0 - never check
    // 1 - check cross-site requests from temporary allowed sites
    // 2 - check every cross-site request (default)
    // 3 - check every request
    
    var injectionCheck = ns.injectionCheck;
    
    if (originSite == targetSite) {
      if (injectionCheck < 3) return; // same origin, fast return
    } else {
      this.onCrossSiteRequest(channel, origin, browser = browser || this.findBrowser(channel));
    }
    
    if (this.callback && this.callback(channel, origin)) return;
    
    if (!trustedTarget) {
      if (ns.injectionChecker.checkNoscript(unescape(originalSpec)) && ns.getPref("injectionCheckHTML", true)) {
        if (ns.consoleDump) this.dump(channel, "JavaScript disabled target positive to HTML injection check!");
      } else {
        if (ns.consoleDump) this.dump(channel, "Target is not Javascript-enabled, skipping XSS checks.");
        return;
      }
    }
    
     // fast return if nothing to do here
    if (!(ns.filterXPost || ns.filterXGet)) return;   
    
    var externalLoad = this.externalLoad && this.externalLoad == originalSpec;
    if (externalLoad) {
      this.externalLoad = null;
    } else if(this.isUnsafeReload(browser = browser || this.findBrowser(channel))) {
      if (ns.consoleDump) this.dump(channel, "UNSAFE RELOAD of [" + originalSpec +"] from [" + origin + "], SKIP");
      return;
    }
    
    if (ns.filterXExceptions) {
      try {
        if (ns.filterXExceptions.test(decodeURI(originalSpec)) &&
            !this.isBadException(host)
            ) {
          // "safe" xss target exception
          if (ns.consoleDump) this.dump(channel, "Safe target according to filterXExceptions: " + ns.filterXExceptions.toString());
          return;
        }
        
        if (ns.filterXExceptions.test("@" + decodeURI(origin))) {
          if (ns.consoleDump) this.dump(channel, "Safe origin according to filterXExceptions: " + ns.filterXExceptions.toString());
          return;
        }
        
      } catch(e) {}
    }
    
    
    
    if (!originSite) { // maybe data or javascript URL?
      if (/^(?:javascript|data):/i.test(origin) && ns.getPref("xss.trustData", true)) {
        var breadCrumbs = [origin];
        originSite = this.traceBack(channel, breadCrumbs);
        if (originSite) { 
          origin = breadCrumbs.join(">>>");
        }
        delete breadCrumbs;
      }
    }
    
    var originalAttempt;
    var injectionAttempt = false;
    var postInjection = false;
    
    window = window || this.findWindow(channel);
    
    // neutralize window.name-based attack
    if (window && window.name) {
      
      if (ns.compatEvernote && window.frameElement && window.name.indexOf("iframe") > 0 && /^https?:\/\/(?:[a-z]+\.)*evernote\.com\/clip\.action$/.test(originalSpec) && channel.requestMethod == "POST") {
        // Evernote Web Clipper hack
        window.frameElement.addEventListener("load", ns.compatEvernote.onload, false);
        if (ns.consoleDump) this.dump(channel, "Evernote frame detected (noscript.compat.evernote)");
        return;
      }
      
      this.checkWindowName(window);
    
    }
   
    if (globalJS || ns.isJSEnabled(originSite) ||
        !origin // we consider null origin as "trusted" (i.e. we check for injections but 
                // don't strip POST unconditionally) to make some extensions (e.g. Google Gears) 
                // work. For dangerous edge cases we should have moz-null-principal: now, anyway.
      ) {
      this.resetUntrustedReloadInfo(browser = browser || this.findBrowser(channel, window), channel);
      
      // here we exceptionally consider same site also http<->https (target would be blocked by
      // certificate checks if something phishy is going on with DNS)
      
      if (injectionCheck < 3) {
        if (/^https?:/.test(originSite)) {
          var originDomain = ns.getDomain(originSite);
          var targetDomain = ns.getDomain(url);
          if (targetDomain == originDomain) {
            this.dump(channel, "Same domain with HTTP(S) origin");
            return;
          }
        }
      }
      
      // origin is trusted, check for injections
      
      injectionAttempt = injectionCheck && (injectionCheck > 1 || ns.isTemp(originSite)) &&
        (!window || ns.injectionCheckSubframes || window == window.top);
      
      
          
      if (injectionAttempt) {
        postInjection = ns.filterXPost && (!origin || originSite != "chrome:") && channel.requestMethod == "POST" && ns.injectionChecker.checkPost(channel);
        injectionAttempt = ns.filterXGet && ns.injectionChecker.checkURL(originalSpec);
        
        if (ns.consoleDump) {
          if (injectionAttempt) this.dump(channel, "Detected injection attempt at level " + injectionCheck);
          if (postInjection) this.dump(channel, "Detected POST injection attempt at level "  + injectionCheck);
        }
      }
      
      if (!(injectionAttempt || postInjection)) {
        if (ns.consoleDump) this.dump(channel, "externalLoad flag is " + externalLoad);

        if (externalLoad) { // external origin ?
          if (ns.consoleDump) this.dump(channel, "External load from " + origin);
          if (this.isHome(url)) {
            if (ns.consoleDump) this.dump(channel, "Browser home page, SKIP");
            return;
          }
          if (ns.getPref("xss.trustExternal", false)) {
            if (ns.consoleDump) this.dump(channel, "noscript.xss.trustExternal is TRUE, SKIP");
            return;
          }
          origin = "///EXTERNAL///";
          originSite = "";
        } else if(ns.getPref("xss.trustTemp", true) || !ns.isTemp(originSite)) { // temporary allowed origin?
          if (ns.consoleDump) {
            this.dump(channel, "Origin " + origin + " is trusted, SKIP");
          }
          return;
        }
        if (ns.consoleDump) 
          this.dump(channel, (externalLoad ? "External origin" : "Origin " + origin + " is TEMPORARILY allowed") + 
            ", we don't really trust it");
      }
    }
    
    if (untrustedReload && browser) {
      this.resetUntrustedReloadInfo(browser, channel);
    }

    // -- DANGER ZONE --
    
    var requestInfo = new RequestInfo(channel, url, origin, window);

    // transform upload requests into no-data GETs
    if (ns.filterXPost &&
        (postInjection || !injectionAttempt) && // don't strip trusted to trusted uploads if they passed injection checks 
        (channel instanceof CI.nsIUploadChannel) && channel.uploadStream
      ) {
      channel.requestMethod = "GET";
      requestInfo.unsafeRequest.postData = channel.uploadStream;
      channel.setUploadStream(this.dummyUpload, "", -1);
      this.notify(this.addXssInfo(requestInfo, {
        reason: "filterXPost",
        originalAttempt: originalSpec + (postInjection ? "§DATA§" + postInjection : ""),
        silent: untrustedReload
      }));
    }
    
    if (ns.filterXGet && ns.filterXGetRx) {
      var changes = null;
      var xsan = ns.createXSanitizer();
      // sanitize referrer
      if (channel.referrer && channel.referrer.spec) {
        originalAttempt = channel.referrer.spec;
        xsan.brutal = /'"</.test(Entities.convertAll(unescape(originalAttempt)));
        try {
          if (channel.referrer instanceof CI.nsIURL) {
            changes = xsan.sanitizeURL(channel.referrer);
          } else {
            channel.referrer.spec =  xsan.sanitizeURIComponent(originalAttempt);
          }
        } catch(e) {
          this.dump("Failed sanitizing referrer " + channel.referrer.spec + ", " + e);
          channel.referrer.spec = "";
        }
        try {
          if (!changes) {
            changes = { 
              minor: !channel.referrer.spec || 
                      unescape(originalAttempt) != unescape(channel.referrer.spec) 
            };
          }
          if (changes.minor) {
            channel.referrer = channel.referrer.clone();
            this.notify(this.addXssInfo(requestInfo, {
              reason: "filterXGetRef",
              originalAttempt: url.spec + " (REF: " + originalAttempt + ")",
              silent: true,
              sanitizedURI: channel.referrer
            }));
          }
        } catch(e) {
          this.dump("Failed notifying referrer sanitization: " + channel.referrer.spec + ", " + e);
          channel.referrer.spec = "";
          channel.referrer = channel.referrer.clone();
        }
      }
      
      originalAttempt = url.spec;
      xsan.brutal = injectionAttempt;
      try {
        changes = xsan.sanitizeURL(url);
      } catch(e) {
        changes = xsan.sanitizeURL(url.clone());
        if (changes.major) {
          requestInfo.reason = url.spec;
          this.abort(requestInfo);
          return;
        }
      }
      if (changes.minor) {
        this.proxyHack(channel);
        this.notify(this.addXssInfo(requestInfo, {
          reason: "filterXGet",
          originalAttempt: originalAttempt,
          silent: !changes.major 
        }));
      }
    }
   
    

    if (requestInfo.xssMaybe) {
      // avoid surprises from history & cache
      if (channel instanceof CI.nsICachingChannel) {
        
        const CACHE_FLAGS = channel.LOAD_FROM_CACHE | 
                            channel.VALIDATE_NEVER | 
                            channel.LOAD_ONLY_FROM_CACHE;
        // if(channel.loadFlags & CACHE_FLAGS) {
          channel.loadFlags = channel.loadFlags & ~CACHE_FLAGS | channel.LOAD_BYPASS_CACHE;
          if (this.consoleDump) this.dump(channel, "SKIPPING CACHE");
        // }
      }
      
      if (requestInfo.window && 
          (requestInfo.window == requestInfo.window.top || 
          requestInfo.window == requestInfo.unsafeRequest.window)
        ) {
        this.setUnsafeRequest(requestInfo.browser, requestInfo.unsafeRequest);
      }
    }
  },
  
  isBadException: function(host) {
    // TLD check for google search
    var m = host.match(/\bgoogle\.((?:[a-z]{1,3}\.)?[a-z]+)$/i);
    return m && this.ns.getPublicSuffix(host) != m[1];
  },
  
  proxyHack: function(channel) {
    // Work-around for channel.URI not being used directly here:
    // http://mxr.mozilla.org/mozilla/source/netwerk/protocol/http/src/nsHttpChannel.cpp#504
    
    var proxyInfo = CI.nsIProxiedChannel && (channel instanceof CI.nsIProxiedChannel) 
      ? channel.proxyInfo
      : Components.classes["@mozilla.org/network/protocol-proxy-service;1"]
          .getService(Components.interfaces.nsIProtocolProxyService)
          .resolve(channel.URI, 0);
     if (proxyInfo && proxyInfo.type == "http") {
       if (channel.URI.userPass == "") {
         channel.URI.userPass = "xss:xss";
         // resetting this bit will avoid auth confirmation prompt
         channel.loadFlags = channel.loadFlags & ~channel.LOAD_INITIAL_DOCUMENT_URI;
       }
     }
  },
  
  abort: function(requestInfo) {
    var channel = requestInfo.channel;
    if (channel instanceof CI.nsIRequest) {
      
      channel.cancel(NS_BINDING_ABORTED);
      /*
      if (channel instanceof CI.nsIRequestObserver) try {
        channel.onStopRequest(channel, null, NS_BINDING_ABORTED);
      } catch(e) {}
      if (channel.loadGroup) try { 
        channel.loadGroup.removeRequest(channel, null, NS_BINDING_ABORTED);
      } catch(e) {}
      */
    }
    this.dump(channel, "Aborted - " + requestInfo.reason);
 
    this.notify(requestInfo);
  },
  
  mergeDefaults: function(o1, o2) {
    for (p in o2) {
      if (!(p in o1)) o1[p] = o2[p];
    }
    return o1;
  },
  
  addXssInfo: function(requestInfo, xssInfo) {
    try {
      requestInfo.window = requestInfo.window || this.findWindow(requestInfo.channel);
      requestInfo.browser = requestInfo.browser || (requestInfo.window && 
                            this.ns.domUtils.findBrowserForNode(requestInfo.window));
    } catch(e) {}
    requestInfo.xssMaybe = true;
    return this.mergeDefaults(xssInfo, requestInfo);
  },
  
  notify: function(requestInfo) {
    var msg = "[NoScript XSS] " + this.ns.getString("xss.reason." + requestInfo.reason, [ 
        requestInfo.originalAttempt || "N/A",
        requestInfo.unsafeRequest && requestInfo.unsafeRequest.origin || "",
        requestInfo.sanitizedURI && requestInfo.sanitizedURI.spec || ""
      ]);
    this.dump(requestInfo.channel, "Notifying " + msg + "\n\n\n");
    this.ns.log(msg);
   
    try {
      if (requestInfo.silent || !requestInfo.window || !this.ns.getPref("xss.notify", true)) 
        return;
      if(requestInfo.window != requestInfo.window.top) { 
        // subframe

        var cur = this.getUnsafeRequest(requestInfo.browser);
        if(cur && !cur.issued) return;
        
        requestInfo.unsafeRequest.window = requestInfo.window;
        this.observeSubframeXSS(requestInfo.originalAttempt, requestInfo.unsafeRequest);
        
        if(!this.ns.getPref("xss.notify.subframes", true))
          return;

        var overlay = this.ns.findOverlay(requestInfo.browser);
        if(overlay) overlay.notifyXSS(requestInfo);
      }
      ABE.attachToChannel(requestInfo.channel, "noscript.XSS", requestInfo);
    } catch(e) {
      dump(e + "\n");
    }
  },
  
  observeSubframeXSS: function(url, unsafeRequest) {
    unsafeRequest.window.addEventListener("unload", function(ev) {
        var w = ev.currentTarget;
        if(w.location.href != url) return; 
        w.removeEventListener("unload", arguments.callee, false);
        unsafeRequest.window = null;
     }, false);
  },
  
  
  
  findWindow: function(channel) {
    try {
      return (channel.notificationCallbacks || channel.loadGroup.notificationCallbacks)
        .QueryInterface(
          CI.nsIInterfaceRequestor).getInterface(
          CI.nsIDOMWindow);
    } catch(e) {}
    return null;
  },
  findBrowser: function(channel, window) {
    var w = window || this.findWindow(channel);
    return w && this.ns.domUtils.findBrowserForNode(w);
  },
  
  dump: function(channel, msg) {
    if (!(this.ns.consoleDump & LOG_XSS_FILTER)) return;
    dump("[NoScript] ");
    dump((channel.URI && channel.URI.spec) || "null URI?" );
    if (channel.originalURI && channel.originalURI.spec != channel.URI.spec) {
      dump(" (" + channel.originalURI.spec + ")");
    }
    dump(" *** ");
    dump(msg);
    dump("\n");
  }
  
  
}


var Entities = {
  
  get htmlNode() {
    delete this.htmlNode;
    return this.htmlNode =
      (function() {
        try {
          // we need a loose HTML node, only way to get it today seems using hidden window
          var as = CC["@mozilla.org/appshell/appShellService;1"].getService(CI.nsIAppShellService);
          as.hiddenDOMWindow.addEventListener("unload", function(ev) {
            ev.currentTarget.removeEventListener("unload", arguments.callee, false);
            Entities.htmlNode = null;
            doc = null;
            // dump("*** Free Entities.htmlNode ***\n");
          }, false);
          return as.hiddenDOMWindow.document.createElementNS(HTML_NS, "body");
        } catch(e) {
          dump("[NoSript Entities]: Cannot grab an HTML node, falling back to XHTML... " + e + "\n");
          return CC["@mozilla.org/xul/xul-document;1"]
            .createInstance(CI.nsIDOMDocument)
            .createElementNS(HTML_NS, "body")
        }
      })()
  },
  convert: function(e) {
    try {
      this.htmlNode.innerHTML = e;
      var child = this.htmlNode.firstChild || null;
      return child && child.nodeValue || e;
    } catch(ex) {
      return e;
    }
  },
  convertAll: function(s) {
    return s.replace(/[\\&][^<>]+/g, function(e) { return Entities.convert(e) });
  },
  convertDeep: function(s) {
    for (var prev = null; (s = this.convertAll(s)) != prev; prev = s);
    return s;
  },
  neutralize: function(e, whitelist) {
    var c = this.convert(e);
    return (c == e) ? c : (whitelist && whitelist.test(c) ? e : e.replace(";", ","));
  },
  neutralizeAll: function(s, whitelist) {
    return s.replace(/&[\w#-]*?;/g, function(e) { return Entities.neutralize(e, whitelist || null); });
  }
};

function SyntaxChecker() {
  this.sandbox = new Components.utils.Sandbox("about:");
}

SyntaxChecker.prototype = {
  lastError: null,
  lastFunction: null,
  check: function(script) {
    this.sandbox.script = script;
     try {
       return !!(this.lastFunction = Components.utils.evalInSandbox("new Function(script)", this.sandbox));
     } catch(e) {
       this.lastError = e;
     }
     return false;
  },
  unquote: function(s, q) {
    if (!(s[0] == q && s[s.length - 1] == q &&
        !s.replace(/\\./g, '').replace(/^(['"])[^\n\r]*?\1/, "")
      )) return null;
    try {
      return Components.utils.evalInSandbox(s, this.sandbox);
    } catch(e) {}
    return null;
  }
};

function fuzzify(s) {
  return s.replace(/\w/g, '\\W*$&');
}

const IC_WINDOW_OPENER_PATTERN = fuzzify("alert|confirm|prompt|open|print");
const IC_EVENT_PATTERN = fuzzify("on(?:load|page|before|unload|ready|error|focus|blur|key|mouse|click|dbl|change|select|reset|submit|context|copy|cut|paste)") + "(?:\\W*[a-z])*";
const IC_EVENT_DOS_PATTERN =
      "\\b(?:" + IC_EVENT_PATTERN + ")[\\s\\S]*=[\\s\\S]*\\b(?:" + IC_WINDOW_OPENER_PATTERN + ")\\b"
      + "|\\b(?:" + IC_WINDOW_OPENER_PATTERN + ")\\b[\\s\\S]+\\b(?:" + IC_EVENT_PATTERN + ")[\\s\\S]*=";
      
var InjectionChecker = {
  fuzzify: fuzzify,
  entities: Entities,
  syntax: new SyntaxChecker(),
  _log: function(msg, t, i) {
    if (msg) msg = this._printable(msg);
    if(!(i || t)) {
      msg += " - LINES: ";
      var lines = [];
      for (var stack = Components.stack; (stack = stack.caller);) {
        lines.push(stack.lineNumber);
      }
      msg += lines.join(", ");
    }
    else {
      if (t) msg += " - TIME: " + (new Date().getTime() - t);
      if (i) msg += " - ITER: " + i;
    }
    this.dump("[NoScript InjectionChecker] " + msg + "\n");
  },
  
  _printable: function (msg) {
    return msg.toString().replace(/[^\u0020-\u007e]/g, function(s) { return "{" + s.charCodeAt(0).toString(16) + "}"; });
  },
  
  dump: dump,
  log: function() {},
  get logEnabled() { return this.log == this._log; },
  set logEnabled(v) { this.log = v ? this._log : function() {}; },
  
  
  bb: function(brac, s, kets) {
    for(var j = 3; j-- > 0;) {
      s = brac + s + kets;
      if (this.checkJSSyntax(s)) return true;
    }
    return false;
  },
  
  checkJSSyntax: function(s) {
    // bracket balancing for micro injections like "''),eval(name,''"
    if (/^(?:''|"")?[^\('"]*\)/.test(s)) return this.bb("x(\n", s, "\n)");
    if (/^(?:''|"")?[^\['"]*\\]/.test(s)) return this.bb("y[\n", s, "\n]");
    if (/^(?:''|"")?[^\{'"]*\}/.test(s)) return this.bb("function z() {\n", s, "\n}");
    
    if (this.syntax.check(s + "/**/")) {
      this.log("Valid fragment " + s);
      return true;
    }
    return false;
  },
  
  get breakStops() {
    var def = "\\/\\?&#;"; // we don't split by newline, because it's relevant only if there's a trailing comment (see checkURL())
    var bs = {
      nq: new RegExp("[" + def + "]")
    };
    Array.forEach("'\"", function(c) { bs[c] = new RegExp("[" + def + c + "]"); });
    delete this.breakStops;  
    return this.breakStops = bs;
  },
  
  reduceBackSlashes: function(bs) {
    return bs.length % 2 ? "" : "\\";
  },
  
  reduceQuotes: function(s) {
    if (s[0] == '/') {
      // reduce common leading path fragment resembling a regular expression or a comment
      s = s.replace(/^\/[^\/\n\r]+\//, '_RegExp_').replace(/^\/\/[^\r\n]*/, '//_COMMENT_');
    }
    if (!/['"]/.test(s) || /\/\*/.test(s)) 
      return s;
    // drop noisy backslashes
    s = s.replace(/\\{2,}/g, this.reduceBackSlashes);
    
    // drop escaped quotes
    s = s.replace(/\\["']/g, "EQ");
    var expr;
    for(;;) {
       expr = s.replace(/(^[^'"\/]*)(["']).*?\2/g, "$1_QS_");
       if(expr == s) break;
       s = expr;
    }
    return expr;
  },
  
  get json() {
    delete this.json;
    try {
      this.json = CC["@mozilla.org/dom/json;1"].createInstance(CI.nsIJSON);
    } catch(e) {
      this.json = null;
    }
    return this.json;
  },
  reduceJSON: function(s) {
    var m, whole, qred, prev;
    
    // optimistic case first, one big JSON block
    do {
      whole = s;
      m = s.match(/{[\s\S]*}/);
      if (!m) return s;
      expr = m[0];
      var json = this.json;
      if (json) {
        try {
          json.decode(expr);
          this.log("Reducing big JSON " + expr);
          return s.replace(expr, '_JSON_');
        } catch(e) {}
      }
      
      // heavier duty, scattered JSON blocks
      while((m = s.match(/\{[^\{\}:]+:[^\{\}]+\}/g))) {
        prev = s;
  
        for each(expr in m) {
          if (json) try {
            json.decode(expr);
            this.log("Reducing JSON " + expr);
            s = s.replace(expr, '"_JSON_"');
            continue;
          } catch(e) {}
          qred = this.reduceQuotes(expr);
          if (/\{(?:\s*(?:(?:\w+:)+\w+)+;\s*)+\}/.test(qred)) {
             this.log("Reducing pseudo-JSON " + expr);
             s = s.replace(expr, '"_PseudoJSON_"');
          } else if (!/[\(=\.]|[^:\s]\s*\[|:\s*(?:location|document|eval|open)\b/.test(qred) && 
             this.checkJSSyntax("JSON = " + qred) // no-assignment JSON fails with "invalid label"
          ) { 
            this.log("Reducing slow JSON " + expr);
            s = s.replace(expr, '"_SlowJSON_"');
          }
        }
        
        if (s == prev) break;
      }
      
    } while (s != whole);

    return s;
  },
  
  reduceXML: function(s) {
    var t;
    while(/^[^"]*</.test(s)) {
        t = s.replace(/^([^"]*)<\??\s*\/?[a-zA-Z][\w\:\-]+(?:[\s\+]+[\w\:\-]+="[\w\:\-\/\.#%\s\+]*")*[\+\s]*\/?\??>/, '$1;xml;');
        if (t == s) break;
        s = t;
    }
    if (t) { s = s.replace(/(?:\s*;xml;\s*)+/g, ';xml;') };
    return s;
  },

  _singleAssignmentRx: new RegExp(
    "(?:\\b" + fuzzify('document') + "\\b[\\s\\S]*\\.|\\s" + fuzzify('setter') + "\\b[\\s\\S]*=)|"
      + IC_EVENT_DOS_PATTERN
  ),
  _locationRx: new RegExp(
    "\\b" + fuzzify('location') + "\\b[\\s\\S]*="
  ),
  _nameRx: new RegExp(
    "=[\\s\\S]*\\b" + fuzzify('name') + "\\b"
  ),
  
  _maybeJSRx: new RegExp(
    '[\\w$\\u0080-\\uFFFF\\]\\)]\\s*(?:\\/[\\/\\*][\\s\\S]*|\\s*)[\\(\\[\\.][\\s\\S]*(?:\\([\\s\\S]*\\)|=)|\\b(?:' +
    fuzzify('eval|set(?:Timeout|Interval)|[fF]unction|Script|') + IC_WINDOW_OPENER_PATTERN +
    ')\\b[\\s\\S]*\\(|\\b(?:' +
    fuzzify('setter|location') +
    ')\\b[\\s\\S]*=|' +
    IC_EVENT_DOS_PATTERN
  ),
  maybeJS: function(expr) {
    if(/^(?:[^\(\)="']+=[^\(\)='"]+|(?:[\?a-z_0-9;,&=\/]|\.[\d\.])*)$/i.test(expr)) // commonest case, single assignment or simple chained assignments, no break
      return this._singleAssignmentRx.test(expr) || this._locationRx.test(expr) && this._nameRx.test(expr);
    if (/^(?:[\w\-\.]+\/)*\(*[\w\-\s]+\([\w\-\s]+\)[\w\-\s]*\)*$/.test(expr)) // typical "call like" Wiki URL pattern + bracketed session IDs
      return /\b(?:eval|set(?:Timeout|Interval)|[F|f]unction|Script|open|alert|confirm|prompt|print|on\w+)\s*\(/.test(expr);
    
    return this._maybeJSRx.test(
        expr.replace(/(?:^|[\/;&#])[\w\-]+\.[\w\-]+[\?;\&#]/g, '', expr) // remolve neutral dotted substrings
    ); 
  },
  checkLastFunction: function() {
    var expr = this.syntax.lastFunction;
    expr = expr && this.syntax.lastFunction.toSource().match(/\{([\s\S]*)\}/);
    return expr && (expr = expr[1]) && 
      (/=[\s\S]*cookie|\b(?:setter|document|location|\.\W*src)[\s\S]*=|[\[\(]/.test(expr) ||
      this.maybeJS(expr)
      );
  },
  
  _createInvalidRanges: function() {
    function x(n) { return '\\x' + n.toString(16); }
    
    var ret = "";
    var first = -1;
    var last = -1;
    var cur = 0x7e;
    while(cur++ <= 0xff) {
      try {
        eval("var _" + String.fromCharCode(cur) + "_=1");
      } catch(e) {
        if (!/illegal char/.test(e.message)) continue;
        if (first == -1) {
          first = last = cur;
          ret += x(cur);
          continue;
        }
        if (cur - last == 1) {
          last = cur;
          continue;
        }
  
        if(last != first) ret += "-" + x(last);
        ret+= x(cur);
        last = first = cur;
      }
    }
    return ret;
  },
  get invalidChars() {
    delete this.invalidChars;
    return this.invalidChars = new RegExp("^[^\"'/]*[" + this._createInvalidRanges() + "][^\"'/]*$");
  },
  checkJSBreak: function(s) {
    // Direct script injection breaking JS string literals or comments
    
    // cleanup most urlencoded noise and reduce JSON/XML
    s = this.reduceXML(this.reduceJSON(s.replace(/\%\d+[a-z\(]\w*/gi, '`')
            .replace(/[\r\n]+/g, "\n").replace(/[\x01-\x09\x0b-\x20]+/g, ' ')));
    
    if (!this.maybeJS(s)) return false;
    
    const invalidChars = this.invalidChars;
    const findInjection = 
      /(['"#;]|[\/\?=&](?![\?=&])|\*\/)(?=([\s\S]*?(?:\(|\[[\s\S]*?\]|(?:s\W*e\W*t\W*t\W*e\W*r|l\W*o\W*c\W*a\W*t\W*i\W*o\W*n|\W*o\W*n(?:\W*\w){3,}|\.[@\*\w\$\u0080-\uFFFF])[^&]*=[\s\S]*?[\w\$\u0080-\uFFFF\.\[\]\-]+)))/g;
    
    
    
    findInjection.lastIndex = 0;
    var m, breakSeq, subj, expr, lastExpr, quote, len, bs, bsPos, hunt, moved, script, errmsg, pos;
    
    const MAX_TIME = 8000, MAX_LOOPS = 600;

    const t = new Date().getTime();
    var iterations = 0;
    
    while ((m = findInjection.exec(s))) {
      
      subj = s.substring(findInjection.lastIndex);
      if (!this.maybeJS(subj)) {
         this.log("Fast escape on " + subj, t, iterations);
         return false;
      }
      
      breakSeq = m[1];
      expr = subj.match(/^[\s\S]*?[=\)]/);
      expr = expr && expr[0] || m[2];
      if (expr.length < m[2].length) expr = m[2];
      
      // quickly skip (mis)leading innocuous CGI patterns
      if ((m = subj.match(
        /^(?:(?:[\.\?\w\-\/&:`\[\]]+=[\w \-:\+%#,`\.]*(?:[&\|](?=[^&\|])|$)){2,}|\w+:\/\/\w[\w\-\.]*)/
        // r2l, chained query string parameters, protocol://domain, ...
        ))) {
       
        this.log("Skipping CGI pattern in " + subj);
        findInjection.lastIndex += m[0].length - 1;
        continue;
      }
      
     
      
      quote = breakSeq == '"' || breakSeq == "'" ? breakSeq : '';
      bs = this.breakStops[quote || 'nq']  

      len = expr.length;
      
      for (moved = false, hunt = !!expr, lastExpr = null; hunt;) {
        
        if (new Date().getTime() - t > MAX_TIME) {
          this.log("Too long execution time! Assuming DOS... " + s, t, iterations);
          return true;
        }
        
        hunt = expr.length < subj.length;
        
        if (moved) {
          moved = false;
        } else if (hunt) {
          bsPos = subj.substring(len).search(bs);
          if (bsPos < 0) {
            expr = subj;
            hunt = false;
          } else {
            len += bsPos;
            if (quote && subj[len] == quote) {
              len++;
            }
            expr = subj.substring(0, len);
            if (bsPos == 0) len++;
          }
        }
        
        if(lastExpr == expr) {
          lastExpr = null;
          continue;
        }
        lastExpr = expr;
        
        if(invalidChars.test(expr)) {
          this.log("Quick skipping invalid chars");
          continue;
        }
        
        if(quote) {
          script = this.syntax.unquote(quote + expr, quote);
          if(script && this.maybeJS(script) &&
            (this.checkJSSyntax(script) ||
              /'.+/.test(script) && this.checkJSSyntax("''" + script + "'") ||
              /".+/.test(script) && this.checkJSSyntax('""' + script + '"')
            ) && this.checkLastFunction()
            ) {
            return true;
          }
          script = quote + quote + expr + quote;
        } else {
          script = expr;
        }
        
        if (/^(?:[^'"\/\[\(]*[\]\)]|[^"'\/]*(?:`|[^&]&[\w\.]+=[^=]))/
            .test(script.split("//")[0])) {
           this.log("SKIP (head syntax) " + script, t, iterations);
           break; // unrepairable syntax error in the head move left cursor forward 
        }
        
        if (this.maybeJS(this.reduceQuotes(expr))) {

          if (this.checkJSSyntax(script) && this.checkLastFunction()) {
            this.log("JS Break Injection detected", t, iterations);
            return true;
          }
          if (++iterations > MAX_LOOPS) {
            this.log("Too many syntax checks! Assuming DOS... " + s, t, iterations);
            return true;
          }
          if(this.syntax.lastError) { // could be null if we're here thanks to checkLastFunction()
            errmsg = this.syntax.lastError.message;
            this.log(errmsg + " --- " + script + " --- ", t, iterations);
            if(!quote) {
              if (/left-hand/.test(errmsg)) {
                m = subj.match(/^([^\]\(\\'"=\?]+?)[\w$\u0080-\uffff\s]+[=\?]/);
                if (m) {
                  findInjection.lastIndex += m[1].length - 1;
                }
                break;
              } else if (/unterminated string literal/.test(errmsg)) {
                bsPos = subj.substring(len).search(/["']/);
                if(bsPos > -1) {
                  expr = subj.substring(0, len += bsPos + 1);
                  moved = true;
                } else break;
              } else if (/syntax error/.test(errmsg)) {
                bsPos = subj.indexOf("//");
                if (bsPos > -1) {
                  pos = subj.search(/['"\n\\\(]|\/\*/);
                  if (pos < 0 || pos > bsPos)
                    break;
                }
                if (/^([\w\[\]]*=)?\w*&[\w\[\]]*=/.test(subj)) { // CGI param concatenation
                  break;
                }
              }
            } else if (/left-hand/.test(errmsg)) break;
            
            if (/invalid flag after regular expression|missing ; before statement|invalid label|illegal character/.test(errmsg)) {
              break; // unrepairable syntax error, move left cursor forward 
            }
            if((m = errmsg.match(/\bmissing ([:\]\)\}]) /))) {
              len = subj.indexOf(m[1], len);
              if (len > -1) {
                expr = subj.substring(0, ++len);
                moved = m[1] != ':';
              } else break;
            }
          }
        }
      }
    }
    this.log(s, t, iterations);
    return false;
  },
  
  
  checkJSStunt: function(s) {
    
    // simplest navigation act (no dots, no round/square brackets)
    if (/\bl\W*o\W*c\W*a\W*t\W*i\W*o\W*n\W*(?:\/[\/\*][\s\S]*|\s*)=\W*(?:\/[\/\*][\s\S]*|\s*)n\W*a\W*m\W*e(?:\W+|$)/.test(s)) { 
      this.log("location = name navigation attempt in " +s);
      return true;
    }
    
    // check well known and semi-obfuscated -- as in [...]() -- function calls
    var m = s.match(/\b(?:open|eval|Script|set(?:Timeout|Interval)|[fF]unction|with|\[[^\]]*\w[^\]]*\]|split|replace|toString|substr(?:ing)?|fromCharCode|toLowerCase|unescape|decodeURI(?:Component)?|atob|btoa|\${1,2})\s*(?:\/[\/\*][\s\S]*?)?\([\s\S]*\)/);
    if (m) {
      var pos;
      var js = m[0];
      if (js.charAt(0) == '[') js = "_xss_" + js;
      for (;;) {
        if (this.checkJSSyntax(js)) {
          return true;
        }
        pos = js.lastIndexOf(")");
        if (pos < 0) break;
        js = js.substring(0, pos);
      }
    }
    return false;
  },
  
  checkJS: function(s, opts) {
    this.log(s);
    // recursive escaping options
    if (!opts) opts = { uni: true, ent: true };
    
    var hasUnicodeEscapes = opts.uni && /\\u[0-9a-f]{4}/.test(s);
    if (hasUnicodeEscapes && /\\u00(?:22|27|2f)/i.test(s)) {
      this.log("Unicode-escaped lower ASCII, why would you?");
      return true;
    }
    
    // the hardcore job!
    if (this.checkAttributes(s)) return true;
    if (/[\\=\(]/.test(s) && // quick preliminary screen
        (this.checkJSStunt(s) || this.checkJSBreak(s)))
      return true;
    
    
    // recursive cross-unescaping
    
    if (hasUnicodeEscapes &&
        this.checkJS(this.unescapeJS(s), {
          ent: false, // even if we introduce new entities, they're unrelevant because happen post-spidermonkey
          uni: false
        })) 
      return true;
    
    if (opts.ent) {
      var converted = Entities.convertAll(s);
      if (converted != s && this.checkJS(converted, {
          ent: false,
          uni: true // we might have introduced new unicode escapes
        }))
        return true;
    }
    
    return false;
  },
  
  unescapeJS: function(s) {
    return s.replace(/\\u([0-9a-f]{4})/gi, function(s, c) {
      return String.fromCharCode(parseInt(c, 16));
    });
  },
  
  unescapeCSS: function(s) {
    // see http://www.w3.org/TR/CSS21/syndata.html#characters
    return s.replace(/\\([\da-f]{0,6})\s?/gi, function($0, $1) {
      try {
        return String.fromCharCode(parseInt($1, 16));
      } catch(e) {
        return "";
      }
    });
  },
  
  reduceDashPlus: function(s) {
    // http://forums.mozillazine.org/viewtopic.php?p=5592865#p5592865
    return s.replace(/\-+/g, "-")
        .replace(/\++/g, "+")
        .replace(/\s+/g, ' ')
        .replace(/(?: \-)+/g, ' -')
        .replace(/(?:\+\-)+/g, '+-'); 
  },
  
  attributesChecker: new RegExp(
      "\\W(?:javascript|data):[\\s\\S]+[=\\(%,]|@" + 
      ("import\\W*(?:\\/\\*[\\s\\S]*)*(?:[\"']|url[\\s\\S]*\\()" + 
        "|-moz-binding[\\s\\S]*:[\\s\\S]*url[\\s\\S]*\\(")
        .replace(/[a-rt-z\-]/g, "\\W*$&"), 
      "i"),
  checkAttributes: function(s) {
    s = this.reduceDashPlus(s);
    return this.attributesChecker.test(s) ||
        /\\/.test(s) && this.attributesChecker.test(this.unescapeCSS(s));
  },
  
  HTMLChecker: new RegExp("<[^\\w<>]*(?:[^<>\"'\\s]*:)?[^\\w<>]*(?:" + // take in account quirks and namespaces
   fuzzify("script|form|style|link|object|embed|applet|iframe|frame|base|body|meta|img|svg|video|audio") + 
    ")|[/'\"]\\W*(?:FSCommand|on(?:error|[a-df-z][a-z]{2,}))[\\s\\x08]*=", 
    "i"),
  checkHTML: function(s) {
    this.log(s);
    return this.HTMLChecker.test(s);
  },
  
  NoscriptChecker: new RegExp("<[^\\w<>]*(?:[^<>\"'\\s]*:)?[^\\w<>]*(?:" +
    fuzzify("form|style|link|object|embed|applet|iframe|frame|meta|svg|video|audio") + ")"
    ),
  checkNoscript: function(s) {
    this.log(s);
    return this.NoscriptChecker.test(s);
  },
  
  base64: false,
  base64tested: [],
  get base64Decoder() { return Base64 }, // exposed here just for debugging purposes
  checkBase64: function(url) {
    this.log(url);
    var t = new Date().getTime();
    var frags, curf, j, k, pos, ff, f;
    const MAX_TIME = 4000;
    const DOS_MSG = "Too long execution time, assuming DOS in Base64 checks";
    this.base64 = false;
    // standard base64
    // notice that we cut at 8192 chars because of stack overflow in JS regexp implementation
    // (limit appears to be 65335, but cutting here seems quicker for big strings)
    // therefore we need to rejoin continuous strings manually
    url = url.replace(/\s+/g, ''); // base64 can be splitted across lines
    frags = url.match(/[A-Za-z0-9\+\/]{12,8191}=*[^A-Za-z0-9\+\/=]?/g);
    if (frags) {
      f = '';
      for (j = 0; j < frags.length; j++) {
        curf = frags[j];
        if (/[A-Za-z0-9\+\/]$/.test(curf)) {
          f += curf;
          if (j < frags.length - 1) continue;
        } else {
          f += curf.substring(0, curf.length - 1);
        }
        ff = f.split('/');
        if (ff.length > 255) {
          this.log("More than 255 base64 slash chunks, assuming DOS");
          return true;
        }
        while (ff.length) {
          
          if (new Date().getTime() - t > MAX_TIME) {
              this.log(DOS_MSG);
              return true;
          }
          f = ff.join('/');
          if (f.length >= 12 && this.checkBase64Frag(f))
            return true;
          
          ff.shift();
        }
        f = '';
      }
    }
    // URL base64 variant, see http://en.wikipedia.org/wiki/Base64#URL_applications
    frags = url.match(/[A-Za-z0-9\-_]{12,8191}[^A-Za-z0-9\-_]?/g);
    if (frags) {
      f = '';
      for (j = 0; j < frags.length; j++) {
        if (new Date().getTime() - t > MAX_TIME) {
          this.log(DOS_MSG);
          return true;
        }
        curf = frags[j];
        if (/[A-Za-z0-9\-_]$/.test(curf)) {
          f += curf;
          if (j < frags.length - 1) continue;
        } else {
          f += curf.substring(0, curf.length - 1);
        }
        f = f.replace(/-/g, '+').replace(/_/, '/');
        if (this.checkBase64Frag(f)) return true;
        f = '';
      }
    }
    return false;
  },
  
  checkBase64Frag: function(f) {
    if (this.base64tested.indexOf(f) < 0) {
      this.base64tested.push(f);
      try {
          var s = Base64.decode(f);
          if(s && s.replace(/[^\w\(\)]/g, '').length > 7 && (this.checkHTML(s) || this.checkJS(s))) {
            this.log("Detected BASE64 encoded injection: " + f);
            return this.base64 = true;
          }
      } catch(e) {}
    }
    return false;
  },
  
  checkURL: function(url) {
    // let's assume protocol and host are safe, but keep the leading double slash to keep comments in account
    url = url.replace(/^[a-z]+:\/\/.*?(?=\/|$)/, "//"); 
    return this.checkRecursive(url);
  },
  
  checkRecursive: function(s, depth, isPost) {
    if (typeof(depth) != "number")
      depth = 3;
    this.isPost = isPost || false;
    this.base64 = false;
    this.base64tested = [];
    return this._checkRecursive(s, depth);
  },
  
  _checkRecursive: function(s, depth) {
    
    
    if (this.checkHTML(s) || this.checkJS(s))
      return true;
    
    if (--depth <= 0)
      return false;
    
    if (/\+/.test(s) && this._checkRecursive(this.urlUnescape(s.replace(/\+/g, ' '), depth)))
      return true;
    
    var unescaped = this.urlUnescape(s);
    
    if (!this.isPost && this.checkBase64(s.replace(/^\/{1,3}/, ''))) return true;
    
    if (unescaped != s && this._checkRecursive(unescaped, depth))
      return true;
    
    s = this.ebayUnescape(unescaped);
    if (s != unescaped && this._checkRecursive(s, depth))
      return true;
    
    return false;
  },
  
  urlUnescape: function(url) {
    try {
      return decodeURIComponent(url);
    } catch(warn) {
      this.log("Problem decoding " + url + ", maybe not an UTF-8 encoding? " + warn.message);
      return unescape(url);
    }
  },
  
  ebayUnescape: function(url) {
    return url.replace(/Q([\da-fA-F]{2})/g, function(s, c) {
      return String.fromCharCode(parseInt(c, 16));
    });
  },
  
  checkPost: function(channel) {
    if (!((channel instanceof CI.nsIUploadChannel)
          && channel.uploadStream && (channel.uploadStream instanceof CI.nsISeekableStream)))
      return false;
    this.log("Extracting post data...");
    return this.checkPostStream(channel.uploadStream);
  },
  
  checkPostStream: function(stream) {
     var ic = this;
     return new PostChecker(stream).check(
      function(chunk) {
        return chunk.length > 6 && ic.checkRecursive(chunk, 2, true) && chunk;
      }
    );
  },
  
  testCheckPost: function(strData) {
    var stream = CC["@mozilla.org/io/string-input-stream;1"].
            createInstance(CI.nsIStringInputStream);
    stream.setData(strData, strData.length);
    return this.checkPostStream(stream);
  }
  
};

function PostChecker(uploadStream) {
  this.uploadStream = uploadStream;  
}

PostChecker.prototype = {
  boundary: null,
  isFile: false,
  postData: '',
  check: function(callback) {
    var m, chunks, data, size, available, ret;
    const BUF_SIZE = 3 * 1024 * 1024; // 3MB
    const MAX_FIELD_SIZE = BUF_SIZE;
    try {
      var us = this.uploadStream;
      us.seek(0, 0);
      const sis = CC['@mozilla.org/binaryinputstream;1'].createInstance(CI.nsIBinaryInputStream);
      sis.setInputStream(us);
      
      // reset status
      delete this.boundary;
      delete this.isFile;
      delete this.postData;
      var t = new Date().getTime(), t2 = t, d;
      if((available = sis.available())) do {
        size = this.postData.length;
        if (size >= MAX_FIELD_SIZE) return size + " bytes or more in one non-file field, assuming memory DOS attempt!";

        data = sis.readBytes(Math.min(available, BUF_SIZE));

        if (size != 0) {
          this.postData += data;
        } else {
           if (data.length == 0) return false;
           this.postData = data;
        }
        available = sis.available();
        chunks = this.parse(!available);
      
        for (var j = 0, len = chunks.length; j < len; j++) {
          ret = callback(chunks[j]);
          if (ret) return ret;
        }
      } while(available)
    } catch(ex) {
      dump(ex + "\n" + ex.stack + "\n");
      return ex;
    } finally {
        try {
          us.seek(0, 0); // rewind
        } catch(e) {}
    }
    return false; 
  },
  
  parse: function(eof) {
    var postData = this.postData;
    
    if (typeof(this.boundary) != "string") {
      m = postData.match(/^Content-type: multipart\/form-data;\s*boundary=(\S*)/i);
      this.boundary = m && m[1] || '';
      if (this.boundary) this.boundary = "--" + this.boundary;
      postData = postData.substring(postData.indexOf("\r\n\r\n") + 2);
    }

    this.postData = '';

    var boundary = this.boundary;
   
    var chunks = [];
    var j, len;

    if (boundary) { // multipart/form-data, see http://www.faqs.org/ftp/rfc/rfc2388.txt  
      if(postData.indexOf(boundary) < 0) {
        // skip big file chunks
        return chunks;
      }
      parts = postData.split(boundary);
      
      var part, last;
      for(j = 0, len = parts.length; j < len;) {
        part = parts[j];
        last = ++j == len;
        if (j == 1 && part.length && this.isFile) {
          // skip file internal terminal chunk
          this.isFile = false;
          continue;
        }
        m = part.match(/^\s*Content-Disposition: form-data; name="(.*?)"(?:;\s*filename="(.*)"|[^;])\r?\n(Content-Type: \w)?.*\r?\n/i);
        
        if (m) {
          // name and filename are backslash-quoted according to RFC822
          if (m[1]) chunks.push(m[1].replace(/\\\\/g, "\\")); // name and file name 
          if (m[2]) {
            chunks.push(m[2].replace(/\\\\/g, "\\")); // filename
            if (m[3]) {
              // Content-type: skip, it's a file
              this.isFile = true;
              
              if (last && !eof) 
                this.postData = part.substring(part.length - boundary.length);

              continue; 
            }
          }
          if (eof || !last) {
            chunks.push(part.substring(m[0].length)); // parameter body
          } else {
            this.postData = part;
          }
          this.isFile = false;
        } else {
          // malformed part, check it all or push it back
          if (eof || !last) {
            chunks.push(part)
          } else {
            this.postData = this.isFile ? part.substring(part.length - boundary.length) : part;
          }
        }
      }
    } else {
      this.isFile = false;
      parts = postData.split("&");
      if (!eof) this.postData = parts.pop();
      
      for (j = 0, len = parts.length; j < len; j++) {
        m = parts[j].split("=");
        chunks.push(m[0]);
        if (m.length > 1) chunks.push(m[1]);
      }
    }
    return chunks;
  }
}


function XSanitizer(primaryBlacklist, extraBlacklist) {
  this.primaryBlacklist = primaryBlacklist;
  this.extraBlacklist = extraBlacklist;
  this.injectionChecker = InjectionChecker;
}

XSanitizer.prototype = {
  brutal: false,
  base64: false,
  sanitizeURL: function(url) {
    var original = url.clone();
    this.brutal = this.brutal || this.injectionChecker.checkURL(url.spec);
    this.base64 = this.injectionChecker.base64;
    
    const changes = { minor: false, major: false, qs: false };
    // sanitize credentials
    if (url.username) url.username = this.sanitizeEnc(url.username);
    if (url.password) url.password = this.sanitizeEnc(url.password);
    url.host = this.sanitizeEnc(url.host);
    
    if (url instanceof CI.nsIURL) {
      // sanitize path
     
      if (url.param) {
        url.path = this.sanitizeURIComponent(url.path); // param is the URL part after filePath and a semicolon ?!
      } else if(url.filePath) { 
        url.filePath = this.sanitizeURIComponent(url.filePath); // true == lenient == allow ()=
      }
      // sanitize query
      if (url.query) {
        url.query = this.sanitizeQuery(url.query, changes);
        if (this.brutal) {
          url.query = this.sanitizeWholeQuery(url.query, changes);
        }
      }
      // sanitize fragment
      var fragPos = url.path.indexOf("#");
      if (url.ref || fragPos > -1) {
        if (fragPos >= url.filePath.length + url.query.length) {
          url.path = url.path.substring(0, fragPos) + "#" + this.sanitizeEnc(url.path.substring(fragPos + 1));
        } else {
          url.ref = this.sanitizeEnc(url.ref);
        }
      }
    } else {
      // fallback for non-URL URIs, we should never get here anyway
      if (url.path) url.path = this.sanitizeURIComponent(url.Path);
    }
    
    var urlSpec = url.spec;
    var neutralized = Entities.neutralizeAll(urlSpec, /[^\\'"\x00-\x07\x09\x0B\x0C\x0E-\x1F\x7F<>]/);
    if (urlSpec != neutralized) url.spec = neutralized;
    
    if (this.base64) {
      url.spec = url.prePath; // drastic, but with base64 we cannot take the risk!
    }
    
    if (url.getRelativeSpec(original) && unescape(url.spec) != unescape(original.spec)) { // ok, this seems overkill but take my word, the double check is needed
      changes.minor = true;
      changes.major = changes.major || changes.qs || 
                      unescape(original.spec.replace(/\?.*/g, "")) 
                        != unescape(url.spec.replace(/\?.*/g, ""));
      url.spec = url.spec.replace(/'/g, "%27")
      if (changes.major) {
        url.ref = Math.random().toString().concat(Math.round(Math.random() * 999 + 1)).replace(/0./, '') // randomize URI
      }
    } else {
      changes.minor = false;
      url.spec = original.spec.replace(/'/g, "%27");
    }
    return changes;
  },
  
  sanitizeWholeQuery: function(query, changes) {
    var original = query;
    query = Entities.convertAll(query);
    if (query == original) return query;
    var unescaped = unescape(original);
    query = this.sanitize(unescaped);
    if (query == unescaped) return original;
    if(changes) changes.qs = true;
    return escape(query);
  },
  
  _queryRecursionLevel: 0,
  sanitizeQuery: function(query, changes, sep) {
    const MAX_RECUR = 2;
    
    var canRecur = this._queryRecursionLevel++ < MAX_RECUR;
    // replace every character matching noscript.filterXGetRx with a single ASCII space (0x20)
    changes = changes || {};
    if (!sep) {
      sep = query.indexOf("&") > -1 ? "&" : ";" 
    }
    const parms = query.split(sep);
    var j, pieces, k, pz, origPz, encodedPz, nestedURI, qpos, apos, encodeURL;
    
    for (j = parms.length; j-- > 0;) {
      pieces = parms[j].split("=");
      
      
      try {
        for (k = pieces.length; k-- > 0;) {
          encodedPz = pieces[k];
          pz = null;
          if (encodedPz.indexOf("+") < 0) {
            try {
              pz = decodeURIComponent(encodedPz);
              encodeURL = encodeURIComponent;
            } catch(e) {}
          }
          if (pz == null) {
            pz = unescape(encodedPz);
            encodeURL = escape;
          }
          origPz = pz;
          
          // recursion for nested (partial?) URIs
          
          
          
          nestedURI = null;
          
          if (canRecur && /^https?:\/\//i.test(pz)) {
            // try to sanitize as a nested URL
            try {
              nestedURI = SiteUtils.ios.newURI(pz, null, null).QueryInterface(CI.nsIURL);
              changes.qs = changes.qs || this.sanitizeURL(nestedURI).major;
              if (unescape(pz).replace(/\/+$/, '') != unescape(nestedURI.spec).replace(/\/+$/, '')) pz = nestedURI.spec;
            } catch(e) {
              nestedURI = null;
            }
          }
          
          if (!nestedURI) {
            if (canRecur &&
                 (qpos = pz.indexOf("?")) > - 1 &&
                 (spos = pz.search(/[&;]/) > qpos)) { 
              // recursive query string?
              // split, sanitize and rejoin
              pz = [ this.sanitize(pz.substring(0, qpos)), 
                    this.sanitizeQuery(pz.substring(qpos + 1), changes)
                   ].join("?")
              
            } else {
              pz = this.sanitize(pz);
            }
            if (origPz != pz) changes.qs = true;
          }
            
          pieces[k] = encodeURL(pz);
        }
        parms[j] = pieces.join("=");
      } catch(e) { 
        // decoding exception, skip this param
        parms.splice(j, 1);
      } 
    }
    this._queryRecursionLevel--;
    return parms.join(sep);
  },
  
  sanitizeURIComponent: function(s) {
    try {
      return encodeURI(this.sanitize(decodeURIComponent(s)));
    } catch(e) {
      return "";
    }
  },
  sanitizeEnc: function(s) {
    try {
      return encodeURIComponent(this.sanitize(decodeURIComponent(s)));
    } catch(e) {
      return "";
    }
  },
  sanitize: function(unsanitized) {
    // deeply convert entities
    var s, orig;
    orig = s = Entities.convertDeep(unsanitized);
    
    if (s.indexOf('"') > -1 && !this.brutal) {
      // try to play nice on search engine queries with grouped quoted elements
      // by allowing double quotes but stripping even more aggressively other chars
      
      // Google preserves "$" and recognizes ~, + and ".." as operators
      // All the other non alphanumeric chars (aside double quotes) are ignored.
      // We will preserve the site: modifier as well
      // Ref.: http://www.google.com/help/refinesearch.html
      s = s.replace(/[^\w\$\+\.\~"&;\- :\u0080-\uffff]/g, 
          " " // strip everything but alphnum and operators
          ).replace(":", 
          function(k, pos, s) { // strip colons as well, unless it's the site: operator
            return (s.substring(0, pos) == "site" || s.substring(pos - 5) == " site") ? ":" : " " 
          }
        );
      if (s.replace(/[^"]/g, "").length % 2) s += '"'; // close unpaired quotes
      return s;
    }
    // regular duty
    s = s.replace(this.primaryBlacklist, " ");
    
    s = s.replace(/\bjavascript:+|\bdata:+[\s\w\-\/]*,|-moz-binding|@import/ig, function(m) { return m.replace(/\W/g, " "); });
    
    if (this.extraBlacklist) { // additional user-defined blacklist for emergencies
      s = s.replace(this.extraBlacklist, " "); 
    }
    
    if (this.brutal) { // injection checks were positive
      s = InjectionChecker.reduceDashPlus(s).replace(/['\(\)\=\[\]]/g, " ")
           .replace(this._brutalReplRx, String.toUpperCase)
           .replace(/Q[\da-fA-Fa]{2}/g, "Q20"); // Ebay-style escaping
    }
    
    return s == orig ? unsanitized : s;
  },
  
  _regularReplRx: new RegExp(
    fuzzify('(?:javascript|data)') + '\\W*:+|' +
      fuzzify('-moz-binding|@import'), 
    "ig"
  ),
  _brutalReplRx: new RegExp(
    '(?:' + fuzzify('setter|location|cookie|name|document|') +
    IC_WINDOW_OPENER_PATTERN + '|' + IC_EVENT_PATTERN + ')',
    "g"
  )
  
};

// we need this because of https://bugzilla.mozilla.org/show_bug.cgi?id=439276

var Base64 = {

  decode : function (input) {
    var output = '';
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;
    
    // if (/[^A-Za-z0-9\+\/\=]/.test(input)) return ""; // we don't need this, caller checks for us

    const k = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    while (i < input.length) {

        enc1 = k.indexOf(input.charAt(i++));
        enc2 = k.indexOf(input.charAt(i++));
        enc3 = k.indexOf(input.charAt(i++));
        enc4 = k.indexOf(input.charAt(i++));

        chr1 = (enc1 << 2) | (enc2 >> 4);
        chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        chr3 = ((enc3 & 3) << 6) | enc4;

        output += String.fromCharCode(chr1);

        if (enc3 != 64) {
          output += String.fromCharCode(chr2);
        }
        if (enc4 != 64) {
          output += String.fromCharCode(chr3);
        }

    }
    return output;

  }
}

function Cookie(s, host) {
  this.parse(s, host);
}
Cookie.computeId = function(c) {
  return c.name + ";" + c.host + "/" + c.path;
}
Cookie.find = function(f) {
  var cc = Cookie.prototype.cookieManager.enumerator;
  var c;
  while (cc.hasMoreElements()) {
    if (f(c = cc.getNext())) return c;
  }
  return null;
}

Cookie.attributes = { host: 'domain', path: 'path', expires: 'expires', isHttpOnly: 'HttpOnly', isSecure: 'Secure' };
Cookie.prototype = {
  
  name: '',
  value: '',
  source: '',
  domain: '',
  host: '',
  rawHost: '',
  path: '',
  secure: false,
  httponly: false,
  session: true,
  expires: 0,
  
  id: '',
  
  
  toString: function() {
    var c = [this['name'] + "=" + this.value];
    var v;
    const aa = Cookie.attributes;
    for (var k in aa) {
      var p = aa[k];
      v = this[k];
      switch(typeof(v)) {
        case "string":
          if (v) c.push(p + "=" + v);
          break;
        case "boolean":
          if (v) c.push(p);
          break;
        case "number":
          if (!this.isSession) c.push(p + "=" + new Date(v * 1000).toUTCString());
          break;
      }
    }
    return c.join("; ");
  },
  parse: function(s, host) {
    if (this.source) {
      // cleanup for recycle
      for (p in this) {
        if (typeof (p) != "function") delete this[p];
      }
    }
    this.source = s;
    this.host = host;
    
    var parts = s.split(/;\s*/);
    var nv = parts.shift().split("=");
    
    this.name = nv.shift() || '';
    this.value = nv.join('=') || '';
    
    var n, v;
    for each (p in parts) {
      nv = p.split("=");
      switch (n = nv[0].toLowerCase()) {
        case 'expires':
          v = Math.round(Date.parse((nv[1] || '').replace(/\-/g, ' ')) / 1000);
        break;
        case 'domain':
        case 'path':
          v = nv[1] || '';
          break;
        case 'secure':
        case 'httponly':
          v = true;
          break;
        default:
          n = 'unknown'
      }
      this[n] = v;
    }
    if (!this.expires) {
      this.session = true;
      this.expires = Math.round(new Date() / 1000) + 31536000;  
    }
    if (this.domain) {
      if (!this.isDomain) this.domain = "." + this.domain;
      this.host = this.domain;
    }
    this.rawHost = this.host.replace(/^\./, '');
    
    this.id = Cookie.computeId(this);
  },
  
  
  get cookieManager() {
    delete Cookie.prototype.cookieManager;
    var cman =  CC["@mozilla.org/cookiemanager;1"]
      .getService(CI.nsICookieManager2).QueryInterface(CI.nsICookieManager);
    return Cookie.prototype.cookieManager = cman; 
  },
  belongsTo: function(host, path) {
    if (path && this.path && path.indexOf(this.path) != 0) return false;
    if (host == this.rawHost) return true;
    var d = this.domain;
    return d && (host == d || this.isDomain && host.slice(-d.length) == d);
  },
  save: function() {
    this.save = ("cookieExists" in this.cookieManager)
      ? function() { this.cookieManager.add(this.host, this.path, this.name, this.value, this.secure, this.httponly, this.session, this.expires); }
      : function() { this.cookieManager.add(this.host, this.path, this.name, this.value, this.secure,                this.session, this.expires);}
    ;
    return this.save();
  },
  exists: function() {
    var cc = this.cookieManager.enumerator;
    while(cc.hasMoreElements()) {
      if (this.sameAs(cc.getNext())) return true;
    }
    return false;
  },
  
  sameAs: function(c) {
    (c instanceof CI.nsICookie) && (c instanceof CI.nsICookie2);
    return Cookie.computeId(c) == this.id;
  },
  
  // nsICookie2 interface extras
  get isSecure() { return this.secure; },
  get expiry() { return this.expires; },
  get isSession() { return this.session; },
  get isHttpOnly() { return this.httponly; },
  get isDomain() { return this.domain && this.domain[0] == '.'; },
  policy: 0,
  status: 0,
  QueryInterface: xpcom_generateQI([CI.nsICookie, CI.nsICookie2, CI.nsISupports])
  
}

var HTTPS = {
  get service() {
    delete this.service;
    return this.service = singleton;
  },
  
  log: function(msg) {
    var ns = this.service;
    this.log = ns.getPref("https.showInConsole", true)
      ? function(msg) { ns.log("[NoScript HTTPS] " + msg); }
      : function(msg) {}
      
    return this.log(msg);
  },
  
  onCrossSiteRequest: function(channel, origin, browser, rw) {
    try {
      if (!this.forceHttps(channel))
        this.handleCrossSiteCookies(channel, origin, browser);
    } catch(e) {
      this.log(e + " --- " + e.stack);
    }

  },
  
  registered: false,
  handleSecureCookies: function(req) {
  /*
    we check HTTPS response setting cookies and
    1) if host is in the noscript.secureCookiesExceptions list we let
     it pass through
    2) if host is in the noscript.secureCookiesForced list we append a
       ";Secure" flag to every non-secure cookie set by this response
    3) otherwise, we just log unsafe cookies BUT if no secure cookie
       is set, we patch all these cookies with ";Secure" like in #2.
       However, if current request redirects (directly or indirectly)
       to an unencrypted final URI, we remove our ";Secure" patch to
       ensure compatibility (ref: mail.yahoo.com and hotmail.com unsafe
       behavior on 11 Sep 2008)
  */
    
    const ns = this.service;
    if (!ns.secureCookies) return;
    
    var uri = req.URI;
    
    if (uri.schemeIs("https") &&
        !(ns.secureCookiesExceptions && ns.secureCookiesExceptions.test(uri.spec)) &&
        (req instanceof CI.nsIHttpChannel)) {
      try {
        var host = uri.host;
        try {
          var cookies = req.getResponseHeader("Set-Cookie");
        } catch(mayHappen) {
          return;
        }
        if (cookies) {
          var forced = ns.secureCookiesForced && ns.secureCookiesForced.test(uri.spec);
          var secureFound = false;
          var unsafe = null;
         
          const rw = ns.requestWatchdog;
          var browser = rw.findBrowser(req);
          
          if (!browser) {
            if (ns.consoleDump) ns.dump("Browser not found for " + uri.spec);
          }
          
          var unsafeMap = this.getUnsafeCookies(browser) || {};
          var c;
          for each (var cs in cookies.split("\n")) {
            c = new Cookie(cs, host);
            if (c.secure && c.belongsTo(host)) {
              this.log("Secure cookie set by " + host + ": " + c);
              secureFound = c;
              delete unsafeMap[c.id];
            } else {
              if (!unsafe) unsafe = [];
              unsafe.push(c);
            }
          }
        
          
          if (unsafe && !(forced || secureFound)) {
            // this page did not set any secure cookie, let's check if we already have one
            secureFound = Cookie.find(function(c) {
              return (c instanceof CI.nsICookie) && (c instanceof CI.nsICookie2)
                && c.secure && !unsafe.find(function(x) { return x.sameAs(c); })
            });
            if (secureFound) {
              this.log("Secure cookie found for this host: " + Cookie.prototype.toString.apply(secureFound));
            }
          }
          
          if (secureFound && !forced) {
            this.cookiesCleanup(secureFound);
            return;
          }
          
          if (!unsafe) return;

          var msg;
          if (forced || !secureFound) {
            req.setResponseHeader("Set-Cookie", "", false);
            msg = forced ? "FORCED SECURE" : "AUTOMATIC SECURE";
            forced = true;
          } else {
            msg = "DETECTED INSECURE";
          }
          
          if (!this.registered) {
            this.registered = true;
            rw.addCrossSiteListener(this);
          }
          
          this.setUnsafeCookies(browser, unsafeMap);
          msg += " on https://" + host + ": ";
          for each (c in unsafe) {
            if (forced) {
              c.secure = true;
              req.setResponseHeader("Set-Cookie", c.source + ";Secure", true);
              unsafeMap[c.id] = c;
            }
            this.log(msg + c);
          }
          
        }
      } catch(e) {
        if (ns.consoleDump) ns.dump(e);
      }
    }
  },
  
  handleCrossSiteCookies: function(req, origin, browser) {
    const ns = this.service;
     
    var unsafeCookies = this.getUnsafeCookies(browser);
    if (!unsafeCookies) return;
    
    var uri = req.URI;
    var dscheme = uri.scheme;
    
    var oparts = origin && origin.match(/^(https?):\/\/([^\/:]+).*?(\/.*)/);
    if (!(oparts && /https?/.test(dscheme))) return; 
    
    var oscheme = oparts[1];
    if (oscheme == dscheme) return; // we want to check only cross-scheme requests
    
    var dsecure = dscheme == "https";
    
    if (dsecure && !this.service.getPref("secureCookies.recycle", false)) return;
   
    var dhost = uri.host;
    var dpath = uri.path;
    
    var ohost = oparts[2];
    var opath = oparts[3];
    
    var ocookieCount = 0, totCount = 0;
    var dcookies = [];
    var c;
    
    for (var k in unsafeCookies) {
      c = unsafeCookies[k];
      if (!c.exists()) {
        delete unsafeCookies[k];
      } else {
        totCount++;
        if (c.belongsTo(dhost, dpath) && c.secure != dsecure) { // either secure on http or not secure on https
          dcookies.push(c);
        }
        if (c.belongsTo(ohost, opath)) {
          ocookieCount++;
        }
      }
    }
    
    if (!totCount) {
      this.setUnsafeCookies(browser, null);
      return;
    }
    
    // We want to "desecurify" cookies only if cross-navigation to unsafe
    // destination originates from a site sharing some secured cookies

    if (ocookieCount == 0 && !dsecure || !dcookies.length) return; 
    
    if (dsecure) {
      this.log("Detected cross-site navigation with secured cookies: " + origin + " -> " + uri.spec);
      
    } else {
      this.log("Detected unsafe navigation with NoScript-secured cookies: " + origin + " -> " + uri.spec);
      this.log(uri.prePath + " cannot support secure cookies because it does not use HTTPS. Consider forcing HTTPS for " + uri.host + " in NoScript's Advanced HTTPS options panel.")
    }
    
    var cs = CC['@mozilla.org/cookieService;1'].getService(CI.nsICookieService).getCookieString(uri, req);
      
    for each (c in dcookies) {
      c.secure = dsecure;
      c.save();
      this.log("Toggled secure flag on " + c);
    }

    if (cs) {
      Array.prototype.push.apply(
        dcookies, cs.split(/\s*;\s*/).map(function(cs) { var nv = cs.split("="); return { name: nv.shift(), value: nv.join("=") } })
         .filter(function(c) { return dcookies.every(function(x) { return x.name != c.name }) })
      );
    }

    cs = dcookies.map(function(c) { return c.name + "=" + c.value }).join("; ");

    this.log("Sending Cookie for " + dhost + ": " + cs);
    req.setRequestHeader("Cookie", cs, false); // "false" because merge syntax breaks Cookie header
  },
  
  
  cookiesCleanup: function(refCookie) {
    const ns = this.service;
    var downgraded = [];

    var ignored = ns.secureCookiesExceptions;
    var disabled = !ns.secureCookies;
    var bi = ns.domUtils.createBrowserIterator();
    var unsafe, k, c, total, deleted;
    for (var browser; browser = bi.next();) {
      unsafe = this.getUnsafeCookies(browser);
      if (!unsafe) continue;
      total = deleted = 0;
      for (k in unsafe) {
        c = unsafe[k];
        total++;
        if (disabled || (refCookie ? c.belongsTo(refCookie.host) : ignored && ignored.test(c.rawHost))) {
          if (c.exists()) {
            this.log("Cleaning Secure flag from " + c);
            c.secure = false;
            c.save();
          }
          delete unsafe[k];
          deleted++;
        }
      }
      if (total == deleted) this.setUnsafeCookies(browser, null);
      if (!this.cookiesPerTab) break;
    }
  },
  
  get cookiesPerTab() {
    return this.service.getPref("secureCookies.perTab", false);
  },
  
  _globalUnsafeCookies: {},
  getUnsafeCookies: function(browser) { 
    return this.cookiesPerTab
      ? browser && this.service.getExpando(browser, "unsafeCookies")
      : this._globalUnsafeCookies;
  },
  setUnsafeCookies: function(browser, value) {
    return this.cookiesPerTab
      ? browser && this.service.setExpando(browser, "unsafeCookies", value)
      : this._globalUnsafeCookies = value;
  },
  
  shouldForbid: function(site) {
    const ns = this.service;
    switch(ns.allowHttpsOnly) {
      case 0:
        return false;
      case 1:
        return /^(?:ht|f)tp:\/\//.test(site) && this.isProxied(site);
      case 2:
        return /^(?:ht|f)tp:\/\//.test(site);
    }
    return false;
  },
  
  isProxied: function(u) {
    var ps = CC["@mozilla.org/network/protocol-proxy-service;1"].getService(CI.nsIProtocolProxyService);
    var ios = this.service.siteUtils.ios;
    this.isProxied = function(u) {
      try {
        if (!(u instanceof CI.nsIURI)) {
          u = ios.newURI(u, null, null);
        }
        return ps.resolve(u, 0).type != "direct";
      } catch(e) {
        return false;
      }
    }
  },
  
  forceHttps: function(req, w) {
    const ns = this.service;
    var uri;
    if (ns.httpsForced && !(uri = req.URI).schemeIs("https") && ns.httpsForced.test(uri.spec) &&
          !(ns.httpsForcedExceptions && ns.httpsForcedExceptions.test(uri.spec))) {
        uri = uri.clone();
        uri.scheme = "https";
        req.cancel(NS_BINDING_ABORTED);
        (w || ns.requestWatchdog.findWindow(req)).location = uri.spec;
        this.log("Forced HTTPS document on " + uri.spec);
        return true;
      }
    return false;
  },
  
  forceHttpsPolicy: function(uri, ctx, type) {
    const ns = this.service;
    if (ns.httpsForced && ns.httpsForced.test(uri.spec) && !(ns.httpsForcedExceptions && ns.httpsForcedExceptions.test(uri.spec))) {
      var httpsURI = uri.clone();
      httpsURI.scheme = "https";
      if (ctx && type != 6 && type != 7) {  
        for each (var attr in ["src", "data", "href"]) {
          try {
            if (attr in ctx) {
              ctx[attr] = httpsURI.spec;
            }
          } catch(e) { this.log(e.message); }
        }
      }
      this.log("Forcing HTTPS policy on " + uri.spec);
      uri.spec = httpsURI.spec;
      return true;
    }
    return false;
  }
  
}

function URIPatternList(s) {
  this.source = s;
  this.rx = this.parse(s);
}
URIPatternList.create = function(s) {
  return s && new URIPatternList(s);
}

URIPatternList.prototype = {
  test: function(u) {
    return this.rx && this.rx.test(u);  
  },
  
  parse: function(s) {
    try {
      var rxSource = s.split(/\s+/).map(function(p) {
        if (!/\w+/.test(p)) return null;
        
        if(!/[^\w\-/:%@;&#\?\.\*]/.test(p)) {
         
          // either simple or glob
          const hasPath = /^(?:\w+:\/\/|)[^\/]+\//.test(p);
          const hasScheme = /^[a-z]\w+:(?:\/+|[^/]*\D)/.test(p);

          p = p.replace(/[\.\?\-]/g, "\\$&"); // escape special regexp chars

          if (!hasScheme) { // adjust for no protocol
            p = "[a-z]+\\w+://" + p;
          }

          

          if (!hasPath) { // adjust for no path
            p += "(?:[/\\?#]|$)";
          }
          
          if (!/\*/.test(p)) {
            // simple "starts with..." site matching
            return '^' + p;
          }
          
          // glob matching
          if (hasPath) p += '$'; 

          return '^' + p.replace(/\*/g, '.*?').replace(/^([^\/:]+:\/*)\.\*/, "$1[^/]*");
        } 
        // raw regexp!
        try {
         new RegExp(p); // check syntax
        } catch(e) {
          dump("[NoScript] Illegal regexp in URIPatternList: " + p + " -- " + e + "\n");
          return null;
        }
        return p;
      }).filter(function(p) { return p }).join("|");
        
      return new RegExp(rxSource);
    } catch(e) {
      dump("[NoScript] Illegal URIPatternList: " + s + " -- " + e + "\n");
      return null;
    }
  }
}


var PlacesPrefs = {
  save: function(prefs) {
    // http://developer.mozilla.org/en/nsINavBookmarksService
    var bmsvc = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"]
                      .getService(Components.interfaces.nsINavBookmarksService);
    const folderName = "... NoScript ...";
    const bookmarkName = folderName;
    
    var parentId = bmsvc.bookmarksMenuFolder;
    var folderId = bmsvc.getChildFolder(parentId, folderName);
    
    // bmsvc.removeItem(folderId); folderId = 0;
    
    if (folderId == 0) {
      folderId = bmsvc.createFolder(parentId, folderName, -1);
      bmsvc.setFolderReadonly(folderId, true);
    }
    
    //print(folderId);
    
    var query = "build=here&a=query";
    
    var ios = Components.classes["@mozilla.org/network/io-service;1"]
                       .getService(Components.interfaces.nsIIOService);
    var uri = ios.newURI("noscript://preferences?" + query, null, null);
    
    try {
      id = bmsvc.getIdForItemAt(folderId, 0);
    } catch(e) {
      id = 0;
    }
    if (id) {
      bmsvc.changeBookmarkURI(id, uri);
    } else {
      bmsvc.insertBookmark(folderId, uri, 0, bookmarkName);
    }
    // print(id);
  }
}

function ClearClickHandler(ns) {
  this.ns = ns; 
}
ClearClickHandler.prototype = {
  
  // TODO: use MozAfterPaint (Fx 3.1) to intercept "Sudden Reveal" attacks
  
  uiEvents: ["mousedown", "mouseup", "click", "dblclick", "keydown", "keypress", "keyup", "blur"],
  install: function(browser) {
    var ceh = browser.docShell.chromeEventHandler;
    var l = this._listener;
    for each(et in this.uiEvents) ceh.addEventListener(et, this._listener, true);
  },
  
  exceptions: null,
  
  get _listener() {
    var self = this;
    var l = function(ev) { self.handle(ev); };
    this.__defineGetter__("_listener", function() { return l; });
  },
  
  sameSiteParents: function(w) {
    const ns = this.ns;
    var site = ns.getSite(w.location.href);
    if (site == "about:blank") site = "";
    var parentSite;
    for(var p = w.parent; p != w; w = p, p = w.parent) {
      parentSite = ns.getSite(p.location.href);
      if (!site || /^(?:chrome|resource|about):/.test(parentSite)) {
        site = parentSite;
        continue;
      }
      if (site != parentSite) return false;
    }
    if (ns.consoleDump & LOG_CLEARCLICK) ns.dump("ClearClick skipping, same site parents for " + site);
    return true;
  },
  
  appliesHere: function(url) {
    const ns = this.ns;
    return ns.appliesHere(ns.clearClick, url) &&
     !(this.exceptions && this.exceptions.test(url) && ns.isJSEnabled(ns.getSite(url)));
  },
  
  _whitelist: {},
  whitelistLen: 0,
  isWhitelisted: function(w) {
    
    var l = this._whitelist[w.location.href];
    if (!l) return false;

    var pp = [];
    for(var p = w.parent; p != w; w = p, p = w.parent) {
      pp.push(p.location.href);
    }
    return l.indexOf(pp.join(" ")) > -1;
  },
  
  whitelist: function(w) {
    if (this.isWhitelisted(w)) return;
    var u = w.location.href;

    var pp = [];
    for(var p = w.parent; p != w; w = p, p = w.parent) {
      pp.push(p.location.href);
    }
    
    var l;
    if (u in this._whitelist) l = this._whitelist[u];
    else {
      l = this._whitelist[u] = [];
      this.whitelistLen++;
    }
    
    l.push(pp.join(" "));
  },
  resetWhitelist: function() {
    this._whitelist = {};
    this.whitelistLen = 0;
  },
  
  isEmbed: function(o) {
    return (o instanceof CI.nsIDOMHTMLObjectElement || o instanceof CI.nsIDOMHTMLEmbedElement) && !o.contentDocument;
  },
  
  swallowEvent: function(ev) {
    ev.cancelBubble = true;
    ev.stopPropagation();
    ev.preventDefault();
  },
  
   // the following is apparently correct and easy, but it suffers of HUGE rounding issues
  getZoomFromBrowser: function(browser) {
    try {
      return this._zoom = browser.markupDocumentViewer && browser.markupDocumentViewer.fullZoom || 1;
    } catch(e) {
      return this._zoom;
    }
  },
  
  // this one is more complex but much more precise than getZoomForBrowser()
  getZoomFromDocument: function(d) {
    var root = d.documentElement;
    var o = d.createElementNS(HTML_NS, "div");
    with(o.style) {
      top = "400000px";
      position = "absolute";
      display = "block";
    }
    root.appendChild(o);
    var oBox = d.getBoxObjectFor(o);
    var rootBox = d.getBoxObjectFor(root);
    var zoom = (oBox.screenY - rootBox.screenY) / o.offsetTop;
    root.removeChild(o);
    return this._zoom = zoom > 0 ? zoom : this._zoom;
  },
  
    
  getBox: function(o, d, w) {
    var zoom = this._zoom || 1;
    if (!d) d = o.ownerDocument;
    if (!w) w = d.defaultView;
     
    var b = d.getBoxObjectFor(o); // TODO: invent something when boxObject is missing or failing
    var c = d.getBoxObjectFor(d.documentElement);
    var p;
    var r = {
      width: b.width, height: b.height,
      screenX: b.screenX, screenY: b.screenY
    };
    
    const ns = this.ns;
    var verbose = ns.consoleDump & LOG_CLEARCLICK;
    
    r.x = (r.screenX - c.screenX) / zoom;
    r.y = (r.screenY - c.screenY) / zoom;
    
    var dx;
    // here we do our best to improve on lousy boxObject horizontal behavior when line breaks are involved
    // (it reports the width of the whole line, but x is referred to the first text node offset)
    if (o.getBoundingClientRect) { 
      c = o.getBoundingClientRect(); // bounding rect, if available, does the right thing with left position
      
      if (verbose) ns.dump("Rect: " + c.left + "," + c.top + "," + c.right + "," + c.bottom);
      
      // boxObject.x "knows" scrolling, but on clientRect.left we must accumulate scrollX until first fixed object or viewport (documentElement)
      var fixed, scrollX;
      dx = Math.round(c.left) - r.x;
      var s = w.getComputedStyle(o, '');
      dx += parseInt(s.borderLeftWidth) || 0 + parseInt(s.paddingLeft) || 0;
      for(p = o; !(fixed = s.display == "fixed"); s = w.getComputedStyle(p, '')) {
        p = p.offsetParent;
        if (p && p != d.documentElement) dx += p.scrollLeft || 0;
        else break;
      }
      if (!fixed) {
        dx += d.documentElement.scrollLeft || 0;
      }
    
    } else {
      // ugly hack for line-breaks without boundClient API
      dx = 0;
      p = b.parentBox;
      if (p) {
        var pb = d.getBoxObjectFor(p);
        if (verbose) dump("Parent: " + pb.x + "," + pb.y + "," + pb.width + "," + pb.height);
        if (b.x + r.width - pb.x - pb.width >= r.width / 2) {
          dx = -(b.x - (pb.width - r.width));
        }
      }
    }
    
    
    r.screenX += dx * zoom;
    r.x += dx;
    
   
    if (verbose) ns.dump(o + r.toSource() + " -- box: " + b.x + "," + b.y);
    return r;
  },
  
  getBG: function(w) {
    var bg = w.document.body && w.getComputedStyle(w.document.body, '').backgroundColor || "white";
    return bg == "transparent" ? w != w.parent && this.getBG(w.parent) || "white" : bg;
  },
  
  _constrain: function(box, axys, dim, max, vp, center, zoom) {
    var d;
    var scr = "screen" + axys.toUpperCase();
    // trim bounds to take in account fancy overlay borders
    var l = box[dim];
    var n = box[axys];
    
    if (vp.frame && center && l < vp[dim]) { // expand to viewport if possible
      l = vp[dim];
    }
    
    if (l > 6) {
      var bStart = Math.floor(l * .1) // 20% border
      var bEnd = bStart;
      if (bStart + n > center) {
        bStart = center - n;
      } else if (l + n - center < bEnd) {
        bEnd = l + n - center;
      } 
      box[dim] = (l -= (bStart + bEnd));
      box[axys] = (n += bStart);
      box[scr] += bStart * zoom;
      
    }

    if (l > max) {
      // resize
      if (center) {
        var halfMax = Math.round(max / 2);
        var nn = center - halfMax;
        if (nn > n && center + halfMax > n + l) nn = (n + l) - max;        
        box[axys] = nn;
        box[scr] += (nn - n) * zoom;
        n = nn;
      }
      l = box[dim] = max;
    }
    // slide into viewport
    var vpn = vp[axys];
    d = (n < vpn)
        ? vpn - n
        : (n + l) > (vpn + vp[dim])
          ? (vpn + vp[dim]) - (n + l)
          : 0;
    
    if (d) {
      n = (box[axys] += d);
      box[scr] += d * zoom;
    }

  },
  
  createCanvas: function(doc) {
    return doc.__clearClickCanvas || (doc.__clearClickCanvas = doc.createElementNS(HTML_NS, "canvas"));
  },
  
  isSupported: function(doc) {
    return "_supported" in this
      ? this._supported
      : this._supported = typeof(this.createCanvas(doc).toDataURL) == "function" && typeof(doc.getBoxObjectFor) == "function";  
  },
  
  _semanticContainers: [CI.nsIDOMHTMLParagraphElement, CI.nsIDOMHTMLQuoteElement,
                        CI.nsIDOMHTMLUListElement, CI.nsIDOMHTMLOListElement, CI.nsIDOMHTMLDirectoryElement,
                        CI.nsIDOMHTMLPreElement, CI.nsIDOMHTMLTableElement ]
  ,
  isSemanticContainer: function(o) {
    for each (t in this._semanticContainers)
     if (o instanceof t) return true;
    return false;
  },
  
  forLog: function(o) {
    return o.tagName + "/" + (o.tabIndex || 0);
  },
  
  handle: function(ev) {
    const o = ev.target;
    const d = o.ownerDocument;
    if (!(d && this.isSupported(d))) return;
    
    const w = d.defaultView;
    if (!w) return;
    
    const top = w.top;
    const ns = this.ns;
    var topURL;
    
    var isEmbed;
    
    if (top.__clearClickUnlocked || (top.__clearClickUnlocked = !this.appliesHere(top.location.href)) ||
        o.__clearClickUnlocked ||
        o != ev.originalTarget ||
        o == d.documentElement || o == d.body || // key event on empty region
        this.isSemanticContainer(o) ||
        (o.__clearClickUnlocked = !(isEmbed = this.isEmbed(o)) && // plugin embedding?
            (w == w.top || w.__clearClickUnlocked ||
              (w.__clearClickUnlocked = this.isWhitelisted(w))
              || this.sameSiteParents(w)) || // cross-site document?
        ns.getPluginExtras(o) // NS placeholder?
        )
      ) return;
    
    var p = ns.getExpando(o, "clearClickProps", {});
    var verbose = ns.consoleDump & LOG_CLEARCLICK;
    var etype = ev.type;
    if (verbose) ns.dump(o.tagName + ", " + etype + ", " + p.toSource());
    
    var ts = 0, obstructed, ctx, primaryEvent;
    try {
      if (etype == "blur") {
        if(/click|key/.test(p.lastEtype)) {
          if (verbose) ns.dump("ClearClick: resetting status on " + this.forLog(o) + " for " + etype);
          if (p.unlocked) p.unlocked = false;
        }
        return;
      }
      if (p.unlocked) return;
    
      ts = new Date().getTime();
      ctx = /mouse/.test(etype)
                && { x: ev.pageX, y: ev.pageY, debug: ev.ctrlKey && ev.button == 1 && ns.getPref("clearClick.debug") }
                || {};
      ctx.isEmbed = isEmbed;
      
      primaryEvent = /^(?:mousedown|keydown)$/.test(etype) ||
          // submit button generates a syntethic click if any text-control receives [Enter]: we must consider this "primary"
             etype == "click" && ev.screenX == 0 && ev.screenY == 0 && ev.pageX == 0 && ev.pageY == 0 && ev.clientX == 0 && ev.clientY == 0 && ev.target.form &&
            ((ctx.box = this.getBox(ev.target, d, w)).screenX * ctx.box.screenY != 0) ||
          // allow infra-document drag operations and tabulations
          etype != "blur" && top.__clearClickDoc == d && (top.__clearClickProps.unlocked || top.__clearClickProps.lastEtype == "blur");
    
      obstructed = (primaryEvent || !("obstructed" in p))
        ? p.obstructed = this.checkObstruction(o, ctx)
        : p.obstructed; // cache for non-primary events       
    } catch(e) {
      ns.dump(e.message + ": " + e.stack);
      obstructed = true;
    } finally {
      p.lastEtype = etype;
      top.__clearClickProps = p;
      top.__clearClickDoc = d;
    }
    
    var quarantine = ts - (p.ts || 0);
    
    if (verbose) ns.dump("ClearClick: " + ev.target.tagName + " " + etype +
       "(s:{" + ev.screenX + "," + ev.screenY + "}, p:{" + ev.pageX + "," + ev.pageY + "}, c:{" + ev.clientX + "," + ev.clientY + 
       ", w:" + ev.which + "}) - obstructed: " + obstructed + ", check time: " + (new Date() - ts) + ", quarantine: " + quarantine +
       ", primary: " + primaryEvent + ", ccp:" + (top.__clearClickProps && top.__clearClickProps.toSource()));
    
    var unlocked = !obstructed && primaryEvent && quarantine > 3000;
    
    if (unlocked) {
      if (verbose) ns.dump("ClearClick: unlocking " + ev.target.tagName + " " + etype);
      p.unlocked = true;
    } else {
      
      this.swallowEvent(ev);
      ns.log("[NoScript ClearClick] Swallowed event " + etype + " on " + this.forLog(o) + " at " + w.location.href, true);
      var docShell = ns.domUtils.getDocShellFromWindow(w);
      var loading = docShell && (docShell instanceof CI.nsIWebProgress) && docShell.isLoadingDocument;
      if (!loading) {
        p.ts = ts;
        if (primaryEvent && ctx.img && ns.getPref("clearClick.prompt") && !this.prompting) {
          try {
            this.prompting = true;
            var params = {
              url: isEmbed && (o.src || o.data) || o.ownerDocument.URL,
              pageURL: w.location.href,
              topURL: w.top.location.href,
              img: ctx.img,
              locked: false,
              pageX: ev.pageX,
              pageY: ev.pageY,
              zoom: this._zoom
            };
            ns.domUtils.findBrowserForNode(w).ownerDocument.defaultView.openDialog(
              "chrome://noscript/content/clearClick.xul",
              "noscriptClearClick",
              "chrome, dialog, dependent, centerscreen, modal",
              params);
            if (!params.locked) {
              w.__clearClickUnlocked = o.__clearClickUnlocked = true
              this.whitelist(w);
            }
          } finally {
            this.prompting = false;
          }
        }
      }
    }
  },
  
  findParentForm: function(o) {
    var ftype = CI.nsIDOMHTMLFormElement;
    while((o = o.parentNode)) {
      if (o instanceof ftype) return o;
    }
    return null;
  },
  
  
  zoom: function(b, z) {
    if (z == 1) return b;
    var r = {};
    for (var p in b) {
      r[p] = b[p] / z;
    }
    return r;
  },
  
  rndColor: function() {
    var c = Math.round(Math.random() * 0xffffff).toString(16);
    return "#" + ("000000".substring(c.length)) + c; 
  },
  
   
  maxWidth: 350,
  maxHeight: 200,
  minWidth: 160,
  minHeight: 100,
  _NO_SCROLLBARS: {w: 0, h: 0},
  checkObstruction: function(o, ctx) {   
    var d = o.ownerDocument;
    var dElem = d.documentElement;
    
    var w = d.defaultView;
    var top = w.top;
    var browser = DOMUtils.findBrowserForNode(top);
    
    var c = this.createCanvas(browser.ownerDocument);
    var gfx = c.getContext("2d");
    
    var bg = this.getBG(w);


    var bgStyle;
    var box, curtain;
    
    var frame, frameClass, frameStyle, objClass, viewer;
    
    var docPatcher = new DocPatcher(this.ns, o);
    
    var sheet = null;
    
    var img1 = null, img2 = null, tmpImg = null;
    
    function snapshot(w, x, y) {
      gfx.drawWindow(w, Math.round(x), Math.round(y), c.width, c.height, bg);
      return c.toDataURL();
    }
    
    function snapshots(x1, y1, x2, y2) {
      img1 = null;
      try {
        if (objClass) docPatcher.clean(true);
        img1 = snapshot(w, x1, y1);
      } catch(ex) {
        throw ex;
      } finally {
        docPatcher.clean(false);
      }
      img2 = tmpImg = snapshot(top, x2, y2);
      return (img1 != img2); 
    }
    var sd = this._NO_SCROLLBARS;

    try {
          
      var zoom = this.getZoomFromBrowser(browser);
      if (zoom != 1) zoom = this.getZoomFromDocument(d);
      
      docPatcher.linkAlertHack(true);
      
      try {
        docPatcher.opaque(true);
         
        if (ctx.isEmbed) { // objects and embeds
          if (this.ns.getPref("clearClick.plugins", true)) {
            var ds = browser.docShell;
            viewer = ds.contentViewer && false;
            objClass = new ClassyObj(o);
            objClass.append(" __noscriptBlank__");
            docPatcher.blankPositioned(true);
            docPatcher.clean(true);
          } else {
            DOMUtils.addClass(o, "__noscriptOpaqued__");
          }
        }
        
        if ((frame = w.frameElement)) {
          frameClass = new ClassyObj(frame);
          DOMUtils.removeClass(frame, "__noscriptScrolling__");
          sd = (function() {
            var fw = frame.clientWidth, fh = frame.clientHeight;
            var dw = dElem.clientWidth, dh = dElem.clientHeight;
            var w = Math.min(fw, dw), h = Math.min(fh, dh);
            var b = d.body;
            if (b) {
              var bw = b.clientWidth;
              if (bw <= fw && (bw > dw || dw > fw)) w = bw; 
              var bh = b.clientHeight;
              if (bh <= fh && (bh > dh || dh > fh)) h = bh;
            }
            
            return {w: fw - w, h: fh - h };
          })();    
        }
        
        var clientHeight = w.innerHeight - sd.h;
        var clientWidth =  w.innerWidth - sd.w;
        // print(dElem.clientWidth + "," +  dElem.clientHeight + " - "  + w.innerWidth + "," + w.innerHeight);
        
        if (!ctx.isEmbed) {
          curtain = d.createElementNS(HTML_NS, "div");
          with(curtain.style) {
            top = left = "0px";
            
            width = (clientWidth + w.scrollX) + "px";
            height = (clientHeight + w.scrollY) + "px";
  
            padding = margin = borderWidth = MozOutlineWidth = "0px";
            position = "absolute";
            zIndex = "99999999";
            
            background = this.rndColor();
          }
          frameStyle = w.parent.getComputedStyle(frame, '');
        }     
        
        if (curtain && frame) {
          dElem.appendChild(curtain);
        }
        
        var maxWidth = Math.max(Math.min(this.maxWidth, clientWidth * zoom), this.minWidth) / zoom ;
        var maxHeight = Math.max(Math.min(this.maxHeight, clientHeight * zoom), this.minHeight) / zoom;
  
        box = this.getBox(o, d, w);
        
        // expand to parent form if needed
        var form = o.form;
        var formBox = null;
        if (frame && !ctx.isEmbed && (form || (form = this.findParentForm(o)))) {
  
          formBox = this.getBox(form, d, w);
          if (!(formBox.width && formBox.height)) { // some idiots put <form> as first child of <table> :(
            formBox = this.getBox(form.offsetParent || form.parentNode, d, w);
            if (!(formBox.width && formBox.height)) {
              formBox = this.getBox(form.parentNode.offsetParent || o.offsetParent, d, w);
            }
          }
    
          if (formBox.width && formBox.height) {
            ctx.x = ctx.x || box.x + box.width;
            ctx.y = ctx.y || box.y + box.height;
            box = formBox;
            var delta;
            if (box.x < 0) {
              box.screenX -= box.x * zoom;
              box.x = 0;
            }
            if (box.y < 0) {
              box.screenY -= box.y * zoom;
              box.y = 0;
            }
            if (box.x + Math.min(box.width, maxWidth) < ctx.x) {
              box.width = Math.min(box.width, maxWidth);
              delta = ctx.x + 4 - box.width - box.x;
              box.x += delta;
              box.screenX += delta * zoom;
             
            }
            if (box.y + Math.min(box.height, maxHeight) < ctx.y) {
              box.height = Math.min(box.height, maxHeight);
              delta = ctx.y + 4 - box.height - box.y;
              box.y += delta;
              box.screenY += delta * zoom;
            }
            o = form;
          }
        }
  
        bgStyle = dElem.style.background;
        dElem.style.background = bg;
        
        // clip, slide in viewport and trim
        
        var vp = { 
          x: w.scrollX, 
          y: w.scrollY, 
          width: Math.max(w.innerWidth - sd.w, 32), 
          height: Math.max(w.innerHeight - sd.h, 32),
          frame: frame
        };

        if (ctx.isEmbed) { // check in-page vieport
          vp.frame = null;
          vp.x = Math.max(vp.x, box.x);
          vp.y = Math.max(vp.y, box.y);
          vp.width = Math.min(vp.width, box.width);
          vp.height = Math.min(vp.height, box.height);
          
          for(form = o; form = form.parentNode;) {
  
            if ((form.offsetWidth < box.width || form.offsetHeight < box.height) &&
                w.getComputedStyle(form, '').overflow != "visible") {
              
              // check if we're being fooled by some super-zoomed applet
              if (box.width / 4 <= form.offsetWidth && box.height / 4 <= form.offsetHeight) {
                formBox = this.getBox(form, d, w);
                
                if (box.x < formBox.x) {
                  box.x = formBox.x;
                  box.screenX = formBox.screenX;
                }
                if (box.y < formBox.y) { 
                  box.y = formBox.y;
                  box.screenY = formBox.screenY;
                }
                if (box.width + box.x > formBox.width + formBox.x) box.width = Math.max(this.minWidth, form.clientWidth - (box.x - formBox.x));
                if (box.height + box.y > formBox.height + formBox.y) box.height = Math.max(this.minHeight, form.offsetHeight - (box.y - formBox.y));
              }
              break;
            }
          }
        } else if (!(sd.w || sd.h)) { // no scrollbars
          if (!sd.w) {
            vp.x = 0;
            vp.width = curtain.offsetWidth;
          }
          if (!sd.h) {
            vp.y = 0;
            vp.height = curtain.offsetHeight;
          }
        }
        
        box.oX = box.x;
        box.oY = box.y;
        box.oW = box.width;
        box.oH = box.height;
        
        // print("Fitting " + box.toSource() + " in " + vp.toSource() + " - zoom: " + zoom + " - ctx " + ctx.x + ", " + ctx.y + " - max " + maxWidth + ", " + maxHeight);
  
        this._constrain(box, "x", "width", maxWidth, vp, ctx.x, zoom);
        this._constrain(box, "y", "height", maxHeight, vp, ctx.y, zoom);
        // print(box.toSource());     
        
        c.width = box.width;
        c.height = box.height;
        
        
        if (this.ns.consoleDump & LOG_CLEARCLICK) this.ns.dump("Snapshot at " + box.toSource() + " + " + w.pageXOffset + ", " + w.pageYOffset);
        
        
        
        img1 = snapshot(w, box.x, box.y);
      
      } finally {
        docPatcher.clean(false);
      }
    
      with(top.document) {
        var rootElement = documentElement;
        var rootBox = getBoxObjectFor(rootElement);
      }
      
      var offsetX = (box.screenX - rootBox.screenX) / zoom;
      var offsetY = (box.screenY - rootBox.screenY) / zoom;
      var ret = true;
      var tmpImg;
      
      const offs = ctx.isEmbed ? [0] : [0, -1, 1, -2, 2, -3, -3];

      checkImage:
      for each(var x in offs) {
        for each(var y in offs) {
          tmpImg = snapshot(top, offsetX + x * zoom, offsetY + y * zoom);
          if (img1 == tmpImg) {
            ret = false;
            break checkImage;
          }
          if (!img2) img2 = tmpImg;
        }
      }
      
      if (ret && !curtain && ctx.isEmbed) {
        curtain = d.createElementNS(HTML_NS, "div");
        if (docPatcher) curtain.className = docPatcher.shownCS;
        with(curtain.style) {
          // we expand by 1 pixel in order to avoid antialias effects on the edge at zoom != 1 (GMail Flash attachment)
          top = (o.offsetTop - 1) + "px";
          left = (o.offsetLeft -1) + "px";
          width = (o.offsetWidth +2) + "px";
          height = (o.offsetHeight +2) + "px";
          position = "absolute";
          zIndex = w.getComputedStyle(o, '').zIndex;
          background = this.rndColor();
        }
        
        if (o.nextSibling) {
          o.parentNode.insertBefore(curtain, o.nextSibling);
        } else {
          o.parentNode.appendChild(curtain);
        }
        
        ret = snapshots(box.x, box.y, offsetX, offsetY);
      }
      
      if (ret && ctx.isEmbed && ("x" in ctx) && c.width > this.minWidth && c.height > this.minHeight) {
        c.width = this.minWidth;
        c.height = this.minHeight;
        for each(x in [Math.max(ctx.x - this.minWidth, box.oX), Math.min(ctx.x, box.oX + box.oW - this.minWidth)]) {
          for each(y in [Math.max(ctx.y - this.minHeight, box.oY), Math.min(ctx.y, box.oY + box.oH - this.minHeight)]) {
            ret = snapshots(x, y, offsetX + (x - box.x), offsetY + (y - box.y));
            if (!ret) {
              offsetX += (x - box.x);
              offsetY += (y - box.y);
              box.x = x;
              box.y = y;
              break;
            }
          }
          if (!ret) break;
        }
      }
      
      if (ctx.debug) {
        ret = true;
        img2 = tmpImg;
      }
      
      if (ret) {
        
        if (curtain) {

          if (ctx.debug) {
            
            if (docPatcher.cleanSheet) {
              curtain.id = "curtain_" + DOMUtils.rndId();
              docPatcher.cleanSheet += " #" + curtain.id + " { opacity: .4 !important }";
            }
            
            curtain.style.opacity = ".4"
            
          } else {
            curtain.parentNode.removeChild(curtain);
          }
          snapshots(box.x, box.y, offsetX, offsetY);
        }
        
        ctx.img =
        {
          src: img1,
          altSrc: img2,
          width: c.width,
          height: c.height
        }
      }
    
    } finally {
      if (ctx.isEmbed) docPatcher.blankPositioned(false);
      
      
      if (curtain && curtain.parentNode) curtain.parentNode.removeChild(curtain);
      if (typeof(bgStyle) == "string") dElem.style.background = bgStyle;
     
      docPatcher.opaque(false);
      docPatcher.linkAlertHack(false);
      
      if (objClass) objClass.reset();
      if (frameClass) frameClass.reset();
      if (viewer) viewer.enableRendering = true;
    }
    
    return ret;
 
  }
  
}

function ClassyObj(o) {
  this.o = o;
  if (o.hasAttribute("class")) this.c = o.className;
}
ClassyObj.prototype = {
  o: null,
  c: null,
  append: function(newC) {
    try {
      this.o.className = this.c ? this.c + newC : newC;
    } catch(e) {}
  },
  reset: function() {
    try {
      if (this.c == null) this.o.removeAttribute("class");
      else this.o.className = this.c;
    } catch(e) {}
  }
}

function DocPatcher(ns, o) {
  this.ns = ns;
  this.o = o;
  this.shownCS = " __noscriptShown__" + DOMUtils.rndId();
}

DocPatcher.prototype = {
  
  
  collectAncestors: function(o) {
    var res = [];
    for(; o && o.hasAttribute; o = o.parentNode) res.push(new ClassyObj(o));
    return res;
  },
  
  collectPositioned: function(d) {
    var t = new Date();
    const w = d.defaultView;
    const res = [];
    var s = null, p = '', n = null;

    const obox = d.getBoxObjectFor(this.o);
    const otop = obox.y;
    const obottom = otop + obox.height;
    const oleft = obox.x;
    const oright = oleft + obox.width;
    
    var c = '', b = null;
    var hasPos = false;
    const posn = [];
    
    const tw = d.createTreeWalker(d, CI.nsIDOMNodeFilter.SHOW_ELEMENT, null, false);
    for (var n = null; (n = tw.nextNode());) {
      b = d.getBoxObjectFor(n);
      if (b.y + b.height < otop || b.y > obottom ||
          b.x + b.width < oleft || b.x > oright)
        continue;
      
      s = w.getComputedStyle(n, '');
      p = s.position;
      if (p == "absolute" || p == "fixed") {
        c = " __noscriptPositioned__";
        n.__noscriptPos = hasPos = true;
        posn.push(n);
      } else { 
        hasPos = hasPos && n.parentNode.__noscriptPos;
        if (!hasPos) continue;
        c = '';
        n.__noscriptPos = true;
        posn.push(n);
      }
      
      if (s.backgroundImage != "none" || s.backgroundColor != "transparent") {
        c += " __noscriptBlank__";
      };
      
      
      if (c) {
        res.push(n = new ClassyObj(n));
        n.append(c);
      }
    }
    
    for each(n in posn) n.__noscriptPos = false;
    
    if(this.ns.consoleDump) this.ns.dump("DocPatcher.collectPositioned(): " + (new Date() - t));
    return res;
  },
  
  collectOpaqued: function(o, oo) {
    if (!oo) oo = { opacity: 1, res: [] };
    
    var w = o.ownerDocument.defaultView;
    
    var opacity;
    var co = null;
    for(; o && o.hasAttribute; o = o.parentNode) {
      opacity = parseFloat(w.getComputedStyle(o, '').opacity);
      if (opacity < 1) {
        if ((oo.opacity *= opacity) < .3) return []; // too much combined transparency!
        oo.res.push(new ClassyObj(o));
      }
    }
       
    o = w.frameElement;
    return o ? this.collectOpaqued(o, oo) : oo.res;
  },
  
  forceVisible: function(co) {
    co.append(this.shownCS); 
  },
  
  forceOpaque: function(co) {
    co.append(" __noscriptJustOpaqued__");
  },
  
  resetClass: function(co) {
    co.reset();
  },
  
  _ancestors: null,
  _cleanSheetHandle: null,
  clean: function(toggle) {
    if (toggle) {
      if (!this._ancestors) {
        this.cleanSheet = "body * { visibility: hidden !important } body ." + this.shownCS.substring(1) + " { visibility: visible !important; opacity: 1 !important }";
        this._ancestors = this.collectAncestors(this.o);
      }
      this._ancestors.forEach(this.forceVisible, this);
      this._cleanSheetHandle = this.applySheet(this.cleanSheet);
    } else if (this._ancestors) {
      this._ancestors.forEach(this.resetClass);
      this.removeSheet(this._cleanSheetHandle);
    }
  },
  
  _positioned: null,
  _blankSheetHandle: null,
  blankSheet: ".__noscriptPositioned__ * { color: white !important; border-color: white !important; }",
  blankPositioned: function(toggle) {
    if (toggle) {
      this._positioned = this.collectPositioned(this.o.ownerDocument);
      this._blankSheetHandle = this.applySheet(this.blankSheet);
    } else if (this._positioned) {
      this._positioned.forEach(this.resetClass);
      this.removeSheet(this._blankSheetHandle);
    }
  },
  
  _opaqued: null,
  opaque: function(toggle) {
    if (toggle) {
      this._opaqued = this._opaqued || this.collectOpaqued(this.o);
      this._opaqued.forEach(this.forceOpaque);
    } else if (this._opaqued) {
      this._opaqued.forEach(this.resetClass);
    }
  },
  
  get oldStyle() {
    delete this.__proto__.oldStyle;
    return this.__proto__.oldStyle = Components.ID('{41d979dc-ea03-4235-86ff-1e3c090c5630}')
                 .equals(CI.nsIStyleSheetService);
  },
  applySheet: function(sheet) {
    var sheetHandle = null;
    if (this.oldStyle) {
      // Gecko < 1.9, asynchronous user sheets force ugly work-around
      var d = this.o.ownerDocument;
      sheetHandle = d.createElementNS(HTML_NS, "style");
      sheetHandle.innerHTML = sheet;
      d.documentElement.appendChild(sheetHandle);
    } else { // 
      this.ns.updateStyleSheet(sheetHandle = sheet, true);
    }
    return sheetHandle;
  },
  removeSheet: function(sheetHandle) {
    if (sheetHandle) {
      if (this.oldStyle) {
        this.o.ownerDocument.documentElement.removeChild(sheetHandle);
      } else {
        this.ns.updateStyleSheet(sheetHandle, false);
      }
    }
  },
  
  _linkAlertBox: null,
  linkAlertHack: function(toggle) {
    try {
      var w = this.o.ownerDocument.defaultView.top;
      var d = w.document;
      if (toggle) {
        var box = d.getElementById("linkalert-box");
        if (!box || box.style.display) return;
        var imgs = box.getElementsByTagName("img");
        if (imgs.length > 5) return;
        var img;
        for (var j = imgs.length; j-- > 0;) {
          img = imgs[j];
          if (!/^(?:chrome:\/\/linkalert\/skin\/|(?:moz\-icon|file):\/\/)/.test(img.src) || img.naturalWidth == 0 ||
            img.offsetWidth > 32 || img.offsetHeight > 32) return;
        }
        box.style.display = "none";
        this._linkAlertBox = box;
      } else {
        if (this._linkAlertBox) {
          this._linkAlertBox.style.display = "";
          this._linkAlertBox = null;
        }
      }
    } catch (e) {}
  }
}

RequestFilter = function(req, consumer) {
  this._init(req, consumer);
}

RequestFilter.prototype = {
  QueryInterface: xpcom_generateQI([CI.nsIStreamListener, CI.nsISupports]),
  
  binaryStream: null,
  stringStream: null,
  buffers: null,
  bytesCount: 0,
  
  _init: function(req, consumer) {
    if (!(CI.nsITraceableChannel && (req instanceof CI.nsITraceableChannel))) return;
    this.consumer = consumer;
    this.originalListener = req.setNewListener(this);
  },
  
  onDataAvailable: function(request, context, inputStream, offset, count) {
    if (!this.binaryStream) {
      this.binaryStream = CC["@mozilla.org/binaryinputstream;1"].createInstance(CI.nsIBinaryInputStream);
      this.binaryStream.setInputStream(inputStream);
    }   
    this.buffers.push(this.binaryStream.readBytes(count));
    this.bytesCount += count;
    this._consume(request, context);
  },
  
  _onDataAvailablePassthru: function(request, context, inputStream, offset, count) {
    this.originalListener.onDataAvailable(request, context, inputStream, 0, count);
  },
  
  _onDataAvailableNop: function(request, context, inputStream, offset, count) {
    try {
      inputStream.close();
    } catch(e) {
      dump(e + "\n");
    }
  },
  
  onStartRequest: function(request, context) {
    this.bytesCount = 0;
    if (this.consumer) {
      this.buffers = [];
    } else {
      this.onDataAvailable = this._onDataAvailableNop;
    }
    this.originalListener.onStartRequest(request, context);
  },
  onStopRequest: function(request, context, statusCode) {
    this.bis = null;
    this.originalListener.onStopRequest(request, context, this._consume(request, context, statusCode));
  },
  
  _consume: function(request, context, statusCode) {
    if (this.buffers) {
      var data = { buffers: this.buffers, count: this.bytesCount, statusCode: statusCode || 0, request: request };
      if (this.consumer.consume(data, typeof(statusCode) == "number")) {
        // filtering is done, we don't need to buffer and consume anymore
        this.buffers = null;
        var stream = this.stringStream || (
            this.stringStream = CC["@mozilla.org/io/string-input-stream;1"].
            createInstance(CI.nsIStringInputStream)
          );
        if (data.buffers) {
          this.onDataAvailable = this._onDataAvailablePassthru;
          stream.setData(data.buffers = data.buffers.join(''), data.count);
        } else {
          // consumer told us all data must be discarded
          this.onDataAvailable = this._onDataAvailableNop;
          data.count = 0;
        }
        this.originalListener.onDataAvailable(request, context, stream, 0, data.count);
      } else {
        if (data.buffers) this.buffers = data.buffers; // pointer could by changed by consumer
      }
      return data.statusCode;
    }
    return statusCode; 
  }
}

function HijackChecker(ns) {
  this.ns = ns;
}
HijackChecker.prototype = {
  consume: function(data, eos) {
    try {
      var bytes = data.buffers.join('');
      var m = bytes.match(/^[\s\0]*(\S)/);
      if (!m) return data.bytesCount > 2048; // skip whitespace up to 2KB
    
      switch(m[1]) {
        case '[':
          this.consume = this._consumeMaybeJson;
          break;
        case '<':
          this.consume = this._consumeMaybeXML;
          break;
        default:
          return true;
      }
      return this.consume(data, eos, bytes);
    } catch(e) {
      if (data.request instanceof CI.nsIChannel)
        this.ns.dump("Error checking JSON/E4X hijacking on " + data.request.URI.spec);
      this.ns.dump(e.message);
    } finally {
      if (data.buffers && data.buffers.length > 1) data.buffers = [bytes]; // compact
    }
    return true; // flush and pass through the remainders
  },
  
  _consumeMaybeJson: function(data, eos, bytes) {
    if (eos) {
      bytes = bytes || data.buffers.join('');
      try {
        // todo: take care of data.request.contentCharset
        this.ns.injectionChecker.json.decode(bytes);
        return this._neutralize(data, "JSON");
      } catch(e) {
        data.buffers = [bytes]; // compact
      }
      return true;
    }
    return false;
  },
  
  _consumeMaybeXML: function(data, eos, bytes) {
    bytes = bytes || data.buffers.join('');
    var m = bytes.match(/^[\s\0]*(\S)(.{2})/);
    if (m) { // skip comments, see http://forums.mozillazine.org/viewtopic.php?p=5488645
      return m[1] == '<' && m[2] != "!-" ? this._neutralize(data, "E4X") : true;
    }
    data.buffers = [bytes]; // compact
    return eos;
  },
  
  _neutralize: function(data, reason) {
    if (data.request instanceof CI.nsIChannel)
      this.ns.log("[NoScript] Potential cross-site " + reason + " hijacking detected and blocked ("
                + data.request.URI.spec + ")");
    data.buffers = null; // don't pass anything 
    return true;
  }
}

const ScriptSurrogate = {
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
          value = new URIPatternList(value);
        case "replacement":
          break;
        default:
          return;
      }
      
      mapping[member] = value; 
    } catch(e) {}
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
    if (scriptBlock) this.execute(document, scriptBlock);
  },
  
  execute: function(document, scriptBlock) {
    var s = document.createElementNS(HTML_NS, "script");
    s.id = "__noscriptSurrogate__" + DOMUtils.rndId();
    s.appendChild(document.createTextNode(scriptBlock +
      ";(function(){var s=document.getElementById('" + s.id + "');s.parentNode.removeChild(s);})()"));
    document.documentElement.insertBefore(s, document.documentElement.firstChild);
  }
}


var ABE = {
  
  attachToChannel: function(channel, key, requestInfo) {
    if (channel instanceof CI.nsIWritablePropertyBag2) 
      channel.setPropertyAsInterface(key, new nsISupportWrapper(requestInfo));
  },
  extractFromChannel: function(channel, key, preserve) {
    if (channel instanceof CI.nsIPropertyBag2) {
      try {
        var requestInfo = channel.getPropertyAsInterface(key, CI.nsISupports);
        if (requestInfo) {
          if(!preserve && (channel instanceof CI.nsIWritablePropertyBag)) channel.deleteProperty(key);
          return requestInfo.wrappedJSObject;
        }
      } catch(e) {}
    }
    return null;
  },
  
  
  extractInternalReferrer: function(channel) {
    if (channel instanceof CI.nsIPropertyBag2) try {
      return channel.getPropertyAsInterface("docshell.internalReferrer", CI.nsIURL);
    } catch(e) {}
    return null;
  },
  extractInternalReferrerSpec: function(channel) {
    var ref = this.extractInternalReferrer(channel);
    return ref && ref.spec || null;
  },
  
  checkFrameOpt: function(w, chan) {
    try {
      if (!w) {
        var ph = this.extractFromChannel(chan, "noscript.policyHints", true);
        w = ph[3].self || ph[3].ownerDocument.defaultView;
      }
      
      switch (chan.getResponseHeader("X-FRAME-OPTIONS").toUpperCase()) {
        case "DENY":
          return true;
        case "SAMEORIGIN":
          return chan.URI.prePath != w.top.location.href.match(/^https?:\/\/[^\/]*/i)[0];
      }
    } catch(e) {}
    return false;
  }
}
