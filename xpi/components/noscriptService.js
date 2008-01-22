/***** BEGIN LICENSE BLOCK *****

NoScript - a Firefox extension for whitelist driven safe JavaScript execution
Copyright (C) 2004-2007 Giorgio Maone - g.maone@informaction.com

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

// XPCOM Scaffolding

const CI = Components.interfaces;
const CC = Components.classes;
const STATE_START = CI.nsIWebProgressListener.STATE_START;
const STATE_DOC = CI.nsIWebProgressListener.STATE_IS_DOCUMENT;
const NS_BINDING_ABORTED = 0x804B0002;
const CP_OK = 1;
const CP_NOP = function() { return CP_OK };

const LOG_CONTENT_BLOCK = 1;
const LOG_CONTENT_CALL = 2;
const LOG_CONTENT_INTERCEPT = 4;
const LOG_CHROME_WIN = 8;
const LOG_XSS_FILTER = 16;
const LOG_INJECTION_CHECK = 32;
const LOG_LEAKS = 1024;
const LOG_SNIFF = 2048;

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
      const catman = CC['@mozilla.org/categorymanager;1'
        ].getService(CI.nsICategoryManager);
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
    const catman = CC['@mozilla.org/categorymanager;1'
        ].getService(CI.nsICategoryManager);
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
  validators: null,
  QueryInterface: xpcom_generateQI([CI.nsIObserver, CI.nsISupportsWeakReference, CI.nsISupports]),
  
  // returns false if absolute URI is not valid, undefined if it cannot be validated (i.e. no validator is found for this scheme) 
  validate: function(uriSpec) {
    if (!uriSpec) return false;
    var parts = uriSpec.split(":");
    if (parts.length < 2) return false;
    var scheme = parts.shift().toLowerCase();
    if (!scheme) return false;
    if (!this.validators) this.init();
    var validator = this.validators[scheme];
    try {
      return validator && validator.test(decodeURI(parts.join(":")));
    } catch(e) {
      return false;
    }
  },
  
  init: function() {
    this.validators = {};
    var prefs = CC["@mozilla.org/preferences-service;1"].getService(CI.nsIPrefService)
      .getBranch("noscript.urivalid.").QueryInterface(CI.nsIPrefBranch2);
    for each(var key in prefs.getChildList("", {})) {
      this.parseValidator(prefs, key);
    }
    prefs.addObserver("", this, true);
  },
  parseValidator: function(prefs, key) {
    try {
      this.validators[key] = new RegExp("^" + prefs.getCharPref(key) + "$");
    } catch(e) {
      delete this.validators[key];
    }
  },
  observe: function(prefs, topic, key) {
    this.parseValidator(prefs, key);
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
  
  function sorter(a,b) {
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
          return /about:neterror(\?|$)/.test(url) ? "about:neterror" : url;
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
    var prevSite="";
    var site;
    for (var j = sl.length; j-->0;) {
      site=sl[j];
      if ((!site) || site == prevSite) { 
        sl.splice(j, 1);
      } else {
        prevSite=site;
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
  
  findBrowser: function(chrome, win) {
    var gb = chrome.getBrowser();
    var browsers;
    if (!(gb && (browsers = gb.browsers))) return null;
    
    var browser = gb.selectedBrowser;
    if (browser.contentWindow == win) return browser;
    
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
      ctx = ctx.top;
      
      var bi = new this.createBrowserIterator(this.getChromeWindow(ctx));
      for (var b; b = bi.next();) {
        if (b.contentWindow == ctx) return b;
      }
    } catch(e) {
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
        .getInterface(CI.nsIDOMWindow);
    } catch(e) {
      return null;
    }
  },
  
  _wm: null,
  get windowMediator() {
    return this._wm || (this._wm = 
        CC['@mozilla.org/appshell/window-mediator;1']
                  .getService(CI.nsIWindowMediator));
  },
  
  _winType: null,
  perWinType: function(delegate) {
    var wm = this.windowMediator;
    var w = null;
    var aa = [].concat(arguments);
    for each(var type in ['navigator:browser', 'emusic:window']) {
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
    return this._winType 
      ? this._wm.getMostRecentWindow(this._winType)
      : this.perWinType(this.windowMediator.getMostRecentWindow, true);
  },
  get windowEnumerator() {
    return this._winType 
      ? this._wm.getZOrderDOMWindowEnumerator(this._winType, true)
      : this.perWinType(this.windowMediator.getZOrderDOMWindowEnumerator, true);
  },
  createBrowserIterator: function(initialWin) {
    return new BrowserIterator(initialWin);
  }
};

function BrowserIterator(initialWin) {
  if (!(initialWin && initialWin.getBrowser)) {
     initialWin = DOMUtils.mostRecentBrowserWindow;
  }
  this.currentWin = this.initialWin = initialWin;
  this.initPerWin();
}
BrowserIterator.prototype = {
 
  initPerWin: function() {
    var currentTB = this.currentWin && this.currentWin.getBrowser();
    if (currentTB) {
      this.browsers = currentTB.browsers;
      this.currentTab = this.mostRecentTab = currentTB && currentTB.selectedBrowser;
    } else {
      this.currentTab = null;
    }
    this.curTabIdx = 0;
  },
  next: function() {
    var ret = this.currentTab;
    if (!ret) {
      this.dispose();
      return null;
    }
    if (this.curTabIdx >= this.browsers.length) {
      if (!this.winEnum) {
        this.winEnum = DOMUtils.windowEnumerator;
      }
      if (this.winEnum.hasMoreElements()) {
        this.currentWin = this.winEnum.getNext();
        if (this.currentWin == this.initialWin) return this.next();
        this.initPerWin();
      } else {
        this.currentTab = null;
        return ret;
      }
    }
    this.currentTab = this.browsers[this.curTabIdx++];
    
    if (this.currentTab == this.mostRecentTab) this.next();
    return ret;
  },
  dispose: function() {
    if (!this.wm) return; // already disposed;
    this.initialWin = 
      this.currentWin = 
      this.browsers = 
      this.currentTab = 
      this.mostRecentTab = 
      this.winEnum = 
      this.wm = 
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
      if (++pos >= site.length || site[pos] != '/') return site == "about:" ? "about:" : "";
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
          for (match in sm) { // remove descendants
            if ((site == this.matches(match)) && site != match) {
              delete sm[match];
              change = true;
            }
          }
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





function NoscriptService() {
  this.register();
}

NoscriptService.prototype = {
  VERSION: "1.3.1",
  
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
          if ( (subject instanceof CI.nsIUpdateItem)
              && subject.id == EXTENSION_ID ) {
            if (data == "item-uninstalled" || data == "item-disabled") {
              this.uninstalling = true;
            } else if(data == "item-enabled") {
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
  
  blockCssScanning: true,
  blockCrossIntranet: true,
  blockNSWB: false,
  
  consoleDump: 0,
  truncateTitle: true,
  truncateTitleLen: 255,
  pluginPlaceholder: "chrome://noscript/skin/icon32.png",
  showPlaceholder: true,
  showUntrustedPlaceholder: true,
  collapseObject: false,
  
  forbidSomeContent: false,
  forbidAllContent: false,
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
  forbidIFramesContext: 1, // 0 = all iframes, 1 = different site, 2 = different domain, 3 = different base domain

  forbidXBL: 4,
  injectionCheck: 2,
  injectionCheckSubframes: true,
  
  jsredirectIgnore: false,
  jsredirectFollow: false,
  jsredirectForceShow: false,
  
  jsHack: null,
  jsHackRegExp: null,
  
  nselNever: false,
  nselForce: true,

  filterXGetRx: "(?:<+(?=[^<>=\\d\\. ])|[\\\\'\"\\x00-\\x07\\x09\\x0B\\x0C\\x0E-\\x1F\\x7F])",
  filterXGetUserRx: "",
  
  
  whitelistRegExp: null,
  
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
        this[name]=this.getPref(name, this[name]);
        this.forbidSomeContent = this.forbidJava || this.forbidFlash 
            || this.forbidSilverlight || this.forbidPlugins || this.forbidIFrames;
        this.forbidAllContent = this.forbidJava && this.forbidFlash 
            &&  this.forbidSilverlight && this.forbidPlugins && this.forbidIFrames;
      break;
      
      case "filterXPost":
      case "filterXGet":
      case "blockCssScanners":
      case "blockXIntranet":
      case "safeToplevel":
      case "autoAllow":
      case "contentBlocker":
      case "showPlaceholder":
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
      case "injectionCheck":
      case "jsredirectFollow":
      case "jsredirectIgnore":
      case "jsredirectForceShow":
      case "jsHack":
        this[name] = this.getPref(name, this[name]);
      break;
      case "consoleDump":
        this[name] = this.getPref(name, this[name]);
        this.injectionChecker.logEnabled = this.consoleDump & LOG_INJECTION_CHECK;
      break;
      case "global":
        this.globalJS = this.getPref(name, false);
      break;
      
      case "forbidMetaRefreshRemember":
        if (!this.getPref(name)) this.metaRefreshWhitelist = {};
      break;
      case "filterXGetRx":
      case "filterXGetUserRx":
        this.updateRxPref(name, this[name], "g");
      break;
      
      case "forbidJarDocumentsExceptions":
      case "filterXExceptions":
      case "whitelistRegExp":
      case "jsHackRegExp":
        this.updateRxPref(name, "", "", this.rxParsers.multi);
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
      case "pluginPlaceholder":
      case "nselForce":
      case "nselNever":
        
      // case "blockCssScanners":
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
      var lines = s.split(/[\n\r]+/);
      var rxx = [];
      for (var j = lines.length; j-- > 0;) {
        if (/\S/.test(lines[j])) { 
          rxx.push(new RegExp(lines[j], flags));
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
          this.caps.setCharPref(cpName,"allAccess");
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
      case "blockCssScanners":
        sheet = "a:visited { background-image: none !important }";
        break;
      case "blockNSWB": 
        sheet = "noscript, noscript * { background-image: none !important; list-style-image: none !important }";
        break;
      case "pluginPlaceholder": 
        sheet = 'a.__noscriptPlaceholder__ > div:first-child { display: block !important; -moz-outline-color: #fc0 !important; -moz-outline-style: solid !important; -moz-outline-width: 1px !important; -moz-outline-offset: -1px !important; background: #ffffe0 url("' + 
                this.pluginPlaceholder + '") no-repeat left top !important; opacity: 0.6 !important; cursor: pointer !important; margin-top: 0px !important; margin-bottom: 0px !important; }' +
                'noscript a.__noscriptPlaceholder__ { display: inline !important }';
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

    const PBI=CI.nsIPrefBranch2;
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
      "blockCssScanners", "blockCrossIntranet",
      "blockNSWB",
      "consoleDump", "contentBlocker",
      "filterXPost", "filterXGet", 
      "filterXGetRx", "filterXGetUserRx", 
      "filterXExceptions",
      "forbidChromeScripts",
      "forbidJarDocuments", "forbidJarDocumentsExceptions",
      "forbidJava", "forbidFlash", "forbidSilverlight", "forbidPlugins", 
      "forbidIFrames", "forbidIFramesContext", "forbidData",
      "forbidMetaRefresh",
      "forbidXBL",
      "global",
      "injectionCheck", "injectionCheckSubframes",
      "jsredirectIgnore", "jsredirectFollow", "jsredirectForceShow", "jsHack", "jsHackRegExp",
      "nselNever", "nselForce",
      "pluginPlaceholder", "showPlaceholder", "showUntrustedPlaceholder", "collapseObject",
      "temp", "untrusted",
      "truncateTitle", "truncateTitleLen",
      "whitelistRegExp",
      ]) {
      try {
        this.syncPrefs(this.prefs, p);
      } catch(e) {
        dump("[NoScript init error] " + e + " setting " + p + "\n");
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
    // this.sanitize2ndLevs();
    
    this.reloadWhereNeeded(); // init snapshot
    
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
            if (ph.hasUserPref(key)) ph.clearUserPref(key);
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
  isTemp: function(s) {
    return s in this.tempSites.sitesMap;
  }
,
  setTemp: function(s, b) {
    var change = b 
      ? this.tempSites.add(s) 
      : this.tempSites.remove(s, true, true); // keeps up and down, see #eraseTemp() 
    if (change) {
      this.setPref("temp", this.tempSites.sitesString);
    }
  },
  
  untrustedSites: new PolicySites(),
  isUntrusted: function(s) {
    return !!this.untrustedSites.matches(s);
  },
  setUntrusted: function(s, b) {
    var change = b ? this.untrustedSites.add(s) : this.untrustedSites.remove(s, true);
    if (change) {
      this.persistUntrusted();
    }
    return b;
  },
  persistUntrusted: function() {
    this.setPref("untrusted", this.untrustedSites.sitesString);
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
  jsPolicySites: new PolicySites(),
  isJSEnabled: function(site) {
    return (!!this.jsPolicySites.matches(site));
  },
  setJSEnabled: function(site, is, fromScratch) {
    const ps = this.jsPolicySites;
    if (fromScratch) ps.sitesString = this.permanentSites.sitesString;
    if (is) {
      ps.add(site);
      if (!fromScratch) {
        this.setUntrusted(site, false);
        this.setManual(site, false);
      }
    } else {
      ps.remove(site, false, true);
      if (this.getPref("forbidImpliesUntrust", false)) {
        this.setUntrusted(site, true);
      }
      if (this.autoAllow) {
        this.setUntrusted(site, true);
      } else {
        this.setManual(site, true);
      }
    }
    this.flushCAPS();
    return is;
  }
,
  checkShorthands: function(site, map) {
    if (this.whitelistRegExp && this.whitelistRegExp.test(site)) {
      return true;
    }
    
    map = map || this.jsPolicySites.sitesMap;
    // port matching, with "0" as port wildcard  and * as nth level host wildcard
    if (/:\d+$/.test(site)) {
      var key = site.replace(/\d+$/, "0");
      if (map[key]) return true;
      var keys = key.split(".");
      if (keys.length > 1) {
        var prefix = keys[0].match(/^https?:\/\//i)[0] + "*.";
        while (keys.length > 2) {
          keys.shift();
          if (map[prefix + keys.join(".")]) return true;
        }
      }
    }
    // check IP leftmost portion up to 2nd byte (e.g. 192.168 or 10.0.0)
    var m = site.match(/^(https?:\/\/((\d+\.\d+)\.\d+))\.\d+(?:\d|$)/);
    return m && (map[m[1]] || map[m[2]] || map[m[3]]);
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
  
  getDomain: function(site, force) {
    try {
      const url = (site instanceof CI.nsIURL) ? site : SiteUtils.ios.newURI(site, null, null);
      const host = url.host;
      return force || url.port == -1 && host[host.length - 1] != "." && 
            (host.lastIndexOf(".") > 0 || host == "localhost") ? host : null;
    } catch(e) {
      return null;
    }
  },
  
  _tldService: null,
  initTldService: function() {
      var srv = null;
      try {
        if (CI.nsIEffectiveTLDService) {
          var srv = CC["@mozilla.org/network/effective-tld-service;1"]
                  .getService(CI.nsIEffectiveTLDService);
          if (typeof(srv.getBaseDomainFromHost) == "function") {
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
    if (/^[\d\.]+$/.test(domain)) return domain; // IP
    
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
  safeCapsOp: function(callback) {
    this.delayExec(function() {
      callback();
      this.savePrefs();
      this.reloadWhereNeeded();
     }, 1);
  }
,
  _lastSnapshot: null,
  _lastGlobal: false,
  reloadWhereNeeded: function(snapshot, lastGlobal) {
    if (!snapshot) snapshot = this._lastSnapshot;
    const ps = this.jsPolicySites;
    this._lastSnapshot = ps.clone();
    const global = this.jsEnabled;
    if (typeof(lastGlobal) == "undefined") {
      lastGlobal = this._lastGlobal;
    }
    this._lastGlobal = global;
    
    this.initContentPolicy();
    
    if ((global == lastGlobal && ps.equals(snapshot)) || !snapshot) return false;
    
    if (!this.getPref("autoReload", true)) return false;
    if (global != lastGlobal && !this.getPref("autoReload.global", true)) return false; 
    const currentTabOnly = !this.getPref("autoReload.allTabs", true);
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
      docSites = this.getSites(browser, true);
      for (j = docSites.length; j-- > 0;) {
        prevStatus = lastGlobal || !!snapshot.matches(docSites[j]);
        currStatus = global || !!(ps.matches(docSites[j]) || this.checkShorthands(docSites[j]));
        if (currStatus != prevStatus) {
          ret = true;
          if (currStatus) this.requestWatchdog.setUntrustedReloadInfo(browser, true);
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
      if (currentTabOnly) break;
    }
    bi.dispose();
    bi = null;
    return ret;
  }
,
  eraseTemp: function() {
    // remove temporary PUNCTUALLY: 
    // keeps ancestors because the may be added as permanent after the temporary allow;
    // keeps descendants because they may already have been permanent before the temporary, and then shadowed
    this.jsPolicySites.remove(this.tempSites.sitesList, true, true); 
    this.setJSEnabled(this.permanentSites.sitesList, true); // add permanent & save
    this.setPref("temp", ""); // flush temporary list
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
        throw new Error("Unsupported type "+typeof(value)+" for preference "+name);
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
    var delegate = this.disabled || this.getPref("global", false) 
      ? this.noopContentPolicy
      : this.mainContentPolicy;
    this.shouldLoad = delegate.shouldLoad;
    this.shouldProcess = delegate.shouldProcess;

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
  
  browserChromeDir: CC["@mozilla.org/file/directory_service;1"].getService(CI.nsIProperties)
                       .get("AChrom", CI.nsIFile),
  chromeRegistry: CC["@mozilla.org/chrome/chrome-registry;1"].getService(CI.nsIChromeRegistry),
  checkForbiddenChrome: function(url, origin) {
    if (url.scheme == "chrome" && origin && !/^(?:chrome|resource|file|about)$/.test(origin.scheme)) {
      var packageName = url.host;
      if (packageName == "browser") return false; // fast path for commonest case
      exception = this.getPref("forbidChromeExceptions." + packageName, false);
      if (exception) return false;
      var chromeURL = this.chromeRegistry.convertChromeURL(url);
      if (chromeURL instanceof CI.nsIJARURI) 
        chromeURL = chromeURL.JARFile;
            
      if (chromeURL instanceof CI.nsIFileURL && !this.browserChromeDir.contains(chromeURL.file, true)) {
        return true;
      }
    }
    return false;
  },
  // nsIContentPolicy interface
  // we use numeric constants for performance sake: 
  // nsIContentPolicy.TYPE_OTHER = 1
  // nsIContentPolicy.TYPE_SCRIPT = 2
  // nsIContentPolicy.TYPE_IMAGE = 3
  // nsIContentPolicy.TYPE_OBJECT = 5
  // nsIContentPolicy.TYPE_DOCUMENT = 6
  // nsIContentPolicy.TYPE_SUBDOCUMENT = 7
  // nsIContentPolicy.TYPE_REFRESH = 8
  // nsIContentPolicy.TYPE_XBL = 9
  // nsIContentPolicy.TYPE_PING = 10
  // nsIContentPolicy.TYPE_XMLHTTPREQUEST = 11
  // nsIContentPolicy.TYPE_OBJECT_SUBREQUEST = 12
  // nsIContentPolicy.REJECT_SERVER = -3
  // nsIContentPolicy.ACCEPT = 1
  POLICY1_9: "TYPE_XBL" in CI.nsIContentPolicy,
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
        args[1].spec = "chrome://noscript/content/nop.xbl#nop";
        return 1;
    }
    return this.rejectCode;
  },

  mainContentPolicy: {
    shouldLoad: function(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aInternalCall) {
      
      var originURL, locationURL, originSite, locationSite, scheme,
          forbid, isJS, isJava, isFlash, isSilverlight,
          isLegacyFrame, blockThisIFrame, contentDocument;
          
      try {
        if (aContentType == 1 && !this.POLICY1_9) { // compatibility for type OTHER
          if (aContext instanceof CI.nsIDOMHTMLDocument) {
            aContentType = arguments.callee.caller ? 11 : 9;
          } else if ((aContext instanceof CI.nsIDOMHTMLElement) && aContext.getAttribute("ping")) {
            aContentType = 10;
          }
          arguments[0] = aContentType;
        }
        
        if (this.consoleDump && (this.consoleDump & LOG_CONTENT_INTERCEPT) && this.cpConsoleFilter.indexOf(aContentType) > -1) {
          this.cpDump("processing", aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aInternalCall);
        }

        this.currentPolicyURI = aContentLocation;
        this.currentPolicyHints = arguments;
        
        switch (aContentType) {
          case 9: // XBL - warning, in 1.8.x could also be XMLHttpRequest...
            if (!this.forbidXBL || aContentLocation.schemeIs("chrome") ||
               !aRequestOrigin || 
             // GreaseMonkey Ajax comes from resource: hidden window
             // Google Toolbar Ajax from about:blank
               /^(?:chrome:|resource:|about:blank)/.test(originURL = aRequestOrigin.spec) 
              ) return CP_OK;
            var win = aContext.defaultView;
            locationURL = aContentLocation.spec;
            if(win) {
              (win.__noscriptBindingSites = (win.__noscriptBindingSites || [])).push(
                this.getSite(locationURL)
              );
            }
            return this.forbiddenXBLContext(originURL, locationURL) ?
              this.reject("XBL", arguments) : 1;
          break;
          
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
            try {
              if (this.blockNSWB && (aContext instanceof CI.nsIDOMHTMLImageElement)) {
                  for (var parent = aContext; (parent = parent.parentNode);) {
                    if (parent.nodeName.toUpperCase() == "NOSCRIPT") {
                      return this.reject("Tracking Image", arguments);
                    }
                  }
                }
              } catch(e) {
                this.dump(e)
              }
            this.resetPolicyState();
            return CP_OK;

          case 5:
            if (aContentLocation && aRequestOrigin && 
                (locationURL = aContentLocation.spec) == (originURL = aRequestOrigin.spec) && 
                (aContext instanceof CI.nsIDOMHTMLEmbedElement) &&
                aMimeTypeGuess && this.pluginsCache.isForcedSomewhere(locationURL, aMimeTypeGuess)) {
              if (this.consoleDump) this.dump("Plugin document " + locationURL);
              return CP_OK; // plugin document, we'll handle it in our webprogress listener
            }
            
            if (this.checkJarDocument(aContentLocation, aContext)) 
              return this.reject("Plugin content from JAR", arguments);
            
            break;
            
          case 7:
            locationURL = aContentLocation.spec;
            if (locationURL == "about:blank" || /^chrome:/.test(locationURL)) return CP_OK;
            
            if (!aMimeTypeGuess) aMimeTypeGuess = this.guessMime(aContentLocation);
            
            isLegacyFrame = aContext instanceof CI.nsIDOMHTMLFrameElement;
            
            if(this.forbidIFrames && !isLegacyFrame) {
              try {
                contentDocument = aContext.contentDocument;
              } catch(e) {}
           
              blockThisIFrame = !(aInternalCall || 
                      /^(?:chrome|resource|wyciwyg):/.test(locationURL) ||
                      (
                        (aRequestOrigin && (originURL = aRequestOrigin.spec))
                          ? (/^chrome:/.test(originURL) ||
                            /^(?:data|javascript):/.test(locationURL) &&
                            contentDocument && originURL == contentDocument.URL)
                          : contentDocument && 
                            this.getSite(contentDocument.URL) == (locationSite = this.getSite(locationURL))
                       )
                  ) && this.forbiddenIFrameContext(originURL || (originURL = aContext.ownerDocument.URL), locationURL);
            }
          case 6:
            
            if (this.checkJarDocument(aContentLocation, aContext)) 
              return this.reject("JAR Document", arguments);
            
            scheme = aContentLocation.scheme;
            
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
                if (!this.isSafeJSURL(locationURL) &&
                  ((this.forbidData && locationURL != "javascript: eval(__firebugTemp__);" || locationURL == "javascript:") && 
                    !this.isJSEnabled(originSite = this.getSite(originURL = originURL || aRequestOrigin.spec)) ||
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
                    !this.isJSEnabled(originSite = this.getSite(originURL = originURL || aRequestOrigin.spec))) {
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
            
            if (!this.forbidSomeContent ||
               !blockThisIFrame && (
                    !aMimeTypeGuess ||
                    aMimeTypeGuess.substring(0, 5) == "text/"
                    || aMimeTypeGuess == "application/xml" 
                    || aMimeTypeGuess == "application/xhtml+xml"
                    || aMimeTypeGuess.substring(0, 6) == "image/"
                    || !this.pluginForMime(aMimeTypeGuess)
                  )
                ) 
              return CP_OK;
            
            break;
            
          default:
            return CP_OK;
        }
        
        
        
        locationURL = locationURL || aContentLocation.spec;
        locationSite = locationSite || this.getSite(locationURL);
        
        
        
        if (isJS) {
          return this.isJSEnabled(locationSite) ? CP_OK : this.reject("Script", arguments);
        }

        if (!(forbid || locationSite == "chrome:")) {
          var mimeKey = aMimeTypeGuess || "application/x-unknown"; 
          
          forbid = this.forbidAllContent || blockThisIFrame;
          if (!forbid && this.forbidSomeContent) {
            if (aMimeTypeGuess) {
              forbid = 
                (
                  (isFlash = /^application\/(?:x-shockwave-flash|futuresplash)/i.test(aMimeTypeGuess)) ||
                  (isJava = /^application\/x-java\b/i.test(aMimeTypeGuess)) || 
                  (isSilverlight = /^application\/x-silverlight\b/i.test(aMimeTypeGuess)) 
                ) &&
                isFlash && this.forbidFlash || 
                isJava && this.forbidJava || 
                isSilverlight && this.forbidSilverlight;
              if (forbid) {
                if (isSilverlight) forbid = aContentLocation != aRequestOrigin || aContext.firstChild;
              } else {
                forbid = this.forbidPlugins && !(isJava || isFlash || isSilverlight);
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
            : /^(?:javascript|data):/.test(locationURL) && originOK; // use origin for javascript: or data:
          
          forbid = !(locationOK && (originOK || !this.getPref(blockThisIFrame 
                                   ? "forbidIFramesParentTrustCheck" : "forbidActiveContentParentTrustCheck", true))
                    );
        }
        
        if(forbid) {
          try {  // moved here because of http://forums.mozillazine.org/viewtopic.php?p=3173367#3173367
            if (aContext.__NoScript_allowedContent || 
              this.pluginsCache.update(locationURL, mimeKey, locationSite, aRequestOrigin || aContentLocation, aContext)) {
              aContext.__NoScript_allowedContent = true;
              return CP_OK; // forceAllow
            }
          } catch(ex) {
            this.dump("pluginsCache.update():" + ex);
          }
         
          try {
            if(isLegacyFrame) { // inject an embed and defer to load
              this.blockLegacyFrame(aContext, aContentLocation, aInternalCall);
            } else if (aContext && (aContentType == 5 || aContentType == 7)) {
              if (aContext instanceof CI.nsIDOMNode
                 && this.pluginPlaceholder) {
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
        } else {
          // duplicated here because of http://forums.mozillazine.org/viewtopic.php?p=3173367#3173367
          this.delayExec(this.pluginsCache.update, 0, 
            locationURL, mimeKey, locationSite, aRequestOrigin || aContentLocation, aContext
          );
        }
      } catch(e) {
        return this.reject("Content (Fatal Error, " + e  + ")", arguments);
      }
      return CP_OK;
    },
    shouldProcess: function(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeType, aExtra) {
      return this.shouldLoad(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeType, true);
    },
    check: function() {
      return false;
    }
  },
  
  tagForReplacement: function(embed, pluginExtras) {
    try {
      var browser = this.domUtils.findBrowserForNode(embed);
      var pe = this.getExpando(browser, "pe") || this.setExpando(browser, "pe",  []);
      pe.push({embed: embed, pluginExtras: pluginExtras});
      try {
        this.syncUI(embed);
      } catch(noUIex) {
        if(this.consoleDump) this.dump(noUIex);
      }
    } catch(ex) {
      if(this.consoleDump) this.dump(
        "Error tagging object [" + pluginExtras.mime + " from " + pluginExtras.url + "] for replacement: " + ex);
    }
  },
  
  blockLegacyFrame: function(frame, uri, sync) {
    var verbose = this.consoleDump & LOG_CONTENT_BLOCK;
    if(verbose) {
      this.dump("Redirecting blocked legacy frame " + uri.spec);
    }
    var url = this.createPluginDocumentURL(uri);
    if(sync) {
      if(verbose) dump("Legacy frame plugin SYNC, setting to " + url + "\n");
      frame.src = url;
    } else {
      frame.ownerDocument.defaultView.addEventListener("load", function(ev) {
          if(verbose) dump("Legacy frame plugin ON PARENT LOAD, setting to " + url + "\n");
          ev.currentTarget.removeEventListener("load", arguments.callee, false);
          frame.src = url;
      }, false);
    }
  },
  
  createPluginDocumentURL: function(uri) {
    return 'data:text/html;charset=utf-8,' +
        encodeURIComponent('<html><head></head><body style="padding: 0px; margin: 0px"><embed src="' +
                  uri.spec + '" width="100%" height="100%"></embed></body></html>');
  },
  
  forbiddenIFrameContext: function(originURL, locationURL) {
    switch (this.forbidIFramesContext) {
      case 0: // all IFRAMES
        return true;
      case 3: // different 2nd level domain
        return this.getBaseDomain(this.getDomain(originURL)) != 
          this.getBaseDomain(this.getDomain(locationURL));
      case 2: // different domain
        return this.getDomain(originURL) != this.getDomain(locationURL);
      case 1: // different site
        return this.getSite(originURL) != this.getSite(locationURL);
     }
     return false;
  },
  
  forbiddenXBLContext: function(originURL, locationURL) {
    var xblSite = this.getSite(locationURL);
    var originSite = this.getSite(originURL);
    switch (this.forbidXBL) {
      case 4: // allow only trusted XBL from the same site or chrome (default)
        if (xblSite != originSite) return true;
      case 3: // allow only trusted XBL on trusted sites
        if (!xblSite) return true;
      case 2: // allow trusted and data: (Fx 3) XBL on trusted sites
        if (!this.isJSEnabled(originSite)) return true;
      case 1: // allow trusted and data: (Fx 3) XBL on any site
        if (!(this.isJSEnabled(xblSite) || /^data:/.test(xblSite))) return true;
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
      this.getPref("fixURI.exclude", "").split(/[^\w-]+/)
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
      if(overlay) overlay.syncUI(domNode.ownerDocument.defaultView.top);
    }
  },
  
  pluginsCache: {
    update: function(url, mime, origin, docURI, ctx) { // returns forceAllow for this url and mime
      var browser = DOMUtils.findBrowserForNode(ctx);
      if (browser) {
        var cache = this.get(browser);
        var uriCache = cache.uris;
        var uriSpec = docURI.spec;
        var origCache = uriCache[uriSpec] || (uriCache[uriSpec] = {});
        origCache[origin] = true;
        var forceMime = cache.forceAllow[url];
        return forceMime && forceMime == mime;
      }
      return false;
    },
    purge: function(cache, uris) {
      var uriCache = cache.uris;
      for (u in uriCache) {
        if (!uris[u]) delete uriCache[u];
      }
    },
    
    purgeURIs: function(browser) {
      this.get(browser).uris = {}; 
    },
    
    get: function(browser) {
      return browser.__noscriptPluginsCache || 
      (browser.__noscriptPluginsCache = { uris: {}, forceAllow: {} });
    },
    
    isForcedSomewhere: function(uri, mime) {
      return uri && new DOMUtils.createBrowserIterator().find(function(b) {
        var cache = b.__noscriptPluginsCache;
        return cache && cache.forceAllow[uri] && cache.forceAllow[uri] == mime;
      });
    },
    
    dispose: function(browser) {
      delete browser.__noscriptPluginsCache;
    },
  },
  
  getPluginExtras: function(obj) {
    return this.getExpando(obj, "pluginExtras");
  },
  setPluginExtras: function(obj, extras) {
    this.setExpando(obj, "pluginExtras", extras);
    if (this.consoleDump) this.dump("Setting plugin extras on " + obj + " -> " + (this.getPluginExtras(obj) == extras)
      + ", " + (extras && extras.toSource())  );
    return extras;
  },
  
  expandoMarker: {},
  getExpando: function(domObject, key) {
    return domObject && domObject.__noscriptStorage && 
           domObject.__noscriptStorage.__marker == this.expandoMarker && 
           domObject.__noscriptStorage[key] || null;
  },
  setExpando: function(domObject, key, value) {
    if (!domObject) return null;
    if (!domObject.__noscriptStorage) domObject.__noscriptStorage = { __marker: this.expandoMarker };
    domObject.__noscriptStorage[key] = value;
    return value;
  },
  
  cleanupBrowser: function(browser) {
    delete browser.__noscriptStorage;
    this.pluginsCache.dispose(browser);
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
      var hasVisibleLinks = this.hasVisibleLinks(document);
      if (!this.jsredirectForceShow && hasVisibleLinks || 
          this.isJSEnabled(this.getSite(document.documentURI))) 
        return 0;
      var j, len;
      var seen = [];
      var body = document.body;
      var cstyle = document.defaultView.getComputedStyle(body, "");
      if (cstyle.visibility != "visible") {
        body.style.visibility = "visible";
      }
      if (cstyle.display == "none") {
        body.style.display = "block";
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
      const scripts = document.getElementsByTagName("script");
      if (!scripts[0]) return 0;
      var follow = false;
      const findURL = /(?:(?:\b(?:open|replace)\s*\(|(?:\b(?:href|location|src|path|pathname|search)|(?:[Pp]ath|UR[IL]|[uU]r[il]))\s*=)\s*['"]|['"](?=https?:\/\/\w|\w*[\.\/\?]))([\?\/\.a-z][^\s'"]*)/g;
      findURL.lastIndex = 0;
      var code, m, url, a;
      var container = null;
      var window;
   
      for (j = 0, len = scripts.length; j < len; j++) {
        code = scripts[j].innerHTML;
        while ((m = findURL.exec(code))) {
          if (!container) {
             container = document.createElement("div");
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
             follow = window == window.top &&  this.jsredirectFollow &&
               !window.frames[0] &&
               !document.evaluate( "//body//text()", document, null,  CI.nsIDOMXPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
             document.body.appendChild(container);
          }
          url = m[1];
          a = document.createElement("a");
          a.href = url;
          container.appendChild(a);
          if (a.href.toLowerCase().indexOf("http") != 0 || seen.indexOf(a.href) > -1) {
             container.removeChild(a);
             continue;
          }
          seen.push(a.href);
          a.innerHTML = a.href;
          container.appendChild(document.createElement("br"));
        }
        
        if (follow && seen.length == 1) {
          this.log("[NoScript Following JS Redirection]: " + seen[0] + " FROM " + document.location.href); 
          
          this.doFollowMetaRefresh(mi = {
            baseURI: this.siteUtils.ios.newURI(document.documentURI, null, null),
            uri: seen[0],
            document: document,
            docShell: this.domUtils.getDocShellFromWindow(document.defaultView)
          });
          
        }
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
        } else {
          scriptSrc = script.getAttribute("src");
          if (!/^[a-z]+:\/\//i.test(scriptSrc)) continue;
        }
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
  
  showNextNoscriptElement: function(script, doc) { // TODO: dexpcomize!!!
    const lm = this.lookupMethod;
    const HTMLElement = CI.nsIDOMHTMLElement;
    for (var node = script; (node = lm(node, "nextSibling")());) {
      try {
        if (node instanceof HTMLElement) {
          if (new String(lm(node, "tagName")()).toUpperCase() != "NOSCRIPT") return;
          if (lm(node, "getAttribute")("class") == "noscript-show") return;
          lm(node, "setAttribute")("class", "noscript-show");
          var child = lm(node, "firstChild")();
          if (lm(child, "nodeType")() != 3) return;
          var el = lm(lm(node, "ownerDocument")(), "createElement")("span");
          el.className = "noscript-show";
          el.innerHTML = lm(child, "nodeValue")();
          lm(node, "replaceChild")(el, child);
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
    if (forceRemember || this.getPref("forbidMetaRefresh.remember", false)) {
      var document = metaRefreshInfo.document;
      this.metaRefreshWhitelist[document.documentURI] = metaRefreshInfo.uri;
    }
    var docShell = metaRefreshInfo.docShell;
    this.enableMetaRefresh(metaRefreshInfo.docShell);
    if (docShell instanceof CI.nsIRefreshURI) {
      docShell.setupRefreshURIFromHeader(metaRefreshInfo.baseURI, "0;" + metaRefreshInfo.uri);
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
  
  handleBookmark: function(url, openCallback) {
    if (!url) return true;
    const allowBookmarklets = !this.getPref("forbidBookmarklets", false);
    const allowBookmarks = this.getPref("allowBookmarks", false);
    if ((!this.jsEnabled) && 
      (allowBookmarks || allowBookmarklets)) {
      try {
        if (allowBookmarklets && url.toLowerCase().indexOf("javascript:") == 0) {
          var browserWindow = DOMUtils.mostRecentBrowserWindow;
          var browser = browserWindow.getBrowser().selectedBrowser;
          var site = this.getSite(browserWindow.content.document.documentURI);
          if (browser && !this.isJSEnabled(site)) {
            var snapshot = this.jsPolicySites.sitesString;
            try {
              this.setJSEnabled(site, true);
              if (Components.utils && typeof(/ /) == "object") { // direct evaluation, after bug 351633 landing
                var sandbox = Components.utils.Sandbox(browserWindow.content);
                sandbox.window = browserWindow.content;
                sandbox.document = sandbox.window.document;
                Components.utils.evalInSandbox(
                  "with(window) { " + decodeURIComponent(url.replace(/^javascript:/i, "")) + " }", sandbox);
              } else {
                openCallback(url);
              }
              return true;
            } finally {
              this.flushCAPS(snapshot);
            }
          }
        } else if(allowBookmarks) {
          this.setJSEnabled(this.getSite(url), true);
        }
      } catch(silentEx) {
        dump(silentEx);
      }
    }
    return false;
  },
  
  findObjectAncestor: function(embed) {
    if (embed instanceof CI.nsIDOMHTMLEmbedElement) {
      const objType = CI.nsIDOMHTMLObjectElement;
      for (var o = embed; (o = o.parentNode);) {
        if (o instanceof objType) return o;
      }
    }
    return embed;
  },
  _objectTypes: null,
  processObjectElements: function(document, sites) {
    var pluginExtras = document.defaultView.__noscriptPluginExtras || [];
    document.defaultView.__noscriptPluginExtras = pluginExtras;
    sites.pluginExtras.push(pluginExtras);
    var pp = this.showPlaceholder && this.pluginPlaceholder;
    var replacePlugins = pp && this.forbidSomeContent;
    var collapse = this.collapseObject;
    
    const types = this._objectTypes || 
          (this._objectTypes = {
            embed:  CI.nsIDOMHTMLEmbedElement, 
            applet: CI.nsIDOMHTMLAppletElement,
            iframe: CI.nsIDOMHTMLIFrameElement,
            object: CI.nsIDOMHTMLObjectElement
          });

    const htmlNS = "http://www.w3.org/1999/xhtml";
    
    var objectType;
    var count, objects, object;
    var anchor, innerDiv;
    var extras;
    var style, cssLen, cssCount, cssProp, cssDef;
    var forcedCSS, style, astyle;
    
    var replacements = null;
    
    for (var objectTag in types) {
      objects = document.getElementsByTagName(objectTag);
      objectType = types[objectTag];
      for (count = objects.length; count-- > 0;) {
        try { 
          object = objects.item(count); 
        } catch(e) { 
          if (this.consoleDump) this.dump(e);
          sites.pluginCount++;
          continue; 
        }
        if (!(object instanceof objectType) || // wrong type instantiated for this tag?!
            this.findObjectAncestor(object) != object // skip "embed" if nested into "object"
         ) continue;
         
        extras = this.getPluginExtras(object);
        
        
        if (extras) {
          
          if (!forcedCSS) {
            
            forcedCSS = ";";
           
            try {
              if (object.parentNode == document.body && !object.nextSibling) { 
                // raw plugin content
                collapse = false;
                forcedCSS = ";-moz-outline-style: none !important;";
              }
            } catch(e) {}
            
          }

          try {
            
            extras.tag = "<" + objectTag.toUpperCase() + ">";
            extras.title =  extras.tag + ", " +  
                (extras.mime ? extras.mime.replace(/^application\/(?:x-)?/, "") + "@" 
                             : "@") + extras.url;
            if ((extras.alt = object.getAttribute("alt"))) {
              extras.title += ' "' + extras.alt + '"'
            }
  
            if (replacePlugins && 
                (this.showUntrustedPlaceholder || !this.isUntrusted(this.getSite(extras.url))
                )) {
              
              innerDiv = document.createElementNS(htmlNS, "div");
              anchor = document.createElementNS(htmlNS, "a");
              
              anchor.id = object.id;
              anchor.href = extras.url;
              anchor.className = "__noscriptPlaceholder__";
              
              anchor.setAttribute("title", extras.title);
              
              with(anchor.style) {
                padding = margin = borderWidth = "0px";
                MozOutlineOffset = "-1px"; 
                display = "inline";
              }
              
              if (!collapse) {
                style = document.defaultView.getComputedStyle(object, null);
                 
                cssDef = "";
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
                innerDiv.style.minWidth = "32px";
                innerDiv.style.minHeight = "32px";
              } else {
                innerDiv.setAttribute("style", forcedCSS);
              }
              
              if(collapse || innerDiv.style.display == "none" || innerDiv.style.visibility == "hidden") {
                innerDiv.style.width = anchor.style.width = "32px";
                innerDiv.style.height = anchor.style.height = "32px";
              }
              
              innerDiv.style.display = "block";
              innerDiv.style.visibility = "visible";
              
              anchor.appendChild(innerDiv);

              anchor.addEventListener("click", this.objectClickListener.bind(this), false); 
              this.setPluginExtras(anchor, extras);
              this.setExpando(anchor, "removedPlugin", object);
              
              (replacements = replacements || []).push({object: object, placeholder: anchor, extras: extras});

              sites.pluginCount++;
            } else {
              if (collapse) object.style.display = "none";
              this.setPluginExtras(object, null);
              pluginExtras.push(extras);
            }
          } catch(objectEx) {
            dump("NoScript: " + objectEx + " processing plugin " + count + "@" + document.documentURI + "\n");
          }
        }
      }
    }
    
    sites.pluginCount += pluginExtras.length;
    if (replacements) {
      this.delayExec(this.createPlaceholders, 0, replacements, pluginExtras);
    }
  },
  
  createPlaceholders: function(replacements, pluginExtras) {
    for each(var r in replacements) {
      if (r.object.parentNode) {
        r.object.parentNode.replaceChild(r.placeholder, r.object);
        pluginExtras.push(r.extras);
      }
    }
  },
  
  objectClickListener: {
    bind: function(ns) {
      this._clickListener.ns = ns;
      return this._clickListener;
    },
    _clickListener: function(ev) {
      if (ev.button) return;
      
     
      const anchor = ev.currentTarget;
      const ns = arguments.callee.ns;
      const object = ns.getExpando(anchor, "removedPlugin");
      
      if (object) try {

        if (ev.shiftKey) {
          anchor.style.display = "none";
          return;
        }
        
        
        const extras = ns.getPluginExtras(anchor);
        const browser = ns.domUtils.findBrowserForNode(anchor);
        const cache = ns.pluginsCache.get(browser);
        if (!(extras && extras.url && extras.mime && cache)) return;
       
        ns.delayExec(ns.checkAndEnableObject, 1,
          {
            window: browser.ownerDocument.defaultView,
            extras: extras,
            cache: cache,
            anchor: anchor,
            object: object
          });
      } finally {
        ev.preventDefault();
      }
    }
  },
  
  checkAndEnableObject: function(ctx) {
    var extras = ctx.extras;
    var mime = extras.mime;
    var url = extras.url;
    if (ctx.window.noscriptUtil.confirm(
        this.getAllowObjectMessage(url, extras.tag + ", " + mime), 
        "confirmUnblock")) {
      ctx.cache.forceAllow[url] = mime;
      var doc = ctx.anchor.ownerDocument;
      if (mime == doc.contentType && 
          ctx.anchor == doc.body.firstChild && 
          ctx.anchor == doc.body.lastChild) { // stand-alone plugin
        doc.location.reload();
      } else {
        this.setExpando(ctx.anchor, "removedPlugin", null);
        this.delayExec(function() {
          var obj = ctx.object.cloneNode(true);
          obj.__NoScript_allowedContent = true;
          ctx.anchor.parentNode.replaceChild(obj, ctx.anchor);
          var pluginExtras = ctx.ownerDocument.defaultView.__noscriptPluginExtras;
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
    this._attachPluginExtras(browser);
    try {
      sites = this._enumerateSites(browser, sites);
    } catch(ex) {
      if (this.consoleDump) this.dump("Error enumerating sites: " + ex);
    }
    return sites;
  },
  
  _attachPluginExtras: function(browser) {
    try {
       var pe = this.getExpando(browser, "pe");
       if (!pe) return;
       for (var o, j = pe.length; j-- > 0;) {
         o = pe[j];
         try {
           this.setPluginExtras( this.findObjectAncestor(o.embed), o.pluginExtras);
          } catch(e1) { 
            if(this.consoleDump & LOG_CONTENT_BLOCK) 
              this.dump("Error setting plugin extras: " + 
                (o && o.pluginExtras && o.pluginExtras.url) + ", " + e1); 
          }
       }
       this.setExpando(browser, "pe", null);
    } catch(e2) {
      if(this.consoleDump & LOG_CONTENT_BLOCK) this.dump("Error attaching plugin extras: " + e2); 
    }
  },

  _enumerateSites: function(browser, sites) {

    const nsIWebNavigation = CI.nsIWebNavigation;
    const nsIDocShell = CI.nsIDocShell;
    
    const docShells = browser.docShell.getDocShellEnumerator(
        CI.nsIDocShellTreeItem.typeContent,
        browser.docShell.ENUMERATE_FORWARDS
    );
    
    var docShell, doc, docURI, url;
    
    const pluginsCache = this.pluginsCache.get(browser);
   
    var redirCache = this.getExpando(browser, "redirCache"); 
    var cache, redir;
    
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
       url = this.getSite(docURI = document.documentURI);
       if (url) {
         try {
           if (document.domain && document.domain != this.getDomain(url, true)) {
             sites.unshift(document.domain);
           }
         } catch(e) {}
         sites.push(url);
          
         cache = pluginsCache.uris[docURI];
         if (cache) {
           for (url in cache) {
              sites.push(url);
            }
          }
          
          cache = redirCache && redirCache[docURI];
          if (cache) {
            for each(redir in cache) {
              sites.push(redir.site);
            }
          }
          
          cache = document.defaultView.__noscriptBindingSites;
          if(cache) {
            sites.push.apply(sites, cache);
          }
       }
       
       if (!document.defaultView.__NoScript_contentLoaded && (!(docShell instanceof nsIWebNavigation) || docShell.isLoadingDocument))
         continue;
       
       // scripts
       this.processScriptElements(document, sites);
       
       // plugins
       this.processObjectElements(document, sites);

    }
    
   
    var j;
    for (j = sites.length; j-- > 0;) {
      url = sites[j];
      if (/:/.test(url) && !(
          /^[a-z]+:\/*[^\/\s]+/.test(url) || 
          /^(?:file|resource|chrome):/.test(url)
        )) {
        sites.splice(j, 1); // reject scheme-only URLs
      }
    }
    
    
    sites.topURL = sites[0] || '';
    return this.sortedSiteSet(sites);
  },
  
  findOverlay: function(browser) {
    return browser && browser.ownerDocument.defaultView.noscriptOverlay;
  },

  // nsIChannelEventSink implementation

  onChannelRedirect: function(oldChannel, newChannel, flags) {
    const rw = this.requestWatchdog;
    const policyHints = rw.extractFromChannel(oldChannel, "noscript.policyHints");
    if (policyHints) {
      // 0: aContentType, 1: aContentLocation, 2: aRequestOrigin, 3: aContext, 4: aMimeTypeGuess, 5: aInternalCall
      var uri = newChannel.URI;
      policyHints[1] = uri;
      
      var ctx = policyHints[3];
      
      if (!this.isJSEnabled(oldChannel.URI.spec)) policyHints[2] = oldChannel.URI;
      try {
        policyHints[4] = newChannel.contentType || oldChannel.contentType || policyHints[4];
      } catch(e) {}
      
      var type = policyHints[0];
      if(type != 6) { // not a document load? try to cache redirection for menus
        try {
          var site = this.getSite(uri.spec);
          var win = rw.findWindow(newChannel) || ctx && ((ctx instanceof CI.nsIDOMWindow) ? ctx : ctx.ownerDocument.defaultView); 
          var browser = win && rw.findBrowser(newChannel, win);
          if (browser) {
            var redirCache = this.getExpando(browser, "redirCache") || this.setExpando(browser, "redirCache", {});
            var cache = redirCache[win.document.documentURI] || (redirCache[win.document.documentURI] = []);
            cache.push({ site: site, type: type });
          } else {
            if (this.consoleDump) this.dump("Cannot find window for " + uri.spec);
          }
        } catch(e) {
          if (this.consoleDump) this.dump(e);
        }
      }
      if (this.shouldLoad.apply(this, policyHints) == CP_OK) { // accept
        rw.attachToChannel(newChannel, "noscript.policyHints", policyHints);
        this.resetPolicyState();
        return;
      }
      
      if (this.consoleDump) {
        this.dump("Blocked " + oldChannel.URI.spec + " -> " + uri.spec + " redirection of type " + type);
      }
      //throw NS_BINDING_ABORTED; // this lead to persistent "loading..." condition on some pages
      uri.spec = "data:application/x-noscript-blocked,";
      newChannel.loadFlags = newChannel.INHIBIT_CACHING | newChannel.LOAD_BYPASS_CACHE;
    }
  },
  
  currentPolicyURI:null,
  currentPolicyHints: null,
  resetPolicyState: function() {
    this.currentPolicyURI = this.currentPolicyHints = null;
  },
  // nsIWebProgressListener implementation
  onLinkIconAvailable: function(x) {}, // tabbrowser.xml bug?
  onStateChange: function(wp, req, stateFlag, status) {
    if (req instanceof CI.nsIHttpChannel) {
      if (this.currentPolicyURI == req.URI) {
        this.requestWatchdog.attachToChannel(req, "noscript.policyHints",  this.currentPolicyHints);
      }
    }
    this.resetPolicyState();
  }, 
  onLocationChange: function(wp, req, location) {
    try {
      if (req && (req instanceof CI.nsIChannel) && req.isPending()) {
        const domWindow = this.requestWatchdog.findWindow(req); 
        if (!domWindow) return;
        this.onBeforeLoad(req, domWindow);
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
      if(domWindow == domWindow.top) return;
      
      this.onBeforeLoad(req, domWindow);
    } catch(e) {
      if (this.consoleDump) this.dump(e);
    }
  },
  onBeforeLoad: function(req, domWindow) {
    const uri = req.URI;
    const rw = this.requestWatchdog;
    if (domWindow && domWindow.document && domWindow.document.characterSet == "UTF-7") {
      if ((uri.schemeIs("http") || uri.schemeIs("https")) &&
          this.getPref("utf7filter", true)) {
        if (this.neutralizeUTF7(domWindow)) {
          req.cancel(NS_BINDING_ABORTED);
          return;
        }
      }
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
        overlay.initContentWindow(domWindow);
        overlay.setMetaRefreshInfo(null, browser);
        xssInfo = rw.extractFromChannel(req, "noscript.XSS");
        if (xssInfo) xssInfo.browser = browser;
        rw.unsafeReload(browser, false);
      }
    }
    
   
    if (this.shouldLoad(7, uri, uri, domWindow, req.contentType, true) != CP_OK) {
      req.cancel(NS_BINDING_ABORTED);
      if (this.consoleDump) {
        this.dump("Aborting plugin document");
      }
      
      if(!topWin) {
        // defer separate embed processing for frames
        domWindow.location.href = this.createPluginDocumentURL(uri);
        return;
      }
      
      var embeds = domWindow.document.getElementsByTagName("embed");
      
     
      var eType = "application/x-noscript-blocked";
      var eURL = "data:" + eType + ",";
      var e;
      for (var j = embeds.length; j-- > 0;) {
        e = embeds.item(j);
        if (this.shouldLoad(5, uri, null, e, req.contentType, true) != CP_OK) {
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
    
    
    if(this.jsHackRegExp && this.jsHack && this.jsHackRegExp.test(uri.spec)) {
      try {
        domWindow.location.href = encodeURI("javascript:try { " + this.jsHack + " } catch(e) {}  void(0)");
      } catch(jsHackEx) {}
    }
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
            uri: uri.spec,
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
    container = rootNode.insertBefore(doc.createElement("div"), rootNode.firstChild || null);
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
    var description = container.appendChild(doc.createElement("pre"));
    description.appendChild(doc.createTextNode(message));
    description.innerHTML = description.innerHTML
    .replace(/\b(http:\/\/noscript.net\/faq#jar)\b/g, 
              '<a href="$1" title="NoScript JAR FAQ">$1</a>'); 
  },
  // end nsIWebProgressListener
  
  neutralizeUTF7: function(window, altCharset) {

    var ds = this.domUtils.getDocShellFromWindow(window);
    var as = CC["@mozilla.org/atom-service;1"].getService(CI.nsIAtomService);
    ds.documentCharsetInfo.forcedCharset = as.getAtom(altCharset || "UTF-8");
    ds.stop(ds.STOP_ALL);
    ds.reload(ds.LOAD_FLAGS_CHARSET_CHANGE);
   
    return true;
  },
  
  processBrowserClick: function(a) {
    if (this.jsEnabled || !this.getPref("fixLinks", true)) return;
    var doc = a.ownerDocument;
    if (!doc) return;
    
    var url = doc.documentURI;
    if ((!url) || this.isJSEnabled(this.getSite(url))) return;
    
    
    while (!(a instanceof CI.nsIDOMHTMLAnchorElement || a instanceof CI.nsIDOMHTMLAreaElement)) {
      if (!(a = a.parentNode)) return;
    }
    
    const href = a.getAttribute("href");
    // fix JavaScript links
    var jsURL;
    if (href) {
      jsURL = /^javascript:/.test(href);
      if (!(jsURL || href == "#")) return;
    } else {
      jsURL = false;
    }
    
    var onclick = a.getAttribute("onclick");
    var fixedHref = fixedHref = (onclick && this.extractJSLink(onclick)) || 
                     (jsURL && this.extractJSLink(href)) || "";
    
    if (fixedHref) {
      a.setAttribute("href", fixedHref);
      var title = a.getAttribute("title");
      a.setAttribute("title", title ? "[js] " + title : 
          (onclick || "") + " " + href
        );
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
  

  log: function(msg) {
    var consoleService = CC["@mozilla.org/consoleservice;1"]
                                 .getService(CI.nsIConsoleService);
    consoleService.logStringMessage(msg);
  },
  
 
  dump: function(msg) {
    dump("[NoScript] " + msg + "\n");
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
  this.LOAD_DOCUMENT_URI = CI.nsIChannel.LOAD_DOCUMENT_URI;
}

RequestWatchdog.prototype = {
  ns: null,
  dns: null,
  callback: null,
  externalLoad: null,
  noscriptReload: null,
  LOAD_DOCUMENT_URI: CI.nsIChannel.LOAD_DOCUMENT_URI,
  
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
    if (!((subject instanceof CI.nsIHttpChannel) && (subject.loadFlags & this.LOAD_DOCUMENT_URI))) return;
    switch(topic) {
      case "http-on-modify-request":
        try {
          this.filterXSS(subject);
        } catch(e) {
          this.abort({ channel: subject, reason: e.message, silent: true });
        }
        break;
      case "http-on-examine-response":
        this.ns.onContentSniffed(subject);
      break;
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
      
    if (/[^\w\-\s]/.test(originalAttempt)) {
      window.name = originalAttempt.replace(/[^\w\-\s]/g, " ");
    }
    if (originalAttempt.length > 11) {
      try {
        if ((originalAttempt.length % 4 == 0)) { 
          var bin = window.atob(window.name);
          if(/[=\(\)\[\]\.\\]/.test(bin) && InjectionChecker.syntax.check(bin)) {
            window.name = "BASE_64_XSS";
          }
        }
      } catch(e) {} 
      if (window.name.length > 19) {
        window.name = window.name.substring(0, 19);
      }
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
        || this.extractInternalReferrerSpec(channel) || null;

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
    originSite = originSite || su.getSite(origin);
    
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
    
    if(!globalJS) {
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
      if(!targetSite) {
        targetSite = su.getSite(originalSpec);
        if(!ns.isJSEnabled(targetSite)) {
          if (ns.checkShorthands(targetSite)) {
            // check wildcards
            // http://url:0 matches all port except defaults
             ns.autoTemp(targetSite);
          } else { 
            if (ns.consoleDump) this.dump(channel, "Destination " + originalSpec + " is noscripted, SKIP");
            return;
          }
        }
      }
    }
     // fast return if nothing to do here
    if (!(ns.filterXPost || ns.filterXGet)) return; 
    
    if(!targetSite) targetSite = su.getSite(originalSpec);
    
    // noscript.injectionCheck about:config option adds first-line 
    // detection for XSS injections in GET requests originated by 
    // whitelisted sites and landing on top level windows. Value can be:
    // 0 - never check
    // 1 - check cross-site requests from temporary allowed sites
    // 2 - check every cross-site request (default)
    // 3 - check every request
    
    var injectionCheck = ns.injectionCheck;
    
    if (originSite == targetSite && 
       (injectionCheck < 3 || channel.requestMethod != "GET") 
      ) return; // same origin, fast return
    
    if (this.callback && this.callback(channel, origin)) return;
    
    
    var externalLoad = this.externalLoad && this.externalLoad == originalSpec;
    if (externalLoad) {
      this.externalLoad = null;
    } else if(this.isUnsafeReload(browser = browser || this.findBrowser(channel))) {
      if (ns.consoleDump) this.dump(channel, "UNSAFE RELOAD of [" + originalSpec +"] from [" + origin + "], SKIP");
      return;
    }
    
    
    
    
    if (ns.filterXExceptions) {
      try {
        if (ns.filterXExceptions.test(decodeURI(originalSpec))) { 
          // "safe" xss target exception
          if (ns.consoleDump) this.dump(channel, "Safe target according to filterXExceptions: " + ns.filterXExceptions.toString());
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
    window = window || this.findWindow(channel);
    
    // neutralize window.name-based attack
    if (window && window.name) {
      this.checkWindowName(window);
    }
   
    if (globalJS || ns.isJSEnabled(originSite)) {
      this.resetUntrustedReloadInfo(browser = browser || this.findBrowser(channel, window), channel);
      
      
      injectionAttempt = injectionCheck && (injectionCheck > 1 || ns.isTemp(originSite)) &&
        (!window || ns.injectionCheckSubframes || window == window.top) &&
        ns.injectionChecker.checkURL(originalSpec);
      
      if (injectionAttempt) {
        if (ns.consoleDump) this.dump(channel, "Detected injection attempt at level " + injectionCheck);
      } else {
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
    if (ns.filterXPost && (channel instanceof CI.nsIUploadChannel) && channel.uploadStream
      && !injectionAttempt // this will rule out the possibility we strip trusted to trusted uploads
      ) {
      channel.requestMethod = "GET";
 
      requestInfo.unsafeRequest.postData = channel.uploadStream;
      channel.uploadStream = null;
      this.notify(this.addXssInfo(requestInfo, {
        reason: "filterXPost",
        originalAttempt: originalSpec,
        silent: untrustedReload
      }));
    }
    
    if (ns.filterXGet && ns.filterXGetRx) {
      var changes = null;
      var xsan = new XSanitizer(ns.filterXGetRx, ns.filterXGetUserRx);
      // sanitize referrer
      if (channel.referrer && channel.referrer.spec) {
        originalAttempt = channel.referrer.spec;
        xsan.brutal = true;
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
                     decodeURI(originalAttempt) != decodeURI(channel.referrer.spec) 
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
      changes = xsan.sanitizeURL(url);
      if (changes.minor) {
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
      this.attachToChannel(requestInfo.channel, "noscript.XSS", requestInfo);
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
  
  findWindow: function(channel) {
    try {
      return channel.notificationCallbacks.QueryInterface(
        CI.nsIInterfaceRequestor).getInterface(
        CI.nsIDOMWindow);
    } catch(e) {
      return null;
    }
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
  _htmlNode: null,

 
  get htmlNode() {
    return this._htmlNode || (this._htmlNode =
      (function() {
        try {
          // we need a loose HTML node, only way to get it today seems using hidden window
          var as = CC["@mozilla.org/appshell/appShellService;1"].getService(CI.nsIAppShellService);
          as.hiddenDOMWindow.addEventListener("unload", function(ev) {
            ev.currentTarget.removeEventListener("unload", arguments.callee, false);
            Entities._htmlNode = null;
            doc = null;
            // dump("*** Free Entities._htmlNode ***\n");
          }, false);
          return as.hiddenDOMWindow.document.createElement("body");
        } catch(e) {
          dump("[NoSript Entities]: Cannot grab an HTML node, falling back to XHTML... " + e + "\n");
          return CC["@mozilla.org/xul/xul-document;1"]
            .createInstance(CI.nsIDOMDocument)
            .createElementNS("http://www.w3.org/1999/xhtml", "body")
        }
      })()
      );
  },
  convert: function(e) {
    try {
      this.htmlNode.innerHTML = e;
      return this.htmlNode.firstChild.nodeValue;
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

var InjectionChecker = {
  syntax: new SyntaxChecker(),
  _log: function(msg, t) {
    if (t) msg += " - TIME: " + (new Date().getTime() - t);
    this.dump("[NoScript InjectionChecker] " + msg + "\n");
  },
  dump: dump,
  log: function() {},
  get logEnabled() { return this.log == this._log; },
  set logEnabled(v) { this.log = v ? this._log : function() {}; },
  
  checkJSSyntax: function(s) {
    if (this.syntax.check(s + "/**/")) {
      this.log("Valid fragment " + s);
      return true;
    }
    return false;
  },
  
  _breakStops: null,
  get breakStops() {
    if (this._breakStops) return this._breakStops;
    var def = "\\/\\?&#;\n\r";
    var bs = {
      nq: new RegExp("[" + def + "]")
    };
    Array.forEach("'\"", function(c) { bs[c] = new RegExp("[" + def + c + "]"); });
    return this._breakStops = bs;
  },
  
  reduceBackSlashes: function(bs) {
    return bs.length % 2 ? "" : "\\";
  },
  reduceQuotes: function(s) {
    if(!/['"]/.test(s)) return s;
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
  maybeJS: function(expr) {
    if(/^[^\(\)="']+=[^\(\)='"]+$/.test(expr) && // commonest case, single assignment, no break
      !/document|location|setter|\/.*\/[\s\S]*source/.test(expr)) return false;
    return /(?:[\w$\u0080-\uFFFF\]][\s\S]*[\(\[\.][\s\S]*(?:\([\s\S]*\)|=)|\b(?:eval|open|alert|confirm|prompt)[\s\S]*\(|\b(?:setter|location)[\s\S]*=)/
      .test(expr); 
  },
  checkLastFunction: function() {
    return this.syntax.lastFunction && 
      this.maybeJS(
        this.syntax.lastFunction.toSource()
        .replace(/[^\{]*?\{\s*([\s\S]*)\s*\}\s*/, "$1")
      );
  },
  checkJSBreak: function(s) {
    // Direct script injection breaking JS string literals or comments
    if (!this.maybeJS(s)) return false;
    
    s = s.replace(/\%\d+[a-z]\w*/gi, '`'); // cleanup most urlencoded noise
    
    const findInjection = 
      /(['"\n\r#\]\)]|[\/\?=&](?![\?=&])|\*\/)(?=([\s\S]*?(?:\([\s\S]*?\)|\[[\s\S]*?\]|(?:setter|location|\.[\w\$\u0080-\uFFFF])[^&]*=[\s\S]*?[\w\$\u0080-\uFFFF\.\[\]\-]+)))/g;
    
    findInjection.lastIndex = 0;
    var breakSeq, subj, expr, lastExpr, quote, len, bs, bsPos, hunt, moved, script, errmsg;
    
    const MAX_TIME = 800, MAX_LOOPS = 400;

    const t = new Date().getTime();
    for (var m, iterations = 0; m = findInjection.exec(s);) {
      breakSeq = m[1];
      expr = m[2];
      subj = s.substring(findInjection.lastIndex);

      // quickly skip innocuous CGI patterns
      if ((m = subj.match(/^(?:(?:[\w\s\-\/&:]+=[\w\s\-\/:]+(?:&|$))+|\w+:\/\/\w[\w\-\.]*)/))) {
        findInjection.lastIndex += m[0].length - 1;
        continue;
      }
      
      
      quote = breakSeq == '"' || breakSeq == "'" ? breakSeq : '';
      bs = this.breakStops[quote || 'nq']  

      len = expr.length;
      
      for (moved = false, hunt = !!expr, lastExpr = null; hunt;) {
        
        if (new Date().getTime() - t > MAX_TIME) {
          this.log("Too long execution time! Assuming DOS... " + s);
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
           this.log("SKIP (head syntax) " + script);
           break; // unrepairable syntax error in the head move left cursor forward 
        }
        
        if (this.maybeJS(this.reduceQuotes(expr))) {

          if (this.checkJSSyntax(script) && this.checkLastFunction()) {
            this.log("JS Break Injection detected", t);
            return true;
          }
          if (++iterations > MAX_LOOPS) {
            this.log("Too many syntax checks! Assuming DOS... " + s, t);
            return true;
          }
          if(this.syntax.lastError) { // could be null if we're here thanks to checkLastFunction()
            errmsg = this.syntax.lastError.message;
            this.log(iterations + ": " + errmsg + "\n" + script + "\n---------------");
            if (/left-hand|invalid flag after regular expression|missing ; before statement|invalid label/.test(errmsg)) {
              break; // unrepairable syntax error (wrong assignment to a left-hand expression), move left cursor forward 
            } else if((m = errmsg.match(/\bmissing ([:\]\)]) /))) {
              len = subj.indexOf(m[1], len);
              if (len > -1) {
                expr = subj.substring(0, ++len);
                moved = m[1] != ':';
              } else break;
            } else if(/unterminated string literal/.test(errmsg)) {
              bsPos = subj.substring(len).search(/["']/);
              if(bsPos > -1) {
                 expr = subj.substring(0, len += bsPos + 1);
                 moved = true;
              } else break;
            }
          }
        }
      }
    }
    this.log(s, t);
    return false;
  },
    
  checkJSStunt: function(s) {
    // check noisy comments first
    if (/(?:\/\*[\s\S]*\*\/|[^:]\/\/.*[\r\n])/.test(s)) { 
      this.log("JS comments in " + s);
      return true; 
    }
    
    // Unicode ASCII escapes, no reason for this unless you're cheating!!!
    if(/\\u00[0-7][0-9a-f]/i.test(s)) {
      this.log("Unicode-escaped ASCII, why would you?");
      return true;
    }
    
    // simplest navigation acts (no dots, no round/square brackets) that we purposedly let slip from checkJSBreak 
    if (/\blocation\s*=\s*name\b/.test(s)) { 
      this.log("location = name navigation attempt in " +s);
      return true;
    };
    if (/[\w\$\u0080-\uFFFF\]][\s\)]*setter\s*=/.test(s)) {
      this.log("setter override attempt in " +s);
      return true;
    }
    // check well known and semi-obfuscated -- as in [...]() -- function calls
    var m = s.match(/\b(open|eval|[fF]unction|with|\[[^\]]*\w[^\]]*\]|split|replace|toString|substr(?:ing)?|Image|fromCharCode|toLowerCase|unescape|decodeURI(?:Component)?|atob|btoa|\${1,2})\s*\([\s\S]*\)/);
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
  
  checkJS: function(s, ignoreEntities) {
    if (this.checkAttributes(s) || this.checkJSStunt(s) || this.checkJSBreak(s)) return true;
    if (ignoreEntities) return false;
    var converted = Entities.convertAll(s);
    return (converted != s) && this.checkJS(converted, true);
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
  attributesChecker: new RegExp(
      "\\W(?:javascript|data):|@" + 
      ("import|-moz-binding:url".replace(/[a-z\-:]/g, "\\W*$&")), 
      "gi"),
  checkAttributes: function(s) {
    return this.attributesChecker.test(s) ||
        /\\/.test(s) && this.attributesChecker.test(this.unescapeCSS(s));
  },
  
  HTMLChecker: new RegExp("<\\W*/?(?:" + 
    ("script|form|style|link|object|embed|applet|iframe|frame|base|body|meta|img|svg|video"
        .replace(/[a-z]/g, "\\W*$&")) + 
    ")|[/'\"\\s\\x08]\\W*(?:FSCommand|on[a-z]{3,}[\\s\\x08]*=)", 
    "gi"),
  checkHTML: function(s, ignorEntities) {
    return this.HTMLChecker.test(s);
  },
  
  checkURL: function(url, depth) {

    // iterate escaping until there's no more to escape
    var currentURL = url, prevURL = null;
    // let's assume protocol and host are safe
    currentURL = currentURL.replace(/^[a-z]+:\/\/.*?(?=\/|$)/, "");
    for (depth = depth || 2; depth-- > 0 && currentURL != prevURL;) {
      try {
        if (this.checkHTML(currentURL) || this.checkJS(currentURL)) return true;
        prevURL = currentURL;
        try {
          currentURL = decodeURIComponent(currentURL);
        } catch(warn) {
          this.log("Problem decoding " + currentURL + " (" + url + "), maybe not an UTF-8 encoding? " + warn.message);
          currentURL = unescape(currentURL);
        }
      } catch(ex) {
        this.log("Error checking " + currentURL + " (" + url + ")" + ex.message);
        return true;
      }
    }
    return false;
  },
  
  test: function(url) {
    
    t = new Date().getTime();
    this.checkURL(url);
    this.dump("********** " + (new Date().getTime() - t) + " **********");
  },
  testSamples: function() {
    for each(u in [
      "http://pagead2.googlesyndication.com/cpa/ads?client=ca-pub-1563315177023518&cpa_choice=CAAQwLOkgwIaCEjO5OMYO7UfKMi84IEB&oe=UTF-8&dt=1183686874437&lmt=1183686871&prev_fmts=120x60_as_rimg&format=120x60_as_rimg&output=html&correlator=1183686872530&url=http%3A%2F%2Facme.com%2Fforum&region=_google_cpa_region_&ref=http%3A%2F%2Facme.com%2Fgetit&cc=100&flash=9&u_h=1200&u_w=1920&u_ah=1170&u_aw=1920&u_cd=32&u_tz=120&u_his=6&u_java=true&u_nplug=32&u_nmime=118"
      ,
      "http://ha.ckers.org/xss.swf?a=0:0;a/**/setter=eval;b/**/setter=atob;a=b=name;",
      "http://ha.ckers.org/xss.swf?a=0:0;a setter=eval;b setter=atob;a=b=name;",
      "http://demo.php-ids.org/?test=_%3Deval%2C__%3Dunescape%2C___%3Dlocation%2C_%28__%28___%29%29#%0aalert(%22xss%22%29",
      "http://demo.php-ids.org/?test=',a%3D0%7C%7C'ev'%2B'al'%2Cb%3D0%7C%7Clocation.hash%2Cc%3D0%7C%7C'sub'%2B'str'%2C1%5Ba%5D(b%5Bc%5D(1))+'#alert('xss')",
      "http://some.wiki.com/wiki.media/Heroes(Comics)"
      ]) this.test(unescape(u));
  }
};



function XSanitizer(primaryBlacklist, extraBlacklist) {
  this.primaryBlacklist = primaryBlacklist;
  this.extraBlacklist = extraBlacklist;
  this.injectionChecker = InjectionChecker;
}

XSanitizer.prototype = {
  brutal: false,
  sanitizeURL: function(url) {
    var original = url.clone();
    this.brutal = this.brutal || this.injectionChecker.checkURL(url.spec);
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
      if (url.query) url.query = this.sanitizeQuery(url.query, changes);
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
  
  
  sanitizeQuery: function(query, changes, sep) {
    // replace every character matching noscript.filterXGetRx with a single ASCII space (0x20)
    changes = changes || {};
    if (!sep) {
      sep = query.indexOf("&") > -1 ? "&" : ";" 
    }
    const parms = query.split(sep);
    var j, pieces, k, pz, origPz, encodedPz, nestedURI, qpos, apos;
    
    for (j = parms.length; j-- > 0;) {
      pieces = parms[j].split("=");
      try {
        for (k = pieces.length; k-- > 0;) {
          origPz = pz = decodeURIComponent(encodedPz = pieces[k]);
          nestedURI = null;
          if (/^https?:\/\//i.test(pz)) {
            // try to sanitize as a nested URL
            try {
              nestedURI = SiteUtils.ios.newURI(pz, null, null).QueryInterface(CI.nsIURL);
              changes.qs = changes.qs || this.sanitizeURL(nestedURI).major;
              pz = nestedURI.spec;
            } catch(e) {
              nestedURI = null;
            }
          }
          
          if (!nestedURI) {
            qpos = pz.indexOf("?");
            spos = pz.search(/[&;]/);
            if (qpos > -1 && spos > qpos) { 
              // recursive query string?
              if (qpos > -1 && spos > qpos) {
                // recursively sanitize it as a whole qs
                pz = this.sanitizeQuery(pz, changes);
              } else {
                // split, sanitize and rejoin
                pz = [ this.sanitize(pz.substring(0, qpos)), 
                       this.sanitizeQuery(pz.substring(qpos + 1), changes)
                     ].join("?")
              }
            } else {
              pz = this.sanitize(pz);
            }
            if (origPz != pz) changes.qs = true;
          }
          
          pieces[k] = encodedPz.indexOf("+") > - 1 ? escape(pz) : encodeURIComponent(pz);
        }
        parms[j] = pieces.join("=");
      } catch(e) { 
        // decoding exception, skip this param
        parms.splice(j, 1);
      }
    }
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
    
    s = s.replace(/javascript\s*:+|data\s*:+|-moz-binding|@import/ig, function(m) { return m.replace(/\W/g, " "); });
    
    if (this.extraBlacklist) { // additional user-defined blacklist for emergencies
      s = s.replace(this.extraBlacklist, " "); 
    }
    
    if (this.brutal) { // injection checks were positive
      s = s.replace(/['\(\)\=]/g, " ").replace(/(?:setter|eval|location|open|document\W*[\[\.])\b/g, String.toUpperCase);
    }
    
    return s == orig ? unsanitized : s;
  }
};


