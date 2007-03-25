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

function NoScriptOverlay() {
  this.ns=new NoScript();
}

NoScriptOverlay.prototype={
  _strings: null,
  get strings() {
    return this._strings?this._strings:this._strings=document.getElementById("noscript-strings");  
  }
,
  _stringsFB: null,
  get strings() {
    return this._stringsFB?this._stringsFB:this._stringsFB=document.getElementById("noscript-stringsFB");  
  }
,
  _stringFrom: function(bundle,key,parms) {
    try {
      return parms?bundle.getFormattedString(key,parms):bundle.getString(key);
    } catch(ex) {
      return null;
    }
  }
,
  getString: function(key,parms) {
    var s=this._stringFrom(this.strings,key,parms);
    return s?s:this._stringFrom(this.stringsFB,key,parms);
  }
,
  getSites: function() {
    function populate(tagName) {
      var elems=doc.getElementsByTagName(tagName);
      for(var j=elems.length; j-->0;) {
        try {
          sites[sites.length]=ns.getSite(new XPCNativeWrapper(elems[j],"src").src);
        } catch(ex) {
        }
      }
    }
    const ns=this.ns;
    try {
      var doc=this.srcDocument;
      var sites=[ns.getSite(doc.URL)];
      populate('frame');
      populate('iframe');
      return ns.sortedSiteSet(sites);
    } catch(ex) {
      return [];
    }
  }
,
  get prompter() {
    return Components.classes["@mozilla.org/embedcomp/prompt-service;1"
          ].getService(Components.interfaces.nsIPromptService);
  }
,
  uninstallAlert: function() {
    this.prompter.alert(window,this.getString("uninstall.alert.title"),
          this.getString("uninstall.alert.text",
            [this.getString("allowed."+(this.ns.jsEnabled?"glb":"no") ) ]
            ));
  }
,
  prepareMenu: function(ev) {
    if(this.ns.uninstalling) {
      ev.preventDefault();
      return;
    }
    const ns=this.ns;
    const miGlobal=document.getElementById("noscript-sm-allow-global");
    const global=ns.jsEnabled;
    miGlobal.setAttribute("label",this.getString((global?"forbid":"allow")+"Global"));
    miGlobal.setAttribute("oncommand","noscriptOverlay.menuAllow("+(!global)+")");
    miGlobal.setAttribute("tooltiptext",document.getElementById("noscript-status").getAttribute("tooltiptext"));
    miGlobal.setAttribute("image",this.getIcon(global?"no":"glb"));
    const sep=document.getElementById("noscript-sm-sep");
    
    const parent=miGlobal.parentNode;
    var node=miGlobal.nextSibling;
    var remNode;
    while(node && (node!=sep)) {
       remNode=node;
       node=node.nextSibling;
       parent.removeChild(remNode);
    }
    
    const sites=this.getSites();
    var site,enabled,lev;
    for(var j=sites.length; j-->0;) {
      site=sites[j];
      enabled=ns.isJSEnabled(site);
      node=document.createElement("menuitem");
      node.setAttribute("label",this.getString((enabled?"forbidLocal":"allowLocal"),[site]));
      node.setAttribute("statustext",site);
      node.setAttribute("oncommand","noscriptOverlay.menuAllow("+(!enabled)+",this)");
      node.setAttribute("class","menuitem-iconic");
      node.setAttribute("tooltiptext",this.getString("allowed."+(enabled?"yes":"no")));
      node.setAttribute("image",this.getIcon(enabled?"no":"yes"));
      parent.insertBefore(node,sep);
    }
  }
,
  get srcWindow() {
    //var w=document.commandDispatcher.focusedWindow;
    return new XPCNativeWrapper(window._content, 'document','getSelection()');
  }
,
  get srcDocument() {
    return new XPCNativeWrapper(this.srcWindow.document, 'getElementsByTagName()','URL');
  }
,
  menuAllow: function(enabled,menuItem) {
    if(menuItem) { // local 
      const site=menuItem.getAttribute("statustext");
      if(site) {
       this.ns.setJSEnabled(site,enabled);
      }
    } else { // global
      if(enabled) {
        enabled=this.prompter.confirm(window,this.getString("global.warning.title"),
          this.getString("global.warning.text"));
      }
      this.ns.jsEnabled=enabled;
    }
    this.syncUI();
  }
,
  _iconURL: null,
  getIcon: function(lev) {
    if(!this._iconURL) this._iconURL=document.getElementById("noscript-status").src;
    return this._iconURL.replace(/\b(yes|no|glb)(\d+\.)/,lev+"$2")
  }
,
  syncUI: function(ev) {
    const ns=this.ns;
    
    if(ev.eventPhase==Event.AT_TARGET && ev.type=="focus") {
      if((!this.ns.uninstalling) && this.cleanup()) {
        window.setTimeout(function() { noscriptOverlay.uninstallAlert(); },10);
      }
    }
    
    if(this.ns.uninstalling) {
      const popup=document.getElementById("noscript-status-popup");
      if(popup) {
        popup.parentNode.setAttribute("onclick","noscriptOverlay.uninstallAlert()");
        popup.parentNode.removeChild(popup);
      }
    }
    
    const global=ns.jsEnabled;
    var lev;
    if(global) {
      lev="glb";
    } else {
      const sites=this.getSites();
      var scount=sites.length;
      while(scount-->0 && !ns.isJSEnabled(sites[scount]));
      lev=scount>-1?"yes":"no";
    }
    const widget=document.getElementById("noscript-status");
    widget.setAttribute("tooltiptext",this.getString("allowed."+lev));
    widget.setAttribute("src",this.getIcon(lev));
  }
,
  chromeBase: "chrome://noscript/content/",
  chromeName: "noscript"
,
  openOptionsDialog: function() {
    window.openDialog(this.chromeBase+this.chromeName+"Options.xul",this.chromeName+"Options",
      "chrome,dialog,centerscreen,alwaysRaised");
  }
,
  openAboutDialog: function() {
    window.openDialog(this.chromeBase+"about.xul",this.chromeName+"About",
      "chrome,dialog,centerscreen");
  }
,
  cleanup: function() {
    return this.ns.cleanupIfUninstalling();
  }
}

noscriptOverlay=new NoScriptOverlay();

_noScript_syncUI=function(ev) { 
  noscriptOverlay.syncUI(ev); 
};

window.addEventListener("load",_noScript_syncUI,false);
window.addEventListener("focus",_noScript_syncUI,false);
window.addEventListener("command",_noScript_syncUI,false);
window.addEventListener("click",_noScript_syncUI,false);
window.addEventListener("unload",function() { noscriptOverlay.cleanup(); },false);
