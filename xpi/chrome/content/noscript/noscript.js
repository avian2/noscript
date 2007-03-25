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

function NoScript() {
  if(this.cleanupIfUninstalling()) {
    return;
  }
  this.sites=this.sites; // inits mandatory sites line - hopefully prevents a reported segfault
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
}

NoScript.prototype={
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
      return this.siteString="flashgot.net informaction.com maone.net mozilla.org noscript.net";
    }
  }
,
  set sitesString(s) {
    s=s.replace(/(^\s+|\s+$)/g,'');
    if(s!=this.siteString) {
      this.caps.setCharPref(this.POLICY_NAME+".sites",'');
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
    this.sitesString=(ss=this.sortedSiteSet(ss)).join(' ');
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
    if(url==null) return null;
    url=url.replace(/^\s+/,'').replace(/\s+$/,'');
    if(!url) return null;
    var protocol;
    try {
      protocol=this.ios.extractScheme(url);
      if(protocol=="chrome" || protocol=="javascript") return null;
      protocol+="://";
    } catch(ex) {
      var domainMatch=url.match(this._domainPattern);
      return domainMatch?domainMatch[0].toLowerCase():null;
    }
    try {
      return protocol+this.ios.newURI(url,null,null).host;
    } catch(ex) {
      return null;
    }
  }
,
  findMatchingSite: function(site,sites,visitor) {
    if(!site) return null;
    if(!sites) sites=this.sites;
    
    var siteLen=site.length;
    var current,currentLen;
    var ret=null;
    for(var j=sites.length; j-->0;) {
      current=sites[j];
      currentLen=current.length;
      if( siteLen>=currentLen && ( current==site
         || (siteLen!=currentLen 
            && site.substring(siteLen-currentLen)==current) 
      ) ) { 
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
    this.findMatchingSite(site,sites,shortestFinder);
    return shortestFinder.shortest;
  }
,
  isJSEnabled: function(site,sites) {
    return this.findMatchingSite(site,sites,null)!=null; 
  }
,
  setJSEnabled: function(site,enabled) {
    if(!site) return false;
    const sites=this.sites;
    if(enabled==this.isJSEnabled(site,sites)) { 
      return enabled;
    }
    if(enabled) {
      sites[sites.length]=site;
    } else {
      const siteKiller={
        visit: function(current,sites,index) {
          sites.splice(index,1);
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
  cleanupIfUninstalling: function() {
    if(this.willBeUninstalled()) this.cleanup();
    return this.uninstalling;
  }
,
  cleanup: function() {
    try {
      this.caps.clearUserPref("default.javascript.enabled");
    } catch(ex) {
      dump(ex);
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
          this.caps.clearUserPref("default.javascript.enabled");
        } catch(ex1) {}
      }
      this.savePrefs();
    } catch(ex) {
      dump(ex);
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
}
