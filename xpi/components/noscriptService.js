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

function UninstallGuard(name) {
  this.name = name;
}

UninstallGuard.prototype = {
  uninstalling: false,
  disabled: false,
  get ds() {
    return Components.classes["@mozilla.org/extensions/manager;1"
        ].getService(Components.interfaces.nsIExtensionManager
      ).datasource;
  }
,
  get rdfService() {
    return Components.classes["@mozilla.org/rdf/rdf-service;1"].getService(Components.interfaces.nsIRDFService);
  }
,
  onAssert: function(ds,source,prop,target) {
    this.check(ds,source);
  },
  onBeginUpdateBatch: function(ds) {},
  onChange: function(ds,source,prop,oldTarget,newTarget) {
    this.check(ds,source);
  },
  onEndUpdateBatch: function(ds) {
    try {
      this.checkAll(ds);
    } catch(ex) {}
  },
  onMove: function(ds,oldSource,newSource,prop,target) {
    this.check(ds,newSource);
  },
  onUnassert: function(ds,source,prop,target) {
    this.check(ds,source);
  }
,
  init: function() {
    try {
      this.ds.AddObserver(this);
    } catch(ex) {
      this.log(ex);
    } 
  }
,
  dispose: function() {
    try {
      this.ds.RemoveObserver(this);
    } catch(ex) {
      this.log(ex);
    } 
  }
,
  checkAll: function(ds) {
    const container = Components.classes["@mozilla.org/rdf/container;1"]
               .getService(Components.interfaces.nsIRDFContainer);
    var root = this.rdfService.GetResource("urn:mozilla:extension:root");
    container.Init(ds, root);

     var elements = container.GetElements();
     for(var found = false; elements.hasMoreElements() && !found; ) {
        found = this.check(elements.getNext().QueryInterface(Components.interfaces.nsIRDFResource));
     }
  }
,
  check: function(extensionDS,element) {
    try { 
      const RDFService = this.rdfService;
      var target;
      if((target=extensionDS.GetTarget(element,  
        RDFService.GetResource("http://www.mozilla.org/2004/em-rdf#name") ,true))
        && target.QueryInterface(Components.interfaces.nsIRDFLiteral).Value==this.name
        ) {
        this.uninstalling = (
          (target = extensionDS.GetTarget(element, 
            RDFService.GetResource("http://www.mozilla.org/2004/em-rdf#toBeUninstalled"),true)
            ) != null 
            && target.QueryInterface(Components.interfaces.nsIRDFLiteral).Value == "true"
           );
        this.disabled = (
          (target = extensionDS.GetTarget(element, 
            RDFService.GetResource("http://www.mozilla.org/2004/em-rdf#toBeDisabled"),true)
            ) != null
            && target.QueryInterface(Components.interfaces.nsIRDFLiteral).Value == "true"
          );
        return true;
      }  
     } catch(ex) {
       this.log(ex);
     } // quick and dirty work-around for SeaMonkey ;)
     return false;
  }
,
  log: function(msg) {
    dump("UninstallGuard: "+msg+"\n");
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
        Components.classes["@mozilla.org/intl/stringbundle;1"]
                  .getService(Components.interfaces.nsIStringBundleService)
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
  const _domainPattern = /^[^\?\/#,;:\\\@]+$/;
  
  const _ios = this.ios = Components.classes["@mozilla.org/network/io-service;1"]
    .getService(Components.interfaces.nsIIOService);
  
  const _uriFixup = this.uriFixup = Components.classes["@mozilla.org/docshell/urifixup;1"]
    .getService(Components.interfaces.nsIURIFixup);
  
  function sorter(a,b) {
    if(a==b) return 0;
    if(!a) return 1;
    if(!b) return -1;
    const dp = _domainPattern;
    return dp.test(a)?
      (dp.test(b)?(a<b?-1:1):-1)
      :(dp.test(b)?1:a<b?-1:1);
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
      if(uri instanceof Components.interfaces.nsIJARURI) {
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
    const ci = Components.interfaces;
    const lm = this.lookupMethod;
    if(!(ctx instanceof ci.nsIDOMWindow)) {
      if(ctx instanceof ci.nsIDOMDocument) {
        ctx = lm(ctx, "defaultView")();
      } else if(ctx instanceof ci.nsIDOMNode) {
        ctx = lm(lm(ctx, "ownerDocument")(), "defaultView")();
      } else return null; 
    }
    if(!ctx) return null;
    ctx = lm(ctx, "top")();
    
    var bi = new this.BrowserIterator();
    for(var b; b = bi.next();) {
      if(b.contentWindow == ctx) return b;
    }
    
    return null;
  },
  
  getDocShellFromWindow: function(window) {
    const ci = Components.interfaces;
    try {
      return window.QueryInterface(ci.nsIInterfaceRequestor)
                   .getInterface(ci.nsIWebNavigation)
                   .QueryInterface(ci.nsIDocShell);
    } catch(e) {
      return null;
    }
  },
  
  BrowserIterator: function() {
     const wm = Components.classes['@mozilla.org/appshell/window-mediator;1']
                          .getService(Components.interfaces.nsIWindowMediator);
    
    var mostRecentWin, mostRecentTab;
    var currentWin = mostRecentWin = wm.getMostRecentWindow("navigator:browser");
    var winEnum = null;
    var currentTB, currentTab;
    var curTabIdx;
    var browsers;
    
    function initPerWin() {
      currentTB = currentWin && currentWin.getBrowser();
      if(currentTB) {
        browsers = currentTB.browsers;
        currentTab = mostRecentTab = currentTB && currentTB.selectedBrowser;
      } else {
        currentTab = null;
      }
      curTabIdx = 0;
    }
    
    initPerWin();
   
    this.next = function() {
      var ret = currentTab;
      if(!ret) return null;
      if(curTabIdx >= browsers.length) {
        
        if(!winEnum) {
          winEnum = wm.getEnumerator("navigator:browser");
        }
        if(winEnum.hasMoreElements()) {
          currentWin = winEnum.getNext();
          if(currentWin == mostRecentWin) return this.next();
          initPerWin();
        } else {
          currentTab = null;
          return ret;
        }
      }
      currentTab = browsers[curTabIdx++];
      
      if(currentTab == mostRecentTab) this.next();
      return ret;
    }
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
      const sm={};
      const sl = SiteUtils.splitString(this.sitesString);
      if(sl) {
        for(var j = sl.length; j-->0;) {
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
    this._sitesList=null;
    return this._sitesMap=sm;
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

NoscriptService.prototype ={
  VERSION: "1.1.4.8.070619",
  
  get wrappedJSObject() {
    return this;
  }
,
  QueryInterface: function(iid) {
     this.queryInterfaceSupport(iid, SERVICE_IIDS);
     return this;
  }
,
  // nsIObserver implementation 
  observe: function(subject, topic, data) {
    // dump(SERVICE_NAME+" notified of "+subject+","+topic+","+data); //DDEBUG
    if(subject instanceof Components.interfaces.nsIPrefBranch2) {
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
            dump("NS: init error -- " + e.message);
          }
          break;
        case "em-action-requested":
          if( (subject instanceof Components.interfaces.nsIUpdateItem)
              && subject.id==EXTENSION_ID ) {
              this.uninstallGuard.uninstalling = data=="item-uninstalled";
              this.uninstallGuard.disabled = data=="item-disabled"
          }
      }
    }
  }
,  
  register: function() {
    const osvr = Components.classes['@mozilla.org/observer-service;1'].getService(
      Components.interfaces.nsIObserverService);
    osvr.addObserver(this, "profile-before-change", false);
    osvr.addObserver(this, "xpcom-shutdown", false);
    osvr.addObserver(this, "profile-after-change", false);
    osvr.addObserver(this, "em-action-requested", false);
    if(!this.requestWatchdog) {
      osvr.addObserver(this.requestWatchdog = new RequestWatchdog(this), "http-on-modify-request", false);
    }
  }
,
  unregister: function() {
    const osvr=Components.classes['@mozilla.org/observer-service;1'].getService(
      Components.interfaces.nsIObserverService);
    osvr.removeObserver(this, "profile-before-change");
    osvr.removeObserver(this, "xpcom-shutdown");
    osvr.removeObserver(this, "profile-after-change");
    osvr.removeObserver(this, "em-action-requested", false);
    if(this.requestWatchdog) {
      osvr.removeObserver(this.requestWatchdog, "http-on-modify-request", false);
      this.requestWatchdog = null;
    }
  },
  
  dispose: function() {
    this.prefs.removeObserver("", this);
    this.mozJSPref.removeObserver("enabled", this, false);
    this.resetJSCaps();
    this.uninstallGuard.dispose();
  }
,
  
  // Preference driven properties
  autoAllow: false,
  
  blockCssScanning: true,
  blockCrossIntranet: true,
  
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
  
  injectionCheck: 2,
  
  jsredirectIgnore: false,
  jsredirectFollow: true,
  
  nselNever: false,
  nselForce: true,
  
  filterXGetRx: "[^\\w:\\/\\.\\-\\+\\*\\=\\(\\)\\[\\]\\{\\}~,@;]",
  filterXGetRx2Black: "[\(\)\=;]",
  
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
          this.mozJSEnabled=this.mozJSPref.getBoolPref("enabled");
        } catch(ex) {
          this.mozJSPref.setBoolPref("enabled",this.mozJSEnabled=true);
        }
      break;
      case "forbidJava":
      case "forbidFlash":
      case "forbidPlugins":
      case "forbidData":
        this[name]=this.getPref(name, this[name]);
        var fsp = this.forbidSomeContent;
        this.forbidSomeContent = this.forbidJava || this.forbidFlash || this.forbidPlugins || this.forbidData;
        this.forbidAllContent = this.forbidJava && this.forbidFlash && this.forbidPlugins;
        if(fsp != this.forbidSomeContent) this.initContentPolicy();
      break;
      
      case "filterXPost":
      case "filterXGet":
      case "blockCssScanners":
      case "blockXIntranet":
        this.initContentPolicy();
        
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
      break;
      case "forbidMetaRefresh.remember":
        if(!this.getPref(name)) this.metaRefreshWhitelist = {};
      break;
      case "filterXGetRx":
      case "filterXGetRx2Black":
        this.updateRxPref(name, this[name], "g");
      break;
      case "filterXExceptions":
        this.updateRxPref(name, "", "", this.rxParsers.multi);
      break;
      
      case "allowClipboard":
        this.updateExtraPerm(name, "Clipboard", ["cutcopy", "paste"]);
      break;
      case "allowLocalLinks":
        this.updateExtraPerm(name, "checkloaduri", ["enabled"]);
      break;
       
      case "nselForce":
      case "nselNever":
      // case "blockCssScanners":
        this.updateCssPref(name);
        
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
      nselNever: "noscript { display: none !important }",
      blockCssScanners: "a:visited { background-image: none !important }"
    }[name]);
    if(!sheet) return;

    var value = this[name];
    this[name] = value = this.getPref(name, value);
    this.updateStyleSheet(sheet, value);
  },
  
  updateStyleSheet: function(sheet, enabled) {
    const sssClass = Components.classes["@mozilla.org/content/style-sheet-service;1"];
    if(!sssClass) return;
    
    const sss = sssClass.getService(Components.interfaces.nsIStyleSheetService);
    const uri = SiteUtils.ios.newURI("data:text/css," + sheet, null, null);
    if(sss.sheetRegistered(uri, sss.USER_SHEET)) {
      if(!enabled) sss.unregisterSheet(uri, sss.USER_SHEET);
    } else {
      if(enabled) sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
    }
  },
 
  getString: function(name, parms) { return noscriptStrings.getString(name, parms); },
  
  uninstallGuard: new UninstallGuard("NoScript"),
  _uninstalling: false,
  get uninstalling() {
    if(this._uninstalling) return this._uninstalling;
    const ug=this.uninstallGuard;
    return (this._uninstalling=(ug.uninstalling || ug.disabled))?
      this.cleanupIfUninstalling():false;
  }
,
  _inited: false,
  POLICY_NAME: "maonoscript",
  prefService: null,
  caps: null,
  policyPB: null,
  prefs: null,
  mozJSPref: null,
  mozJSEnabled: true
,
  init: function() {
    if(this._inited) return false;
    this._inited = true;
    
    
    const prefserv=this.prefService=Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch);
    
    const PBI=Components.interfaces.nsIPrefBranch2;
    this.caps = prefserv.getBranch("capability.policy.").QueryInterface(PBI);
    this.policyPB = prefserv.getBranch("capability.policy." + this.POLICY_NAME + ".").QueryInterface(PBI);
    this.policyPB.addObserver("sites", this, false);
    this.prefs = prefserv.getBranch("noscript.").QueryInterface(PBI);
    this.prefs.addObserver("", this, false);
    this.mozJSPref = prefserv.getBranch("javascript.").QueryInterface(PBI);
    this.mozJSPref.addObserver("enabled", this, false);
    
    this.permanentSites.sitesString = "chrome: resource: about:neterror";
    
    const syncPrefNames = [
      "autoAllow",
      "allowClipboard", "allowLocalLinks",
      "blockCssScanners", "blockCrossIntranet",
      "consoleDump", "contentBlocker",
      "filterXPost", "filterXGet", 
      "filterXGetRx", "filterXGetRx2Black", 
      "filterXExceptions",
      "forbidFlash", "forbidJava", "forbidPlugins", "forbidData",
      "forbidMetaRefresh",
      "injectionCheck",
      "jsredirectIgnore", "jsredirectFollow",
      "nselNever", "nselForce",
      "pluginPlaceholder", "showPlaceholder",
      "temp", "untrusted",
      "truncateTitle", "truncateTitleLen"
    ];
    for(var spcount = syncPrefNames.length; spcount-->0;) {
      this.syncPrefs(this.prefs, syncPrefNames[spcount]);
    }
    
    this.syncPrefs(this.mozJSPref, "enabled");
    
    this.setupJSCaps();
    
    // init jsPolicySites from prefs
    this.syncPrefs(this.policyPB, "sites");
    this.eraseTemp();
    // this.sanitize2ndLevs();
    
    this.reloadWhereNeeded(); // init snapshot
   
    this.uninstallGuard.init();
 
    return true;
  }
,  
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
    return s &&
      (s == "chrome:" || s == "resource:" || s == "about:" || s == "about:neterror"
        || this.permanentSites.matches(s));
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
  flushCAPS: function(sitesString) {
    const ps = this.jsPolicySites;
    if(sitesString) ps.sitesString = sitesString;
    
    // dump("Flushing " + ps.sitesString);
    ps.toPref(this.policyPB);
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
  get jsEnabled() {
    try {
      return this.mozJSEnabled && this.caps.getCharPref("default.javascript.enabled") != "noAccess";
    } catch(ex) {
      return this.uninstalling ? this.mozJSEnabled : (this.jsEnabled = this.getPref("global", false));
    }
  }
,
  set jsEnabled(enabled) {
    this.caps.setCharPref("default.javascript.enabled", enabled ? "allAccess" : "noAccess");
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
      const url = (site instanceof Components.interfaces.nsIURL) ? site : SiteUtils.ios.newURI(site, null, null);
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
     const timer=Components.classes["@mozilla.org/timer;1"].createInstance(
        Components.interfaces.nsITimer);
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
    
    var ret = false;
    var docSites, site;
    var prevStatus, currStatus;
    
    var webNav, url;
    
    const nsIWebNavigation = Components.interfaces.nsIWebNavigation;
    const nsIURL = Components.interfaces.nsIURL;
    const LOAD_FLAGS = nsIWebNavigation.LOAD_FLAGS_NONE;
    const untrustedReload = !this.getPref("xss.trustReloads", false);
    
    for(var browser, bi = new this.domUtils.BrowserIterator(), j; browser = bi.next();) {
      docSites = this.getSites(browser, true);
      for(j = docSites.length; j-- > 0;) {
        prevStatus = lastGlobal || !!snapshot.matches(docSites[j]);
        currStatus = global || !!ps.matches(docSites[j]);
        if(currStatus != prevStatus) {
          ret = true;
          if(currStatus) this.requestWatchdog.setUntrustedReloadInfo(browser, true);
          webNav = browser.webNavigation;
          url = webNav.currentURI;
          if(url.schemeIs("http") || url.schemeIs("https")) {
            this.requestWatchdog.noscriptReload = url;
          }
          try {
            webNav = webNav.sessionHistory.QueryInterface(nsIWebNavigation);
            if(currStatus && webNav.index && untrustedReload) {
              try {
                site = this.getSite(webNav.getEntryAtIndex(webNav.index - 1, false).URI.spec);
                this.requestWatchdog.setUntrustedReloadInfo(browser, site != docSites[j] && !ps.matches(site));
              } catch(e) {}
            }
            if(!(url instanceof nsIURL && url.ref)) {
              webNav.gotoIndex(webNav.index);
              break;
            }
          } catch(e) {}
          browser.webNavigation.reload(LOAD_FLAGS);
          break;
        }
      }
      if(currentTabOnly) break;
    }
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
  cleanup: function() {
    this.cleanupIfUninstalling();
  }
,
  cleanupIfUninstalling: function() {
    if(this.uninstalling) this.uninstallJob();
    return this.uninstalling;
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
      try {
        prefArray = this.splitList(prefString = originalPrefString = this.caps.getCharPref("policynames"));
        var pcount = prefArray.length;
        while(pcount-- > 0 && prefArray[pcount] != POLICY_NAME);
        if(pcount == -1) { // our policy is not installed, should always be so unless dirty exit
          this.setPref("policynames", originalPrefString);
          if(prefArray.length == 0 || this.getPref("excaps", true)) {
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
      if(prefString != originalPrefString) { 
        this.caps.setCharPref("policynames", prefString);
       
      }
      
     
      
      if(!this._observingPolicies) {
        this.caps.addObserver("policynames", this, false);
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
      this.eraseTemp();
      this.savePrefs();
    } catch(ex) {}
  }
,
  uninstallJob: function() {
    this.resetJSCaps();
  }
,
  getPref: function(name,def) {
    const IPC = Components.interfaces.nsIPrefBranch;
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
  playSound: function(url,force) {
    if(force || this.getPref("sound",true)) {
      var sound=this._sound;
      if(sound==null) {
        sound=Components.classes["@mozilla.org/sound;1"].createInstance(Components.interfaces.nsISound);
        sound.init();
      }
      try {
        sound.play(SiteUtils.ios.newURI(url, null, null));
      } catch(ex) {
        //dump(ex);
      }
    }
  }
,
  readFile: function(file) {
    const cc=Components.classes;
    const ci=Components.interfaces;  
    const is = cc["@mozilla.org/network/file-input-stream;1"].createInstance(
          ci.nsIFileInputStream );
    is.init(file ,0x01, 0400, null);
    const sis = cc["@mozilla.org/scriptableinputstream;1"].createInstance(
      ci.nsIScriptableInputStream );
    sis.init(is);
    const res=sis.read(sis.available());
    is.close();
    return res;
  }
,
  writeFile: function(file, content) {
    const cc=Components.classes;
    const ci=Components.interfaces;
    const unicodeConverter = cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(
    ci.nsIScriptableUnicodeConverter);
    unicodeConverter.charset = "UTF-8";
    content=unicodeConverter.ConvertFromUnicode(content);
    const os=cc["@mozilla.org/network/file-output-stream;1"].createInstance(
      ci.nsIFileOutputStream);
    os.init(file, 0x02 | 0x08 | 0x20,0664,0);
    os.write(content,content.length);
    os.close();
  }
,
  
  get lastWindow() {
    return Components.classes['@mozilla.org/appshell/window-mediator;1']
      .getService(Components.interfaces.nsIWindowMediator)
      .getMostRecentWindow("navigator:browser");
  },
  
  
  getAllowObjectMessage: function(url, mime) {
    url = this.siteUtils.crop(url);
    return this.getString("allowTemp", [url + "\n(" + mime + ")\n"]);
  }
,
  queryInterfaceSupport: function(iid,iids) { 
    xpcom_checkInterfaces(iid, iids, Components.results.NS_ERROR_NO_INTERFACE);
  }
,
  lookupMethod: DOMUtils.lookupMethod,
  domUtils: DOMUtils,
  siteUtils: SiteUtils
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
    this.rejectCode = typeof(/ /) == "object" ? -4 : -3;
    
    if(!this.xcache) {
      this.xcache = new XCache();
      this.mimeService = Components.classes['@mozilla.org/uriloader/external-helper-app-service;1']
                                   .getService(Components.interfaces.nsIMIMEService);
    }
  },
  guessMime: function(uri) {
    try {
      return (uri instanceof Components.interfaces.nsIURL) && uri.fileExtension && 
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
  // nsIContentPolicy interface
  // we use numeric constants for performance sake:
  // nsIContentPolicy.TYPE_SCRIPT = 2
  // nsIContentPolicy.TYPE_OBJECT = 5
  // nsIContentPolicy.TYPE_DOCUMENT = 6
  // nsIContentPolicy.TYPE_SUBDOCUMENT = 7
  // nsIContentPolicy.TYPE_REFRESH = 8
  // nsIContentPolicy.REJECT_SERVER = -3
  // nsIContentPolicy.ACCEPT = 1
  
  noopContentPolicy: {
    shouldLoad: function() { return 1; },
    shouldProcess: function() { return 1; }
  },
  mainContentPolicy: {
    shouldLoad: function(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aInternalCall) {
      if(this.consoleDump && (this.consoleDump & 4)) {
        dump("[noscript cp]: type: " + aContentType + ", location: " + (aContentLocation && aContentLocation.spec) + 
        ", origin: " + (aRequestOrigin && aRequestOrigin.spec) + ", ctx: " + aContext + ", mime: " + aMimeTypeGuess + ", " + aInternalCall
          + "\n");
      }
      
      var forbid, isJS, isFlash, isJava, mustAsk;

      switch(aContentType) {
        case 2:
          forbid = isJS = true;
          break;
        case 5:
          if(aContentLocation && aRequestOrigin && aContentLocation.spec == aRequestOrigin.spec && 
              (aContext instanceof Components.interfaces.nsIDOMHTMLEmbedElement) &&
              aMimeTypeGuess && this.pluginsCache.isForcedSomewhere(aContentLocation.spec, aMimeTypeGuess)) {
            return 1; // plugin document, we'll handle it in our webprogress listener
          }
        case 7:
          if(!aMimeTypeGuess) aMimeTypeGuess = this.guessMime(aContentLocation);
        case 6:
          
          if(aRequestOrigin && aRequestOrigin != aContentLocation) {
            if(aContentLocation.schemeIs("http") || aContentLocation.schemeIs("https")) {
              if(aRequestOrigin.prePath != aContentLocation.prePath) {
                this.xcache.storeOrigin(aRequestOrigin, aContentLocation);
              }
            } else if(this.forbidData && // block data: and javascript: URLs
                      (aContentLocation.schemeIs("data:") || aContentLocation.schemeIs("javascript")) &&
                      !this.isJSEnabled(this.getSite(aRequestOrigin.spec))) {
               if(this.consoleDump & 1) 
                 dump("NoScript blocked " + aContentLocation.spec + " from " + aRequestOrigin.spec + "\n");
              return this.rejectCode;
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

      const url = aContentLocation.spec;
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
            if(aContext && (aContentType == 5 || aContentType ==7)) {
              const ci = Components.interfaces;
              if(aContext instanceof ci.nsIDOMNode
                 && this.pluginPlaceholder) {  
                if(aContext instanceof ci.nsIDOMHTMLEmbedElement
                    && aContext.parentNode instanceof ci.nsIDOMHTMLObjectElement) {
                  aContext = aContext.parentNode;
                }
                if(aMimeTypeGuess) {
                  this.setPluginExtras(aContext, 
                  {
                    url: url,
                    mime: aMimeTypeGuess
                  });
                  const browser = this.domUtils.findBrowserForNode(aContext);
                  if(browser && (browser.docShell instanceof ci.nsIWebNavigation) && !browser.docShell.isLoadingDocument) {
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
      if(uri) {
        var bi = new DOMUtils.BrowserIterator();
        for(var b; b = bi.next();) {
          if(this.get(b).forceAllow[uri] == mime) return true;
        }
      }
      return false;
    }
    
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
               !document.evaluate( "//body//text()", document, null,  Components.interfaces.nsIDOMXPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
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
      const HTMLElement = Components.interfaces.nsIDOMHTMLElement;
      sites.scriptCount += scount;
      var script, scriptSrc;
      var nselForce = this.nselForce && this.isJSEnabled(sites[sites.length - 1]);
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
    const HTMLElement = Components.interfaces.nsIDOMHTMLElement;
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
           Components.interfaces.nsIDOMXPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
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
              this.domUtils.findBrowserForNode(document).ownerDocument.defaultView
                  .noscriptOverlay.notifyMetaRefresh({ 
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
          }, false);
          this.disableMetaRefresh(docShell);
          return;
        }
      }
    } catch(e) {
      dump("[NoScript]: " + e + " processing meta refresh at " + document.documentURI + "\n");
      debugger;
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
    if(docShell instanceof Components.interfaces.nsIRefreshURI) {
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
      if(docShell instanceof Components.interfaces.nsIRefreshURI) {
        docShell.cancelRefreshURITimers();
      }
      // if(this.consoleDump) dump("Disabled META refresh on " + (docShell.currentURI && docShell.currentURI.spec) + "\n");
    }
  },
  
  
  _objectTypes: null,
  processObjectElements: function(document, sites) {
    const ci = Components.interfaces;
    var pp = this.showPlaceholder && this.pluginPlaceholder;
    var replacePlugins = pp && this.forbidSomeContent;
      
    const types = this._objectTypes || 
          (this._objectTypes = {
            embed:  ci.nsIDOMHTMLEmbedElement, 
            applet: ci.nsIDOMHTMLAppletElement,
            iframe: ci.nsIDOMHTMLIFrameElement,
            object: ci.nsIDOMHTMLObjectElement
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
        replacements.forEach(function(r) {
          r.object.parentNode.replaceChild(r.placeHolder, r.object);  
        });
    }, 0);
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
        
        var url = extras.url;
        var mime = extras.mime;
        
        const window = browser.ownerDocument.defaultView;
        window.setTimeout(function() {
          if(window.noscriptUtil.confirm(ns.getAllowObjectMessage(url, mime), "confirmUnblock")) { 
            cache.forceAllow[url] = mime;
            var doc = anchor.ownerDocument;
            if(mime == doc.contentType) { // stand-alone plugin
              doc.location.reload();
              return;
            }
            
            ns.setExpando(anchor, "removedPlugin", null);
            
            window.setTimeout(function() { 
              anchor.parentNode.replaceChild(object.cloneNode(true), anchor);
            }, 0);
          }
        }, 0);
      } finally {
        ev.preventDefault();
      }
    }
  },
  
  getSites: function(browser) {
    var sites = [];
    sites.browser = browser;
    sites.scriptCount = 0;
    sites.pluginCount = 0;
    
    try {
      return this._enumerateSites(browser, sites);
    } catch(ex) {
      if(this.consoleDump) {
        dump("[NOSCRIPT ERROR!!!] Enumerating sites: " + ex.message + "\n");
        debugger;
      }
    }
    return sites;
  },
  
  _enumerateSites: function(browser, sites) {
    const ci = Components.interfaces;
    const nsIWebNavigation = ci.nsIWebNavigation;
    const nsIDocShell = ci.nsIDocShell;
    
    const docShells = browser.docShell.getDocShellEnumerator (
        ci.nsIDocShellTreeItem.typeContent,
        browser.docShell.ENUMERATE_FORWARDS
    );
    
    var docShell, doc, docURI, url;
    
    const pluginsCache = this.pluginsCache.get(browser);
    const docURIs = {};
    var cache;
    
    var document;
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
         sites.push(url);
         docURIs[docURI] = true;
         cache = pluginsCache.uris[docURI];
         if(cache) {
           for(var pluginURI in cache) {
              sites.push(pluginURI);
            }
          }
          try {
            const domain = document.domain;
            if(domain && this.getDomain(url) != domain) sites.push(domain);
          } catch(e) {}
       }

       if(!document._NoScript_contentLoaded && (!(docShell instanceof nsIWebNavigation) || docShell.isLoadingDocument))
         continue;
       
       // scripts
       this.processScriptElements(document, sites);
       
       // plugins
       this.processObjectElements(document, sites);

    }
    
    for(var j = sites.length; j-- > 0;) {
      if(!/^[a-z]+:\/*[^\/\s]+/.test(sites[j]) && sites[j] != "file://") {
        sites.splice(j, 1); // reject scheme-only URLs
      }
    }
    
    sites.topURL = sites[0] || '';
    return this.sortedSiteSet(sites);
  },
  

  log: function(msg) {
    var consoleService = Components.classes["@mozilla.org/consoleservice;1"]
                                 .getService(Components.interfaces.nsIConsoleService);
    consoleService.logStringMessage(msg);
  },
  
 
  
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
  this.dns = Components.classes["@mozilla.org/network/dns-service;1"]
                  .getService(Components.interfaces.nsIDNSService);
}

RequestWatchdog.prototype = {
  ns: null,
  dns: null,
  callback: null,
  externalLoad: null,
  noscriptReload: null,

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
        this.setUnsafeRequest(browser, null);
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
  
  detectBackFrame: function(prev, next, ds) {
    if(prev.ID != next.ID) return prev.URI.spec;
    const ci = Components.interfaces;
    if((prev instanceof ci.nsISHContainer) &&
       (next instanceof ci.nsISHContainer) &&
       (ds instanceof ci.nsIDocShellTreeNode)
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
    breadCrumbs = breadCrumbs || [];
    
    var he;
    var uri = null;
    var site = '';
    for(var j = sh.index; j-- > 0;) {
       he = sh.getEntryAtIndex(j, false);
       if(he.isSubFrame) {
         uri = this.detectBackFrame(he, sh.getEntryAtIndex(j + 1),
           this.ns.getDocShellFromWindow(window)
         );  
       } else {
        // not a subframe navigation 
        if(window == window.top) {
          uri = he.URI.spec; // top frame, return previous history entry
        } else {
          window = window.parent;
          uri = window.document.documentURI;
        }
      }
      if(!uri) break;
      breadCrumbs.push(uri);
      var site = this.ns.getSite(uri);
      if(site) break;
    }
    return wantsBreadCrumbs ? breadCrumbs : site;
  },
  
  traceBack: function(channel, breadCrumbs) {
    
    const ci = Components.interfaces;
    try {
      var window = this.findWindow(channel);
      var webNav = window.top.QueryInterface(ci.nsIInterfaceRequestor).getInterface(ci.nsIWebNavigation);
      const sh = webNav.sessionHistory;
      if(!sh) return '';
      
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
  
  checkInjections: function(url) {
    try {
      // Direct script injection breaking a JS string
      var unescapedURL = decodeURIComponent(url);
      var sandbox = null;
      const syntaxCheck = "new Function(script)";
      const findInjection = /(['"])(?=([\s\S]*[=\(][\s\S]*?)(\1|\/\/))/g;
      findInjection.lastIndex = 0;
      for(var m; m = findInjection.exec(unescapedURL);) {
        if(!sandbox) sandbox = new Components.utils.Sandbox("about:neterror");
        sandbox.script = m[1] + m[1] + m[2] + m[3] + m[1];
        try {
          Components.utils.evalInSandbox(syntaxCheck, sandbox);
          return true;
        } catch(e) {}
      }
      // basic HTML injections
      return /<\/?script|<form|<style|<link|<object|<applet|<iframe|<base|<frameset|<body|<meta|[^\w](?:javascript|data):|[\/'"`\s](?:FSCommand|on[a-z]{3,}\s*=)|-moz-binding.*:.*url|\.\s*fromCharCode\s*\(|\beval\s*\(/i
        .test(unescapedURL);
    } catch(ex) {
      this.ns.log("[NoScript XSS] Error while checking " + url + " for basic injections, " + ex.message);
      return true;
    }
  },
  
  filterXSS: function(channel) {
    const ci = Components.interfaces;
    const ns = this.ns;
    
    if(!((channel instanceof ci.nsIHttpChannel) && (channel.loadFlags & channel.LOAD_DOCUMENT_URI))) { 
      if(ns.consoleDump) this.dump(channel, "not a document load, SKIP");
      return;
    }
    
    const url = channel.URI;
    
    const xorigin = ns.xcache.pickOrigin(url, true); // picks and remove cached entry
    
    if(this.noscriptReload && this.noscriptReload == url) {
      // fast cache route for NoScript-triggered reloads
      this.noscriptReload = null;
      channel.loadFlags |= channel.LOAD_FROM_CACHE | channel.VALIDATE_NEVER;
    }
    
    // fast return if nothing to do here
    if(!(ns.filterXPost || ns.filterXGet)) return; 
    
    var browser = null;
    
    var origin = xorigin && xorigin.spec || channel.originalURI.spec != url.spec && channel.originalURI.spec || null;
    
    
    var untrustedReload = false;
   
    var originSite = null;
    
    if(!origin) {
      if((channel instanceof ci.nsIHttpChannelInternal) && channel.documentURI) {
        if(channel.URI.spec == channel.documentURI.spec) {
           var breadCrumbs = [];
           originSite = this.traceBack(channel, breadCrumbs);
           if(originSite) {
             origin = [channel.URI.spec].concat(breadCrumbs).join("@@@");
             if(ns.consoleDump) this.dump(channel, "TRACEBACK ORIGIN: " + originSite + " FROM " + origin);
           } else {
             // check untrusted reload
             browser = this.findBrowser(channel);
             if(!this.getUntrustedReloadInfo(browser)) return;
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
    } else if(origin == "about:blank") {
      //let's pass it on, it may be an user-initated refresh or an external navigation
      if(ns.consoleDump) this.dump("ORIGIN is about:blank, SKIP");
      return;
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
    
    var targetSite = su.getSite(url.spec);
    
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
    
    
    var externalLoad = this.externalLoad && this.externalLoad == url.spec;
    if(externalLoad) {
      this.externalLoad = null;
    }
    
    if(!ns.isJSEnabled(targetSite)) {
       if(ns.consoleDump) this.dump(channel, "Destination " + url.spec + " is noscripted, SKIP");
       return;
    }
    
    if(!originSite) { // maybe data or javascript URL?
      if(/^(?:javascript|data):/i.test(origin) && ns.getPref("xss.trustData", true)) {
        var breadCrumbs = [];
        originSite = this.traceBack(channel, breadCrumbs);
        if(originSite) { 
          origin = [origin].concat(breadCrumbs).join("@@@");
        }
        delete breadCrumbs;
      }
    }

    var injectionAttempt = false;
    var window = null;
    if(ns.isJSEnabled(originSite)) {
      this.resetUntrustedReloadInfo(browser = browser || this.findBrowser(channel), channel);
      
      if(injectionAttempt = injectionCheck && (injectionCheck > 1 || ns.isTemp(originSite)) &&
        channel.requestMethod == "GET" &&
        this.checkInjections(url.spec)) {
        window = this.findWindow(channel);
        injectionAttempt = window == window.top; 
      }
      
      if(injectionAttempt) {
        if(ns.consoleDump) this.dump(channel, "Detected injection attempt at level " + injectionCheck);
      } else {
        if(externalLoad) { // external origin ?
          if(ns.consoleDump) this.dump(channel, "External load from " + origin);
          if(originSite == "chrome:") {
            if(ns.getPref("xss.trustExternal", false)) {
              if(ns.consoleDump) this.dump(channel, "noscript.xss.trustExternal is TRUE, SKIP");
              return;
            }
            origin = "///EXTERNAL///";
            originSite = "";
          } else {
            if(ns.consoleDump) this.dump(channel, "Not coming from an external application, SKIP");
            return;
          }
        } else if(ns.getPref("xss.trustTemp", true) || !ns.isTemp(originSite)) { // temporary allowed origin?
          if(ns.consoleDump) this.dump(channel, "Origin " + origin + " is trusted, SKIP");
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
    
    if(this.isUnsafeReload(browser = browser || this.findBrowser(channel))) {
      if(ns.consoleDump) this.dump(channel, "UNSAFE RELOAD of [" + url.spec +"] from [" + origin + "], SKIP");
      return;
    }
    
    if(ns.filterXExceptions) {
      try {
        if(ns.filterXExceptions.test(decodeURI(url.spec))) { 
          // "safe" xss target exception
          if(ns.consoleDump) this.dump(channel, "Safe target according to filterXExceptions: " + ns.filterXExceptions.toString());
          return;
        }
      } catch(e) {}
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
      },
      sanitizedURI: url,
      window: window
    };
    
    var originalAttempt;
    
    // transform upload requests into no-data GETs
    if(ns.filterXPost && (channel instanceof ci.nsIUploadChannel) && channel.uploadStream) {
      channel.requestMethod = "GET";
 
      requestInfo.unsafeRequest.postData = channel.uploadStream;
      channel.uploadStream = null;
      this.notify(this.addXssInfo(requestInfo, {
        reason: "filterXPost",
        origin: origin,
        originalAttempt: url.spec,
        silent: untrustedReload
      }));
    }
    
    if(ns.filterXGet && ns.filterXGetRx) {
      var changes;
      
      // sanitize referrer
      if(channel.referrer && channel.referrer.spec) {
        originalAttempt = channel.referrer.spec;
        try {
          if(channel.referrer instanceof Components.interfaces.nsIURL) {
            changes = this.sanitizeURL(channel.referrer);
          } else {
            channel.referrer.spec =  this.sanitizeURIString(originalAttempt);
          }
        } catch(e) {
          this.dump("Failed sanitizing referrer " + channel.referrer.spec + ", " + e);
          channel.referrer.spec = "";
        }
        try {
          if((!channel.referrer.spec) || decodeURI(originalAttempt) != decodeURI(channel.referrer.spec)) {
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
      changes = this.sanitizeURL(url);
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
      if(channel instanceof Components.interfaces.nsICachingChannel) {
        
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
  
  sanitizeURL: function(url) {
    var original = url.clone();
    changes = { minor: false, major: false, qs: false };
    // sanitize credentials
    if(url.username) url.username = this.sanitizeEnc(url.user);
    if(url.password) url.password = this.sanitizeEnc(url.password);
    url.host = this.sanitizeEnc(url.host);
    var qsChanged = { value: false };
    if(url instanceof Components.interfaces.nsIURL) {
      // sanitize path
     
      if(url.param) {
        url.path = this.sanitizeURIString(url.path, true); // param is the URL part after filePath and a semicolon ?!
      } else if(url.filePath) { 
        url.filePath = this.sanitizeURIString(url.filePath, true); // true == lenient == allow ()=
      }
      // sanitize query
      if(url.query) url.query = this.sanitizeXQuery(url.query, changes);
      // sanitize fragment
      if(url.ref) url.ref = this.sanitizeEnc(url.ref);
    } else {
      // fallback for non-URL URIs, we should never get here anyway
      if(url.path) url.path = this.sanitizeURIString(url.Path);
    }
    
    if(url.getRelativeSpec(original)) {
      changes.minor = true;
      changes.major = changes.major || changes.qs || 
                      decodeURIComponent(original.spec.replace(/\?.*/g, "")) 
                        != decodeURIComponent(url.spec.replace(/\?.*/g, ""));
      url.ref = Math.random().toString().concat(Math.round(Math.random() * 999 + 1)).replace(/0./, '') // randomize URI
    }
    return changes;
  },
  
  sanitizeXQuery: function(query, changes) {
    // replace every character matching noscript.filterXGetRx with a single ASCII space (0x20)
    changes = changes || {};
    const parms = query.split(/[&;]/);
    var j, pieces, k, pz, origPz, nestedURI, qpos, apos;
    
    for(j = parms.length; j-- > 0;) {
      pieces = parms[j].split(/=/, 2);
      try {
        for(k = pieces.length; k-- > 0;) {
         
          origPz = pz = decodeURIComponent(pieces[k].replace(/\+/g, " "));
          nestedURI = null;
          if(/^https?:\/\//i.test(pz)) {
            // try to sanitize as a nested URL
            try {
              nestedURI = this.ns.siteUtils.ios.newURI(pz, null, null).QueryInterface(Components.interfaces.nsIURL);
              changes = this.mergeDefaults(changes, this.sanitizeURL(nestedURI));
              pz = nestedURI.spec;
            } catch(e) {
              nestedURI = null;
            }
          }
          
          if(!nestedURI) {
            qpos = pz.indexOf("?");
            spos = pz.search(/[&;]/);
            if(qpos > -1 || spos > -1) { 
              // recursive query string?
              if(spos > -1 && qpos > spos) {
                // recursively sanitize it as a whole qs
                pz = this.sanitizeXQuery(pz, changes);
              } else {
                // split, sanitize and rejoin
                pz = [ this.sanitize(pz.substring(0, qpos)), 
                       this.sanitizeXQuery(pz.substring(qpos + 1), changes)
                     ].join("?")
              }
            } else {
              pz = this.sanitize(pz);
            }
            if(origPz != pz) changes.qs = true;
          }
          
          pieces[k] = encodeURIComponent(pz);
        }
        if(j > 0 && pieces.length == 1 && j == parms.length - 1) {
          // avoid "&" separator to be used as an entity escape if site rewrites this URL 
          pieces.push("");
        }
        parms[j] = pieces.join("=");
      } catch(e) { 
        // decoding exception, skip this param
        parms.splice(j, 1);
      }
    } 
    return parms.join("&");
  },
  
  sanitizeURIString: function(s, lenient) {
    try {
      return encodeURI(this.sanitize(decodeURIComponent(s), lenient));
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
  sanitize: function(s, lenient) {
    
    if(s.indexOf('"') > -1) {
      // try to play nice on search engine queries with grouped quoted elements
      // by allowing double quotes but stripping even more aggressively other chars
      
      // Google preserves "$" and recognizes ~, + and ".." as operators
      // All the other non alphanumeric chars (aside double quotes) are ignored.
      // We will preserve the site: modifier as well
      // Ref.: http://www.google.com/help/refinesearch.html
      s = s.replace(/[^\w\$\+\.\~" :]/g, 
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
    s = s.replace(this.ns.filterXGetRx, " ");
    /*
    if(s.indexOf("+") > -1) { 
      // Anti UTF-7, effective but likely too much drastic.
      // Investigate on-the-fly charset detection for future versions,
      // as this kind of attack is *very* unlikely to work in default Firefox setup
      s.replace(/\+\w+/g, function(m) { return m.replace(/A/g, "a"); });
    }
    */
    if(lenient) {
      // if lenient, we let ampersand and semicolon pass. Now we ensure that no entity passes, though
      s = s.replace(/&(?:[^\/=]+;|[^\/=]*$)/g, "");
    } else {
      s = s.replace(this.ns.filterXGetRx2Black, " "); // lenient on path only to allow some wikipedianisms
    }
    return s;
  },
  
  abort: function(requestInfo) {
    if(requestInfo.channel instanceof Components.interfaces.nsIRequest) {
      requestInfo.channel.cancel(0x804b0002 /* NS_BINDING_ABORTED */);
    }
    this.dump(requestInfo.channel, "Aborted - " + requestInfo.reason);
    this.notify(requestInfo);
  },
  
  mergeDefaults: function(o1, o2) {
    for(p in o2) {
      o1[p] = o1[p] || o2[p];
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
   
    
    if(requestInfo.silent || !requestInfo.browser || !requestInfo.window ||
      !this.ns.getPref("xss.notify", true) ||
      (requestInfo.window && requestInfo.window != requestInfo.window.top && 
          !this.ns.getPref("xss.notify.subframes", false)
      )
    ) return;
    
    try {
      requestInfo.browser.ownerDocument.defaultView.noscriptOverlay.notifyXSSOnLoad(requestInfo);
    } catch(e) {}
  },
  
  findWindow: function(channel) {
    try {
      return channel.notificationCallbacks.QueryInterface(
        Components.interfaces.nsIInterfaceRequestor).getInterface(
        Components.interfaces.nsIDOMWindow);
    } catch(e) {
      return null;
    }
  },
  findBrowser: function(channel) {
    var w = this.findWindow(channel);
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



// XPCOM Scaffolding code

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
Components.interfaces.nsIObserver,
Components.interfaces.nsISupports,
Components.interfaces.nsISupportsWeakReference,
Components.interfaces.nsIContentPolicy
];

// categories which this component is registered in
const SERVICE_CATS = ["app-startup","content-policy"];


// Factory object
const SERVICE_FACTORY = {
  _instance: null,
  createInstance: function (outer, iid) {
    if (outer != null)
        throw Components.results.NS_ERROR_NO_AGGREGATION;

    xpcom_checkInterfaces(iid,SERVICE_IIDS,Components.results.NS_ERROR_INVALID_ARG);
    // kept this for flexibility sake, but we're really adopting an
    // early instantiation and late init singleton pattern
    return this._instance==null?this._instance=new SERVICE_CONSTRUCTOR():this._instance;
  }
};

function xpcom_checkInterfaces(iid,iids,ex) {
  for(var j=iids.length; j-- >0;) {
    if(iid.equals(iids[j])) return true;
  }
  throw ex;
}

// Module

var Module = new Object();
Module.firstTime=true;
Module.registerSelf = function (compMgr, fileSpec, location, type) {
  if(this.firstTime) {
   
    debug("*** Registering "+SERVICE_CTRID+".\n");
    
    compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar
      ).registerFactoryLocation(SERVICE_CID,
      SERVICE_NAME,
      SERVICE_CTRID, 
      fileSpec,
      location, 
      type);
    const catman = Components.classes['@mozilla.org/categorymanager;1'
      ].getService(Components.interfaces.nsICategoryManager);
    for(var j=0, len=SERVICE_CATS.length; j<len; j++) {
      catman.addCategoryEntry(SERVICE_CATS[j],
        //SERVICE_NAME, "service," + SERVICE_CTRID, 
        SERVICE_CTRID, SERVICE_CTRID, true, true, null);
    }
    this.firstTime=false;
  } 
}
Module.unregisterSelf = function(compMgr, fileSpec, location) {
  compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar
    ).unregisterFactoryLocation(SERVICE_CID, fileSpec);
  const catman = Components.classes['@mozilla.org/categorymanager;1'
      ].getService(Components.interfaces.nsICategoryManager);
  for(var j = 0, len=SERVICE_CATS.length; j<len; j++) {
    catman.deleteCategoryEntry(SERVICE_CATS[j], SERVICE_CTRID, true);
  }
}

Module.getClassObject = function (compMgr, cid, iid) {
  if(cid.equals(SERVICE_CID))
    return SERVICE_FACTORY;

  if (!iid.equals(Components.interfaces.nsIFactory))
    throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
  
  throw Components.results.NS_ERROR_NO_INTERFACE;
    
}

Module.canUnload = function(compMgr) {
  return true;
}

// entrypoint
function NSGetModule(compMgr, fileSpec) {
  return Module;
}


