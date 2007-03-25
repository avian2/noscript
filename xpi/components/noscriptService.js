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

function NoscriptService() {
  this.register();
}

NoscriptService.prototype={
    get wrappedJSObject() {
    return this;
  }
,
  QueryInterface: function(iid) {
     flashgot_checkInterfaces(iid,Components.results.NS_ERROR_NO_INTERFACE);
     return this;
  }
,
  // nsIObserver implementation 
  observe: function(subject, topic, data) {
    if(subject==this.prefs) {
      this.syncPrefs(data);
    } else {
      switch(topic) {
        case "xpcom-shutdown":
          this.unregister();
          break;
        case "profile-before-change": 
          this.cleanup();
          break;
        case "profile-after-change":
          this.init();
          break;
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
  }
,
  unregister: function() {
    const osvr=Components.classes['@mozilla.org/observer-service;1'].getService(
    Components.interfaces.nsIObserverService);
    osvr.removeObserver(this,"profile-before-change");
    osvr.removeObserver(this,"xpcom-shutdown");
    osvr.removeObserver(this,"profile-after-change");
  }
,
  syncPrefs: function(name) {}
,
  _inited: false
,
  init: function() {
    if(this._inited) return;
    this._inited=true;
    this.DEFAULT_WHITELIST=this.getPref("default",
      "noscript.net gmail.google.com googlesyndication.com informaction.com maone.net mozilla.org mozillazine.org noscript.net hotmail.com msn.com passport.com passport.net passportimages.com");
    this.permanentList=this.sortedSiteSet(this.splitList(this.getPref("permanent",
      "googlesyndication.com noscript.net maone.net informaction.com noscript.net")));
    const sites=this.sites=this.sites;
    const POLICY_NAME=this.POLICY_NAME;
    var prefArray;
    var prefString=null,originalPrefString=null;
    try { 
      prefArray=this.splitList(prefString=originalPrefString=this.caps.getCharPref("policynames"));
      var pcount=prefArray.length;
      var pn;
      while(pcount-->0 && (pn=prefArray[pcount])!=POLICY_NAME);
      if(pcount==-1) {
        if(prefArray.length==0) {
          prefString=POLICY_NAME;
        } else {
          prefArray[prefArray.length]=POLICY_NAME;
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
    
    var site;
    for(var ps in this.permanentList) {
      site=this.permanentList[ps];
      if(!this.isJSEnabled(site,sites)) {
        this.setJSEnabled(site,true);
      }
    }
  }
,
  isPermanent: function(s) {
    if(!s) return false;
    if(s=="chrome://") return true; 
    const pl=this.permanentList;
    for(var ps in pl) if(pl[ps]==s) return true;
  }
,
  POLICY_NAME: "maonoscript",
  _caps: null,
  get caps() {
    return this._caps?this._caps:this._caps=Components.classes["@mozilla.org/preferences-service;1"].getService(
      Components.interfaces.nsIPrefService).getBranch("capability.policy.");
  }
, 
  _prefs: null,
  get prefs() {
    return this._prefs?this._prefs:this._prefs=Components.classes["@mozilla.org/preferences-service;1"].getService(
      Components.interfaces.nsIPrefService).getBranch("noscript.");
  }
,
  uninstalling: false
,
  splitList: function(s) {
    return s.split(/\s*[, ]\s*/);
  }
,
  savePrefs: function() {
    return Components.classes["@mozilla.org/preferences-service;1"].getService(
        Components.interfaces.nsIPrefService).savePrefFile(null);
  }
,
  get sitesString() {
    try {
      return this.caps.getCharPref(this.POLICY_NAME+".sites");
    } catch(ex) {
      return this.siteString=this.DEFAULT_WHITELIST;
    }
  }
,
  set sitesString(s) {
    s=s.replace(/(^\s+|\s+$)/g,'');
    if(s!=this.siteString) {
      this.caps.setCharPref(this.POLICY_NAME+".sites",s);
    }
    return s;
  }
,
  get sites() {
    var sstr=this.sitesString;
    return /^\s*$/.test(sstr)?[]:sstr.split(/\s+/);
  }
,
  set sites(ss) {
    this.sitesString=(ss=this.sortedSiteSet(ss,true)).join(' ');
    return ss;
  }
,
  _domainPattern: /^[\w\-\.]*\w$/
,
  sortedSiteSet: function(ss,keepShortest) {
    const ns=this;
    ss=ss.sort(function(a,b) {
      if(a==b) return 0;
      if(!a) return 1;
      if(!b) return -1;
      const dp=ns._domainPattern;
      return dp.test(a)?
        (dp.test(b)?(a<b?-1:1):-1)
        :(dp.test(b)?1:a<b?-1:1);
    });
    // sanitize and kill duplicates
    var prevSite=null;
    for(var j=ss.length; j-->0;) {
      var curSite=ss[j];
      if((!curSite) || curSite.toLowerCase().replace(/\s/g,'')==prevSite) { 
        ss.splice(j,1);
      } else {
        ss[j]=prevSite=curSite;
      }
    }
    return ss;
  }
,
  get jsEnabled() {
    try {
      return this.caps.getCharPref("default.javascript.enabled") != "noAccess";
    } catch(ex) {
      return this.uninstalling || (this.jsEnabled=false);
    }
  }
,
  set jsEnabled(enabled) {
    this.caps.setCharPref("default.javascript.enabled",enabled?"allAccess":"noAccess");
    return enabled;
  }
,
  _ios: null,
  get ios() {
     return this._ios?this._ios
      :this._ios=Components.classes["@mozilla.org/network/io-service;1"
        ].getService(Components.interfaces.nsIIOService);
  }
,
  getSite: function(url) {
    if(!url) return null;
    url=url.replace(/^\s+/,'').replace(/\s+$/,'');
    if(!url) return null;
    var protocol;
    try {
      protocol=this.ios.extractScheme(url);
      if(protocol=="javascript") return null;
      protocol+="://";
    } catch(ex) {
      var domainMatch=url.match(this._domainPattern);
      return domainMatch?domainMatch[0].toLowerCase():null;
    }
    try {
      const uri=this.ios.newURI(url,null,null);
      const port=uri.port;
      return port>0?protocol+uri.host+":"+port:protocol+uri.host;
    } catch(ex) {
      return null;
    }
  }
,
  findMatchingSite: function(site,sites,visitor) {
    if(!site) return null;
    if(site.indexOf("chrome://")==0) return "chrome://";
    if(!sites) sites=this.sites;
    const siteLen=site.length;
    var current,currentLen,lenDiff,charBefore;
    
    var ret=null;
    for(var j=sites.length; j-->0;) {
      current=sites[j];
      currentLen=current.length;
      lenDiff=siteLen-currentLen;
     
      if(lenDiff>=0 && (current==site ||
           // subdomain matching
          (lenDiff>0 && 
            ( (charBefore=site.charAt(lenDiff-1))=="."
               || (charBefore=="/" 
                    && current.indexOf(".")!=current.lastIndexOf(".")) 
                      // 2nd level domain policy lookup flaw 
              ) 
            && site.substring(lenDiff)==current
          ) )
      ) { 
        if(visitor) {
          if(ret=visitor.visit(current,sites,j)) {
            return ret;
          }
        } else {
          return current;
        }
      }
    }
    return null;
  }
,
  findShortestMatchingSite: function(site,sites) {
    const shortestFinder={
      shortest: null, shortestLen: site.length,
      visit: function(current,sites,index) {
        if(this.shortestLen>=current.length) {
          this.shortestLen=current.length;
          this.shortest=current;
        }
      }
    };
    return this.findMatchingSite(site,sites,shortestFinder) || shortestFinder.shortest;
  }
,
  isJSEnabled: function(site,sites) {
    return this.findMatchingSite(site,sites,null)!=null; 
  }
,
  setJSEnabled: function(site,enabled,sites) {
    if(!site) return false;
    if(!sites) sites=this.sites;
    
    if(site.indexOf("/")<0 && site.indexOf(".")==site.lastIndexOf(".")) {
     //2nd level domain hack
      this.setJSEnabled("http://"+site,enabled,sites);
      this.setJSEnabled("https://"+site,enabled,sites);
    }
    if(enabled==this.isJSEnabled(site,sites)) { 
      return enabled;
    }
    if(enabled) {
      sites[sites.length]=site;
    } else {
      const siteKiller={
        visit: function(current,ss,index) {
          ss.splice(index,1);
          return null;
        }
      };
      this.findMatchingSite(site,sites,siteKiller);
    }
    this.sites=sites;
    return enabled;
  }
,
  willBeUninstalled: function() {
   if(this.uninstalling) return true;
   try {
     const RDFService = Components.classes["@mozilla.org/rdf/rdf-service;1"]
               .getService(Components.interfaces.nsIRDFService);
     const container = Components.classes["@mozilla.org/rdf/container;1"]
               .getService(Components.interfaces.nsIRDFContainer);
     const extensionDS= Components.classes["@mozilla.org/extensions/manager;1"]
          .getService(Components.interfaces.nsIExtensionManager).datasource;
     var root = RDFService.GetResource("urn:mozilla:extension:root");
     const nameArc = RDFService.GetResource("http://www.mozilla.org/2004/em-rdf#name");
     const toBeUninstalledArc = RDFService.GetResource("http://www.mozilla.org/2004/em-rdf#toBeUninstalled");
     const toBeDisabledArc=RDFService.GetResource("http://www.mozilla.org/2004/em-rdf#toBeDisabled");
     container.Init(extensionDS,root);
    
     var found = false;
     var elements = container.GetElements();
     var element,name,target;
     while (elements.hasMoreElements()) {
      element = elements.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
     
  
      if((target=extensionDS.GetTarget(element, nameArc ,true)) && 
          target.QueryInterface(Components.interfaces.nsIRDFLiteral).Value=="NoScript"
        && 
        (
          (target = extensionDS.GetTarget(element, toBeUninstalledArc,true))
           && target.QueryInterface(Components.interfaces.nsIRDFLiteral).Value == "true"
          ||
          (target = extensionDS.GetTarget(element, toBeDisabledArc,true))
          && target.QueryInterface(Components.interfaces.nsIRDFLiteral).Value == "true"
        )  
      ) {
         return this.uninstalling=true;     
        }         
     }
   } catch(ex) {} // quick and dirty work-around for Mozilla ;)
   return this.uninstalling=false;
  }
,
  cleanup: function() {
    this.cleanupIfUninstalling();
  }
,
  cleanupIfUninstalling: function() {
    if(this.willBeUninstalled()) this.uninstallJob();
    return this.uninstalling;
  }
,
  uninstallJob: function() {
    try {
      this.caps.clearUserPref("default.javascript.enabled");
    } catch(ex) {
      // dump(ex);
    }
    try {
      const POLICY_NAME=this.POLICY_NAME;
      var prefArray=this.splitList(this.caps.getCharPref("policynames"));
      var pcount=prefArray.length;
      prefArrayTarget=[];
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
      this.savePrefs();
    } catch(ex) {
      // dump(ex);
    }
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
};


// XPCOM Scaffolding code

// component defined in this file

const SERVICE_NAME="NoScript Service";
const SERVICE_CID =
    Components.ID("{31aec909-8e86-4397-9380-63a59e0c5ff5}");
const SERVICE_CTRID =
    "@maone.net/noscript-service;1";
    
const SERVICE_CONSTRUCTOR=NoscriptService;

// interfaces implemented by this component
const SERVICE_IIDS = 
[ 
Components.interfaces.nsIObserver,
Components.interfaces.nsISupports,
Components.interfaces.nsISupportsWeakReference,
];

// Factory object
const SERVICE_FACTORY = {
  _instance: new SERVICE_CONSTRUCTOR(),
  createInstance: function (outer, iid) {
    if (outer != null)
        throw Components.results.NS_ERROR_NO_AGGREGATION;

    xpcom_checkInterfaces(iid,Components.results.NS_ERROR_INVALID_ARG);
    // kept this for flexibility sake, but we're really adopting an
    // early instantiation and late init singleton pattern
    return this._instance==null?this._instance=new SERVICE_CONSTRUCTOR():this._instance;
  }
};

function xpcom_checkInterfaces(iid,ex) {
  for(var j=SERVICE_IIDS.length; j-- >0;) {
    if(iid.equals(SERVICE_IIDS[j])) return true;
  }
  throw ex;
}

// Module

var Module = new Object();
Module.firstTime=true;
Module.registerSelf = function (compMgr, fileSpec, location, type) {
  if(this.firstTime) {
   
    debug("*** Registering "+SERVICE_CTRID+".\n");
    
    compMgr =
        compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
  
    compMgr.registerFactoryLocation(SERVICE_CID,
      "NoScript Service",
      SERVICE_CTRID, 
      fileSpec,
      location, 
      type);
   
   Components.classes[SERVICE_CTRID].getService(
      Components.interfaces.nsISupports);
    // Early instantiation, CHECK ME
    this.firstTime=false;
  } 
}
Module.unregisterSelf = function(compMgr, fileSpec, location) {
  compMgr = compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
  compMgr.unregisterFactoryLocation(SERVICE_CID, fileSpec);
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

