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
        const ns=this.ns;
        const lm=ns.lookupMethod;
        const getByTag=lm(doc,"getElementsByTagName");
        if(!tagName) {
          const docURI=lm(doc,"documentURI")();
          var url=ns.getSite(docURI);
          if(url) {
            if(sites) {
              sites.push(url);
            } else {
              sites = [url];
              sites.pluginsCache = ns.pluginsCache.get(getBrowser().selectedBrowser);
              sites.scriptCount = 0;
              sites.pluginCount = 0;
              sites.docURIs = {};
              sites.loading = this.isLoading();
            }
            sites.docURIs[docURI] = true;
            var cache = sites.pluginsCache.uris[docURI];
            if(cache) {
              for(url in cache) {
                sites[sites.length] = url;
              }
            }
          }
          var scripts=new XPCNativeWrapper(getByTag("script"),"item()","length");
          var scount=scripts.length;
          if(scount) {
            sites.scriptCount+=scount;
            var script, scriptSrc;
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
          var pp = ns.pluginPlaceholder;
          var replacePlugins = pp && 
                   !(sites.loading || lm(doc,"getElementById")("_noscript_styled")) ;
          
          const appletTags=["embed", "applet", "object"];
          var tcount=appletTags.length;
          var acount, applets, applet, div, innerDiv, appletParent;
          var extras, title;
          var style, cssLen, cssCount, cssProp, cssDef;
          var aWidth,aHeight;
          var createElem;
          while(tcount-->0) {
            var applets=new XPCNativeWrapper(getByTag(appletTags[tcount]),"item()","length");
            for(acount=applets.length; acount-- >0;) {
              applet = applets.item(acount);
              if( (!tcount) && 
                (lm(applet,"parentNode")() instanceof HTMLObjectElement)) {
                continue; // skip "embed" if nested into "object"
              }
              
              sites.pluginCount++;
              
              if(replacePlugins) {
                if(!createElem) {
                  createElem=lm(doc,"createElement");
                  var style=createElem("style");
                  style.setAttribute("id","_noscript_styled");
                  style.setAttribute("type","text/css");
                  style.appendChild(lm(doc,"createTextNode")(
                    ".-noscript-blocked { -moz-outline-color: red !important; -moz-outline-style: solid !important; -moz-outline-width: 1px !important; background: white url(\""
                    + pp + "\") no-repeat left top !important; opacity: 0.6 !important; cursor: pointer !important; margin-top: 0px !important; margin-bottom: 0px !important }"
                  ));
                  try {
                    lm(getByTag("head")[0],"appendChild")(style);
                  } catch(ex) {}
                }
                try {
                  if(extras = ns.getPluginExtras(applet)) {
                   
                    
                    div = createElem("div");
                    innerDiv = createElem("div");
                    title = (extras.mime ? extras.mime.replace("application/","")+"@":"@") + url;
                    extras.alt = lm(applet,"getAttribute")("alt");
                    
                    div.setAttribute("title", extras.alt ? title+" \"" + 
                      extras.alt + "\"" : title);
                    
                    div.style.display = "inline";
                    div.style.padding = div.style.margin = "0px";
                     
                    style=lm(lm(doc,"defaultView")(),"getComputedStyle")(applet,"");
                    cssDef="";
                    for(cssCount = 0, cssLen = style.length; cssCount < cssLen; cssCount++) {
                      cssProp=style.item(cssCount);
                      cssDef+=cssProp+": "+style.getPropertyValue(cssProp)+";";
                    }
                    innerDiv.setAttribute("style",cssDef);
                    innerDiv.setAttribute("class", "-noscript-blocked");
                    
                    innerDiv.style.display = "block";
                    
                    div._noScriptRemovedObject = lm(applet, "cloneNode")(true);
                    div._noScriptExtras = extras;
                    
                    while(lm(applet,"hasChildNodes")()) {
                      lm(applet,"removeChild")(lm(applet,"firstChild")());
                    }
                    
                    lm(lm(applet,"parentNode")(),"replaceChild")(div, applet);
                    div.appendChild(innerDiv);
                    div.addEventListener("click", _noScript_onPluginClick, false);
                  }
                } catch(appletEx) {
                  dump("NoScript: "+appletEx+" processing plugin "+acount+"@"+url);
                }
              }
            }
          }
          
          sites=this.getSites(doc, sites, 'frame');
          sites=this.getSites(doc, sites, 'iframe');
          if(!sites.loading) ns.pluginsCache.purge(sites.pluginsCache, sites.docURIs);
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
    const status=document.getElementById("noscript-statusIcon");
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
    miGlobal.setAttribute("tooltiptext",document.getElementById("noscript-statusIcon").getAttribute("tooltiptext"));
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
    var jsPSs=ns.jsPolicySites;
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
      matchingSite=jsPSs.matches(site);
      enabled=!!matchingSite;
      if(enabled) {
        if(domainDupChecker.check(matchingSite)) continue;
        menuSites=[matchingSite];
      } else {
        domain=site.match(/.*?:\/\/([^\?\/\\#]+)/); // double check - changed for Unicode compatibility
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
        return this.ns.lookupMethod(browser.contentWindow,'document')();
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
    if(!this._iconURL) this._iconURL=document.getElementById("noscript-statusIcon").src;
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
  _disablePopup: function(id) {
    const popup=document.getElementById(id);
    if(popup) {
      popup.parentNode.setAttribute("onclick","noscriptOverlay.uninstallAlert()");
      popup.parentNode.removeChild(popup);
    }
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
      this._disablePopup("noscript-status-popup");
      this._disablePopup("noscript-tbb-popup");
    }
    
    const global=ns.jsEnabled;
    const jsPSs=ns.jsPolicySites;
    var lev;
    const sites=this.getSites();
    var totalScripts=sites.scriptCount;
    var totalPlugins=sites.pluginCount;
    var totalAnnoyances=totalScripts+totalPlugins;
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
        site=jsPSs.matches(url);
        if(site) {
          if(ns.isPermanent(site)) {
            total--;
          } else {
            allowed++;
          }
        } 
      }
      lev=(allowed==total && sites.length>0)?"yes":allowed==0?"no":"prt";
      notificationNeeded=(lev!="yes" && totalAnnoyances>0); 
    }
    
    var message=this.getString("allowed."+lev)
      +" [<script>: "+totalScripts+"] [J+F+P: "+totalPlugins+"]";
    var icon=this.getIcon(lev,!totalAnnoyances);
    
   var widget=document.getElementById("noscript-tbb");
   if(widget) {
     widget.setAttribute("tooltiptext",message);
     widget.setAttribute("image", icon);  
   }
   
   widget=document.getElementById("noscript-statusIcon");
   widget.setAttribute("tooltiptext",message);
   widget.setAttribute("src", icon);

   
   
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
              var buttonLabel, buttonAccesskey;
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
            if(!mb._noScriptOneClickPatch) {
              mb._noScriptOneClickPatch = true;
              if(mb._buttonElement && mb._buttonElement.accessKey) { // Fx 1.5
                // mb.addEventListener("click",_noScript_onMessageClick,false);
              }
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
      message = "";
    }
    
    widget=document.getElementById("noscript-statusLabelValue");
    widget.setAttribute("value", message ? message.replace(/JavaScript/g,"JS") : "");
    widget.parentNode.style.display = message ? "block" : "none";
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
}

const _noscript_randomSignature=Math.floor(100000000*Math.random());
function _noscript_signatureGetter() { return _noscript_randomSignature; }

const noscriptOverlay=new NoScriptOverlay();

const noscriptOverlayPrefsObserver={
  ns: noscriptOverlay.ns,
  iids: [Components.interfaces.nsISupports, Components.interfaces.nsIObserver],
  QueryInterface: function(iid) {
    return this.ns.queryInterfaceSupport(iid, this.iids);
  }
,
  observe: function(subject, topic, data) {
    switch(data) {
      case "statusIcon": case "statusLabel":  
      window.setTimeout(function() {
          var widget=document.getElementById("noscript-"+data);
          if(widget) {
            widget.setAttribute("hidden", !noscriptOverlay.ns.getPref(data))
          }
        },0);
       break;
       case "notify":
       case "notify.bottom" : 
       var mb=noscriptOverlay.getMessageBox("top");
       if(mb) mb.hidden=true;
       if(mb=noscriptOverlay.getMessageBox("bottom")) mb.hidden=true;
       break;
    }
  },
  register: function() {
    this.ns.prefs.addObserver("",this,false);
    this.observe(null,null,"statusIcon");
    this.observe(null,null,"statusLabel");
  },
  remove: function() {
    this.ns.prefs.removeObserver("",this);
  }
};

function _noScript_onMessageClick(ev) {
  if(noscriptOverlay.isNsMB(ev.target)) {
    document.getElementById(ev.target.popup)
            .showPopup(ev.target, -1, -1, "popup");
  }
}

function _noScript_onPluginClick(ev) {
  const div = ev.currentTarget;
  const applet = div._noScriptRemovedObject;
  if(applet) {
    const ns = noscriptUtil.service;
    const extras = ns.getPluginExtras(div);
    const cache = ns.pluginsCache.get(ns.pluginsCache.findBrowserForNode(div));
    if(! (extras && extras.url && extras.mime && cache) ) return;
    
    var url = extras.url;
    var mime = extras.mime;
    var description = url + "\n(" + mime + ")\n";
    var alwaysAsk = { value: ns.getPref("confirmUnblock", true) };
    if((!alwaysAsk.value) || 
        ns.prompter.confirmCheck(window, "NoScript", 
       noscriptUtil.getString("allowTemp", [description]),
       noscriptUtil.getString("alwaysAsk"), alwaysAsk)
    ) {
      ns.setPref("confirmUnblock", alwaysAsk.value);
      div._noScriptRemovedObject = null;
      cache.forceAllow[url] = mime;
      window.setTimeout(function() {
        const lm = ns.lookupMethod;
        while(lm(div,"hasChildNodes")()) {
          lm(div,"removeChild")(lm(div,"firstChild")());
        }
        lm(lm(div,"parentNode")(),"replaceChild")(applet, div)
      },0);
    }
  }
}

function _noScript_syncUI(ev) { 
  noscriptOverlay.syncUI(ev); 
}
function _noScript_prepareCtxMenu(ev) {
    noscriptOverlay.prepareContextMenu(ev);
}

function _noScript_openOneBookmark(aURI, aTargetBrowser, aDS) {
  const ns = noscriptUtil.service;
  var snapshot = "";
  if(aTargetBrowser == "current" && !(ns.getPref("forbidBookmarklets", false)  || ns.jsEnabled)) {
    var ncNS = typeof(gNC_NS) == "undefined" ? ( typeof(NC_NS) == "undefined" ?
      "http://home.netscape.com/NC-rdf#" : NC_NS ) : gNC_NS;
    var url = BookmarksUtils.getProperty(aURI, ncNS+"URL", aDS);
    if(!url) return;
    var caughtEx = null;
    try {
      if(url.toLowerCase().indexOf("javascript:") == 0) {
        var browser = getBrowser().selectedBrowser;
        var site = ns.getSite(noscriptOverlay.srcDocument.documentURI);
        if(browser && !ns.isJSEnabled(site)) {
          snapshot = ns.jsPolicySites.sitesString;
          try {
            ns.setJSEnabled(site, true);
            browser.loadURI(url);
          } catch(ex) {
            caughtEx = ex;
          }
          ns.flushCAPS(snapshot);
          if(caughtEx) throw caughtEx;
          return;
        }
      }
    } catch(silentEx) {
      dump(silentEx);
    }
  }
  this._noScript_openOneBookmark_originalMethod(aURI, aTargetBrowser, aDS);
}


function _noScript_onloadInstall(ev) {
  document.getElementById("contentAreaContextMenu")
          .addEventListener("popupshowing",_noScript_prepareCtxMenu,false);
  BookmarksCommand._noScript_openOneBookmark_originalMethod = BookmarksCommand.openOneBookmark;
  BookmarksCommand.openOneBookmark = _noScript_openOneBookmark;
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
  noscriptOverlayPrefsObserver.remove();
  window.removeEventListener("load",_noScript_onloadInstall,false);
  document.getElementById("contentAreaContextMenu")
          .removeEventListener("popupshowing",_noScript_prepareCtxMenu,false);  
  
}

_noScript_install();

