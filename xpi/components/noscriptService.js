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
CI.nsIWebProgressListener
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
  for(var j = iids.length; j-- > 0;) {
    lines.push("if(CI." + iids[j].name + ".equals(iid)) return this;");
  }
  lines.push("throw Components.results.NS_ERROR_NO_INTERFACE;");
  return new Function("iid", lines.join("\n"));
}


function xpcom_checkInterfaces(iid,iids,ex) {
  for(var j = iids.length; j-- >0;) {
    if(iid.equals(iids[j])) return true;
  }
  throw ex;
}

var Module = {
  firstTime: true,
  registerSelf: function (compMgr, fileSpec, location, type) {
    if(this.firstTime) {
      compMgr.QueryInterface(CI.nsIComponentRegistrar
        ).registerFactoryLocation(SERVICE_CID,
        SERVICE_NAME,
        SERVICE_CTRID, 
        fileSpec,
        location, 
        type);
      const catman = CC['@mozilla.org/categorymanager;1'
        ].getService(CI.nsICategoryManager);
      for(var j=0, len=SERVICE_CATS.length; j<len; j++) {
        catman.addCategoryEntry(SERVICE_CATS[j],
          //SERVICE_NAME, "service," + SERVICE_CTRID, 
          SERVICE_CTRID, SERVICE_CTRID, true, true);
      }
      this.firstTime=false;
    }
  },
  
  unregisterSelf: function(compMgr, fileSpec, location) {
    compMgr.QueryInterface(CI.nsIComponentRegistrar
      ).unregisterFactoryLocation(SERVICE_CID, fileSpec);
    const catman = CC['@mozilla.org/categorymanager;1'
        ].getService(CI.nsICategoryManager);
    for(var j = 0, len=SERVICE_CATS.length; j<len; j++) {
      catman.deleteCategoryEntry(SERVICE_CATS[j], SERVICE_CTRID, true);
    }
  },

  getClassObject: function (compMgr, cid, iid) {
    if(cid.equals(SERVICE_CID))
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
    if(!uriSpec) return false;
    var parts = uriSpec.split(":");
    if(parts.length < 2) return false;
    var scheme = parts.shift().toLowerCase();
    if(!scheme) return false;
    if(!this.validators) this.init();
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
    if(!sep) sep = ' ';
    
    function wrapPara(p) {
    if(!length) length = 80;
    if(p.length <= length) return p;
    chunks = [];
    var pos;
    while(p.length > length) {
      pos = p.lastIndexOf(sep, length);
      if(pos < 0) pos = p.indexOf(sep, length);
      if(pos < 0) break;
      chunks.push(p.substring(0, pos));
      p = p.substring(pos + 1);
    }

    if(chunks.length) {
      res  = chunks.join("\n");
      if(p.length) res += "\n" + p;
      return res;
    } else return p;
  }
  if(typeof(s) != "string") s = s.toString();
  var paras = s.split(/\n/);
  
  for(var j = 0; j < paras.length; j++) paras[j] = wrapPara(paras[j]);
  return paras.join("\n");
}

Strings.prototype = {
  bundles: {},
  getBundle: function(path) {
    if(path in this.bundles) return this.bundles[path];
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
    if(a == b) return 0;
    if(!a) return 1;
    if(!b) return -1;
    const dp = _domainPattern;
    return dp.test(a) ?
        (dp.test(b) ? (a < b ? -1 : 1) : -1)
      : (dp.test(b) ? 1 : a < b ? -1 : 1);
  }
  
  this.sort = function(ss) {
    return ss.sort(sorter);
  };
  
  this.getSite = function(url) {
    if(!url || 
        url.charCodeAt(0) < 33  && // needs trimming
        !(url = url.replace(/^\s*(.*?)\s*$/, '$1'))) {
      return "";
    }
    
    if(url.indexOf(":") == -1) {
      return this.domainMatch(url);
    }
    
    var scheme;
    try {
      scheme = this.ios.extractScheme(url).toLowerCase();
      switch(scheme) {
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
      if(url == scheme) return url;
    } catch(ex) {
      return this.domainMatch(url);
    }
    try {
      // let's unwrap JAR uris
      var uri = _uriFixup.createExposableURI(_ios.newURI(url, null, null));
      if(uri instanceof CI.nsIJARURI) {
        uri = uri.JARFile;
        return uri ? this.getSite(uri.spec) : scheme;
      }
      try  {
        return scheme + "//" + uri.hostPort;
      } catch(exNoHostPort) {
        return scheme;
      }
    } catch(ex) {
      return "";
    }
  };
  
  this.list2set = function(sl) {
    // kill duplicates
    var prevSite="";
    var site;
    for(var j = sl.length; j-->0;) {
      site=sl[j];
      if((!site) || site == prevSite) { 
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
    for(var j = sl.length; j-- > 0; ) {
      sl[j] = this.getSite(sl[j]);
    }
    return sl;
  };
  
  this.sanitizeMap = function(sm) {
    var site;
    delete sm[""];
    for(var url in sm) {
      site = this.getSite(url);
      if(site != url) {
        if(site) sm[site] = sm[url];
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
    if(url.length < width) return url;
    
    max = max || 2000;
    if(max > width && url.length > max) {
        return this.crop(url.substring(0, max / 2)) + "\n[...]\n" + 
          this.crop(url.substring(url.length - max / 2));
    }
    
    var parts = [];
   
    while(url.length > width) {
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
    if(! (gb && (browsers = gb.browsers))) return null;
    
    var browser = gb.selectedBrowser;
    if(browser.contentWindow == win) return browser;
    
    for(var j = browsers.length; j-- > 0;) {
      browser = browsers[j];
      if(browser.contentWindow == win) return browser;
    }
    
    return null;
  },
  
  findBrowserForNode: function(ctx) {
    if(!ctx) return null;
    var bi = null;
    try {
      if(!(ctx instanceof CI.nsIDOMWindow)) {
        if(ctx instanceof CI.nsIDOMDocument) {
          ctx = ctx.defaultView;
        } else if(ctx instanceof CI.nsIDOMNode) {
          ctx = ctx.ownerDocument.defaultView;
        } else return null; 
      }
      if(!ctx) return null;
      ctx = ctx.top;
      
      var bi = new this.createBrowserIterator(this.getChromeWindow(ctx));
      for(var b; b = bi.next();) {
        if(b.contentWindow == ctx) return b;
      }
    } catch(e) {
    } finally {
      if(bi) bi.dispose();
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
  
  createBrowserIterator: function(initialWin) {
    return new BrowserIterator(initialWin);
  }
};

function BrowserIterator(initialWin) {
  this.wm = DOMUtils.windowMediator;
  if(!(initialWin && initialWin.getBrowser)) {
     initialWin = this.wm.getMostRecentWindow("navigator:browser");
  }
  this.currentWin = this.initialWin = initialWin;
  this.initPerWin();
}
BrowserIterator.prototype = {
  initPerWin: function() {
    var currentTB = this.currentWin && this.currentWin.getBrowser();
    if(currentTB) {
      this.browsers = currentTB.browsers;
      this.currentTab = this.mostRecentTab = currentTB && currentTB.selectedBrowser;
    } else {
      this.currentTab = null;
    }
    this.curTabIdx = 0;
  },
  next: function() {
    var ret = this.currentTab;
    if(!ret) {
      this.dispose();
      return null;
    }
    if(this.curTabIdx >= this.browsers.length) {
      if(!this.winEnum) {
        this.winEnum = this.wm.getZOrderDOMWindowEnumerator("navigator:browser", true);
      }
      if(this.winEnum.hasMoreElements()) {
        this.currentWin = this.winEnum.getNext();
        if(this.currentWin == this.initialWin) return this.next();
        this.initPerWin();
      } else {
        this.currentTab = null;
        return ret;
      }
    }
    this.currentTab = this.browsers[this.curTabIdx++];
    
    if(this.currentTab == this.mostRecentTab) this.next();
    return ret;
  },
  dispose: function() {
    if(!this.wm) return; // already disposed;
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
      for(var b; b = this.next();) {
        if(filter(b)) {
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
  if(sitesString) this.sitesString = sitesString;
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
    if(s!=this._sitesString) {
      this._sitesString=s;
      this._sitesMap=null;
      this._sitesList=null;
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
    if(!this._sitesMap) {
      const sm = {};
      const sl = SiteUtils.splitString(this.sitesString);
      if(sl) {
        for(var j = sl.length; j-- > 0;) {
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
    for(var s in sm) {
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
   var change;
   var s = this.sitesString.replace(/[^\u0000-\u007f]+/g,function($0) { return unescape(encodeURIComponent($0)) });
   try {
      change = s != pref.getCharPref("sites");
    } catch(ex) {
      change = true;
    }
    
    if(change) {
      this.settingPref = true;
      pref.setCharPref("sites", s);
      this.settingPref = false;
    }
 }
,
  // returns the shortest match for a site, or "" if no match is found
  matches: function(site) {
    if(!site) return "";
    const sm = this.sitesMap;
    var match;
    var dots; // track "dots" for (temporary) fix to 2nd level domain policy lookup flaw 
    var pos = site.indexOf(':') + 1;
    if(pos > 0 && (pos == site.length || site[pos] == '/')) {
      if(sm[match = site.substring(0, pos)]) return match; // scheme match
      if(++pos >= site.length || site[pos] != '/') return site == "about:" ? "about:" : "";
      match = site.substring(pos + 1);
      dots = 0;
    } else {
      match = site;
      dots = 1;
    }

    var submatch;
    for(pos = match.lastIndexOf('.'); pos > 1; dots++) {
      pos = match.lastIndexOf('.', pos - 1);
      if( (dots || pos > -1) && sm[submatch=match.substring(pos + 1)]) {
        return submatch; // domain/subdomain match
      }
    }
    
    if(sm[match]) return match; // host match
    return sm[site] ? site : ""; // full match
  }
,
  _remove: function(site, keepUp, keepDown) {
    if(!site) return false;
    
    const sm = this.sitesMap;
    var change=false;
    var match;
    
    if(site[site.length-1] != ":") { // not a scheme only site
      if(!keepUp) {
        while((match = this.matches(site)) && site != match) { // remove ancestors
          delete sm[match];
          change = true;
        }
      }
      if(!keepDown) {
        for(match in sm) { // remove descendants
          if((site == this.matches(match)) && site != match) {
            delete sm[match];
            change = true;
          }
        }
      }
    }
    
    if(site in sm) {
      delete sm[site];
      if(site.indexOf(".") == site.lastIndexOf(".")) {
        //2nd level domain hack
        delete sm["http://" + site];
        delete sm["https://" + site];
        delete sm["file://" + site];
      }
      change = true;
    }
    
    return change;
  },
  remove: function(sites, keepUp, keepDown) {
    return this._operate(this._remove, arguments);
  },
  _add: function(site) {
    var change = false;
    if(site.indexOf(":") < 0 && site.indexOf(".") == site.lastIndexOf(".")) {
     //2nd level domain hack
      change = this._add("http://" + site) || change;
      change = this._add("https://" + site) || change;
      change = this._add("file://" + site) || change;
    }
    const sm = this.sitesMap;
    return (site in sm ? false : sm[site] = true ) || change;
  },
  add: function(sites) {
    return this._operate(this._add, arguments);
  }, 
  _operate: function(oper, args) {
    var sites = args[0];
    if(!sites) return false;
    
    var change;
    if(typeof(sites)=="object" && "push" in sites) {
      for(var j = sites.length; j-->0; ) {
        args[0]=sites[j];
        if(oper.apply(this, args)) change = true;
      }
    } else {
      change = oper.apply(this,args);
    }
    if(change) {
      this.sitesMap = this._sitesMap;
    }
    return change;
  }
}





function NoscriptService() {
  this.register();
}

NoscriptService.prototype = {
  VERSION: "1.1.6.21",
  
  get wrappedJSObject() {
    return this;
  }
,
  QueryInterface: xpcom_generateQI(SERVICE_IIDS),
  generateQI: xpcom_generateQI
,
  // nsIObserver implementation 
  observe: function(subject, topic, data) {
    // dump(SERVICE_NAME+" notified of "+subject+","+topic+","+data); //DDEBUG
    if(subject instanceof CI.nsIPrefBranch2) {
      this.syncPrefs(subject, data);
    } else {
      switch(topic) {
        case "xpcom-shutdown":
          this.unregister();
          break;
        case "profile-before-change": 
          this.resetJSCaps();
          break;
        case "profile-after-change":
          try {
            this.init();
          } catch(e) {
            this.dump("Init error -- " + e.message);
          }
          break;
        case "em-action-requested":
          if( (subject instanceof CI.nsIUpdateItem)
              && subject.id==EXTENSION_ID ) {
            if(data == "item-uninstalled" || data == "item-disabled") {
              this.uninstalling = true;
            } else if(data == "item-enabled") {
              this.uninstalling = false;
            }
            this.dump(data);
          }
        break;
        case "toplevel-window-ready":
          this.registerToplevel(subject);
        break;
      }
    }
  },
  
  registerToplevel: function(window) {
    if((window instanceof CI.nsIDOMChromeWindow) && !window.opener &&
       (window instanceof CI.nsIDOMNSEventTarget)) {
      window.isNewToplevel = true;
      if((window.noscriptDump = 
            this.consoleDump && (this.consoleDump & 1)
          )) {
        this.dump("Toplevel register, true");
      }
      window.addEventListener("load", this.handleToplevel, false);
    }
  },
  handleToplevel: function(ev) {
    // this resets newtoplevel status to true after chrome
    var window = ev.currentTarget;
    var callee = arguments.callee;
    switch(ev.type) {
      case "load":
        if(!window.topLeveltimeout) {
          window.toplevelTimeout = window.setTimeout(callee, 0, { type: "timeout", currentTarget: window });
          window.addEventListener("unload", callee, false);
          break;
        }
      case "timeout":
      case "unload":
        window.isNewToplevel = false;
        window.clearTimeout(window.toplevelTimeout);
        window.removeEventListener("load", callee, false);
        window.removeEventListener("unload", callee, false);
    }
    if(window.noscriptDump) dump("[NoScript] Toplevel " + ev.type + ", " + window.isNewToplevel + "\n");
  },
  isNewBrowserWindow: function(window) {
    return window.isNewToplevel;
  },
  
  register: function() {
    const osvr = CC['@mozilla.org/observer-service;1'].getService(CI.nsIObserverService);
    osvr.addObserver(this, "profile-before-change", true);
    osvr.addObserver(this, "xpcom-shutdown", true);
    osvr.addObserver(this, "profile-after-change", true);
    osvr.addObserver(this, "em-action-requested", true);
    osvr.addObserver(this, "toplevel-window-ready", true);
    if(!this.requestWatchdog) {
      osvr.addObserver(this.requestWatchdog = new RequestWatchdog(this), "http-on-modify-request", true);
    }
    
    const dls = CC['@mozilla.org/docloaderservice;1'].getService(CI.nsIWebProgress);
    dls.addProgressListener(this, CI.nsIWebProgress.NOTIFY_LOCATION);
  }
,
  unregister: function() {
    const osvr = CC['@mozilla.org/observer-service;1'].getService(CI.nsIObserverService);
    
    if(this.requestWatchdog) {
      osvr.removeObserver(this.requestWatchdog, "http-on-modify-request");
      this.requestWatchdog = null;
    }
    const dls = CC['@mozilla.org/docloaderservice;1'].getService(CI.nsIWebProgress);
    dls.removeProgressListener(this);
    
    osvr.removeObserver(this, "profile-before-change");
    osvr.removeObserver(this, "xpcom-shutdown");
    osvr.removeObserver(this, "profile-after-change");
    osvr.removeObserver(this, "em-action-requested");
    osvr.removeObserver(this, "toplevel-window-ready");
  },
  
  dispose: function() {
    this.prefs.removeObserver("", this);
    this.mozJSPref.removeObserver("enabled", this);
    this.resetJSCaps();
  }
,
  
  // Preference driven properties
  autoAllow: false,
  
  blockCssScanning: true,
  blockCrossIntranet: true,
  blockNSWB: true,
  
  consoleDump: 0,
  truncateTitle: true,
  truncateTitleLen: 255,
  pluginPlaceholder: "chrome://noscript/skin/icon32.png",
  showPlaceHolder: true,

  forbidSomeContent: false,
  forbidAllContent: false,
  contentBlocker: false,
  
  forbidJava: false,
  forbidFlash: false,
  forbidPlugins: false,
  forbidData: true,
  
  forbidChromeScripts: false,
  
  injectionCheck: 2,
  
  jsredirectIgnore: false,
  jsredirectFollow: true,
  
  nselNever: false,
  nselForce: true,

  filterXGetRx: "(?:<+(?=[^<>=\\d\\. ])|[\\\\'\"\\x00-\\x07\\x09\\x0B\\x0C\\x0E-\\x1F\\x7F])",
  filterXGetUserRx: "",
  
  resetDefaultPrefs: function(prefs, exclude) {
    exclude = exclude || [];
    var children = prefs.getChildList("", {});
    for(var j = children.length; j-- > 0;) {
      if(exclude.indexOf(children[j]) < 0) {
        if(prefs.prefHasUserValue( children[j])) {
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
    this.setJSEnabled(this.splitList(this.getPref("default",
              "chrome: resource: about:blank about:neterror about:config about:plugins about:credits addons.mozilla.org flashgot.net gmail.com google.com googlesyndication.com informaction.com yahoo.com yimg.com maone.net noscript.net hotmail.com msn.com passport.com passport.net passportimages.com live.com"
              )), true, true);
  },
  
  resetDefaults: function() {
    this.resetDefaultGeneralPrefs();
    this.resetDefaultSitePrefs();
  },
  syncPrefs: function(branch, name) {
    switch(name) {
      case "sites":
        if(this.jsPolicySites.settingPref) return;
        try {
          this.jsPolicySites.fromPref(this.policyPB);
        } catch(ex) {
          this.resetDefaultSitePrefs();
        }
        break;
      case "temp":
        this.tempSites.sitesString = this.getPref(name, "") + " jar:";
        // why jar:? see https://bugzilla.mozilla.org/show_bug.cgi?id=298823
        break;
      case "untrusted":
        this.untrustedSites.sitesString = this.getPref(name, "");
        break;
      case "enabled":
        try {
          this.mozJSEnabled = this.mozJSPref.getBoolPref("enabled");
        } catch(ex) {
          this.mozJSPref.setBoolPref("enabled",this.mozJSEnabled = true);
        }
      break;
      case "forbidJava":
      case "forbidFlash":
      case "forbidPlugins":
      case "forbidData":
      case "forbidChromeScripts":
        this[name]=this.getPref(name, this[name]);
        this.forbidSomeContent = this.forbidJava || this.forbidFlash || this.forbidPlugins;
        this.forbidAllContent = this.forbidJava && this.forbidFlash && this.forbidPlugins;

      break;
      
      case "filterXPost":
      case "filterXGet":
      case "blockCssScanners":
      case "blockXIntranet":
      case "safeToplevel":
      case "autoAllow":
      case "consoleDump":
      case "contentBlocker":
      case "pluginPlaceholder":
      case "showPlaceholder":
      case "truncateTitle":
      case "truncateTitleLen":
      case "forbidMetaRefresh":
      case "injectionCheck":
      case "jsredirectFollow":
      case "jsredirectIgnore":
        this[name] = this.getPref(name, this[name]);
        switch(name) {
          case "consoleDump":
            this.injectionChecker.logEnabled = !!this.consoleDump;
          break;
        }
      break;
      case "global":
        this.globalJS = this.getPref(name, false);
      break;
      
      case "forbidMetaRefresh.remember":
        if(!this.getPref(name)) this.metaRefreshWhitelist = {};
      break;
      case "filterXGetRx":
      case "filterXGetUserRx":
        this.updateRxPref(name, this[name], "g");
      break;
      case "filterXExceptions":
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
        this[name] = this.getPref(name);
      case "nselForce":
      case "nselNever":
        
      // case "blockCssScanners":
        this.updateCssPref(name);
        if(name = "nselNever" && this.getPref("nselNever") && !this.blockNSWB) {
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
      for(var j = lines.length; j-- > 0;) {
        if(/\S/.test(lines[j])) { 
          rxx.push(new RegExp(lines[j], flags));
        } else {
          lines.splice(j, 1);
        }
      }
      if(!rxx.length) return null;
      
      rxx.test = function(s) {
        for(var j = this.length; j-- > 0;) {
          if(this[j].test(s)) return true;
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
    if(!s) {
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
    for(var j = names.length; j-- > 0;) {
      cpName = this.POLICY_NAME + "." + baseName + "." + names[j];
      try {
        if(enabled) {
          this.caps.setCharPref(cpName,"allAccess");
        } else {
          if(this.caps.prefHasUserValue(cpName)) {
            this.caps.clearUserPref(cpName);
          }
        }
      } catch(ex) {}
    }
  },
  
  updateCssPref: function(name) {
    var sheet = 
    ({
      nselForce: "noscript.noscript-show, span.noscript-show { display: inline !important } span.noscript-show { padding: 0px; margin: 0px; border: none; background: inherit; color: inherit }",
      nselNever: "noscript, noscript * { display: none !important }",
      blockCssScanners: "a:visited { background-image: none !important }",
      blockNSWB: "noscript, noscript * { background-image: none !important; list-style-image: none !important }"
    }[name]);
    if(!sheet) return;

    var value = this[name];
    this[name] = value = this.getPref(name, value);
    this.updateStyleSheet(sheet, value);
  },
  
  updateStyleSheet: function(sheet, enabled) {
    const sssClass = CC["@mozilla.org/content/style-sheet-service;1"];
    if(!sssClass) return;
    
    const sss = sssClass.getService(CI.nsIStyleSheetService);
    const uri = SiteUtils.ios.newURI("data:text/css," + sheet, null, null);
    if(sss.sheetRegistered(uri, sss.USER_SHEET)) {
      if(!enabled) sss.unregisterSheet(uri, sss.USER_SHEET);
    } else {
      try {
        if(enabled) sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
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
    if(!this._uninstalling) {
      if(b) this.uninstallJob();
    } else {
      if(!b) this.undoUninstallJob();
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
  mozJSEnabled: true
,
  init: function() {
    if(this._inited) return false;
    this._inited = true;
    
    
    const prefserv = this.prefService = CC["@mozilla.org/preferences-service;1"]
      .getService(CI.nsIPrefService).QueryInterface(CI.nsIPrefBranch);
    
      
    const PBI=CI.nsIPrefBranch2;
    this.caps = prefserv.getBranch("capability.policy.").QueryInterface(PBI);
    this.defaultCaps = prefserv.getDefaultBranch(this.caps.root);
    this.policyPB = prefserv.getBranch("capability.policy." + this.POLICY_NAME + ".").QueryInterface(PBI);
    this.policyPB.addObserver("sites", this, true);
    this.prefs = prefserv.getBranch("noscript.").QueryInterface(PBI);
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
      "forbidFlash", "forbidJava", "forbidPlugins", "forbidData",
      "forbidMetaRefresh",
      "global",
      "injectionCheck",
      "jsredirectIgnore", "jsredirectFollow",
      "nselNever", "nselForce",
      "pluginPlaceholder", "showPlaceholder",
      "temp", "untrusted",
      "truncateTitle", "truncateTitleLen"
      ]) {
      try {
        this.syncPrefs(this.prefs, p);
      } catch(e) {
        dump("[NoScript init error] " + e + " setting " + p + "\n");
      }
    }
    
    this.syncPrefs(this.mozJSPref, "enabled");
    

    this.setupJSCaps();
    
    // init jsPolicySites from prefs
    this.syncPrefs(this.policyPB, "sites");
    this.eraseTemp();
    // this.sanitize2ndLevs();
    
    this.reloadWhereNeeded(); // init snapshot

    return true;
  },
  
  captureExternalProtocols: function() {
    try {
      const ph = this.prefService.getDefaultBranch("network.protocol-handler.");
      if(this.getPref("fixURI", true)) {
        try {
          ph.setBoolPref("expose-all", true);
        } catch(e1) {}
        var prots = [];
        for each(var key in ph.getChildList("expose.", {})) {
          try {
            ph.setBoolPref(key, true);
            prots.push(key.replace("expose.", ""));
            if(ph.hasUserPref(key)) ph.clearUserPref(key);
          } catch(e1) {}
        }
        if(prots.length) this.extraCapturedProtocols = prots;
      }
    } catch(e) {}
  },
  
  extraCapturedProtocols: null,
  
  sanitize2ndLevs: function() {
    const rx = /(?:^| )([^ \.:]+\.\w+)(?= |$)(?!.*https:\/\/\1)/g
    const doms = [];
    for(var s = this.jsPolicySites.sitesString; m = rx.exec(s); s = s.substring(m.lastIndex - 1)) {
      doms.push(m[1]);
    }
    if(doms.length) this.setJSEnabled(doms, true);
  }
,
  permanentSites: new PolicySites(),
  isPermanent: function(s) {
    return s && this.permanentSites.matches(s);
  }
,
  tempSites: new PolicySites(),
  isTemp: function(s) {
    return this.tempSites.matches(s);
  }
,
  setTemp: function(s, b) {
    var change = b ? this.tempSites.add(s) : this.tempSites.remove(s, true);
    if(change) {
      this.setPref("temp", this.tempSites.sitesString);
    }
  },
  
  untrustedSites: new PolicySites(),
  isUntrusted: function(s) {
    return !!this.untrustedSites.matches(s);
  },
  setUntrusted: function(s, b) {
    var change = b ? this.untrustedSites.add(s) : this.untrustedSites.remove(s, true);
    if(change) {
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
    if(b) this.untrustedSites.add(s);
    else this.untrustedSites.remove(s, true);
    return b;
  },
  
  autoTemp: function(site) {
    if(!(this.isUntrusted(site) || this.isManual(site))) {
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
    if(fromScratch) ps.sitesString = this.permanentSites.sitesString;
    if(is) {
      ps.add(site);
      if(!fromScratch) {
        this.setUntrusted(site, false);
      }
    } else {
      ps.remove(site, false, true);
      if(this.getPref("forbidImpliesUntrust", false)) {
        this.setUntrusted(site, true);
      }
      if(this.autoAllow) {
        this.setManual(site, true);
      }
    }
    this.flushCAPS();
    return is;
  }
,
  checkShorthands: function(site, map) {
    map = map || this.jsPolicySites.sitesMap;
    // port matching, with "0" as port wildcard  and * as nth level host wildcard
    if(/:\d+$/.test(site)) {
      var key = site.replace(/\d+$/, "0");
      if(map[key]) return true;
      var keys = key.split(".");
      if(keys.length > 1) {
        var prefix = keys[0].match(/^https?:\/\//i)[0] + "*.";
        while(keys.length > 2) {
          keys.shift();
          if(map[prefix + keys.join(".")]) return true;
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
    if(sitesString) ps.sitesString = sitesString;
    
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
    const prefName = "default.javascript.enabled";
    try {
      this.caps.clearUserPref("default.javascript.enabled");
    } catch(e) {}
    this.defaultCaps.setCharPref(prefName, enabled ? "allAccess" : "noAccess");
    this.setPref("global", enabled);
    if(enabled) {
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
    if(level > 0 && !this.jsEnabled) {
      site = this.getSite(url);
      var domain;
      if(level > 1 && (domain = this.getDomain(site))) {
        site = level > 2 ? this.get2ndLevel(domain) : domain;
      }
    }
    return site;
  },
  
  getDomain: function(site) {
    try {
      const url = (site instanceof CI.nsIURL) ? site : SiteUtils.ios.newURI(site, null, null);
      const host = url.host;
      return url.port == -1 && host[host.length - 1] != "." && 
            (host.lastIndexOf(".") > 0 || host == "localhost") ? host : null;
    } catch(e) {
      return null;
    }
  },
  
  getTLDPos: function(domain) {
    if(/^[\d\.]+$/.test(domain)) return 0; // IP
    
    var lastPos = domain.lastIndexOf('.');
    if(lastPos < 1 || domain.lastIndexOf('.', lastPos - 1) < 1) return 0;
    
    var domParts = domain.split('.');
    var dpLen = domParts.length;
    var dp = domParts[dpLen - 2];
    var tlds = this.SPECIAL_TLDS[dp];
    var pos;
    if(tlds) {
      if(dp == "com" || (tlds.indexOf(" " + (dp = domParts[dpLen - 1]) + " ")) > -1) {
        if(dp == "uk" && (pos = domain.lastIndexOf(".here.co.")) == domain.length - 11) {
          lastPos = pos;
        } else {
          lastPos = domain.lastIndexOf('.', lastPos - 1);
        }
      }
    }
    return lastPos;
  },
  get2ndLevel: function(domain) {
    var pos = this.getTLDPos(domain);
    return pos ? domain.substring(domain.lastIndexOf('.', pos - 1) + 1) : domain;
  }
,

  delayExec: function(callback, delay) {
     const timer = CC["@mozilla.org/timer;1"].createInstance(
        CI.nsITimer);
     timer.initWithCallback( { notify: callback, context: this },  delay || 1, 0);
  }
,
  safeCapsOp: function(callback) {
    const serv = this;
    this.delayExec(function() {
      callback();
      serv.savePrefs();
      serv.reloadWhereNeeded();
     }, 1);
  }
,
  _lastSnapshot: null,
  _lastGlobal: false,
  reloadWhereNeeded: function(snapshot, lastGlobal) {
    if(!snapshot) snapshot = this._lastSnapshot;
    const ps = this.jsPolicySites;
    this._lastSnapshot = ps.clone();
    const global = this.jsEnabled;
    if(typeof(lastGlobal) == "undefined") {
      lastGlobal = this._lastGlobal;
    }
    this._lastGlobal = global;
    
    this.initContentPolicy();
    
    if((global == lastGlobal && ps.equals(snapshot)) || !snapshot) return false;
    
    if(!this.getPref("autoReload", true)) return false;
    if(global != lastGlobal && !this.getPref("autoReload.global", true)) return false; 
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
    for(var browser, j; browser = bi.next();) {
      docSites = this.getSites(browser, true);
      for(j = docSites.length; j-- > 0;) {
        prevStatus = lastGlobal || !!snapshot.matches(docSites[j]);
        currStatus = global || !!(ps.matches(docSites[j]) || this.checkShorthands(docSites[j]));
        if(currStatus != prevStatus) {
          ret = true;
          if(currStatus) this.requestWatchdog.setUntrustedReloadInfo(browser, true);
          webNav = browser.webNavigation;
          url = webNav.currentURI;
          if(url.schemeIs("http") || url.schemeIs("https")) {
            this.requestWatchdog.noscriptReload = url.spec;
          }
          try {
            webNav = webNav.sessionHistory.QueryInterface(nsIWebNavigation);
            if(currStatus && webNav.index && untrustedReload) {
              try {
                site = this.getSite(webNav.getEntryAtIndex(webNav.index - 1, false).URI.spec);
                this.requestWatchdog.setUntrustedReloadInfo(browser, site != docSites[j] && !ps.matches(site));
              } catch(e) {}
            }
            
            if(useHistory) {
              if(useHistoryExceptCurrent) {
                useHistoryExceptCurrent = false;
              } else if(!(url instanceof nsIURL && url.ref || url.spec.substring(url.spec.length - 1) == "#")) {
                if(useHistoryCurrentOnly) useHistory = false;
                webNav.gotoIndex(webNav.index);
                break;
              }
            }
          } catch(e) {}
          browser.webNavigation.reload(LOAD_FLAGS);
          break;
        }
      }
      if(currentTabOnly) break;
    }
    bi.dispose();
    bi = null;
    return ret;
  }
,
  SPECIAL_TLDS: {

    "ab": " ca ", 
    "ac": " ac at be cn id il in jp kr nz th uk za ", 
    "adm": " br ", 
    "adv": " br ",
    "agro": " pl ",
    "ah": " cn ",
    "aid": " pl ",
    "alt": " za ",
    "am": " br ",
    "ar": " com ",
    "arq": " br ",
    "art": " br ",
    "arts": " ro ",
    "asn": " au au ",
    "asso": " fr mc ",
    "atm": " pl ",
    "auto": " pl ",
    "bbs": " tr ",
    "bc": " ca ",
    "bio": " br ",
    "biz": " pl ",
    "bj": " cn ",
    "br": " com ",
    "cn": " com ",
    "cng": " br ",
    "cnt": " br ",
    "co": " ac at id il in jp kr nz th sy uk za ",
    "com": " ar au br cn ec fr hk mm mx pl ro ru sg tr tw ua ",
    "cq": " cn ",
    "cri": " nz ",
    "ecn": " br ",
    "edu": " ar au co cn hk mm mx pl tr tw uy za ",
    "eng": " br ",
    "ernet": " in ",
    "esp": " br ",
    "etc": " br ",
    "eti": " br ",
    "eu": " com lv ",
    "fin": " ec ",
    "firm": " ro ",
    "fm": " br ",
    "fot": " br ",
    "fst": " br ",
    "g12": " br ",
    "gb": " com net ",
    "gd": " cn ",
    "gen": " nz ",
    "gmina": " pl ",
    "go": " id jp kr th ",
    "gob": " mx ",
    "gov": " ar br cn ec il in mm mx sg tr uk za ",
    "govt": " nz ",
    "gs": " cn ",
    "gsm": " pl ",
    "gv": " ac at ",
    "gx": " cn ",
    "gz": " cn ",
    "hb": " cn ",
    "he": " cn ",
    "hi": " cn ",
    "hk": " cn ",
    "hl": " cn ",
    "hn": " cn ",
    "hu": " com ",
    "id": " au ",
    "in": " th ",
    "ind": " br ",
    "inf": " br ",
    "info": " pl ro ",
    "iwi": " nz ",
    "jl": " cn ",
    "jor": " br ",
    "js": " cn ",
    "k12": " il tr ",
    "lel": " br ",
    "ln": " cn ",
    "ltd": " uk ",
    "mail": " pl ",
    "maori": " nz ",
    "mb": " ca ",
    "me": " uk ",
    "med": " br ec ",
    "media": " pl ",
    "mi": " th ",
    "miasta": " pl ",
    "mil": " br ec id nz pl tr za ",
    "mo": " cn ",
    "muni": " il ",
    "nb": " ca ",
    "ne": " jp kr ",
    "net": " ar au br cn ec hk id il in mm mx nz pl ru sg th tr tw ua uk uy za ",
    "nf": " ca ",
    "ngo": " za ",
    "nm": " cn kr ",
    "no": " com ",
    "nom": " br pl ro za ",
    "ns": " ca ",
    "nt": " ca ro ",
    "ntr": " br ",
    "nx": " cn ",
    "odo": " br ",
    "on": " ca ",
    "or": " ac at id jp kr th ",
    "org": " ar au br cn ec hk il in mm mx nz pe pl ro ru sg tr tw uk ua uk uy za ",
    "pc": " pl ",
    "pe": " ca ",
    "plc": " uk ",
    "ppg": " br ",
    "presse": " fr ",
    "priv": " pl ",
    "pro": " br ",
    "psc": " br ",
    "psi": " br ",
    "qc": " ca com ",
    "qh": " cn ",
    "re": " kr ",
    "realestate": " pl ",
    "rec": " br ro ",
    "rel": " pl ",
    "res": " in ",
    "sa": " com ",
    "sc": " cn ",
    "sch": " id ",
    "school": " nz za ",
    "se": " com net ",
    "sh": " cn ",
    "shop": " pl ",
    "sk": " ca ",
    "sklep": " pl ",
    "slg": " br ",
    "sn": " cn ",
    "sos": " pl ",
    "store": " ro ",
    "targi": " pl ",
    "tj": " cn ",
    "tm": " fr mc pl ro za ",
    "tmp": " br ",
    "tourism": " pl ",
    "travel": " pl ",
    "tur": " br ",
    "turystyka": " pl ",
    "tv": " br ",
    "tw": " cn ",
    "uk": " co com net ",
    "us": " com ca ",
    "vet": " br ",
    "web": " id za ",
    "www": " ro ",
    "xj": " cn ",
    "xz": " cn ",
    "yk": " ca ",
    "yn": " cn ",
    "za": " com ",
    "zj": " cn ", 
    "zlg": " br "
  }
,
  eraseTemp: function() {
    this.jsPolicySites.remove(this.tempSites.sitesList, false, true); // remove temporary
    this.setJSEnabled(this.permanentSites.sitesList, true); // add permanent & save
    this.setPref("temp", ""); // flush temporary list
  }
,
  _observingPolicies: false,
  _editingPolicies: false,
  setupJSCaps: function() {
    if(this._editingPolicies) return;
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
        while(pcount-- > 0 && prefArray[pcount] != POLICY_NAME);
        if(pcount == -1) { // our policy is not installed, should always be so unless dirty exit
          this.setPref("policynames", originalPrefString);
          if(exclusive || prefArray.length == 0) {
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

      
      if(!this._observingPolicies) {
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
    if(this._observingPolicies) {
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
      for(var pcount = prefArray.length; pcount-- > 0;) {
        if(prefArray[pcount] != POLICY_NAME) prefArrayTarget[prefArrayTarget.length] = prefArray[pcount];
      }
      var prefString = prefArrayTarget.join(" ").replace(/\s+/g,' ').replace(/^\s+/,'').replace(/\s+$/,'');
      if(prefString) {
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
  getPref: function(name,def) {
    const IPC = CI.nsIPrefBranch;
    const prefs = this.prefs;
    try {
      switch(prefs.getPrefType(name)) {
        case IPC.PREF_STRING:
          return prefs.getCharPref(name);
        case IPC.PREF_INT:
          return prefs.getIntPref(name);
        case IPC.PREF_BOOL:
          return prefs.getBoolPref(name);
      }
    } catch(e) {}
    return def;
  }
,
  setPref: function(name,value) {
    const prefs = this.prefs;
    switch(typeof(value)) {
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
    if(force || this.getPref("sound",true)) {
      var sound = this._sound;
      if(sound == null) {
        sound=CC["@mozilla.org/sound;1"].createInstance(CI.nsISound);
        sound.init();
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
    if(this.getPref("sound.oncePerSite")) {
      const site = this.getSite(url);
      if(this._soundNotified[site]) return;
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
  
  get lastWindow() {
    return DOMUtils.windowMediator.getMostRecentWindow("navigator:browser");
  },
  
  
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
 
  shouldLoad: function() { return 1; },
  shouldProcess: function() { return 1; },
  initContentPolicy: function() {
    var delegate = this.getPref("global", false) ? this.noopContentPolicy
                                                 : this.mainContentPolicy;
    this.shouldLoad = delegate.shouldLoad;
    this.shouldProcess = delegate.shouldProcess;

    if(!this.mimeService) {
      
      this.rejectCode = typeof(/ /) == "object" ? -4 : -3;
      this.safeToplevel = this.getPref("safeToplevel", true);
      this.initSafeJSRx();
      
      this.xcache = new XCache();
      this.mimeService = CC['@mozilla.org/uriloader/external-helper-app-service;1']
                                   .getService(CI.nsIMIMEService);
    }
  },
  guessMime: function(uri) {
    try {
      return (uri instanceof CI.nsIURL) && uri.fileExtension && 
        this.mimeService.getTypeFromExtension(uri.fileExtension) || ""; 
    } catch(e) {
      return "";
    }
  },
  pluginForMime: function(mimeType) {
    if(!mimeType) return null;
    var w = this.lastWindow;
    if(!(w && w.navigator)) return null;
    var mime = w.navigator.mimeTypes.namedItem(mimeType);
    return mime && mime.enabledPlugin || null;
  },
  
  browserChromeDir: CC["@mozilla.org/file/directory_service;1"].getService(CI.nsIProperties)
                       .get("AChrom", CI.nsIFile),
  chromeRegistry: CC["@mozilla.org/chrome/chrome-registry;1"].getService(CI.nsIChromeRegistry),
  checkForbiddenChrome: function(url, origin) {
    if(url.scheme == "chrome" && origin && !/^(?:chrome|resource|file|about)$/.test(origin.scheme)) {
      var packageName = url.host;
      if(packageName == "browser") return false; // fast path for commonest case
      exception = this.getPref("forbidChromeExceptions." + packageName, false);
      if(exception) return false;
      var chromeURL = this.chromeRegistry.convertChromeURL(url);
      if(chromeURL instanceof CI.nsIJARURI) 
        chromeURL = chromeURL.JARFile;
            
      if(chromeURL instanceof CI.nsIFileURL && !this.browserChromeDir.contains(chromeURL.file, true)) {
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
  PING_DEFINED: "TYPE_PING" in CI.nsIContentPolicy,
  noopContentPolicy: {
    shouldLoad: function() { return 1; },
    shouldProcess: function() { return 1; }
  },
  cpConsoleFilter: [2, 5, 6, 7],
  mainContentPolicy: {
    shouldLoad: function(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aInternalCall) {
      if(this.consoleDump && (this.consoleDump & 4) && this.cpConsoleFilter.indexOf(aContentType) > -1) {
        dump("[noscript cp]: type: " + aContentType + ", location: " + (aContentLocation && aContentLocation.spec) + 
        ", origin: " + (aRequestOrigin && aRequestOrigin.spec) + ", ctx: " + aContext + ", mime: " + aMimeTypeGuess + ", " + aInternalCall
          + "\n");
      }
      
      var url, forbid, isJS, isFlash, isJava, mustAsk, scheme;

      switch(aContentType) {
        case 1:
          if(this.PING_DEFINED || 
              !((aContext instanceof CI.nsIDOMHTMLElement) && aContext.getAttribute("ping"))) 
            return 1;
        
        case 10: // TYPE_PING
          if(this.jsEnabled || !this.getPref("noping", true) || 
              aRequestOrigin && this.isJSEnabled(this.getSite(aRequestOrigin.spec))
            )
            return 1;
            
          if(this.consoleDump & 1) 
            this.dump("Blocked ping " + aRequestOrigin.spec + " -> " + aContentLocation.spec);
       
          return this.rejectCode;
            
        case 2:
          if(this.forbidChromeScripts && this.checkForbiddenChrome(aContentLocation, aRequestOrigin)) {
            if(this.consoleDump & 1) 
              this.dump("Blocked chrome access, " + aRequestOrigin.spec + " -> " + aContentLocation.spec);
            return this.rejectCode;
          }
          forbid = isJS = true;
          break;
        case 3:
          try {
            if(this.blockNSWB && (aContext instanceof CI.nsIDOMHTMLImageElement)) {
                for(var parent = aContext; (parent = parent.parentNode);) {
                  if(parent.nodeName.toUpperCase() == "NOSCRIPT") {
                    if(this.consoleDump & 1) this.dump("Blocked Tracking Image " + aContentLocation.spec);
                    return this.rejectCode;
                  }
                }
              }
            } catch(e) {
              this.dump(e)
            }
          return 1;
        case 5:
          if(aContentLocation && aRequestOrigin && aContentLocation.spec == aRequestOrigin.spec && 
              (aContext instanceof CI.nsIDOMHTMLEmbedElement) &&
              aMimeTypeGuess && this.pluginsCache.isForcedSomewhere(aContentLocation.spec, aMimeTypeGuess)) {
            return 1; // plugin document, we'll handle it in our webprogress listener
          }
          
        case 7:
          if(!aMimeTypeGuess) aMimeTypeGuess = this.guessMime(aContentLocation);
          
        case 6:
          scheme = aContentLocation.scheme;
          
          if(aRequestOrigin && aRequestOrigin != aContentLocation) {
            
            if(this.safeToplevel && (aContext instanceof CI.nsIDOMChromeWindow) &&
                this.isNewBrowserWindow(aContext) &&
                !(/^(?:chrome|resource|file)$/.test(scheme) ||
                  this.isSafeJSURL(aContentLocation.spec))
                  ) {
              if(this.consoleDump) this.dump("Blocked " + aContentLocation.spec + ": can't open in a new toplevel window");
              return this.rejectCode;
            }
         
            if(/^https?$/.test(scheme)) {
              if(aRequestOrigin.prePath != aContentLocation.prePath) {
                if(aRequestOrigin.schemeIs("chrome") && aContext.ownerDocument &&
                  this.isNewBrowserWindow(aContext.ownerDocument.defaultView)){
                  this.requestWatchdog.externalLoad = aContentLocation.spec;
                }
                this.xcache.storeOrigin(aRequestOrigin, aContentLocation);
              }
            } else if(/^(?:data|javascript)$/.test(scheme)) { 
              //data: and javascript: URLs
              url = aContentLocation.spec;
              if(!this.isSafeJSURL(url) &&
                ((this.forbidData && url != "javascript: eval(__firebugTemp__);" || url == "javascript:") && 
                  !this.isJSEnabled(this.getSite(aRequestOrigin.spec)) ||
                  aContext && this.isNewBrowserWindow(
                    (aContext instanceof CI.nsIDOMWindow) 
                      ? aContext
                      : aContext.ownerDocument.defaultView
                   )
                )
               ) {
                 if(this.consoleDump & 1) 
                   this.dump("Blocked " + url + " from " + aRequestOrigin.spec);
                 
                   return this.rejectCode;
              }
            } else if(scheme != aRequestOrigin.scheme && 
                scheme != "chrome" && // faster path for common case
                this.isExternalScheme(scheme)) {
              // work-around for bugs 389106 & 389580, escape external protocols
              if(aContentType != 6 && !aInternalCall && 
                  this.getPref("forbidExtProtSubdocs", true) && 
                  !this.isJSEnabled(this.getSite(aRequestOrigin.spec))) {
                this.dump("Prevented " + aContentLocation.spec + " subdocument request from " + aRequestOrigin.spec);
                return this.rejectCode;
              }
              if(!this.normalizeExternalURI(aContentLocation)) {
                return this.rejectCode;
              }
            }
          }
          
          if(((!this.forbidSomeContent)
              || (!aMimeTypeGuess)
              || aMimeTypeGuess.substring(0, 5) == "text/"
              || aMimeTypeGuess == "application/xml" 
              || aMimeTypeGuess == "application/xhtml+xml"
              || aMimeTypeGuess.substring(0, 6) == "image/")
              || !this.pluginForMime(aMimeTypeGuess)) {
            return 1;
          }
          break;
          
        default:
          return 1;
      }

      url = aContentLocation.spec;
      const origin = this.getSite(url);
      
      if(!forbid) {
        try {
          if(this.pluginsCache.update(url, aMimeTypeGuess, origin, aRequestOrigin || aContentLocation, aContext)) 
            return 1; // forceAllow
        } catch(ex) {
          dump("NoScriptService.pluginsCache.update():" + ex + "\n");
        }
        
        if(this.forbidSomeContent) {
          var forbid = this.forbidAllContent;
          if((!forbid) && aMimeTypeGuess) {
            forbid = 
              (isFlash = (aMimeTypeGuess == "application/x-shockwave-flash" || aMimeTypeGuess == "application/futuresplash")) && this.forbidFlash ||
              (isJava = aMimeTypeGuess.indexOf("application/x-java-") == 0) && this.forbidJava ||
              (this.forbidPlugins && !(isJava || isFlash));
          }
        }
      }
      
      if(forbid) {
        if((this.contentBlocker && !isJS) || 
            !(this.isJSEnabled(origin))) {
          try {
            if(aContext && (aContentType == 5 || aContentType == 7)) {
              if(aContext instanceof CI.nsIDOMNode
                 && this.pluginPlaceholder) {  
                if(aContext instanceof CI.nsIDOMHTMLEmbedElement
                    && aContext.parentNode instanceof CI.nsIDOMHTMLObjectElement) {
                  aContext = aContext.parentNode;
                }
                if(aMimeTypeGuess) {
                  this.setPluginExtras(aContext, 
                  {
                    url: url,
                    mime: aMimeTypeGuess
                  });
                  const browser = this.domUtils.findBrowserForNode(aContext);
                  if(browser && (browser.docShell instanceof CI.nsIWebNavigation) && !browser.docShell.isLoadingDocument) {
                    browser.ownerDocument.defaultView.noscriptOverlay.syncUI(aContext.ownerDocument.defaultView);
                  }
                }
              }
            }
          } finally {
            if(this.consoleDump & 1) 
              dump("NoScript blocked " + url + " which is a " + aMimeTypeGuess + " from " + origin + "\n");
            return this.rejectCode;
          }
        }
      }

      return 1;
    },
    shouldProcess: function(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeType, aExtra) {
      return this.shouldLoad(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeType, true);
    },
    check: function() {
      return false;
    }
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
    if(!uriValid) {
      if(fixURI) {
        uriSpec = uriSpec
            .replace(/[\s\x01-\x1f\0]/g, " ") // whitespace + null + control chars all to space
            .replace(/%[01][\da-f]/gi, "%20"); // ditto for already encoded items
        if(uriSpec != uri.spec) {
          if(this.consoleDump) this.dump("Fixing URI: " + uri.spec + " into " + uriSpec);
          if(uriValid !== false || (uriValid = this.uriValidator.validate(uriSpec))) {
            uri.spec = uriSpec;
          }
        }
      }
      if(uriValid === false) {
        msg = "Rejected invalid URI: " + uriSpec;
        if(this.consoleDump) this.dump(msg);
        this.log("[NoScript URI Validator] " + msg);
        return false;
      }
    }
    // encode all you can (i.e. don't touch valid encoded and delims)
    if(fixURI) {
      try {
        uriSpec = uriSpec.replace(/[^%]|%(?![\da-f]{2})/gi, encodeURI); 
        if(uriSpec != uri.spec) {
          if(this.consoleDump) this.dump("Encoded URI: " + uri.spec + " to " + uriSpec);
          uri.spec = uriSpec;
        }
      } catch(ex) {
        msg = "Error assigning encoded URI: " + uriSpec + ", " + ex;
        if(this.consoleDump) this.dump(msg);
        this.log("[NoScript URI Validator] " + msg);
        return false;
      }
    }
    return true;
  },
  
  pluginsCache: {
    update: function(url, mime, origin, docURI, ctx) { // returns forceAllow for this url and mime
      var browser = DOMUtils.findBrowserForNode(ctx);
      if(browser) {
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
      for(u in uriCache) {
        if(!uris[u]) delete uriCache[u];
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
      return uri && new DOMUtils.createBrowserIterator().find(this.forcedFilter);
    },
    forcedFilter: function(b) {
      return b.__noscriptPluginsCache && b.__noscriptPluginsCache.forceAllow[uri] == mime;
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
    if(this.consoleDump) dump("Setting plugin extras on " + obj + " -> " + (this.getPluginExtras(obj) == extras)
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
    if(!domObject) return null;
    if(!domObject.__noscriptStorage) domObject.__noscriptStorage = { __marker: this.expandoMarker };
    domObject.__noscriptStorage[key] = value;
    return value;
  },
  
  cleanupBrowser: function(browser) {
    delete browser.__noscriptStorage;
    this.pluginsCache.dispose(browser);
  },
  
  detectJSRedirects: function(document) {
    if(this.jsredirectIgnore) return 0;
    try {
      if(document.links[0] || this.isJSEnabled(this.getSite(document.documentURI))) return 0;
      const scripts = document.getElementsByTagName("script");
      if(!scripts[0]) return 0;
      var follow = false;
      const findURL = /(?:(?:\b(?:open|replace)\s*\(|(?:\b(?:href|location|src|path|pathname|search)|(?:[Pp]ath|UR[IL]|[uU]r[il])\s*=))\s*['"]|['"](?=https?:|\/|\.\/\?))([\?\/\.a-z][^\s'"]*)/g;
      findURL.lastIndex = 0;
      var code, m, url, a;
      var container = null;
      var window;
      var seen = [];
      for(var j = 0, len = scripts.length; j < len; j++) {
        code = scripts[j].innerHTML;
        while((m = findURL.exec(code))) {
          if(!container) {
             container = document.createElement("div");
             with(container.style) {
               backgroundImage = 'url("' + this.pluginPlaceholder + '")';
               backgroundRepeat = "no-repeat";
               backgroundPosition = "2px 2px";
               padding = "4px 4px 4px 40px";
               display = "block";
               minHeight = "32px";
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
          if(a.href.toLowerCase().indexOf("http") != 0 || seen.indexOf(a.href) > -1) {
             container.removeChild(a);
             continue;
          }
          seen.push(a.href);
          a.innerHTML = a.href;
          container.appendChild(document.createElement("br"));
        }
        
        if(follow && seen.length == 1) {
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
    } catch(e) { return 0; }
  }
,
  processScriptElements: function(document, sites) {
    var scripts = document.getElementsByTagName("script");
    var scount = scripts.length;
    if(scount) {
      const HTMLElement = CI.nsIDOMHTMLElement;
      sites.scriptCount += scount;
      var script, scriptSrc;
      var nselForce = this.nselForce && sites.length && this.isJSEnabled(sites[sites.length - 1]);
      var isHTMLScript;
      while(scount-- > 0) {
        script = scripts.item(scount);
        isHTMLScript = script instanceof HTMLElement;
        if(isHTMLScript) {
          scriptSrc = script.src;
        } else {
          scriptSrc = script.getAttribute("src");
          if(!/^[a-z]+:\/\//i.test(scriptSrc)) continue;
        }
        scriptSrc = this.getSite(scriptSrc);
        if(scriptSrc) {
          sites.push(scriptSrc);
          if(nselForce && isHTMLScript && !this.isJSEnabled(scriptSrc)) {
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
      if(node instanceof HTMLElement) {
        if(new String(lm(node, "tagName")()).toUpperCase() != "NOSCRIPT") return;
        if(lm(node, "getAttribute")("class") == "noscript-show") return;
        lm(node, "setAttribute")("class", "noscript-show");
        var child = lm(node, "firstChild")();
        if(lm(child, "nodeType")() != 3) return;
        var el = lm(lm(node, "ownerDocument")(), "createElement")("span");
        el.className = "noscript-show";
        el.innerHTML = lm(child, "nodeValue")();
        lm(node, "replaceChild")(el, child);
      }
    }
  },
  
  metaRefreshWhitelist: {},
  metaRefreshesXPath: "/html/head/meta[translate(self::node()/attribute::http-equiv,'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = 'refresh']",
  processMetaRefresh: function(document) {
    var docShell = this.domUtils.getDocShellFromWindow(document.defaultView);
    if(!this.forbidMetaRefresh ||    
       this.metaRefreshWhitelist[document.documentURI] ||
       this.isJSEnabled(this.getSite(document.documentURI)) ||
       !document.getElementsByTagName("noscript")[0]
       ) {
      if(!docShell.allowMetaRedirects) this.disableMetaRefresh(docShell); // refresh blocker courtesy
      return;
    }
    try {
      /*
       "//noscript//meta" SHOULD be the right XPATH, if only Gecko didn't mess 
       both with <NOSCRIPT> tags inside <HEAD>, relocating them inside <BODY>, 
       and with <META> tags relocatibg them inside <HEAD> :P
       So we need to fallback to a fuzzier euristhic...
       We'll just require that both a <NOSCRIPT> element and a <META> refresh
       live in the same document
      */
      // const xpath = "//noscript//meta[translate(self::node()/attribute::http-equiv,'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = 'refresh']";
      const xpath = this.metaRefreshesXPath;
      var rr = document.evaluate(xpath, document, null, 
           CI.nsIDOMXPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      if(!rr.snapshotLength) return;

      var refresh, content, timeout, uri;
      for(var j = 0; j < rr.snapshotLength; j++) {
        refresh = rr.snapshotItem(j);
        content = refresh.getAttribute ("content").split(/[,;]/, 2);
        uri = content[1];
        if(uri) {
          if(!(document.documentURI in this.metaRefreshWhitelist)) {
            timeout = content[0];
            uri = uri.replace (/^\s*/, "").replace (/^URL/i, "URL").split("URL=", 2)[1];
            try {
              var chromeWin =  this.domUtils.getChromeWindow(document.defaultView).document.defaultView;
              chromeWin.noscriptOverlay.notifyMetaRefresh({ 
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
    // this.enableMetaRefresh(docShell);
  },
  doFollowMetaRefresh: function(metaRefreshInfo, forceRemember) {
    if(forceRemember || this.getPref("forbidMetaRefresh.remember", false)) {
      var document = metaRefreshInfo.document;
      this.metaRefreshWhitelist[document.documentURI] = metaRefreshInfo.uri;
    }
    var docShell = metaRefreshInfo.docShell;
    this.enableMetaRefresh(metaRefreshInfo.docShell);
    if(docShell instanceof CI.nsIRefreshURI) {
      docShell.setupRefreshURIFromHeader(metaRefreshInfo.baseURI, "0;" + metaRefreshInfo.uri);
    }
  },
  doBlockMetaRefresh: function(metaRefreshInfo) {
    if(this.getPref("forbidMetaRefresh.remember", true)) {
      var document = metaRefreshInfo.document;
      this.metaRefreshWhitelist[document.documentURI] = null;
    }
  },
  
  enableMetaRefresh: function(docShell) {
    if(docShell) {
      docShell.allowMetaRedirects = true;
      docShell.resumeRefreshURIs();
      // if(this.consoleDump) dump("Enabled META refresh on " + (docShell.currentURI && docShell.currentURI.spec) + "\n");
    }
  },
  disableMetaRefresh: function(docShell) {
    if(docShell) {
      docShell.suspendRefreshURIs();
      docShell.allowMetaRedirects = false;
      if(docShell instanceof CI.nsIRefreshURI) {
        docShell.cancelRefreshURITimers();
      }
      // if(this.consoleDump) dump("Disabled META refresh on " + (docShell.currentURI && docShell.currentURI.spec) + "\n");
    }
  },
  
  handleBookmark: function(url, openCallback) {
    if(!url) return true;
    const allowBookmarklets = !this.getPref("forbidBookmarklets", false);
    const allowBookmarks = this.getPref("allowBookmarks", false);
    if((!this.jsEnabled) && 
      (allowBookmarks || allowBookmarklets)) {
      try {
        if(allowBookmarklets && url.toLowerCase().indexOf("javascript:") == 0) {
          var browserWindow =  Components.classes["@mozilla.org/appshell/window-mediator;1"]
              .getService(Components.interfaces.nsIWindowMediator)
              .getMostRecentWindow("navigator:browser");
          var browser = browserWindow.getBrowser().selectedBrowser;
          var site = this.getSite(browserWindow.noscriptOverlay.srcDocument.documentURI);
          if(browser && !this.isJSEnabled(site)) {
            var snapshot = this.jsPolicySites.sitesString;
            try {
              this.setJSEnabled(site, true);
              if(Components.utils && typeof(/ /) == "object") { // direct evaluation, after bug 351633 landing
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
  
  
  _objectTypes: null,
  processObjectElements: function(document, sites) {
   
    var pp = this.showPlaceholder && this.pluginPlaceholder;
    var replacePlugins = pp && this.forbidSomeContent;
      
    const types = this._objectTypes || 
          (this._objectTypes = {
            embed:  CI.nsIDOMHTMLEmbedElement, 
            applet: CI.nsIDOMHTMLAppletElement,
            iframe: CI.nsIDOMHTMLIFrameElement,
            object: CI.nsIDOMHTMLObjectElement
          });

    const htmlNS = "http://www.w3.org/1999/xhtml";
    
    var objectType;
    var count, objects, object, anchor, innerDiv, objectParent;
    var extras, title;
    var style, cssLen, cssCount, cssProp, cssDef;
    var aWidth,aHeight;
    var forcedCSS, style, astyle;
    
    var replacements = null;
    
    for(objectTag in types) {
      objects = document.getElementsByTagName(objectTag);
      objectType = types[objectTag];
      for(count = objects.length; count-- > 0;) {
        object = objects.item(count);
        if(!(object instanceof objectType) || // wrong type instantiated for this tag?!
            objectType == types.embed &&
            object.parentNode instanceof types.object // skip "embed" if nested into "object"
         ) continue;
         
        sites.pluginCount++;
        
        if(replacePlugins) {
          if(!forcedCSS) {
            forcedCSS = "; -moz-outline-color: red !important; -moz-outline-style: solid !important; -moz-outline-width: 1px !important; background: white url(\"" + pp +
                     "\") no-repeat left top !important; opacity: 0.6 !important; cursor: pointer !important; margin-top: 0px !important; margin-bottom: 0px !important; }";
            try {
              if(object.parentNode == document.body && 
                  !object.nextSibling) { // raw plugin content ?
                var contentType = document.contentType;
                if(contentType.substring(0, 5) != "text/") {
                  this.shouldLoad(5, 
                      this.siteUtils.ios.newURI(document.documentURI, null, null), 
                      null, object, contentType, true);
                }
              }
            } catch(e) {}
          }
          try {
            extras = this.getPluginExtras(object);
            if(extras) {
              anchor = document.createElementNS(htmlNS, "a");
              innerDiv = document.createElementNS(htmlNS, "div");
              
              anchor.href = extras.url;
              title = (extras.mime ? extras.mime.replace("application/", "") + "@" : "@") + extras.url;
              extras.alt = object.getAttribute("alt");
              
              anchor.setAttribute("title", extras.alt ? title+" \"" + 
                                           extras.alt + "\"" : title);
              
              with(anchor.style) {
                padding = margin = borderWidth = "0px !important";
              }
              
              style = document.defaultView.getComputedStyle(object, null);
               
              cssDef = "";
              for(cssCount = 0, cssLen = style.length; cssCount < cssLen; cssCount++) {
                cssProp=style.item(cssCount);
                cssDef += cssProp + ": " + style.getPropertyValue(cssProp) + ";";
              }
              innerDiv.setAttribute("style", cssDef + forcedCSS);
              innerDiv.style.display = "block";

              anchor.appendChild(innerDiv);
              
              if(style.width == "100%" || style.height == "100%") {
                anchor.style.width = style.width;
                anchor.style.height = style.height;
                anchor.style.display = "block";
                
                if(object.parentNode == document.body &&
                style.width == "100%" && style.height == "100%") {
                  innerDiv.style.border = "none";
                }
              } else {
                anchor.style.display = "inline";
              }
              
              anchor.addEventListener("click", this.objectClickListener.bind(this), false);
              this.setPluginExtras(anchor, extras);
              this.setExpando(anchor, "removedPlugin", object);
              
              (replacements = replacements || []).push({object: object, placeHolder: anchor});
              
            }
          } catch(objectEx) {
            dump("NoScript: " + objectEx + " processing plugin " + count + "@" + document.documentURI + "\n");
          }
        }
      }
    }
    
    if(replacements) {
      this.createDeferredPlaceHolders(document.defaultView, replacements);
    }
  },
  
  createDeferredPlaceHolders: function(window, replacements) {
    window.setTimeout(function() {
        for each(r in replacements) {
          if(r.object.parentNode) r.object.parentNode.replaceChild(r.placeHolder, r.object);  
        }
        replacements = null;
    }, 0);
    window = null;
  },
  
  objectClickListener: {
    bind: function(ns) {
      this._clickListener.ns = ns;
      return this._clickListener;
    },
    _clickListener: function(ev) {
      if(ev.button) return;
      
     
      const anchor = ev.currentTarget;
      const ns = arguments.callee.ns;
      const object = ns.getExpando(anchor, "removedPlugin");
      
      if(object) try {

        if(ev.shiftKey) {
          anchor.style.display = "none";
          return;
        }
        
        
        const extras = ns.getPluginExtras(anchor);
        const browser = ns.domUtils.findBrowserForNode(anchor);
        const cache = ns.pluginsCache.get(browser);
        if(!(extras && extras.url && extras.mime && cache) ) return;
       
        var window = browser.ownerDocument.defaultView;
        window.setTimeout(ns.objectClickListener.checkAndEnable, 0,
          {
            window: window,
            url: extras.url,
            mime: extras.mime,
            cache: cache,
            anchor: anchor,
            object: object,
            ns: ns
          });
      } finally {
        ev.preventDefault();
      }
    },
    
    checkAndEnable: function(ctx) {
      var mime = ctx.mime;
      var url = ctx.url;
      if(ctx.window.noscriptUtil.confirm(
          ctx.ns.getAllowObjectMessage(url, mime), 
          "confirmUnblock")) { 
        ctx.cache.forceAllow[url] = mime;
        var doc = ctx.anchor.ownerDocument;
        if(mime == doc.contentType) { // stand-alone plugin
          doc.location.reload();
        } else {
          ctx.ns.setExpando(ctx.anchor, "removedPlugin", null);
          ctx.window.setTimeout(function() { 
            ctx.anchor.parentNode.replaceChild(ctx.object.cloneNode(true), ctx.anchor);
            ctx = null;
          }, 0);
          return;
        }
      }
      ctx = null;
    },
    
  },
  
  getSites: function(browser) {
    var sites = [];
    sites.scriptCount = 0;
    sites.pluginCount = 0;
    
    try {
      return this._enumerateSites(browser, sites);
    } catch(ex) {
      if(this.consoleDump) {
        dump("[NOSCRIPT ERROR!!!] Enumerating sites: " + ex.message + "\n");
      }
    }
    return sites;
  },
  
  _enumerateSites: function(browser, sites) {

    const nsIWebNavigation = CI.nsIWebNavigation;
    const nsIDocShell = CI.nsIDocShell;
    
    const docShells = browser.docShell.getDocShellEnumerator (
        CI.nsIDocShellTreeItem.typeContent,
        browser.docShell.ENUMERATE_FORWARDS
    );
    
    var docShell, doc, docURI, url;
    
    const pluginsCache = this.pluginsCache.get(browser);
    
    var cache;
    
    var document, domain;
    while(docShells.hasMoreElements()) {
       
       docShell = docShells.getNext();
       document = (docShell instanceof nsIDocShell) &&
                  docShell.contentViewer && docShell.contentViewer.DOMDocument;
       if(!document) continue;
       
       // Truncate title as needed
       if(this.truncateTitle && document.title.length > this.truncateTitleLen) {
         document.title = document.title.substring(0, this.truncateTitleLen);
       }
       
       // Collect document / cached plugin URLs
       url = this.getSite(docURI = document.documentURI);
       if(url) {
         cache = pluginsCache.uris[docURI];
         if(cache) {
           for(var pluginURI in cache) {
              sites.push(pluginURI);
            }
          }
          try {
            domain = document.domain;
            if(domain && domain != this.getDomain(url)) {
              url = domain;
            }
          } catch(e) {}
          sites.push(url);
       }

       if(!document._NoScript_contentLoaded && (!(docShell instanceof nsIWebNavigation) || docShell.isLoadingDocument))
         continue;
       
       // scripts
       this.processScriptElements(document, sites);
       
       // plugins
       this.processObjectElements(document, sites);

    }
    
    for(var j = sites.length; j-- > 0;) {
      url = sites[j];
      if(/:/.test(url) && !(
          /^[a-z]+:\/*[^\/\s]+/.test(url) || 
          /^(?:file|resource|chrome):/.test(url)
        )) {
        sites.splice(j, 1); // reject scheme-only URLs
      }
    }
    
    sites.topURL = sites[0] || '';
    return this.sortedSiteSet(sites);
  },
  
  
  // nsIWebProgressListener implementation
  onLocationChange: function(wp, aRequest, aLocation) {
    try {
      if(aRequest && (aRequest instanceof CI.nsIChannel) && aRequest.isPending()) {
        
        const ns = this;
        const rwd = ns.requestWatchdog;
        
        const domWindow = rwd.findWindow(aRequest);
        
        if(!domWindow) return;
        
        const uri = aRequest.URI;
        
        if(domWindow && domWindow.document && domWindow.document.characterSet == "UTF-7") {
          if((uri.schemeIs("http") || uri.schemeIs("https")) &&
              this.getPref("utf7filter", true)) {
            if(this.neutralizeUTF7(domWindow)) {
              aRequest.cancel(0x804b0002);
              return;
            }
          }
        }

        const topWin = domWindow == domWindow.top;
          
        var browser = null;
        var overlay = null;
        var xssInfo = null;
        

        if(topWin) {
          
          if(domWindow instanceof CI.nsIDOMChromeWindow) return;
        
          browser = ns.domUtils.findBrowserForNode(domWindow);
          overlay = browser && browser.ownerDocument.defaultView.noscriptOverlay;
          if(browser && overlay) {
            overlay.initContentWindow(domWindow);
            overlay.setMetaRefreshInfo(null, browser);
            xssInfo = rwd.extractFromChannel(aRequest);
            if(xssInfo) xssInfo.browser = browser;
            rwd.unsafeReload(browser, false);
          }
        }
        
       
        if(ns.shouldLoad(7, uri, uri, domWindow, aRequest.contentType, true) != 1) {
          aRequest.cancel(0x804b0002);
          if(xssInfo) overlay.notifyXSS(xssInfo);
        } else {
          if(topWin) {
            if(xssInfo) overlay.notifyXSSOnLoad(xssInfo);
            if(ns.autoAllow) {
              var site = ns.getQuickSite(uri.spec, ns.autoAllow);
              if(site && !ns.isJSEnabled(site)) {
                ns.autoTemp(site);
              }
            }
          }
        }
      }
    } catch(e) {
      ns.consoleDump && dump("[NoScript] " + e + "\n");
    }
  },
  onStatusChange: function() {}, 
  onStateChange: function() {}, 
  onSecurityChange: function() {}, 
  onProgressChange: function() {}
  ,
  // end nsIWebProgressListener
  
  neutralizeUTF7: function(window, altCharset) {
    var ds = this.domUtils.getDocShellFromWindow(window);
    var as = CC["@mozilla.org/atom-service;1"].
            getService(CI.nsIAtomService);
    ds.documentCharsetInfo.forcedCharset = as.getAtom(altCharset || "UTF-8");
    ds.reload(ds.LOAD_FLAGS_CHARSET_CHANGE);
    return true;
  },
  
  processBrowserClick: function(a) {
    if(this.jsEnabled || !this.getPref("fixLinks", true)) return;
    var doc = a.ownerDocument;
    if(!doc) return;
    
    var url = doc.documentURI;
    if((!url) || this.isJSEnabled(this.getSite(url))) return;
    
    
    while(!(a instanceof CI.nsIDOMHTMLAnchorElement || a instanceof CI.nsIDOMHTMLAreaElement)) {
      if(!(a = a.parentNode)) return;
    }
    
    const href = a.getAttribute("href");
    // fix JavaScript links
    var jsURL;
    if(href) {
      jsURL = /^javascript:/.test(href);
      if(!(jsURL || href == "#")) return;
    } else {
      jsURL = false;
    }
    
    var onclick = a.getAttribute("onclick");
    var fixedHref = fixedHref = (onclick && this.extractJSLink(onclick)) || 
                     (jsURL && this.extractJSLink(href)) || "";
    
    if(fixedHref) {
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
    while((m = findLink.exec(js))) {
      s = m[2];
      if(/^https?:\/\//.test(s)) return s;
      score = 0;
      if(s.indexOf("/") > -1) score += 2;
      if(s.indexOf(".") > 0) score += 1;
      if(score > maxScore) {
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
    if(!this.findOriginInEntry(targetURI, entry)) {
      entry.push({ origin: originURI, target: targetURI });
    }
  },
  findOriginInEntry: function(targetURI, entry, remove) {
    var o;
    for(var j = entry.length; j-- > 0;) {
      o = entry[j];
      if(entry[j].target === targetURI) {
        if(remove) {
          entry.splice(j, 1);
          if(entry.length == 0) {
            delete this._cache[targetURI.spec];
          }
        }
        return o.origin;
      }
    }
    return null;
  }
};

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
    if(start) {
      const unsafeRequest = this.getUnsafeRequest(browser);
      if(unsafeRequest) {
        // should we figure out what to do with unsafeRequest.loadFlags?
        browser.webNavigation.loadURI(unsafeRequest.URI.spec, 
              browser.webNavigation.LOAD_FLAGS_BYPASS_CACHE | 
              browser.webNavigation.LOAD_FLAGS_IS_REFRESH,
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
    if(!browser) return;
    var window = this.findWindow(channel);
    if(browser.contentWindow == window) {
      if(this.ns.consoleDump) this.dump(channel, "Top level document, resetting former untrusted browser info");
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
    
    try {
      return channel.QueryInterface(CI.nsIPropertyBag2)
        .getPropertyAsInterface("docshell.internalReferrer", CI.nsIURL);
    } catch(e) {}
    return null;
  },
  extractInternalReferrerSpec: function(channel) {
    var ref = this.extractInternalReferrer(channel);
    return ref && ref.spec || null;
  },
  
  detectBackFrame: function(prev, next, ds) {
    if(prev.ID != next.ID) return prev.URI.spec;
    if((prev instanceof CI.nsISHContainer) &&
       (next instanceof CI.nsISHContainer) &&
       (ds instanceof CI.nsIDocShellTreeNode)
      ) {
      var uri;
      for(var j = Math.min(prev.childCount, next.childCount, ds.childCount); j-- > 0;) {
        uri = this.detectBackFrame(prev.GetChildAt(j),
                                   next.GetChildAt(j),
                                   ds.GetChildAt(j));
        if(uri) return uri.spec;
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
    for(var j = sh.index; j > -1; j--) {
       he = sh.getEntryAtIndex(j, false);
       if(he.isSubFrame && j > 0) {
         uri = this.detectBackFrame(sh.getEntryAtIndex(j - 1), h,
           this.ns.getDocShellFromWindow(window)
         );  
       } else {
        // not a subframe navigation 
        if(window == window.top) {
          uri = he.URI.spec; // top frame, return history entry
        } else {
          window = window.parent;
          uri = window.document.documentURI;
        }
      }
      if(!uri) break;
      if(breadCrumbs[0] && breadCrumbs[0] == uri) continue;
      breadCrumbs.unshift(uri);
      var site = this.ns.getSite(uri);
      if(site) break;
    }
    return wantsBreadCrumbs ? breadCrumbs : site;
  },
  
  traceBack: function(channel, breadCrumbs) {
    try {
      var window = this.findWindow(channel);
      var webNav = window.top.QueryInterface(CI.nsIInterfaceRequestor).getInterface(CI.nsIWebNavigation);
      const sh = webNav.sessionHistory;
      return sh ? this.traceBackHistory(sh, window, breadCrumbs || null) 
                : webNav.currentURI && !webNav.currentURI.equals(channel.URI) 
                  ? webNav.currentURI.spec
                  : '';
    } catch(e) {
      if(this.ns.consoleDump) this.dump(channel, "Error tracing back origin: " + e.message);
    }
    return '';
  },
  
  observe: function(subject, topic, data) {
    try {
      this.filterXSS(subject);
    } catch(e) {
      this.abort({ channel: subject, reason: e.message, silent: true });
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
  }
  ,
  filterXSS: function(channel) {
    const ns = this.ns;
    
    if(!((channel instanceof CI.nsIHttpChannel) && (channel.loadFlags & this.LOAD_DOCUMENT_URI))) { 
      return;
    }
    
    const url = channel.URI;
    const originalSpec = url.spec;
    
    const xorigin = ns.xcache.pickOrigin(url, true); // picks and remove cached entry
    
    if(this.noscriptReload == originalSpec) {
      // fast cache route for NoScript-triggered reloads
      this.noscriptReload = null;
      try {
        if(ns.consoleDump) {
          ns.dump("Fast reload, original flags: " + 
            channel.loadFlags + ", " + (channel.loadGroup && channel.loadGroup.loadFlags));
        }
        channel.loadFlags = (channel.loadFlags & ~CI.nsIChannel.VALIDATE_ALWAYS) | 
                    CI.nsIChannel.LOAD_FROM_CACHE | CI.nsIChannel.VALIDATE_NEVER;
        if(channel.loadGroup) {
          channel.loadGroup.loadFlags = (channel.loadGroup.loadFlags & ~CI.nsIChannel.VALIDATE_ALWAYS) | 
                  CI.nsIChannel.LOAD_FROM_CACHE | CI.nsIChannel.VALIDATE_NEVER;
        }
        if(ns.consoleDump) {
          ns.dump("Fast reload, new flags: " + 
            channel.loadFlags + ", " + (channel.loadGroup && channel.loadGroup.loadFlags));
        }
      } catch(e) {
        // we may have a problem here due to something Firekeeper 0.2.11 started doing..
        ns.dump(e);
      }
    }
    
    // fast return if nothing to do here
    if(!(ns.filterXPost || ns.filterXGet)) return; 
    
    var browser = null;
    
    var origin = xorigin && xorigin.spec || 
        channel.originalURI.spec != originalSpec && channel.originalURI.spec 
        || this.extractInternalReferrerSpec(channel) || null;

    var untrustedReload = false;
   
    var originSite = null;
    
    if(!origin) {
      if((channel instanceof CI.nsIHttpChannelInternal) && channel.documentURI) {
        if(originalSpec == channel.documentURI.spec) {
           var breadCrumbs = [originalSpec];
           originSite = this.traceBack(channel, breadCrumbs);
           if(originSite) {
             origin = breadCrumbs.join(">>>");
             if(ns.consoleDump) this.dump(channel, "TRACEBACK ORIGIN: " + originSite + " FROM " + origin);
           } else {
             // check untrusted reload
             browser = this.findBrowser(channel);
             if(!this.getUntrustedReloadInfo(browser)) {
               if(ns.consoleDump) this.dump(channel, "Trusted reload");
               return;
             }
             origin = "";
             untrustedReload = true;
             if(ns.consoleDump) this.dump(channel, "Untrusted reload");
           }
        } else {
          origin = channel.documentURI.spec;
          if(ns.consoleDump) this.dump(channel, "ORIGIN (from channel.documentURI): " + origin);
        }
      } else {
        if(ns.consoleDump) this.dump("***** NO ORIGIN CAN BE INFERRED!!! *****");
      }
    } else {
      if(channel.loadFlags & channel.LOAD_INITIAL_DOCUMENT_URI && channel.originalURI.spec == channel.URI.spec) {
        // clean up after user action
        browser = browser || this.findBrowser(channel);
        this.resetUntrustedReloadInfo(browser, channel);
        var unsafeRequest = this.getUnsafeRequest(browser);
        if(unsafeRequest && unsafeRequest.URI.spec != channel.originalURI.spec) {
          this.setUnsafeRequest(browser, null);
        }
      }
      if(ns.consoleDump) this.dump(channel, "ORIGIN: " + origin + ", xorigin: " + (xorigin && xorigin.spec) + ", originalURI: " + channel.originalURI.spec);
    }
    
    const su = this.siteUtils;
    originSite = originSite || su.getSite(origin);
    
    var host = channel.URI.host;
    if(host[host.length - 1] == ".") {
      channel.URI.host = this.dns.resolve(host, 2).canonicalName;
    }
    
    var targetSite = su.getSite(originalSpec);
    
    const globalJS = ns.globalJS;
    
    // noscript.injectionCheck about:config option adds first-line 
    // detection for XSS injections in GET requests originated by 
    // whitelisted sites and landing on top level windows. Value can be:
    // 0 - never check
    // 1 - check cross-site requests from temporary allowed sites
    // 2 - check every cross-site request (default)
    // 3 - check every request
    
    var injectionCheck = ns.injectionCheck;
    
    if(originSite == targetSite && 
       (injectionCheck < 3 || channel.requestMethod != "GET") 
      ) return; // same origin, fast return
    
    if(this.callback && this.callback(channel, origin)) return;
    
    
    var externalLoad = this.externalLoad && this.externalLoad == originalSpec;
    if(externalLoad) {
      this.externalLoad = null;
    } else if(this.isUnsafeReload(browser = browser || this.findBrowser(channel))) {
      if(ns.consoleDump) this.dump(channel, "UNSAFE RELOAD of [" + originalSpec +"] from [" + origin + "], SKIP");
      return;
    }
    
    if(!(globalJS || ns.isJSEnabled(targetSite))) {
      // check wildcards
      // http://url:0 matches all port except defaults
      if(ns.checkShorthands(targetSite)) {
          ns.autoTemp(targetSite);
      } else {
        if(ns.consoleDump) this.dump(channel, "Destination " + originalSpec + " is noscripted, SKIP");
          return;
      }
    }
    
    if(ns.filterXExceptions) {
      try {
        if(ns.filterXExceptions.test(decodeURI(originalSpec))) { 
          // "safe" xss target exception
          if(ns.consoleDump) this.dump(channel, "Safe target according to filterXExceptions: " + ns.filterXExceptions.toString());
          return;
        }
      } catch(e) {}
    }
    
    
    if(!originSite) { // maybe data or javascript URL?
      if(/^(?:javascript|data):/i.test(origin) && ns.getPref("xss.trustData", true)) {
        var breadCrumbs = [origin];
        originSite = this.traceBack(channel, breadCrumbs);
        if(originSite) { 
          origin = breadCrumbs.join(">>>");
        }
        delete breadCrumbs;
      }
    }
    
    var originalAttempt;
    var injectionAttempt = false;
    var window = this.findWindow(channel);
    
    // neutralize window.name-based attack
    if(window && window.name && /[^\w\-\s]/.test(window.name)) {
      originalAttempt = window.name;
      window.name = window.name.replace(/[^\w\-\s]/g, " ");
      ns.log('[NoScript XSS]: sanitized window.name, "' + originalAttempt + '" to "' + window.name + '".');
    }
   
    if(globalJS || ns.isJSEnabled(originSite)) {
      this.resetUntrustedReloadInfo(browser = browser || this.findBrowser(channel), channel);
      
      if(injectionAttempt = injectionCheck && (injectionCheck > 1 || ns.isTemp(originSite)) &&
          channel.requestMethod == "GET" &&
          ns.injectionChecker.checkURL(originalSpec)) {
        injectionAttempt = window == window.top; 
      }
      
      if(injectionAttempt) {
        if(ns.consoleDump) this.dump(channel, "Detected injection attempt at level " + injectionCheck);
      } else {
        if(ns.consoleDump) this.dump(channel, "externalLoad flag is " + externalLoad);

        if(externalLoad) { // external origin ?
          if(ns.consoleDump) this.dump(channel, "External load from " + origin);
          if(this.isHome(url)) {
            if(ns.consoleDump) this.dump(channel, "Browser home page, SKIP");
            return;
          }
          if(ns.getPref("xss.trustExternal", false)) {
            if(ns.consoleDump) this.dump(channel, "noscript.xss.trustExternal is TRUE, SKIP");
            return;
          }
          origin = "///EXTERNAL///";
          originSite = "";
        } else if(ns.getPref("xss.trustTemp", true) || !ns.isTemp(originSite)) { // temporary allowed origin?
          if(ns.consoleDump) {
            this.dump(channel, "Origin " + origin + " is trusted, SKIP");
          }
          return;
        }
        if(ns.consoleDump) 
          this.dump(channel, (externalLoad ? "External origin" : "Origin " + origin + " is TEMPORARILY allowed") + 
            ", we don't really trust it");
      }
    }
    
    if(untrustedReload && browser) {
      this.resetUntrustedReloadInfo(browser, channel);
    }
    
    
    
    
    
    // -- DANGER ZONE --
    
    var requestInfo = {
      xssMaybe: false,
      channel: channel,
      unsafeRequest: {
        URI: url.clone(),
        postData: null,
        referrer: channel.referrer && channel.referrer.clone(),
        origin: origin,
        loadFlags: channel.loadFlags,
        issued: false
      },
      sanitizedURI: url,
      window: window
    };
    

    
    

    // transform upload requests into no-data GETs
    if(ns.filterXPost && (channel instanceof CI.nsIUploadChannel) && channel.uploadStream) {
      channel.requestMethod = "GET";
 
      requestInfo.unsafeRequest.postData = channel.uploadStream;
      channel.uploadStream = null;
      this.notify(this.addXssInfo(requestInfo, {
        reason: "filterXPost",
        origin: origin,
        originalAttempt: originalSpec,
        silent: untrustedReload
      }));
    }
    
    if(ns.filterXGet && ns.filterXGetRx) {
      var changes = null;
      var xsan = new XSanitizer(ns.filterXGetRx, ns.filterXGetUserRx);
      // sanitize referrer
      if(channel.referrer && channel.referrer.spec) {
        originalAttempt = channel.referrer.spec;
        xsan.brutal = true;
        try {
          if(channel.referrer instanceof CI.nsIURL) {
            changes = xsan.sanitizeURL(channel.referrer);
          } else {
            channel.referrer.spec =  xsan.sanitizeURIComponent(originalAttempt);
          }
        } catch(e) {
          this.dump("Failed sanitizing referrer " + channel.referrer.spec + ", " + e);
          channel.referrer.spec = "";
        }
        try {
          if(!changes) {
            changes = { 
              minor: !channel.referrer.spec || 
                     decodeURI(originalAttempt) != decodeURI(channel.referrer.spec) 
            };
          }
          if(changes.minor) {
            channel.referrer = channel.referrer.clone();
            this.notify(this.addXssInfo(requestInfo, {
              reason: "filterXGetRef",
              origin: origin,
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
      if(changes.minor) {
        this.notify(this.addXssInfo(requestInfo, {
          reason: "filterXGet",
          origin: origin,
          originalAttempt: originalAttempt,
          silent: !changes.major 
        }));
      }
    }
   
    

    if(requestInfo.xssMaybe) {
      // avoid surprises from history & cache
      if(channel instanceof CI.nsICachingChannel) {
        
        const CACHE_FLAGS = channel.LOAD_FROM_CACHE | 
                            channel.VALIDATE_NEVER | 
                            channel.LOAD_ONLY_FROM_CACHE;
        // if(channel.loadFlags & CACHE_FLAGS) {
          channel.loadFlags = channel.loadFlags & ~CACHE_FLAGS | channel.LOAD_BYPASS_CACHE;
          if(this.consoleDump) this.dump(channel, "SKIPPING CACHE");
        // }
      }
      
      if(requestInfo.window && requestInfo.window == requestInfo.window.top) {
        this.setUnsafeRequest(requestInfo.browser, requestInfo.unsafeRequest);
      }
    }
  },
  
  abort: function(requestInfo) {
    if(requestInfo.channel instanceof CI.nsIRequest) {
      requestInfo.channel.cancel(0x804b0002 /* NS_BINDING_ABORTED */);
    }
    this.dump(requestInfo.channel, "Aborted - " + requestInfo.reason);
    this.notify(requestInfo);
  },
  
  mergeDefaults: function(o1, o2) {
    for(p in o2) {
      if(!(p in o1)) o1[p] = o2[p];
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
        requestInfo.origin,
        requestInfo.sanitizedURI && requestInfo.sanitizedURI.spec || ""
      ]);
    this.dump(requestInfo.channel, "Notifying " + msg + "\n\n\n");
    this.ns.log(msg);
   
    try {
      if(requestInfo.silent || !requestInfo.window ||
        !this.ns.getPref("xss.notify", true) ||
        (requestInfo.window && requestInfo.window != requestInfo.window.top && 
            !this.ns.getPref("xss.notify.subframes", false)
        )
      ) return;
      this.attachToChannel(requestInfo);
    } catch(e) {
      dump(e + "\n");
    }
  },
  
  attachToChannel: function(requestInfo) {
    requestInfo.QueryInterface = xpcom_generateQI([CI.nsISupports]);
    requestInfo.wrappedJSObject = requestInfo;
    requestInfo.channel.QueryInterface(CI.nsIWritablePropertyBag2)
      .setPropertyAsInterface("noscript.XSS", requestInfo);
  },
  extractFromChannel: function(channel) {
    if(channel instanceof CI.nsIPropertyBag2) {
      try {
        var requestInfo = channel.getPropertyAsInterface("noscript.XSS", CI.nsISupports);
        if(requestInfo) return requestInfo.wrappedJSObject;
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
    if(!(this.ns.consoleDump & 2)) return;
    dump("[NoScript] ");
    dump((channel.URI && channel.URI.spec) || "null URI?" );
    if(channel.originalURI && channel.originalURI.spec != channel.URI.spec) {
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
      CC["@mozilla.org/xul/xul-document;1"]
        .createInstance(CI.nsIDOMDocument)
        .createElementNS("http://www.w3.org/1999/xhtml", "div")
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
    return s.replace(/&[\w#-]*?;/g, function(e) { return Entities.convert(e) });
  },
  convertDeep: function(s) {
    for(var prev = null; (s = this.convertAll(s)) != prev; prev = s);
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
  check: function(script) {
    this.sandbox.script = script;
     try {
       Components.utils.evalInSandbox("new Function(script)", this.sandbox);
       return true;
     } catch(e) {
       this.lastError = e;
     }
     return false;
  }
};

var InjectionChecker = {
  syntax: new SyntaxChecker(),
  _log: function(msg, t) {
    if(t) msg += " - TIME: " + (new Date().getTime() - t);
    dump("[NoScript InjectionChecker] " + msg + "\n");
  },
  log: function() {},
  get logEnabled() { return this.log == this._log; },
  set logEnabled(v) { this.log = v ? this._log : function() {}; },
  
  checkJSSyntax: function(s) {
    if(this.syntax.check(s)) {
      this.log("Valid fragment " + s);
      return true;
    }
    return false;
  },
  
  _breakStops: null,
  get breakStops() {
    if(this._breakStops) return this._breakStops;
    var def = "\\/\\?&#;";
    var bs = {
      nq: new RegExp("[" + def + "]")
    };
    Array.forEach("'\"", function(c) { bs[c] = new RegExp("[" + def + c + "]"); });
    return this._breakStops = bs;
  },
  
   maybeJS: function(expr, THRESHOLD) {
     score = 0;
    // single function call with arguments, it would be enough -- eval(name) -- but we catch those shorties in checkJSStunts()
    if(/[\w$\]][\s\S]*\(\s*[^\)\(\s][\S\s]*\)/.test(expr)) {
      score += 2;
      // multiple function calls or assignments or dot notation, danger! (a=eval,b=unescape,c=location;a(b(c)))
      if(/\([^\(\s]*\(|=|\./.test(expr)) score += 2;
    }
    return (
      (score >= THRESHOLD) ||
    // assignment
      /[\w$\]][\s\S]*(?:=[\s\S]*[\[\w$]|\(\s*\))/.test(expr) && 
        (score += 1) >= THRESHOLD || 
    // dot notation
      /[\w$\]][\s\S]*\./.test(expr) && 
        (score += 1) >= THRESHOLD ||
    // named properties
      /\[[\s\S]*\]/.test(expr) &&
       (score += 2) >= THRESHOLD ||
    // closed string literals
      /(['"/])[^\1]+\1/.test(expr) && 
       (score += 2) >= THRESHOLD
    ) && score;
  },
  
  checkJSBreak: function(s) {
    // Direct script injection breaking JS string literals or comments
    const THRESHOLD = 4;
    if(!this.maybeJS(s, THRESHOLD)) return false;
    
    s = s.replace(/\%\d+[a-z]\w*/gi, '`'); // cleanup most urlencoded noise
    const findInjection = /(['"\n\r#\]\)]|[\/\?=&](?![\/\?=&])|\*\/)(?=([\s\S]*?(?:\([\s\S]*?\)|\[[\s\S]*?\]|=[\s\S]*?[\w$\.\[\]\-]+)))/g;
    findInjection.lastIndex = 0;
    var breakSeq, subj, expr, quote, len, bs, bsPos, hunt, moved, script, score, errmsg;
    
    const MAX_TIME = 800, MAX_LOOPS = 50;

    const t = new Date().getTime();
    for(var m, iterations = 0; m = findInjection.exec(s);) {
      breakSeq = m[1];
      expr = m[2];
      subj = s.substring(findInjection.lastIndex);

      // quickly skip innocuous CGI patterns
      if((m = subj.match(/^(?:[\w\s\-\/&:]+=[\w\s\-\/:]+(?:&|$))+|\w+:\/\/[\w+\-\.]*/))) {
        findInjection.lastIndex += m[0].length;

        continue;
      }
      
      
      quote = breakSeq == '"' || breakSeq == "'" ? breakSeq : '';
      bs = this.breakStops[quote || 'nq']  


      len = expr.length;
      for(moved = false, hunt = !!expr; hunt;) {
        
        if(new Date().getTime() - t > MAX_TIME) {
          this.log("Too long execution time! Assuming DOS... " + s);
          return true;
        }
        
        hunt = len < subj.length;
        if(moved) {
          moved = false;
        } else if(hunt) {
          bsPos = subj.substring(len).search(bs);
          if(bsPos < 0) {
            expr = subj;
            hunt = false;
          } else {
            len += bsPos;
            if(quote && subj[len] == quote) {
              len++;
            }
            if(bsPos == 0) len++;
            else expr = subj.substring(0, len);
          }
        }

        script = (quote ? quote + quote + expr + quote : expr);
        if(/^[^"'\/\[\(]*[\]\)%\/\\`]|(?:''|"")(?:[ \t]*[`\w]+[ \t]*[`\w]+|[^"'\/]*`)/.test(script)) {
           // this.log("SKIP (head syntax) " + script);
           break; // unrepairable syntax error in the head move left cursor forward 
        }
        
        if(this.maybeJS(expr, THRESHOLD)) {

          if(this.checkJSSyntax( script + "/**/")) {
            this.log("JS Break Injection detected", t);
            return true;
          }
          if(++iterations > MAX_LOOPS) {
            this.log("Too many syntax checks! Assuming DOS... " + s, t);
            return true;
          }
          errmsg = this.syntax.lastError.message;
          this.log(iterations + ": " + errmsg + "\n" + expr + "\n---------------");
          if(errmsg.indexOf("left-hand") > 0) {
            break; // unrepairable syntax error (wrong assignment to a left-hand expression), move left cursor forward 
          } else if((m = errmsg.match(/\bmissing ([:\]\)]) /))) {
            len = subj.indexOf(m[1], len);
            if(len > -1) {
               expr = subj.substring(0, ++len);
               moved = m[1] != ':';
            } else break;
          } 
        }
      }
    }
    this.log(s, t);
    return false;
  },
    
  checkJSStunt: function(s) {
    // check noisy comments first
    if(/\/\*[\s\S]*\*\//.test(s)) { 
      this.log("JS comments in " + s);
      return true; 
    }
    // simplest navigation acts (no dots, no round/square brackets) that we purposedly let slip from checkJSBreak 
    if(/\blocation\s*=\s*name\b/.test(s)) { 
      this.log("location=name navigation attempt in " +s);
      return true;
    };
    // check well known and semi-obfuscated -- as in [...]() -- function calls
    var m = s.match(/\b(open|eval|[fF]unction|with|\[[^\]]*\w[^\]]*\]|split|replace|toString|substr(?:ing)?|Image|fromCharCode|toLowerCase|unescape|decodeURI(?:Component)?|atob|btoa|\${1,2})\s*\([\s\S]*\)/);
    if(m) {
      var pos;
      var js = m[0];
      if(js.charAt(0) == '[') js = "_xss_" + js;
      for(;;) {
        if(this.checkJSSyntax(js)) {
          return true;
        }
        pos = js.lastIndexOf(")");
        if(pos < 0) break;
        js = js.substring(0, pos);
      }
    }
    return false;
  },
  
  checkJS: function(s, ignoreEntities) {
    if(this.checkJSStunt(s) || this.checkJSBreak(s)) return true;
    if(ignoreEntities) return false;
    var converted = Entities.convertAll(s);
    return (converted != s) && arguments.callee.apply(this, [converted, true]);
  },
  
  HTMLChecker: (function() {
      const tags = "script|form|style|link|object|embed|applet|iframe|frame|base|body|meta".replace(/[a-z]/g, "\\W*$&");
      return new RegExp("<\\W*/?(?:" + tags + 
              ")|\\W(?:javascript|data):|[/'\"\\s\\x08]\\W*(?:FSCommand|on[a-z]{3,}[\\s\\x08]*=)|@import|-moz-binding[\\s\\S]*:[\\s\\S]*url", "gi");
  })(),
  checkHTML: function(s) {
    return this.HTMLChecker.test(s);
  },
  
  checkURL: function(url, depth) {

    // iterate escaping until there's no more to escape
    var currentURL = url, prevURL = null;
    // let's assume protocol and host are safe
    currentURL = currentURL.replace(/^[a-z]+:\/\/.*?(?=\/|$)/, "");
    for(depth = depth || 2; depth-- > 0 && currentURL != prevURL;) {
      try {
        if(this.checkHTML(currentURL) || this.checkJS(currentURL)) return true;
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
    var _dump = dump;
    if(print) {
      dump = print;
    }
    t = new Date().getTime();
    this.checkURL(url);
    dump("********** " + (new Date().getTime() - t) + " **********");
    dump = _dump;
  },
  testSamples: function() {
    for each(u in [
      "http://pagead2.googlesyndication.com/cpa/ads?client=ca-pub-1563315177023518&cpa_choice=CAAQwLOkgwIaCEjO5OMYO7UfKMi84IEB&oe=UTF-8&dt=1183686874437&lmt=1183686871&prev_fmts=120x60_as_rimg&format=120x60_as_rimg&output=html&correlator=1183686872530&url=http%3A%2F%2Facme.com%2Fforum&region=_google_cpa_region_&ref=http%3A%2F%2Facme.com%2Fgetit&cc=100&flash=9&u_h=1200&u_w=1920&u_ah=1170&u_aw=1920&u_cd=32&u_tz=120&u_his=6&u_java=true&u_nplug=32&u_nmime=118"
      ,
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
    if(url.username) url.username = this.sanitizeEnc(url.username);
    if(url.password) url.password = this.sanitizeEnc(url.password);
    url.host = this.sanitizeEnc(url.host);
    
    if(url instanceof CI.nsIURL) {
      // sanitize path
     
      if(url.param) {
        url.path = this.sanitizeURIComponent(url.path); // param is the URL part after filePath and a semicolon ?!
      } else if(url.filePath) { 
        url.filePath = this.sanitizeURIComponent(url.filePath); // true == lenient == allow ()=
      }
      // sanitize query
      if(url.query) url.query = this.sanitizeQuery(url.query, changes);
      // sanitize fragment
      var fragPos = url.path.indexOf("#");
      if(url.ref || fragPos > -1) {
        if(fragPos >= url.filePath.length + url.query.length) {
          url.path = url.path.substring(0, fragPos) + "#" + this.sanitizeEnc(url.path.substring(fragPos + 1));
        } else {
          url.ref = this.sanitizeEnc(url.ref);
        }
      }
    } else {
      // fallback for non-URL URIs, we should never get here anyway
      if(url.path) url.path = this.sanitizeURIComponent(url.Path);
    }
    
    var urlSpec = url.spec;
    var neutralized = Entities.neutralizeAll(urlSpec, /[^\\'"\x00-\x07\x09\x0B\x0C\x0E-\x1F\x7F<>]/);
    if(urlSpec != neutralized) url.spec = neutralized;
    
    if(url.getRelativeSpec(original) && unescape(url.spec) != unescape(original.spec)) { // ok, this seems overkill but take my word, the double check is needed
      changes.minor = true;
      changes.major = changes.major || changes.qs || 
                      unescape(original.spec.replace(/\?.*/g, "")) 
                        != unescape(url.spec.replace(/\?.*/g, ""));
      if(changes.major) {
        url.ref = Math.random().toString().concat(Math.round(Math.random() * 999 + 1)).replace(/0./, '') // randomize URI
      }
    } else {
      changes.minor = false;
      url.spec = original.spec;
    }
    return changes;
  },
  
  
  sanitizeQuery: function(query, changes, sep) {
    // replace every character matching noscript.filterXGetRx with a single ASCII space (0x20)
    changes = changes || {};
    if(!sep) {
      sep = query.indexOf("&") > -1 ? "&" : ";" 
    }
    const parms = query.split(sep);
    var j, pieces, k, pz, origPz, encodedPz, nestedURI, qpos, apos;
    
    for(j = parms.length; j-- > 0;) {
      pieces = parms[j].split("=");
      try {
        for(k = pieces.length; k-- > 0;) {
          origPz = pz = decodeURIComponent(encodedPz = pieces[k]);
          nestedURI = null;
          if(/^https?:\/\//i.test(pz)) {
            // try to sanitize as a nested URL
            try {
              nestedURI = SiteUtils.ios.newURI(pz, null, null).QueryInterface(CI.nsIURL);
              changes.qs = changes.qs || this.sanitizeURL(nestedURI).major;
              pz = nestedURI.spec;
            } catch(e) {
              nestedURI = null;
            }
          }
          
          if(!nestedURI) {
            qpos = pz.indexOf("?");
            spos = pz.search(/[&;]/);
            if(qpos > -1 && spos > qpos) { 
              // recursive query string?
              if(qpos > -1 && spos > qpos) {
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
            if(origPz != pz) changes.qs = true;
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
  sanitize: function(s) {
    // deeply convert entities
    s = Entities.convertDeep(s);
    
    if(s.indexOf('"') > -1) {
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
      if(s.replace(/[^"]/g, "").length % 2) s += '"'; // close unpaired quotes
      return s;
    }
    // regular duty
    s = s.replace(this.primaryBlacklist, " ");
    
    s = s.replace(/javascript\s*:+|data\s*:+|-moz-binding|@import/ig, function(m) { return m.replace(/\W/g, " "); });
    
    if(this.extraBlacklist) { // additional user-defined blacklist for emergencies
      s = s.replace(this.extraBlacklist, " "); 
    }
    
    if(this.brutal) { // injection checks were positive
      s = s.replace(/[\(\)\=]/g, " ");
    }
    
    return s;
  }
};


