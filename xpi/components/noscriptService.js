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
    this.checkAll(ds);
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
    container.Init(ds,root);

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
  var _domainPattern = /^[^\?\/#,;:\\\@]+$/; // double check: changed for Unicode compliance: it was /^[\w\-\.]*\w$/
  
  this.ios = Components.classes["@mozilla.org/network/io-service;1"
        ].getService(Components.interfaces.nsIIOService);
  
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
    if(! (url && (url = url.replace(/^\s+/, '').replace(/\s+$/, '') ))) {
      return "";
    }
    
    if(url.indexOf(":") < 0) return this.domainMatch(url);
    
    var scheme;
    try {
      scheme = this.ios.extractScheme(url).toLowerCase();
      switch(scheme) {
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
      var uri=this.ios.newURI(url, null, null);
      if(uri instanceof Components.interfaces.nsIJARURI) {
        uri=uri.JARFile;
        return uri?this.getSite(uri.spec):scheme;
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
    return s?/^[,\s]*$/.test(s)?[]:s.split(/\s*[,\s]\s*/):[];
  };
  
  this.domainMatch = function(url) {
     const m=url.match(_domainPattern);
     return m?m[0].toLowerCase():"";
  };
  
  this.sanitizeList = function(sl) {
    for(var j=sl.length; j-->0; ) {
      sl[j]=this.getSite(sl[j]);
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
    // s=s.replace(/,/g,' ').replace(/\s{2,}/g,' ').replace(/(^\s+|\s+$)/g,'');
    return this.set2string(this.string2set(s)); 
  };
  
  this.string2set = function(s) {
    return this.sortedSet(this.sanitizeList(this.splitString(s)));
  };
  
  this.set2string = function(ss) {
    return ss.join(" ");
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
  
  BrowserIterator: function() {
     const wm = Components.classes['@mozilla.org/appshell/window-mediator;1']
                          .getService(Components.interfaces.nsIWindowMediator);
    
    var mostRecentWin, mostRecentTab;
    var currentWin = mostRecentWin = wm.getMostRecentWindow("navigator:browser");
    var winEnum = null;
    var currentTB, currentTab;
    var curTabIdx;
    
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
        for(var j=sl.length; j-->0;) {
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
    
    const sm=this.sitesMap;
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
          if( (site == this.matches(match)) && site!=match) {
            delete sm[match];
            change = true;
          }
        }
      }
    }
    
    if(site in sm) {
      delete sm[site];
      if(site.indexOf(".")==site.lastIndexOf(".")) {
        //2nd level domain hack
        delete sm["http://"+site];
        delete sm["https://"+site];
        delete sm["file://"+site];
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
    const sm=this.sitesMap;
    return (site in sm?false:sm[site]=true) || change;
  },
  add: function(sites) {
    return this._operate(this._add, arguments);
  }, 
  _operate: function(oper, args) {
    var sites = args[0];
    if(!sites) return false;
    
    var change;
    if(typeof(sites)=="object" && sites.constructor == Array) {
      for(var j=sites.length; j-->0; ) {
        args[0]=sites[j];
        if(oper.apply(this,args)) change=true;
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
  VERSION: "1.1.4.7",
  
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
    if(subject instanceof Components.interfaces.nsIPrefBranchInternal) {
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
  syncPrefs: function(branch, name) {
    switch(name) {
      case "sites":
        if(this.jsPolicySites.settingPref) return;
        try {
          this.jsPolicySites.fromPref(this.policyPB);
        } catch(ex) {
          this.setJSEnabled(this.splitList(this.getPref("default",
              "chrome: resource: about:blank about:neterror about:config about:plugins about:credits addons.mozilla.org flashgot.net gmail.com google.com googlesyndication.com informaction.com yahoo.com yimg.com maone.net noscript.net hotmail.com msn.com passport.com passport.net passportimages.com live.com"
              )), true, true);
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
        this[name]=this.getPref(name,this[name]);
        var fsp = this.forbidSomePlugins;
        this.forbidSomePlugins = this.forbidJava || this.forbidFlash || this.forbidPlugins;
        this.forbidAllPlugins = this.forbidJava && this.forbidFlash && this.forbidPlugins;
        if(fsp != this.forbidSomePlugins) this.initContentPolicy();
      break;
      
      case "filterXPost":
      case "filterXGet":
      case "blockCssScanners":
      case "blockXIntranet":
        this.initContentPolicy();
    
      case "pluginPlaceholder":
      case "showPlaceholder":
      case "consoleDump":
      
      case "forbidMetaRefresh":
        this[name] = this.getPref(name, this[name]);
      break;
      
      case "filterXGetRx":
        this.updateRxPref(name, "[^\\w:\\/\\.\\-\\+\\[\\]\\{\\}~,@]", "g");
      break;
       case "filterXExceptions":
        this.updateRxPref(name, "", "");
      break;
      
      case "allowClipboard":
        this.updateExtraPerm(name, "Clipboard", ["cutcopy", "paste"]);
      break;
      case "allowLocalLinks":
        this.updateExtraPerm(name, "checkloaduri", ["enabled"]);
      break;
      
      case "truncateTitle":
        this.truncateTitle = this.getPref(name, true);
      break;
      case "truncateTitleLen":
       this.truncateTitleLen = this.getPref(name, 255);
      break;
      
      case "autoAllow":
       this[name] = this.getPref(name, 0);
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
  
  updateRxPref: function(name, def, flags) {
    var s = this.getPref(name, def);
    if(!s) {
      this[name] = null;
    } else
    {
      try {
        this[name] = new RegExp(this.getPref(name, def), flags);
      } catch(e) {
        this[name] = new RegExp(def, flags);
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
    
    const PBI=Components.interfaces.nsIPrefBranchInternal;
    this.caps = prefserv.getBranch("capability.policy.").QueryInterface(PBI);
    this.policyPB = prefserv.getBranch("capability.policy." + this.POLICY_NAME + ".").QueryInterface(PBI);
    this.policyPB.addObserver("sites", this, false);
    this.prefs = prefserv.getBranch("noscript.").QueryInterface(PBI);
    this.prefs.addObserver("", this, false);
    this.mozJSPref = prefserv.getBranch("javascript.").QueryInterface(Components.interfaces.nsIPrefBranchInternal);
    this.mozJSPref.addObserver("enabled", this, false);
    
    this.permanentSites.sitesString = "chrome: resource: about:neterror";
    
    const syncPrefNames = [
      "consoleDump",
      "pluginPlaceholder", "showPlaceholder", "forbidPlugins", 
      "forbidJava", "forbidFlash", 
      "allowClipboard", "allowLocalLinks",
      "temp", "untrusted",
      "truncateTitle", "truncateTitleLen",
      "nselNever", "nselForce", 
      "blockCssScanners", "blockCrossIntranet",
      "filterXPost", "filterXGet", "filterXGetRx", "filterXExceptions",
      "forbidMetaRefresh",
      "autoAllow"
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
    return this.untrustedSites.matches(s);
  },
  setUntrusted: function(s, b) {
    var change = b ? this.untrustedSites.add(s) : this.untrustedSites.remove(s, true);
    if(change) {
      this.setPref("untrusted", this.untrustedSites.sitesString);
    }
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
  
  getDomain: function(site) {
    var domain = site.match(/.*?:\/\/([^\?\/\\#]+)/); // double check - changed for Unicode compatibility
    if(domain) {
      domain = domain[1];
      if(domain.indexOf(":") > -1) {
        domain = null; // addresses with a specific port can't be enabled by domain
      }
    }
    return domain;
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
  jsPolicySites: new PolicySites(),
  isJSEnabled: function(site) {
    return (!!this.jsPolicySites.matches(site));
  },
  setJSEnabled: function(site, is, fromScratch) {
    const ps = this.jsPolicySites;
    if(fromScratch) ps.sitesString = this.permanentSites.sitesString;
    if(is) {
      ps.add(site);
      this.setUntrusted(site, false);
    } else {
      ps.remove(site, false, true);
      if(this.getPref("forbidImpliesUntrust", false)) 
        this.setUntrusted(site, true);
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
  delayExec: function(callback,delay) {
     const timer=Components.classes["@mozilla.org/timer;1"].createInstance(
        Components.interfaces.nsITimer);
     timer.initWithCallback( { notify: callback }, 1, 0);
  }
,
  safeCapsOp: function(callback) {
    callback();
    const serv = this;
    this.delayExec(function() {
      serv.savePrefs();
      serv.reloadWhereNeeded();
     },1);
  }
,
  _lastSnapshot: null,
  _lastGlobal: false,
  reloadWhereNeeded: function(snapshot, lastGlobal) {
    if(!snapshot) snapshot = this._lastSnapshot;
    const ps=this.jsPolicySites;
    this._lastSnapshot = ps.clone();
    const global = this.jsEnabled;
    if(typeof(lastGlobal) == "undefined") {
      lastGlobal=this._lastGlobal;
    }
    this._lastGlobal = global;
    
    this.initContentPolicy();
    
    if( (global==lastGlobal && ps.equals(snapshot)) || !snapshot) return false;
    
    if(!this.getPref("autoReload")) return false;
    
    var ret=false;
    var ov, gb, bb, b, j, doc, docSites;
    var prevStatus, currStatus;
    const ww = Components.classes['@mozilla.org/appshell/window-mediator;1']
                         .getService(Components.interfaces.nsIWindowMediator)
                         .getEnumerator("navigator:browser");
    var webNav;
    const nsIWebNavigation = Components.interfaces.nsIWebNavigation;
    const LOAD_FLAGS = nsIWebNavigation.LOAD_FLAGS_NORMAL; // nsIWebNavigation.LOAD_FLAGS_CHARSET_CHANGE;
    for(var w; ww.hasMoreElements();) {
      w = ww.getNext();
      ov = w.noscriptOverlay;
      gb = w.getBrowser ? w.getBrowser() : null;
      if(ov && gb && (bb=gb.browsers)) {
        for(b = bb.length; b-- > 0;) {
          doc = ov.getBrowserDoc(bb[b]);
          if(doc) {
            docSites = ov.getSites(doc);
            for(j = docSites.length; j-- >0;) {
              prevStatus = lastGlobal || !!snapshot.matches(docSites[j]);
              currStatus = global || !!ps.matches(docSites[j]);
              if(currStatus != prevStatus) {
                ret = true;
                webNav = bb[b].webNavigation;
                try {
                  webNav = webNav.sessionHistory.QueryInterface(nsIWebNavigation);
                  webNav.gotoIndex(webNav.index);
                } catch(e) {
                  webNav.reload(LOAD_FLAGS);
                }
                break;
              }
            }
          }
        }
      }
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
    "edu": " ar au cn hk mm mx pl tr za ",
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
    "net": " ar au br cn ec hk id il in mm mx nz pl ru sg th tr tw ua uk za ",
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
    "org": " ar au br cn ec hk il in mm mx nz pl ro ru sg tr tw uk ua uk za ",
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
    "uy": " com ",
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
    const IPC=Components.interfaces.nsIPrefBranch;
    const prefs=this.prefs;
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
    const prefs=this.prefs;
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
        sound.play(SiteUtils.ios.newURI(url,null,null));
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
    if(url.length > 100) {
      url = url.substring(0, 50) + "..." + url.substring(url.length - 50);
    }
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
  nakeEmbed: function(ctx) { return ctx },
  pluginPlaceholder: "chrome://noscript/skin/icon32.png",
  showPlaceHolder: true,
  consoleDump: 0,
  blockCssScanning: true,
  blockCrossIntranet: true,
  pluginForMime: function(mimeType) {
    if(!mimeType) return null;
    var w = this.lastWindow;
    if(!(w && w.navigator)) return null;
    var mime = w.navigator.mimeTypes.namedItem(mimeType);
    return mime && mime.enabledPlugin || null;
  },
  forbidSomePlugins: false,
  forbidAllPlugins: false,
  forbidJava: false,
  forbidFlash: false,
  forbidPlugins: false,
  nselNever: false,
  nselForce: true,
  
  mimeService: null,
  xcache: null,
  shouldLoad: function() { return 1; },
  shouldProcess: function() { return 1; },
  initContentPolicy: function() {
    var delegate = (
        (this.forbidSomePlugins || this.filterXPost || this.filterXGet) 
          && !this.getPref("global", false)
        ) 
        ? (Components.interfaces.nsIContentPolicy.TYPE_OBJECT 
            ? this.mainContentPolicy 
            : this.oldStyleContentPolicy)
        : this.noopContentPolicy;
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
  // nsIContentPolicy interface
  // we use numeric constants for performance sake:
  // nsIContentPolicy.TYPE_SCRIPT = 2
  // nsIContentPolicy.TYPE_OBJECT = 5
  // nsIContentPolicy.TYPE_DOCUMENT = 6
  // nsIContentPolicy.TYPE_SUBDOCUMENT = 7
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
          
          if(aRequestOrigin && 
              (aRequestOrigin != aContentLocation) && 
              (aContentLocation.schemeIs("http") || aContentLocation.schemeIs("https")) &&
              aRequestOrigin.prePath != aContentLocation.prePath
             ) {
            this.xcache.storeOrigin(aRequestOrigin, aContentLocation);
          }
          if(((!this.forbidSomePlugins)
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
        if(this.forbidSomePlugins) {
          var forbid = this.forbidAllPlugins;
          if((!forbid) && aMimeTypeGuess) {
            forbid = 
              (isFlash = (aMimeTypeGuess == "application/x-shockwave-flash" || aMimeTypeGuess == "application/futuresplash") && this.forbidFlash ||
              (isJava = aMimeTypeGuess.indexOf("application/x-java-") == 0) && this.forbidJava ||
              (this.forbidPlugins && !(isJava || isFlash)));
          }
        }
      }
      
      if(forbid) {
        if(!(this.isJSEnabled(origin))) {
           
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
              }
            }
          }

          if(this.consoleDump & 1) 
            dump("NoScript blocked " + url + " which is a " + aMimeTypeGuess + " from " + origin + "\n");
          return this.rejectCode;
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
  oldStyleContentPolicy: {
    shouldLoad: function(aContentType, aContentLocation, aCtx, aWin, aInternalCall) {
     
      // old style (Gecko 1.7) equivalent constants are shifted down by 1, except document:
      // OTHER       = 0;
      // SCRIPT      = 1;
      // IMAGE       = 2;
      // STYLESHEET  = 3;
      // OBJECT      = 4;
      // SUBDOCUMENT = 5;
      // CONTROL_TAG = 6;
      // RAW_URL     = 7;
      // DOCUMENT    = 8;
      //
      // so...
      
      aContentType++;

      var mimeType = "";
      var origin = null;
      if(aContentType == 5) {
        var ext, pos;
        if(aCtx && (aCtx instanceof Components.interfaces.nsIDOMHTMLAppletElement) || 
            (ext = (ext = aContentLocation.path).substring(ext.lastIndexOf(
              ".",(pos=ext.indexOf("?")) > 0 ? pos : pos=ext.length)+1,pos).toLowerCase() ) == "jnlp" ) {
          mimeType = "application/x-java-";
        } else {
          if(ext == "swf") mimeType = "application/x-shockwave-flash";
        }
        if(aCtx && aCtx.ownerDocument) {
          origin = { spec: aCtx.ownerDocument.documentURI };
        }
      } else if(aContentType == 8) {
        aContentType = 7;
      }
      return this.mainContentPolicy
                 .shouldLoad.call(this, aContentType, aContentLocation, origin, 
                      aCtx || aWin, mimeType, aInternalCall) == 1;
    },
    shouldProcess: function(aContentType, aContentLocation, aCtx, aWin) {
      return this.shouldLoad(aContentType, aContentLocation, aCtx, aWin, true);
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
    get: function(browser) {
      return browser.noScriptPluginsCache || 
      (browser.noScriptPluginsCache = { uris: {}, forceAllow: {} });
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
  
  pluginExtrasMark: {},
  getPluginExtras: function(obj) {
    obj = this.nakeEmbed(obj);
    if(this.consoleDump & 8) dump("Reading extras for " + obj);
    return (obj._noScriptExtras && obj._noScriptExtras.mark && 
      this.pluginExtrasMark == obj._noScriptExtras.mark) ? obj._noScriptExtras : null;
  },
  setPluginExtras: function(obj, extras) {
    obj = this.nakeEmbed(obj);
    if(this.consoleDump & 8) dump("Setting extras for " + obj);
    extras.mark = this.pluginExtrasMark;
    obj._noScriptExtras = extras;
    return extras;
  },
  
  log: function(msg) {
    var consoleService = Components.classes["@mozilla.org/consoleservice;1"]
                                 .getService(Components.interfaces.nsIConsoleService);
    consoleService.logStringMessage(msg);
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
}
RequestWatchdog.prototype = {
  ns: null,
  callback: null,
  
  observe: function(channel, topic, data) {
    const ci = Components.interfaces;
    const ns = this.ns;
    
    if(!((channel instanceof ci.nsIHttpChannel) && (channel.loadFlags & channel.LOAD_DOCUMENT_URI))) { 
      if(ns.consoleDump) this.dump(channel, "not a document load, SKIP");
      return;
    }
    
    const url = channel.URI;
    
    const xorigin = ns.xcache.pickOrigin(url, true); // picks and remove cached entry
    
    // fast return if nothing to do here
    if(!(ns.filterXPost || ns.filterXGet)) return; 

    var origin = xorigin && xorigin.spec || channel.originalURI.spec != url.spec && channel.originalURI.spec || null;
    
    
    var untrustedReload = false;
    var browser = null;

    if(!origin) {
      if((channel instanceof ci.nsIHttpChannelInternal) && channel.documentURI) {
        if(channel.URI == channel.documentURI) {
           browser = this.findBrowser(channel);
           if(!(browser && browser.__noscript_untrusted__)) return;
           origin = "";
           untrustedReload = true;
           if(ns.consoleDump) this.dump(channel, "Untrusted reload");
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
      if(ns.consoleDump) this.dump(channel, "ORIGIN: " + origin + ", xorigin: " + (xorigin && xorigin.spec) + ", originalURI: " + channel.originalURI.spec);
    }
    
    const su = this.siteUtils;
    const originSite = su.getSite(origin);
    const targetSite = su.getSite(url.spec);

    if(originSite == targetSite) return; // same origin, fast return
    
    if(this.callback && this.callback(channel, origin)) return;

    if(ns.isJSEnabled(originSite)) {
      if(originSite.substring(0, 7) == "chrome:"   // browser initiated navigation
         // && !(channel.loadGroup.loadFlags & channel.LOAD_REPLACE) // not a reload, cleanup state
          ) { 
        browser = browser || this.findBrowser(channel); 
        if(browser) { 
          browser.__noscript_untrusted__ = false;
          if(ns.consoleDump) this.dump(channel, "Origin " + origin + " is chrome, resetting untrusted browser info");
        } else {
          if(ns.consoleDump) this.dump(channel, "Origin " + origin + " is chrome, but cannot find browser");
        }
      } else if(ns.consoleDump) this.dump(channel, "Origin " + origin + " is trusted, SKIP");
      return;
    }
    
    if(!ns.isJSEnabled(targetSite)) {
       browser = browser || this.findBrowser(channel);
       if(browser) browser.__noscript_untrusted__ = true;
       if(ns.consoleDump) this.dump(channel, "Destination " + url.spec + " is noscripted, SKIP");
       return;
    }
    
    
    if(untrustedReload && browser) {
      var window = this.findWindow(channel);
      if(browser.contentWindow == window) {
        if(ns.consoleDump) this.dump(channel, "Top level document, resetting untrusted browser info");
        browser.__noscript_untrusted__ = false;
      }
    }
    
    // -- DANGER ZONE --
    
    var originalAttempt = url.spec;
    var xssMaybe = false;
    
    // transform upload requests into no-data GETs
    if(ns.filterXPost && (channel instanceof ci.nsIUploadChannel) && channel.uploadStream) {
      channel.requestMethod = "GET";
      try {
        channel.uploadStream.close();
      } catch(e) {}
      channel.uploadStream = null;
      xssMaybe = true;
      this.notify({
        reason: "filterXPost",
        channel: channel,
        origin: origin,
        originalAttempt: originalAttempt
      });
    }
    
    if(ns.filterXGet && ns.filterXGetRx) {
    
      if(ns.filterXExceptions && ns.filterXExceptions.test(originalAttempt)) { 
        // "safe" xss target exception
        if(this.consoleDump) this.dump(channel, "Safe target according to filterXExceptions: " + ns.filterXExceptions.toString());
        return; 
      }
      // sanitize referer
      if(channel.referrer && channel.referrer.spec) {
        originalAttempt = channel.referrer.spec;
        try {
          if(channel.referrer instanceof Components.interfaces.nsIURL) {
            channel.referrer = SiteUtils.ios.newURI(
              this.sanitizeURI(channel.referrer.prePath + channel.referrer.filePath) +
              (channel.query ? ("?" + this.sanitizeXQuery(channel.query)) : ""),
              null, null);
          } else {
            channel.referrer = SiteUtils.ios.newURI(
                this.sanitizeURI(originalAttempt), 
                null, null);
          }
        } catch(e) {
          this.dump("Failed sanitizing referrer " + channel.referrer.spec + ", " + e);
          channel.referrer.spec = "";
        }
        if((!channel.referrer) || originalAttempt != channel.referrer.spec) {
          xssMaybe = true;
          this.notify({
            reason: "filterXGetRef",
            channel: channel,
            origin: origin,
            originalAttempt: originalAttempt,
            silent: true
          });
        }
      }
      
      originalAttempt = url.spec;
      
      // sanitize credentials
      if(url.username) url.username = this.sanitizeEnc(url.user);
      if(url.password) url.password = this.sanitizeEnc(url.password);
      url.host = this.sanitizeEnc(url.host);
      var qsChanged = { value: false };
      if(url instanceof ci.nsIURL) {
        // sanitize path
        if(url.filePath) url.filePath = this.sanitizeURI(url.filePath);
        // sanitize query
        if(url.query) url.query = this.sanitizeXQuery(url.query, qsChanged);
        // sanitize fragment
        if(url.ref) url.ref = this.sanitizeEnc(url.ref);
      } else {
        // fallback for non-URL URIs, we should never get here anyway
        if(url.path) url.path = this.sanitizeURI(url.Path);
      }
      
      if(url.spec != originalAttempt) {
        xssMaybe = true;
        this.notify({
          reason: "filterXGet",
          channel: channel,
          origin: origin,
          originalAttempt: originalAttempt,
          silent: !(qsChanged.value || originalAttempt.replace(/\?.*/g, "") != url.prePath + url.filePath) 
        });
      }
    }
   
    if(untrustedReload) { 
      browser.__noscript_untrusted__ = false;
    }
    // avoid surprises from history & cache
    if(xssMaybe && channel instanceof Components.interfaces.nsICachingChannel) {
      const CACHE_FLAGS = channel.LOAD_FROM_CACHE | 
                          channel.VALIDATE_NEVER | 
                          channel.LOAD_ONLY_FROM_CACHE;
      if(channel.loadFlags & CACHE_FLAGS) {
        channel.loadFlags = channel.loadFlags & ~CACHE_FLAGS | channel.LOAD_BYPASS_CACHE;
        if(this.consoleDump) this.dump(channel, "SKIPPING CACHE");
      }
    }

  },
  
  sanitizeXQuery: function(query, changed) {
    // replace every character matching noscript.filterXGetRx with a single ASCII space (0x20)
    changed = changed || {};
    const parms = query.split(/[&;]/);
    var j, pieces, k, pz, origPz, qpos, apos;
    
    for(j = parms.length; j-- > 0;) {
      pieces = parms[j].split(/=/, 2);
      try {
        for(k = pieces.length; k-- > 0;) {
         
          origPz = pz = decodeURIComponent(pieces[k].replace(/\+/g, " "));
          
          qpos = pz.indexOf("?");
          spos = pz.search(/[&;]/);
          if(qpos > -1 || spos > -1) { 
            // recursive query string?
            if(spos > -1 && qpos > spos) {
              // recursively sanitize it as a whole qs
              pz = this.sanitizeXQuery(pz, changed);
            } else {
              // split, sanitize and rejoin
              pz = [ this.sanitize(pz.substring(0, qpos)), 
                     this.sanitizeXQuery(pz.substring(qpos + 1), changed.value)
                   ].join("?")
            }
          } else {
            pz = this.sanitize(pz);
          }
          pieces[k] = encodeURIComponent(pz);
          if(origPz != pz) changed.value = true;
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
  sanitizeURI: function(s) {
    try {
      return encodeURI(this.sanitize(decodeURI(s)));
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
    return s.replace(this.ns.filterXGetRx, " ");
  },
  
  abort: function(requestInfo) {
    requestInfo.channel.cancel(0x804b0002 /* NS_BINDING_ABORTED */);
    this.dump(requestInfo.channel, "Aborted - " + requestInfo.reason);
    this.notify(requestInfo);
  },
  
  notify: function(requestInfo) {
    var msg = "[NoScript XSS] " + this.ns.getString("xss.reason." + requestInfo.reason, [ 
        requestInfo.originalAttempt || "N/A",
        requestInfo.origin,
        requestInfo.channel.URI.spec
      ]);
    this.dump(requestInfo.channel, "Notifying " + msg + "\n\n\n");
    this.ns.log(msg);
    
    if(requestInfo.silent || !this.ns.getPref("xss.notify", true)) 
      return;
    
    if((requestInfo.browser = this.findBrowser(requestInfo.channel))) {
      requestInfo.browser.ownerDocument.defaultView.noscriptOverlay.notifyXSSOnLoad(requestInfo);
    }
  },
  
  findWindow: function(channel) {
    return channel.notificationCallbacks.QueryInterface(
      Components.interfaces.nsIInterfaceRequestor).getInterface(
      Components.interfaces.nsIDOMWindow);
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


