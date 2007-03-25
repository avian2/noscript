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
  this.ns=noscriptUtil.service;
}

NoScriptOverlay.prototype={
  getString: function(key,parms) {
    return noscriptUtil.getString(key,parms);
  }
,
  isLoading : function() {   
    return getBrowser().selectedBrowser.webProgress.isLoadingDocument;
  }
,
  getSites: function(doc,sites,tagName) {
    try {
      if(doc || (doc=this.srcWindow.document)) {
        const lm=Components.lookupMethod;
        const getByTag=lm(doc,"getElementsByTagName");
        const ns=this.ns;
        if(!tagName) {
          const docURI=lm(doc,"documentURI")();
          var url=ns.getSite(docURI);
          if(url) {
            if(sites) {
              sites.push(url);
            } else {
              sites=[url];
              sites.scriptCount=0;
              sites.pluginCount=0;
            }
            var pluginSites=ns.getPluginSites(docURI);
            for(var pe in pluginSites) {
              sites.push(pe);
              sites.pluginCount+=pluginSites[pe].pluginCount;
            }
          }
          var scripts=new XPCNativeWrapper(getByTag("script"),"item()","length");
          var scount=scripts.length;
          if(scount) {
            sites.scriptCount+=scount;
            var script,scriptSrc;
            while(scount-->0) {
              script=scripts.item(scount);
              if(script instanceof XULElement) {
                scriptSrc=script.getAttribute("src");
                if(!/^[\w\-]+:\/\//.test(scriptSrc)) continue;
              } else {
                scriptSrc=lm(script,"src")();
              }
              scriptSrc=ns.getSite(scriptSrc);
              if(scriptSrc) {
                sites.push(scriptSrc);
              }
            }
          }
          var pp=ns.pluginPlaceholder;
          if(pp && ! (lm(doc,"getElementById")("_noscript_styled") || this.isLoading() ) ) {
            const createElem=lm(doc,"createElement");
            var style=createElem("style");
            style.setAttribute("id","_noscript_styled");
            style.setAttribute("type","text/css");
            style.appendChild(lm(doc,"createTextNode")(
              ".-noscript-blocked { border: 1px solid red !important; background: white url(\""
              + pp + "\") no-repeat left top !important; opacity: 0.6 !important; }"
            ));
            try {
              lm(getByTag("head")[0],"appendChild")(style);
            } catch(ex) {}
            const appletTags=["applet","object"];
            var tcount=appletTags.length;
            var applets,applet,clazz,div,innerDiv,style,cssCount,cssProp,cssDef;
            var aWidth,aHeight;
            while(tcount-->0) {
              var applets=new XPCNativeWrapper(getByTag(appletTags[tcount]),"item()","length");
              for(acount=applets.length; acount-- >0;) {
                applet=applets.item(acount);
                try {
                  clazz=lm(applet,"getAttribute")("class");
                  if(clazz && clazz.indexOf("-noscript-blocked")>-1) {
                    innerDiv=createElem("div");
                    div=createElem("div");
                    div.setAttribute("title",lm(applet,"getAttribute")("title"));
                    div.style.display="inline";
                    style=lm(lm(doc,"defaultView")(),"getComputedStyle")(applet,"");
                    cssDef="";
                    for(cssCount=style.length; cssCount-- >0;) {
                      cssProp=style.item(cssCount);
                      cssDef+=cssProp+": "+style.getPropertyValue(cssProp)+";";
                    }
                    innerDiv.setAttribute("style",cssDef);
                    innerDiv.style.display="block";
                    lm(applet,"setAttribute")("style","display: none !important");
                    lm(lm(applet,"parentNode")(),"insertBefore")(div,applet);
                    div.appendChild(innerDiv);
                    div.appendChild(applet);
                  }
                } catch(appletEx) {}
              }
            }
          }
          sites=this.getSites(doc, sites, 'frame');
          sites=this.getSites(doc, sites, 'iframe');
          return ns.sortedSiteSet(sites);
        } else {
          var frames=new XPCNativeWrapper(getByTag(tagName),"item()","length");
          var contentDocument;
          for(var j=frames.length; j-->0;) {
            try {
              contentDocument=lm(frames.item(j),"contentDocument")();
              if(contentDocument) this.getSites(contentDocument,sites);
            } catch(ex2) {
            }
          }
        }
      }
    } catch(ex) {
      // dump(ex);
    }
    if(!sites) {
      sites=[];
      sites.scriptCount=0;
      sites.pluginCount=0;
    }
    return sites;
  }
,
  get prompter() {
    return this.ns.prompter;
  }
,
  uninstallAlert: function() {
    this.prompter.alert(window,this.getString("uninstall.alert.title"),
          this.getString("uninstall.alert.text",
            [this.getString("allowed."+(this.ns.jsEnabled?"glb":"no") ) ]
            ));
  }
,
  prepareContextMenu: function(ev) {
    menu=document.getElementById("noscript-context-menu");
    if(this.ns.uninstalling || !this.ns.getPref("ctxMenu",true)) {
      menu.setAttribute("hidden",true);
      return;
    }
    menu.removeAttribute("hidden");
    const status=document.getElementById("noscript-status");
    menu.setAttribute("image",status.getAttribute("src"));
    menu.setAttribute("tooltiptext",status.getAttribute("tooltiptext"));
  }
,
  toggleMenuOpt: function(node) {
    var val=node.getAttribute("checked")=="true";
    var k=node.id.lastIndexOf("-opt-");
    if(k>-1) {
      this.ns.setPref(node.id.substring(5+k),val);
    }
    return val;
  }
,
  prepareMenu: function(popup) {
    const ns=this.ns;
    var j,k,node;
    
    var opts=popup.getElementsByAttribute("type","checkbox");
    for(j=opts.length; j-->0;) {
      node=opts[j];
      if((k=node.id.lastIndexOf("-opt-"))>-1) {
        node.setAttribute("checked",ns.getPref(node.id.substring(5+k)));
      }
    }
    
    var miNotify=document.getElementById('noscript-mi-notify');
    if(miNotify) miNotify.setAttribute("checked",ns.getPref("notify")); 
    
    const global=ns.jsEnabled;
    
    var separators=popup.getElementsByTagName("menuseparator");
    var insertSep,stopSep,globalSep;
    const sepNames=['insert','stop','global'];
    var sepName;
    for(j=separators.length; j-- >0;) {
      sepName=(node=separators[j]).className;
      for(k in sepNames) {
        if(sepName.indexOf("-"+sepNames[k])>-1) {
          eval(sepNames[k]+"Sep=node");
        }
      }
    }
    
    delete separators;
    const miGlobal=globalSep.nextSibling;
    miGlobal.setAttribute("label",this.getString((global?"forbid":"allow")+"Global"));
    miGlobal.setAttribute("oncommand","noscriptOverlay.menuAllow("+(!global)+")");
    miGlobal.setAttribute("tooltiptext",document.getElementById("noscript-status").getAttribute("tooltiptext"));
    miGlobal.setAttribute("image",this.getIcon(global?"no":"glb"));

    
    node=insertSep.nextSibling;
    const parent=node.parentNode;
    var remNode;
    while(node && (node!=stopSep)) {
       remNode=node;
       node=node.nextSibling;
       parent.removeChild(remNode);
    }
    
    const sites=this.getSites();
    var site,enabled,lev;
    const allowedSites=ns.sites;
    var matchingSite;
    var menuSites,menuSite,scount;
    var domain,isIP,pos,lastPos,domParts,dpLen,dp,tlds;
    const STLDS=ns.SPECIAL_TLDS;
    var domainDupChecker={
      prev: "",
      check: function(d) {
         d=" "+d+" ";
         if(this.prev.indexOf(d)>-1) return true;
         this.prev+=d;
         return false;
      }
    };
    
    const showAddress=ns.getPref("showAddress",false);
    const showDomain=ns.getPref("showDomain",false);
    const showBase=ns.getPref("showBaseDomain",true);
    const showNothing=!(showAddress||showDomain||showBase);
    
    const showTemp=ns.getPref("showTemp");
   
    for(j=sites.length; j-->0;) {
      site=sites[j];
      matchingSite=ns.findShortestMatchingSite(site,allowedSites);
      enabled=matchingSite!=null;
      if(enabled) {
        if(domainDupChecker.check(matchingSite)) continue;
        menuSites=[matchingSite];
      } else {
        domain=site.match(/.*?:\/\/([\w\-\.:]+)/);
        if(domain) {
          domain=domain[1];
          if(domain.indexOf(":")>-1) {
            domain=null; // addresses with a specific port can't be enabled by domain
          }
        }
        menuSites=(showAddress || showNothing || !domain)?[site]:[];
        if(domain && (showDomain || showBase)) {
          isIP=/^[\d\.]+$/.test(domain);
          if(isIP || (lastPos=domain.lastIndexOf('.'))<0
            || (dpLen=(domParts=domain.split('.')).length)<3) {
            // IP or TLD or 2nd level domain
            if(!domainDupChecker.check(domain)) {
              menuSites[menuSites.length]=domain;
            }
          } else {
            // Special TLD (co.uk, co.nz...) or normal domain
            dp=domParts[dpLen-2];
            if(tlds=STLDS[dp]) {
              if(tlds.indexOf(" "+domParts[dpLen-1]+" ")>-1) {
                lastPos=domain.lastIndexOf('.',lastPos-1);
              }
            }
            dp=domain;
            for(pos=0; (pos=domain.indexOf('.',pos))>0; dp=domain.substring(++pos)) {
              if(pos==lastPos) {
                if(menuSites.length>0 && !showBase) continue;
              } else {
                if(!showDomain) continue;
              }
              if(!domainDupChecker.check(dp)) {
                menuSites[menuSites.length]=dp;
                if(pos==lastPos) break;
              }
            }
          }
        }
      }
      if(stopSep.previousSibling.tagName!="menuseparator") {
        node=document.createElement("menuseparator");
        parent.insertBefore(node,stopSep);
      }
      
      for(scount=menuSites.length; scount-->0;) {
        menuSite=menuSites[scount];
        node=document.createElement("menuitem");
        node.setAttribute("label",this.getString((enabled?"forbidLocal":"allowLocal"),[menuSite]));
        node.setAttribute("statustext",menuSite);
        node.setAttribute("oncommand","noscriptOverlay.menuAllow("+(!enabled)+",this)");
        node.setAttribute("tooltiptext",
          this.getString("allowed."+(enabled?"yes":"no")));
        if(enabled && ns.isPermanent(menuSite)) {
          node.setAttribute("class","");
          node.setAttribute("disabled","true");
          node.style.fontStyle="normal";
        } else {
          node.setAttribute("class","menuitem-iconic");
          node.setAttribute("image",this.getIcon(enabled?"no":"yes"));
          node.style.fontStyle=(enabled && ns.isTemp(menuSite))?"italic":"normal";
        }
        parent.insertBefore(node,stopSep);
        if(showTemp && !enabled) {
          node=node.cloneNode(true);
          node.setAttribute("label",this.getString("allowTemp",[menuSite]));
          node.setAttribute("oncommand","noscriptOverlay.menuAllow(true,this,true)");
          node.style.fontStyle="italic";
          parent.insertBefore(node,stopSep);
        }
      }
    }
    
    
    if(globalSep!=stopSep) { // status bar
      insertSep.setAttribute("hidden", insertSep.nextSibling.getAttribute("hidden")?"true":"false");
    } else { // context menu
      stopSep.setAttribute("hidden",
        //stopSep==parent.firstChild.nextSibling ||
        stopSep.previousSibling.nodeName=="menuseparator"
        ); 
    }
  }
,
  get srcWindow() {
    //var w=document.commandDispatcher.focusedWindow;
    return new XPCNativeWrapper(window._content, 'document','getSelection()');
  }
,
  get srcDocument() {
    return new XPCNativeWrapper(this.srcWindow.document, 'getElementsByTagName()','documentURI');
  }
,
  getBrowserDoc: function(browser) {
    if(browser && browser.contentWindow) {
      try {
        return Components.lookupMethod(browser.contentWindow,'document')();
      } catch(ex) {
      }
    } 
    return null;
  }
,
  menuAllow: function(enabled,menuItem,temp) {
    if(menuItem) { // local 
      const site=menuItem.getAttribute("statustext");
      if(!site) return;
    } else { // global
      if(enabled) {
        enabled=this.prompter.confirm(window,this.getString("global.warning.title"),
          this.getString("global.warning.text"));
      }
    }
    this.safeAllow(site,enabled,temp);
  }
,
  safeAllow: function(site,enabled,temp) {
    const overlay=this;
    const ns=this.ns;
    ns.safeCapsOp(function() {
      if(site) {
        ns.setJSEnabled(site,enabled);
        ns.setTemp(site, enabled && temp);
      } else {
        ns.jsEnabled=enabled;
      }
      overlay.syncUI();
    });
  }
,
  _iconURL: null,
  getIcon: function(lev,inactive) {
    if(!this._iconURL) this._iconURL=document.getElementById("noscript-status").src;
    return this._iconURL.replace(/[^\/]*(yes|no|glb|prt)(\d+\.)/,(inactive?"inactive-":"")+lev+"$2");
  }
,
  _syncInfo: { enqueued: false, uninstallCheck: false }
,
  syncUI: function(ev) {
    if(ev && ev.eventPhase==ev.AT_TARGET 
        && ev.target==document && ev.type=="focus") {
      this._syncInfo.uninstallCheck=true;
    }
     
    if(!this._syncInfo.enqueued) {
      this._syncInfo.enqueued=true;
      window.setTimeout(function(nso) { 
        try {
          nso._syncUINow();
        } catch(ex) {
          // dump(ex);
        }
        nso._syncInfo.enqueued=false; 
       }, 400, this);
    }
  }
,
  get messageBoxPos() {
    return this.ns.getPref("notify.bottom",false)?"bottom":"top";
  }
,
  getMessageBox: function(pos) {
    var b=getBrowser();
    return b.getMessageForBrowser?
        b.getMessageForBrowser(b.selectedBrowser,pos?pos:this.messageBoxPos)
        :null;
  }
,
  _syncUINow: function() {
   
    const ns=this.ns;
    if(ns.uninstalling) {
      if(this._syncInfo.uninstallCheck && !ns.uninstallAlerted) {
        window.setTimeout(function() { noscriptOverlay.uninstallAlert(); }, 10);
        ns.uninstallAlerted=true;
      }
      this._syncInfo.uninstallCheck=false;

      const popup=document.getElementById("noscript-status-popup");
      if(popup) {
        popup.parentNode.setAttribute("onclick","noscriptOverlay.uninstallAlert()");
        popup.parentNode.removeChild(popup);
      }
    }
    
    const global=ns.jsEnabled;
    var lev;
    const sites=this.getSites();
    var totalScripts=sites.scriptCount;
    var notificationNeeded;
    if(global) {
      lev="glb";
      notificationNeeded=false;
    } else {
      var allowed=0;
      var s=sites.length;
      var total=s;
      var url,site;
      while(s-->0) {
        url=sites[s];
        site=ns.findShortestMatchingSite(url);
        if(site) {
          if(ns.isPermanent(site)) {
            total--;
          } else {
            allowed++;
          }
        } 
      }
      lev=(allowed==total && sites.length>0)?"yes":allowed==0?"no":"prt";
      notificationNeeded=(lev!="yes" && totalScripts>0); 
    }
    const widget=document.getElementById("noscript-status");
    var message=this.getString("allowed."+lev)
      +" [<script>: "+totalScripts+"] [J+F+P: "+sites.pluginCount+"]";
   
    var icon=this.getIcon(lev,!totalScripts);
    widget.setAttribute("tooltiptext",message);
    widget.setAttribute("src",icon);
    
    const mb=this.getMessageBox();
    const mbMine=this.isNsMB(mb);
    if(notificationNeeded) { // notifications
      const doc=this.srcWindow.document;
      if(mb) {
        var hidden=mb.hidden;
        if(ns.getPref("notify",false)) { 
          if(mbMine || hidden) {
            if(this.checkDocFlag(doc,"_noscript_message_shown")) {
              const browser=getBrowser();
              var buttonLabel, buttonAccessKey;
              if(/\baButtonAccesskey\b/i.test(browser.showMessage.toSource())) {
                const refWidget=document.getElementById("noscript-options-ctx-menuitem");
                buttonLabel=refWidget.getAttribute("label");
                buttonAccesskey=refWidget.getAttribute("accesskey");
              } else {
                buttonLabel="";
                buttonAccesskey="";
              }
              browser.showMessage(browser.selectedBrowser, icon, message, 
                buttonLabel, null,
                null, "noscript-notify-popup",this.messageBoxPos,true,
                buttonAccesskey);
            } else if(mbMine && !hidden) {
              mb.text=message;
              mb.image=icon;
            }
          }
        } else if(mbMine && !hidden) {
          mb.hidden=true; 
        }
      }
      if(this.checkDocFlag(doc,"_noscript_sound_played")) {
        ns.playSound(ns.getPref("sound.block"));
      }
    } else {
      if(mbMine && !mb.hidden) {
        mb.hidden=true;
      }
    }
  }
,
  checkDocFlag: function(doc,flag) {
    if(flag in doc && doc[flag]==_noscript_randomSignature) return false;
    doc.__defineGetter__(flag,_noscript_signatureGetter);
    return true;
  }
,
  isNsMB: function(mb) {
    return mb && mb.popup=="noscript-notify-popup";
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
}

const _noscript_randomSignature=Math.floor(100000000*Math.random());
function _noscript_signatureGetter() { return _noscript_randomSignature; }

const noscriptOverlay=new NoScriptOverlay();

const noscriptOverlayPrefsObserver={
  ns: noscriptOverlay.ns
,
  QueryInterface: function(iid) {
    return this.ns.queryInterfaceSupport(iid, [Components.interfaces.nsIObserver]);
  }
,
  observe: function(subject, topic, data) {
    switch(data) {
      case "statusIcon":
        window.setTimeout(function() {
          var widget=document.getElementById("noscript-status");
          if(widget) {
            widget.setAttribute("hidden",
            !noscriptOverlay.ns.getPref("statusIcon"))
          }
        },0);
       break;
       case "notify":
       case "notify.bottom" : 
       var mb=noscriptOverlay.getMessageBox("top");
       if(mb) mb.hidden=true;
       var mb=noscriptOverlay.getMessageBox("bottom");
       if(mb) mb.hidden=true;
       break;
    }
  },
  register: function() {
    this.ns.prefs.addObserver("",this,false);
    this.observe(null,null,"statusIcon");
  },
  remove: function() {
    this.ns.prefs.removeObserver("",this);
  }
};



function _noScript_syncUI(ev) { 
  noscriptOverlay.syncUI(ev); 
}
function _noScript_prepareCtxMenu(ev) {
    noscriptOverlay.prepareContextMenu(ev);
}
function _noScript_onloadInstall(ev) {
  document.getElementById("contentAreaContextMenu").addEventListener(
    "popupshowing",_noScript_prepareCtxMenu,false);
}

const _noScript_syncEvents=["load","focus"];
_noScript_syncEvents.visit=function(callback) {
  for(var e=0,len=this.length; e<len; e++) {
    callback.call(window,this[e],_noScript_syncUI,true);
  }
}
function _noScript_install() {
  _noScript_syncEvents.visit(window.addEventListener);
  window.addEventListener("load",_noScript_onloadInstall,false);
  window.addEventListener("unload",_noScript_dispose,false);
  noscriptOverlayPrefsObserver.register();
}

function _noScript_dispose(ev) {
  _noScript_syncEvents.visit(window.removeEventListener);
  window.removeEventListener("load",_noScript_onloadInstall,false);
  document.removeEventListener("popupshowing",_noScript_prepareCtxMenu,false);
  noscriptOverlayPrefsObserver.remove();
}

_noScript_install();

