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
  const POLICY_NAME=this.POLICY_NAME;
  var prefArray;
  var prefString=null;
  try {
    prefArray=this.splitList(this.prefs.getCharPref("policynames"));
    var pcount=prefArray.length;
    while(pcount-->0 && prefArray[pcount]!=POLICY_NAME);
    if(pcount==-1) {
      prefArray[prefArray.length]=POLICY_NAME;
      prefString=prefArray.join(",");
    }
  } catch(ex) {
    prefString=POLICY_NAME;
  }
  if(prefString) {
    this.prefs.setCharPref("policynames",prefString);
    this.prefs.setCharPref(POLICY_NAME+".javascript.enabled","allAccess");
  }
  this.sitesString;
}

NoScript.prototype={
  POLICY_NAME: "maonoscript",
  get prefs() {
    return Components.classes["@mozilla.org/preferences-service;1"].getService(
      Components.interfaces.nsIPrefService).getBranch("capability.policy.");
  }
,
  uninstalling: false
,
  splitList: function(s) {
    return s.split(/\s*[, ]\s*/);
  }
,
  get sitesString() {
    try {
      return this.prefs.getCharPref(this.POLICY_NAME+".sites");
    } catch(ex) {
      return "http://www.informaction.com http://www.maone.net http://www.noscript.net http://www.flashgot.net https://addons.mozilla.org";
    }
  }
,
  set sitesString(s) {
    s=s.replace(/(^\s+|\s+$)/g,'');
    this.prefs.setCharPref(this.POLICY_NAME+".sites",s);
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
  sortedSiteSet: function(ss) {
    ss=ss.sort();
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
      return this.prefs.getCharPref("default.javascript.enabled") != "noAccess";
    } catch(ex) {
      return this.uninstalling || (this.jsEnabled=false);
    }
  }
,
  set jsEnabled(enabled) {
    this.prefs.setCharPref("default.javascript.enabled",enabled?"allAccess":"noAccess");
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
    var protocol;
    try {
      protocol=this.ios.extractScheme(url)+"://";
    } catch(ex) {
      url=(protocol="http://")+url;
    }
    try {
      return protocol+this.ios.newURI(url,null,null).host;
    } catch(ex) {
      return null;
    }
  }
,
  isJSEnabled: function(site) {
    if(!site) return false;
    var sites=this.sitesString;
    if(!(sites && sites.length)) return false;
    var pos=sites.indexOf(site);
    return (pos==0 || pos>0 && sites.charAt(pos-1)==' ');
  }
,
  setJSEnabled: function(site,enabled) {
    if(!site) return false;
    var sites=this.sitesString.split(/\s+/);
    var scount=sites.length;
    while(scount-->0) {
      if(sites[scount]==site) {
        if(enabled) return true;
        sites.splice(scount,1);
        break;
      }
    }
    if(scount==-1) sites[sites.length]=site;
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
      this.prefs.clearUserPref("default.javascript.enabled");
    } catch(ex) {
      dump(ex);
    }
    try {
      const POLICY_NAME=this.POLICY_NAME;
      var prefArray=this.splitList(this.prefs.getCharPref("policynames"));
      var pcount=prefArray.length;
      prefArrayTarget=[];
      for(var pcount=prefArray.length; pcount-->0;) {
        if(prefArray[pcount]!=POLICY_NAME) prefArrayTarget[prefArrayTarget.length]=prefArray[pcount];
      }
      this.prefs.setCharPref("policynames",prefArrayTarget.join(","));
      return Components.classes["@mozilla.org/preferences-service;1"].getService(
        Components.interfaces.nsIPrefService).savePrefFile(null);
    } catch(ex) {
      dump(ex);
    }
  }
}
