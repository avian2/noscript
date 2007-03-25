/***** BEGIN LICENSE BLOCK *****

NoScript - a Firefox extension for whitelist driven safe JavaScript execution
Copyright (C) 2004-2005 Giorgio Maone - g.maone@informaction.com

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
  this.name=name;
}

UninstallGuard.prototype={
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
    
     var found = false;
     var elements = container.GetElements();
     for(var found=false; elements.hasMoreElements() && !found; ) {
        found=this.check(elements.getNext().QueryInterface(Components.interfaces.nsIRDFResource));
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
            ) !=null 
            && target.QueryInterface(Components.interfaces.nsIRDFLiteral).Value == "true"
           );
        this.disabled = (
          (target = extensionDS.GetTarget(element, 
            RDFService.GetResource("http://www.mozilla.org/2004/em-rdf#toBeDisabled"),true)
            ) !=null
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

const SiteUtils = new function() {
  var _domainPattern = /^[^\?\/#,;:\\\@]+$/; // double check: changed for Unicode compliance: it was /^[\w\-\.]*\w$/
  
  var _ios = null;
  this.__defineGetter__("ios", function() {
     return _ios?_ios
      :_ios=Components.classes["@mozilla.org/network/io-service;1"
        ].getService(Components.interfaces.nsIIOService);
  });
  
  function sorter(a,b) {
    if(a==b) return 0;
    if(!a) return 1;
    if(!b) return -1;
    const dp=_domainPattern;
    return dp.test(a)?
      (dp.test(b)?(a<b?-1:1):-1)
      :(dp.test(b)?1:a<b?-1:1);
  }
  
  this.sort = function(ss) {
    return ss.sort(sorter);
  };

  this.getSite = function(url) {
    if(! (url && ( url=url.replace(/^\s+/,'').replace(/\s+$/,'') )) ) {
      return "";
    }
    
    if(url.indexOf(":")<0) return this.domainMatch(url);
    
    var scheme;
    try {
      scheme = this.ios.extractScheme(url).toLowerCase();
      if(scheme == "javascript" || scheme == "data") return "";
      if(scheme == "about") {
        return /about:neterror(\?|$)/.test(url) ? "about:neterror" : url;
      }
      scheme += ":";
      if(url == scheme) return url;
    } catch(ex) {
      return this.domainMatch(url);
    }
    try {
      // let's unwrap JAR uris
      var uri=this.ios.newURI(url,null,null);
      if(uri instanceof Components.interfaces.nsIJARURI) {
        uri=uri.JARFile;
        return uri?this.getSite(uri.spec):scheme;
      }
      try  {
        return scheme+"//"+uri.hostPort;
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
    for(var j=sl.length; j-->0;) {
      site=sl[j];
      if((!site) || site==prevSite) { 
        sl.splice(j,1);
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
      site=this.getSite(url);
      if(site!=url) {
        if(site) sm[site]=sm[url];
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




function PolicySites(sitesString) {
  if(sitesString) this.sitesString=sitesString;
}
PolicySites.prototype={
  clone: function() {
    return new PolicySites(this.sitesString);
  }
,
  equals: function(other) {
    return other && (this.sitesString==other.sitesString);
  }
,
  _sitesString: "",
  get sitesString() {
    return this._sitesString;
  },
  set sitesString(s) {
    s=SiteUtils.sanitizeString(s);
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
    return this._sitesList?this._sitesList:this._sitesList=SiteUtils.splitString(this.sitesString);
  },
  set sitesList(sl) {
    this.sitesString=SiteUtils.set2string(SiteUtils.sortedSet(SiteUtils.sanitizeList(sl)));
    return this.sitesList;
  }
,
  _sitesMap: null,
  get sitesMap() {
    if(!this._sitesMap) {
      const sm={};
      const sl=SiteUtils.splitString(this.sitesString);
      if(sl) {
        for(var j=sl.length; j-->0;) {
          sm[sl[j]]=true;
        }
      }
      this._sitesMap=sm;
    }
    return this._sitesMap;
  },
  set sitesMap(sm) {
    sm = sm?SiteUtils.sanitizeMap(sm):{};
    var sl=[];
    for(var s in sm) {
      sl.push(s);
    }
    
    this._sitesString=SiteUtils.set2string(SiteUtils.sort(sl));
    this._sitesList=null;
    return this._sitesMap=sm;
  }
,
 fromPref: function(pref) {
   this.sitesString = pref.getCharPref("sites")
       .replace(/[^\u0000-\u007f]+/g, function($0) { return decodeURIComponent(escape($0)) });
 }
,
 toPref: function(pref) {
   var change;
   var s = this.sitesString.replace(/[^\u0000-\u007f]+/g,function($0) { return unescape(encodeURIComponent($0)) });
   try {
      change = s != pref.getCharPref("sites");
    } catch(ex) {
      change = true;
    }
    
    if(change) {
      pref.setCharPref("sites", s);
    }
 }
,
  // returns the shortest match for a site, or "" if no match is found
  matches: function(site) {
    if(!site) return "";
    const sm=this.sitesMap;
    var match;
    var dots; // track "dots" for (temporary) fix to 2nd level domain policy lookup flaw 
    var pos=site.indexOf(':')+1;
    if(pos > 0 && (site[pos]=='/' || pos==site.length) ) {
      if(sm[match=site.substring(0,pos)]) return match; // scheme match
      if(site[++pos]!='/') return site == "about:" ? "about:" : "";
      match=site.substring(pos+1);
      dots=0;
    } else {
      match=site;
      dots=1;
    }

    var submatch;
    for(pos=match.lastIndexOf('.'); pos>1; dots++) {
      pos=match.lastIndexOf('.',pos-1);
      if( (dots || pos>-1) && sm[submatch=match.substring(pos+1)]) {
        return submatch; // domain/subdomain match
      }
    }
    
    if(sm[match]) return match; // host match
    return sm[site]?site:""; // full match
  }
,
  _remove: function(site, keepUp, keepDown) {
    if(!site) return false;
    
    const sm=this.sitesMap;
    var change=false;
    var match;
    
    if(site[site.length-1]!=":") { // not a scheme only site
      if(!keepUp) {
        while((match=this.matches(site)) && site!=match) { // remove ancestors
          delete sm[match];
          change = true;
        }
      }
      if(!keepDown) {
        for(match in sm) { // remove descendants
          if( (site==this.matches(match)) && site!=match) {
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
    var change=false;
    if(site.indexOf(":")<0 && site.indexOf(".")==site.lastIndexOf(".")) {
     //2nd level domain hack
      change = this._add("http://"+site) || change;
      change = this._add("https://"+site) || change;
      change = this._add("file://"+site) || change;
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

NoscriptService.prototype={
  get wrappedJSObject() {
    return this;
  }
,
  QueryInterface: function(iid) {
     this.queryInterfaceSupport(iid,SERVICE_IIDS);
     return this;
  }
,
  // nsIObserver implementation 
  observe: function(subject, topic, data) {
    // dump(SERVICE_NAME+" notified of "+subject+","+topic+","+data); //DDEBUG
    
    if(subject instanceof Components.interfaces.nsIPrefBranchInternal) {
      this.syncPrefs(subject,data);
    } else {
      switch(topic) {
        case "xpcom-shutdown":
          this.unregister();
          break;
        case "profile-before-change": 
          this.resetJSCaps();
          break;
        case "profile-after-change":
          this.init();
          break;
        case "em-action-requested":
          if( (subject instanceof Components.interfaces.nsIUpdateItem)
              && subject.id==EXTENSION_ID ) {
              this.uninstallGuard.uninstalling=data=="item-uninstalled";
              this.uninstallGuard.disabled=data=="item-disabled"
          }
      }
    }
  }
,  
  register: function() {
    const osvr=Components.classes['@mozilla.org/observer-service;1'].getService(
    Components.interfaces.nsIObserverService);
    osvr.addObserver(this,"profile-before-change",false);
    osvr.addObserver(this,"xpcom-shutdown",false);
    osvr.addObserver(this,"profile-after-change",false);
    osvr.addObserver(this,"em-action-requested",false);
  }
,
  unregister: function() {
    const osvr=Components.classes['@mozilla.org/observer-service;1'].getService(
      Components.interfaces.nsIObserverService);
    osvr.removeObserver(this,"profile-before-change");
    osvr.removeObserver(this,"xpcom-shutdown");
    osvr.removeObserver(this,"profile-after-change");
    osvr.removeObserver(this,"em-action-requested",false);
    if(this.prefs) {
      this.prefs.removeObserver("",this);
      this.mozJSPref.removeObserver("enabled",this,false);
      this.uninstallGuard.dispose();
    }
  }
,
  syncPrefs: function(branch, name) {
    switch(name) {
      case "sites":
        try {
          this.jsPolicySites.fromPref(this.policyPB);
        } catch(ex) {
          this.policyPB.setCharPref("sites",
            this.getPref("default",
              "chrome: resource: about:neterror flashgot.net mail.google.com googlesyndication.com informaction.com yahoo.com yimg.com maone.net mozilla.org mozillazine.org noscript.net hotmail.com msn.com passport.com passport.net passportimages.com"
            ));
        }
        break;
      case "permanent":
        this.permanentSites.sitesString=this.getPref("permanent",
            "googlesyndication.com noscript.net maone.net informaction.com noscript.net"
          ) + " chrome: resource: about:neterror";
      break;
      case "temp":
        this.tempSites.sitesString=this.getPref("temp","") + " jar:";
        // why jar:? see https://bugzilla.mozilla.org/show_bug.cgi?id=298823
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
        this.forbidSomePlugins = this.forbidJava || this.forbidFlash || this.forbidPlugins;
        this.forbidAllPlugins = this.forbidJava && this.forbidFlash && this.forbidPlugins;
        this.initContentPolicy();
      break;
      case "pluginPlaceholder":
      case "showPlaceholder":
      case "consoleDump":
        this[name]=this.getPref(name,this[name]);
      break;
      case "allowClipboard":
        const cp=["cutcopy","paste"];
        const cpEnabled=this.getPref(name,false);
        var cpName;
        for(var cpJ=cp.length; cpJ-->0;) {
          cpName=this.POLICY_NAME+".Clipboard."+cp[cpJ];
          try {
            if(cpEnabled) {
              this.caps.setCharPref(cpName,"allAccess");
            } else {
              if(this.caps.prefHasUserValue(cpName)) {
                this.caps.clearUserPref(cpName);
              }
            }
          } catch(ex) {
            dump(ex+"\n");
          }
        }
      break;
      case "truncateTitle" :
        this.truncateTitle = this.getPref(name, true);
      break;
      case "truncateTitleLen" :
       this.truncateTitleLen = this.getPref(name, 255);
      break;  
    }
  }
,
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
    if(this._inited) return;
    this._inited=true;
    
    const prefserv=this.prefService=Components.classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefService).QueryInterface(Components.interfaces.nsIPrefBranch);
    
    const PBI=Components.interfaces.nsIPrefBranchInternal;
    this.caps=prefserv.getBranch("capability.policy.").QueryInterface(PBI);
    this.policyPB=prefserv.getBranch("capability.policy."+this.POLICY_NAME+".").QueryInterface(PBI);
    this.policyPB.addObserver("sites",this,false);
    this.prefs=prefserv.getBranch("noscript.").QueryInterface(PBI);
    this.prefs.addObserver("",this,false);
    this.mozJSPref=prefserv.getBranch("javascript.").QueryInterface(Components.interfaces.nsIPrefBranchInternal);
    this.mozJSPref.addObserver("enabled",this,false);
    
    const syncPrefNames=[ "consoleDump",
      "pluginPlaceholder", "showPlaceholder", "allowClipboard", "forbidPlugins", 
      "forbidJava", "forbidFlash", "temp", "permanent",
      "truncateTitle", "truncateTitleLen" ];
    for(var spcount=syncPrefNames.length; spcount-->0;) {
      this.syncPrefs(this.prefs,syncPrefNames[spcount]);
    }
    
    this.syncPrefs(this.mozJSPref,"enabled");
   
    // init jsPolicySites from prefs
    this.syncPrefs(this.policyPB,"sites");
    this.eraseTemp();
    
    
    const POLICY_NAME=this.POLICY_NAME;
    var prefArray;
    var prefString="",originalPrefString="";
    try { 
      prefArray=this.splitList(prefString=originalPrefString=this.caps.getCharPref("policynames"));
      var pcount=prefArray.length;
      var pn;
      while(pcount-->0 && (pn=prefArray[pcount])!=POLICY_NAME);
      if(pcount==-1) {
        if(prefArray.length==0) {
          prefString=POLICY_NAME;
        } else {
          prefArray.push(POLICY_NAME);
          prefString=prefArray.join(' ');
        }
      }
      prefString=prefString.replace(/,/g,' ').replace(/\s+/g,' ').replace(/^\s+/,'').replace(/\s+$/,'');
    } catch(ex) {
      prefString=POLICY_NAME;
    }
  
    if(prefString && (prefString!=originalPrefString)) { 
      this.caps.setCharPref("policynames",prefString);
      this.caps.setCharPref(POLICY_NAME+".javascript.enabled","allAccess");
    }
    
    this.reloadWhereNeeded(); // init snapshot
   
    this.uninstallGuard.init();
  }
,
  permanentSites: new PolicySites(),
  isPermanent: function(s) {
    return s &&
      (s == "chrome:" || s == "resource:" || s =="about:" || s == "about:neterror"
        || this.permanentSites.matches(s));
  }
,
  tempSites: new PolicySites(),
  isTemp: function(s) {
    return this.tempSites.matches(s);
  }
,
  setTemp: function(s,b) {
    var change=b?this.tempSites.add(s):this.tempSites.remove(s, true);
    if(change) {
      this.setPref("temp",this.tempSites.sitesString);
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
      return this.uninstalling?this.mozJSEnabled:(this.jsEnabled=this.getPref("global",false));
    }
  }
,
  set jsEnabled(enabled) {
    this.caps.setCharPref("default.javascript.enabled",enabled?"allAccess":"noAccess");
    this.setPref("global",enabled);
    if(enabled) {
      this.mozJSPref.setBoolPref("enabled",true);
    }
    return enabled;
  }
,
  getSite: function(url) {
    return SiteUtils.getSite(url);
  }
,
  jsPolicySites: new PolicySites(),
  isJSEnabled: function(site) {
    return (!!this.jsPolicySites.matches(site));
  },
  setJSEnabled: function(site,is,fromScratch) {
    const ps=this.jsPolicySites;
    if(fromScratch) ps.sitesString=this.permanentSites.sitesString;
    if(is) {
      ps.add(site)
    } else {
      ps.remove(site, false, true);
    }
    this.flushCAPS();
    return is;
  }
,
 flushCAPS: function(sitesString) {
   const ps = this.jsPolicySites;
   if(sitesString) ps.sitesString = sitesString;
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
    const serv=this;
    this.delayExec(function() {
      serv.savePrefs();
      serv.reloadWhereNeeded();
     },1);
  }
,
  _lastSnapshot: null,
  _lastGlobal: false,
  reloadWhereNeeded: function(snapshot,lastGlobal) {
    if(!snapshot) snapshot=this._lastSnapshot;
    const ps=this.jsPolicySites;
    this._lastSnapshot=ps.clone();
    const global=this.jsEnabled;
    if(typeof(lastGlobal)=="undefined") {
      lastGlobal=this._lastGlobal;
    }
    this._lastGlobal=global;
    
    this.initContentPolicy();
    
    if( (global==lastGlobal && ps.equals(snapshot)) || !snapshot) return false;
    
    if(!this.getPref("autoReload")) return false;
    
    var ret=false;
    var ov, gb, bb, b, j, doc, docSites;
    var prevStatus, currStatus;
    const ww = Components.classes['@mozilla.org/appshell/window-mediator;1']
                         .getService(Components.interfaces.nsIWindowMediator)
                         .getEnumerator("navigator:browser");
    for(var w; ww.hasMoreElements();) {
      w=ww.getNext();
      ov=w.noscriptOverlay;
      gb=w.getBrowser?w.getBrowser():null;
      if(ov && gb && (bb=gb.browsers)) {
        for(b=bb.length; b-->0;) {
          doc=ov.getBrowserDoc(bb[b]);
          if(doc) {
            docSites=ov.getSites(doc);
            for(j=docSites.length; j-- >0;) {
              prevStatus=lastGlobal || !!snapshot.matches(docSites[j]);
              currStatus=global || !!ps.matches(docSites[j]);
              if(currStatus!=prevStatus) {
                ret=true;
                bb[b].reload();
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
    "ac": " ac at be cn il in jp kr nz th uk za ", 
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
    "co": " ac at il in jp kr nz th uk za ",
    "com": " ar au br cn ec fr hk mm mx pl ro ru sg tr tw ",
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
    "go": " jp kr th ",
    "gob": " mx ",
    "gov": " ar br cn ec il in mm mx sg tr za ",
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
    "mil": " br ec nz pl tr za ",
    "mo": " cn ",
    "muni": " il ",
    "nb": " ca ",
    "ne": " jp kr ",
    "net": " ar au br cn ec hk il in mm mx nz pl ru sg th tr tw za ",
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
    "or": " ac at jp kr th ",
    "org": " ar au br cn ec hk il mm mx nz pl ro ru sg tr tw uk za ",
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
    "web": " za ",
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
    this.setJSEnabled(this.permanentSites.sitesList,true); // add permanent & save
    this.setPref("temp",""); // flush temporary list
  }
,
  resetJSCaps: function() {
    try {
      this.caps.clearUserPref("default.javascript.enabled");
    } catch(ex) {}
    try {
      const POLICY_NAME=this.POLICY_NAME;
      var prefArray=SiteUtils.splitString(this.caps.getCharPref("policynames"));
      var pcount=prefArray.length;
      const prefArrayTarget=[];
      for(var pcount=prefArray.length; pcount-->0;) {
        if(prefArray[pcount]!=POLICY_NAME) prefArrayTarget[prefArrayTarget.length]=prefArray[pcount];
      }
      var prefString=prefArrayTarget.join(" ").replace(/\s+/g,' ').replace(/^\s+/,'').replace(/\s+$/,'');
      if(prefString) {
        this.caps.setCharPref("policynames",prefString);
      } else {
        try {
          this.caps.clearUserPref("policynames");
        } catch(ex1) {}
      }
      this.eraseTemp();
      this.savePrefs();
    } catch(ex) {
      // dump(ex);
    }
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
  get prompter() {
    return Components.classes["@mozilla.org/embedcomp/prompt-service;1"
          ].getService(Components.interfaces.nsIPromptService);
  }
,
  queryInterfaceSupport: function(iid,iids) { 
    xpcom_checkInterfaces(iid, iids, Components.results.NS_ERROR_NO_INTERFACE);
  }
,
 lookupMethod: Components.utils?Components.utils.lookupMethod:Components.lookupMethod
,
  pluginPlaceholder: "chrome://noscript/skin/icon32.png",
  showPlaceHolder: true,
  pluginsExtrasMark: {},
  getPluginExtras: function(obj) {
    return (obj._noScriptExtras && obj._noScriptExtras.mark && 
      this.pluginsExtrasMark == obj._noScriptExtras.mark) ? obj._noScriptExtras : null;
  },
  consoleDump: false,
  forbidSomePlugins: false,
  forbidAllPlugins: false,
  forbidJava: false,
  forbidFlash: false,
  forbidPlugins: false, 
  initContentPolicy: function() {
    var delegate = (this.forbidSomePlugins && !this.getPref("global",false)) ? 
        (Components.interfaces.nsIContentPolicy.TYPE_OBJECT 
          ? this.mainContentPolicy 
          : this.oldStyleContentPolicy)
      : this.noopContentPolicy;
    this.shouldLoad = delegate.shouldLoad;
    this.shouldProcess = delegate.shouldProcess;
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
      var forbid, isJS, isFlash, isJava;
      if(aContentType == 5 || (forbid = isJS = (aContentType == 2))) {
        const url = aContentLocation.spec;
        const origin = this.getSite(url);
        if(!forbid) {
          var forceAllow;
          try {
            forceAllow = this.pluginsCache.update(url, aMimeTypeGuess, origin, aRequestOrigin, aContext);
          } catch(ex) {
            dump("NoScriptService.pluginsCache.update():" + ex + "\n");
          }
          if((!forceAllow) && this.forbidSomePlugins) {
            var forbid=this.forbidAllPlugins;
            if((!forbid) && aMimeTypeGuess) {
              forbid = 
                (isFlash = aMimeTypeGuess == "application/x-shockwave-flash") && this.forbidFlash ||
                (isJava = aMimeTypeGuess.indexOf("application/x-java-")==0) && this.forbidJava ||
                (this.forbidPlugins && !(isJava || isFlash));
            }
          }
        }
        
        if(forbid) {
          if(!(this.isJSEnabled(origin))) {
            
            if(aContext && (!isJS)) {
              const ci = Components.interfaces;
              if(aContext instanceof ci.nsIDOMNode) {
                
                const lm=this.lookupMethod;
                
                if(this.pluginPlaceholder) {
                 
                  if(aContext instanceof(ci.nsIDOMHTMLEmbedElement)) {
                    var parent = lm(aContext,"parentNode")();
                    if(parent instanceof ci.nsIDOMHTMLObjectElement) {
                      aContext = parent;
                    }
                  }

                  if(aMimeTypeGuess && !this.getPluginExtras(aContext)) {
                    aContext._noScriptExtras = {
                      mark: this.pluginsExtrasMark,
                      url: url,
                      mime: aMimeTypeGuess
                    };
                  }
                }
              }
            }
            
            if(this.consoleDump) 
              dump("NoScript blocked " + url + " which is a " + aMimeTypeGuess + " from " + origin + "\n");
            return -3;
          }
        }
      }
    
      return 1;
    },
    shouldProcess: function(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeType, aExtra) {
      return this.shouldLoad(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeType, true);
    }
  },
  oldStyleContentPolicy: {
    shouldLoad: function(aContentType, aContentLocation, aCtx, aWin, aInternalCall) {
      aContentType++;
      var mimeType = "";
      var origin = null;
      if(aContentType == 5) {
        var ext, pos;
        if(aCtx && (aCtx instanceof Components.interfaces.nsIDOMHTMLAppletElement) || 
            (ext = (ext = aContentLocation.path).substring(ext.lastIndexOf(
              ".",(pos=ext.indexOf("?"))>0 ? pos : pos=ext.length)+1,pos).toLowerCase() ) == "jnlp" ) {
          mimeType = "application/x-java-";
        } else {
          if(ext == "swf") mimeType = "application/x-shockwave-flash";
        }
        if(aCtx && aCtx.ownerDocument) {
          origin = { spec: aCtx.ownerDocument.documentURI };
        }
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
    _lastBrowser: null,
    findBrowser: function(chrome, win) {
      var gb=chrome.getBrowser();
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
          ctx = lm(ctx,"defaultView")();
        } else if(ctx instanceof ci.nsIDOMNode) {
          ctx = lm(lm(ctx,"ownerDocument")(),"defaultView")();
        } else return; 
      }
      if(!ctx) return;
      ctx = lm(ctx,"top")();
      var browser = this._lastBrowser;
      try {
        if(browser.contentWindow != ctx) browser = null;
      } catch(ex) {
        browser = null;
      }
      if(!browser) {
        this._lastBrowser = null;
        const wm = Components.classes['@mozilla.org/appshell/window-mediator;1']
                             .getService(Components.interfaces.nsIWindowMediator);
        const chrome = wm.getMostRecentWindow("navigator:browser");
        
        if(! (browser = this.findBrowser(chrome, ctx))) {
          const ww = wm.getEnumerator("navigator:browser");
          for(var w; ww.hasMoreElements();) {
            w=ww.getNext();
            if(w != chrome && (browser = this.findBrowser(w, ctx))) {
              break;
            }
          }
        }
        this._lastBrowser = browser;
      }
      return browser;
    },
    lookupMethod: Components.utils?Components.utils.lookupMethod:Components.lookupMethod,
    update: function(url, mime, origin, docURI, ctx) { // returns forceAllow
      var browser = this.findBrowserForNode(ctx);
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
    }
  }
};



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
  for(var j=0, len=SERVICE_CATS.length; j<len; j++) {
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


