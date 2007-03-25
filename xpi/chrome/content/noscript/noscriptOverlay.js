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
  this.ns = noscriptUtil.service;
}

NoScriptOverlay.prototype = {
  
  getString: function(key,parms) {
    return noscriptUtil.getString(key, parms);
  }
,
  toggleCurrentPage: function() {
    const ns = this.ns;
    const url = ns.getSite(ns.lookupMethod(this.srcWindow.document, "documentURI")());
    this.safeAllow(url, !ns.isJSEnabled(url));
  },
  
  isLoading : function() {   
    return getBrowser().selectedBrowser.webProgress.isLoadingDocument;
  },
  
  get currentPluginsCache() {
    return this.ns.pluginsCache.get(getBrowser().selectedBrowser);
  },

 
  getSites: function(doc,sites,tagName) {
    try {
      if(doc || (doc = this.srcWindow.document)) {
        const ns = this.ns;
        const lm = ns.lookupMethod;
        
        if(ns.truncateTitle) {
          try {
            const titleAccessor = lm(doc, "title");
            if(titleAccessor().length > ns.truncateTitleLen) {
              titleAccessor(titleAccessor().substring(0, ns.truncateTitleLen));
            }
          } catch(ex) {}
        }
        const htmlNS = "http://www.w3.org/1999/xhtml";
        const getByTag = lm(doc,"getElementsByTagName");
        if(!tagName) {
          const docURI = lm(doc,"documentURI")();
          var url = ns.getSite(docURI);
          if(url) {
            if(sites) {
              sites.push(url);
            } else {
              sites = [url];
              sites.pluginsCache = this.currentPluginsCache;
              sites.scriptCount = 0;
              sites.pluginCount = 0;
              sites.docURIs = {};
              sites.loading = this.isLoading();
            }
            sites.docURIs[docURI] = true;
            var cache = sites.pluginsCache.uris[docURI];
            if(cache) {
              for(var pluginURI in cache) {
                sites[sites.length] = pluginURI;
              }
            }
          }
          var scripts = new XPCNativeWrapper(getByTag("script"), "item()" , "length");
          var scount = scripts.length;
          if(scount) {
            sites.scriptCount += scount;
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
          var pp = ns.showPlaceholder && ns.pluginPlaceholder;
          
          var replacePlugins = pp && ns.forbidSomePlugins && !sites.loading;
          
          const appletTypes = {
              "embed": HTMLEmbedElement, 
              "applet": HTMLAppletElement, 
              "object": HTMLObjectElement
          };
          var appletType;
          var acount, applets, applet, div, innerDiv, appletParent;
          var extras, title;
          var style, cssLen, cssCount, cssProp, cssDef;
          var aWidth,aHeight;
          var createElem;
          var forcedCSS, style;
          
          for(appletTag in appletTypes) {
            
            applets = new XPCNativeWrapper(getByTag(appletTag), "item()", "length");
            appletType = appletTypes[appletTag];
            
            for(acount = applets.length; acount-- > 0;) {
              applet = applets.item(acount);
              if(!(applet instanceof appletType)) continue;
              
              if(appletType == HTMLEmbedElement && 
                (lm(applet,"parentNode")() instanceof HTMLObjectElement)) {
                continue; // skip "embed" if nested into "object"
              }
              
              sites.pluginCount++;
              
              if(replacePlugins) {
                if(!createElem) {
                  createElem = lm(doc, "createElementNS");
                  forcedCSS = "; -moz-outline-color: red !important; -moz-outline-style: solid !important; -moz-outline-width: 1px !important; background: white url(\"" + pp +
                           "\") no-repeat left top !important; opacity: 0.6 !important; cursor: pointer !important; margin-top: 0px !important; margin-bottom: 0px !important }";
                  try {
                    if(lm(lm(lm(doc, "documentElement")(), "firstChild")(), "firstChild")() == applet &&
                       lm(applet, "nextSibling")() == null) { // raw plugin content ?
                      var contentType = lm(doc, "contentType")();
                      if(contentType.substring(0, 5) != "text/" && !/\bxml\b/.test(contentType)) { // force "extras" creation
                        ns.shouldLoad(5, { spec: docURI }, { spec: docURI }, applet, contentType, true);
                      }
                    }
                  } catch(e) {}
                }
                try {
                  extras = ns.getPluginExtras(applet);
                  if(extras) {
                    div = createElem(htmlNS, "div");
                    innerDiv = createElem(htmlNS, "div");
                    title = (extras.mime ? extras.mime.replace("application/","")+"@":"@") + url;
                    extras.alt = lm(applet,"getAttribute")("alt");
                    
                    div.setAttribute("title", extras.alt ? title+" \"" + 
                      extras.alt + "\"" : title);
                    
                    div.style.display = "inline";
                    div.style.padding = div.style.margin = "0px";
                     
                    style = lm(lm(doc,"defaultView")(),"getComputedStyle")(applet,"");
                    cssDef = "";
                    for(cssCount = 0, cssLen = style.length; cssCount < cssLen; cssCount++) {
                      cssProp=style.item(cssCount);
                      cssDef += cssProp + ": " + style.getPropertyValue(cssProp) + ";";
                    }
                    innerDiv.setAttribute("style", cssDef + forcedCSS);
                    
                    innerDiv.style.display = "block";
                    
                    div._noScriptRemovedObject = lm(applet, "cloneNode")(true);
                    ns.setPluginExtras(div, extras);
                    
                    while(lm(applet,"hasChildNodes")()) {
                      lm(applet,"removeChild")(lm(applet,"firstChild")());
                    }
                    
                    lm(lm(applet,"parentNode")(),"replaceChild")(div, applet);
                    div.appendChild(innerDiv);
                    div.onclick = _noScript_onPluginClick;
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
  },
  
  fixLink: function(ev) {
    const ns = noscriptOverlay.ns;
   
    if(ns.jsEnabled) return;
    
    var fixLinks  = ns.getPref("fixLinks", true);
    if(!fixLinks) return;
    
    var noping = ns.getPref("noping", true);
    if(!noping)  return;
    
    const lm = ns.lookupMethod;
    var a = ev.originalTarget;
    
    var doc = lm(a, "ownerDocument")();
    if(!doc) return;
    
    var url = lm(doc, "documentURI")();
    if((!url) || ns.isJSEnabled(ns.getSite(url))) return;
    
    
    while(!(a instanceof HTMLAnchorElement || a instanceof HTMLMapElement)) {
      if(!(a = lm(a, "parentNode")())) return;
    }
    
    const getAttr = lm(a, "getAttribute");
    const setAttr = lm(a, "setAttribute");
    
    const href = getAttr("href");
    
    if(noping) {
      var ping = getAttr("ping");
      if(ping) {
        lm(a, "removeAttribute")("ping");
        setAttr("noping", ping);
      }
    }
    
    if(fixLinks) {
      var jsURL;
      if(href) {
        jsURL = href.toLowerCase().indexOf("javascript:") == 0;
        if(!(jsURL || href == "#")) return;
      } else {
        jsURL = false;
      }
      
      var onclick = getAttr("onclick");
      var fixedHref = fixedHref = (onclick && noscriptOverlay.extractLink(onclick)) || 
                       (jsURL && noscriptOverlay.extractLink(href)) || "";
      
      if(fixedHref) {
        setAttr("href", fixedHref);
        var title = getAttr("title");
        setAttr("title", title ? "[js] " + title : 
          (onclick || "") + " " + href
          );
      }
    }
  },
  extractLink: function(js) {
    var match = js.match(/['"]([\/\w-\?\.#%=&:@]+)/);
    return match && match[1];
  },
  
  get prompter() {
    return noscriptUtil.prompter;
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
    var menu = document.getElementById("noscript-context-menu");
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
      if((k = node.id.lastIndexOf("-opt-"))>-1) {
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
    const miGlobal = globalSep.nextSibling;
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
    var domain, isIP, pos, lastPos, domParts, dpLen, dp, tlds;
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
          if(isIP || (lastPos = domain.lastIndexOf('.')) < 0
            || (dpLen = (domParts = domain.split('.')).length) < 3) {
            // IP or TLD or 2nd level domain
            if(!domainDupChecker.check(domain)) {
              menuSites[menuSites.length] = domain;
            }
          } else {
            // Special TLD (co.uk, co.nz...) or normal domain
            dp = domParts[dpLen-2];
            tlds = STLDS[dp];
            if(tlds) {
              if(dp == "com" || (tlds.indexOf(" " + (dp = domParts[dpLen - 1]) + " ")) > -1) {
                if(dp == "uk" && (pos = domain.lastIndexOf(".here.co.")) == domain.length - 11) {
                  lastPos = pos;
                } else {
                  lastPos = domain.lastIndexOf('.', lastPos - 1);
                }
              }
            }
            dp = domain;
            for(pos=0; (pos = domain.indexOf('.', pos))>0; dp = domain.substring(++pos)) {
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
      if(stopSep.previousSibling.nodeName!="menuseparator") {
        node=document.createElement("menuseparator");
        parent.insertBefore(node,stopSep);
      }
      
      for(scount = menuSites.length; scount-- > 0;) {
        menuSite=menuSites[scount];
        node=document.createElement("menuitem");
        node.setAttribute("label",this.getString((enabled?"forbidLocal":"allowLocal"),[menuSite]));
        node.setAttribute("statustext",menuSite);
        node.setAttribute("oncommand","noscriptOverlay.menuAllow(" + (!enabled) + ",this)");
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
    
    const doubleSep = stopSep.previousSibling.nodeName == "menuseparator";
    if(globalSep!=stopSep) { // status bar
      insertSep.setAttribute("hidden", insertSep.nextSibling.getAttribute("hidden")?"true":"false");
      if(doubleSep) stopSep.previousSibling.setAttribute("hidden", "true");
    } else { // context menu
      stopSep.setAttribute("hidden",
        //stopSep==parent.firstChild.nextSibling ||
        doubleSep
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
  menuAllow: function(enabled, menuItem, temp) {
    if(menuItem) { // local 
      const site=menuItem.getAttribute("statustext");
      if(!site) return;
    } else { // global
      if(enabled) {
        enabled=this.prompter.confirm(window,this.getString("global.warning.title"),
          this.getString("global.warning.text"));
      }
    }
    this.safeAllow(site, enabled, temp);
  }
,
  safeAllow: function(site,enabled,temp) {
    const overlay = this;
    const ns = this.ns;
    ns.safeCapsOp(function() {
      if(site) {
        ns.setJSEnabled(site, enabled);
        ns.setTemp(site, enabled && temp);
      } else {
        ns.jsEnabled = enabled;
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
    if(ev && ev.eventPhase == ev.AT_TARGET 
        && ev.target == document && ev.type== "focus") {
      this._syncInfo.uninstallCheck = true;
    }
     
    if(!this._syncInfo.enqueued) {
      this._syncInfo.enqueued = true;
      window.setTimeout(function(nso) { 
        try {
          nso._syncUINow();
        } catch(ex) {
          // dump(ex);
        }
        nso._syncInfo.enqueued = false; 
       }, 400, this);
    }
  }
,
  get notificationPos() {
    return this.ns.getPref("notify.bottom", false) ? "bottom" : "top";
  }
, 
  getNotificationBox: function(pos) {
    var b = getBrowser();
    if(!pos) pos = this.notificationPos;
    if(b.getMessageForBrowser) return b.getMessageForBrowser(b.selectedBrowser, pos); // Fx <= 1.5 
    if(!b.getNotificationBox) return null; // SeaMonkey

    var nb = b.getNotificationBox(null);
    b = null;
    
    if(pos == "bottom") {
      if(!nb._bottomStack) {
        var stacks =  nb.getElementsByTagName("stack");
        var stack = null;
        for(var j = stacks.length; j-- > 0;) {
          if(stacks[j].getAttribute("class") ==  "noscript-bottom-notify") {
            stack = stacks[j];
            break;
          }
        }
        if(!stack) {
         stack = nb.ownerDocument.createElement("stack");
         stack.setAttribute("class", "noscript-bottom-notify");
         nb.appendChild(stack);
        }
        nb._bottomStack = stack;
        nb._dom_removeChild = nb.removeChild;
        nb.removeChild = function(n) {
          return (n.parentNode == this) ? this._dom_removeChild(n) : n.parentNode.removeChild(n); 
        }
        nb._dom_insertBefore = nb.insertBefore;
        nb.insertBefore = function(n, ref) {
          if(n.localName == "notification" && n.getAttribute("value") == "noscript"
            && noscriptOverlay.notificationPos == "bottom") {
            while(this._bottomStack.firstChild) this._bottomStack.removeChild(this._bottomStack.firstChild);
            this._bottomStack.appendChild(n);
            var hbox = n.ownerDocument.getAnonymousElementByAttribute(n, "class", "notification-inner outset");
            if(hbox) {
              var style = hbox.ownerDocument.defaultView.getComputedStyle(hbox, null);
              var borderProps = ['color', 'style', 'width'];
              var cssProp, jsProp, tmpVal;
              for(var p = borderProps.length; p-- > 0;) {
                cssProp = borderProps[p];
                jsProp = cssProp[0].toUpperCase() + cssProp.substring(1);
                tmpVal = style.getPropertyValue("border-bottom-" + cssProp);
                hbox.style["borderBottom" + jsProp] = style.getPropertyValue("border-top-" + cssProp);
                hbox.style["borderTop" + jsProp] = tmpVal;
              }
            }
            return n;
          }
          return this._dom_insertBefore(n, ref);
        }
      }
    }
   
    return nb;
  },
  getNsNotification: function(widget) {
    if(widget == null) return null;
    if(widget.localName == "notificationbox") return widget.getNotificationWithValue("noscript");
    return this.isNsNotification(widget) && widget || null;
  },
  isNsNotification: function(widget) {
    return widget && widget.getAttribute("value") == "noscript" || widget.popup == "noscript-notify-popup";
  },
  
  notificationShow: function(label, icon, canAppend) {
    var box = this.getNotificationBox();
    if(box == null) return false;
    var pos = this.notificationPos;
    var widget = this.getNsNotification(box);
    if(widget) {
     if(widget.localName == "notification") {
       widget.label = label;
       widget.icon = icon;
     } else {
       widget.text = label;
       widget.image = icon;
       widget.removeAttribute("hidden");
     }
    
    } else {
     
      if(!canAppend) return false;
       
      const browser = getBrowser();
     
      var buttonLabel, buttonAccesskey;
      if(browser.getNotificationBox || /\baButtonAccesskey\b/i.test(browser.showMessage.toSource())) {
        const refWidget = document.getElementById("noscript-options-ctx-menuitem");
        buttonLabel = refWidget.getAttribute("label");
        buttonAccesskey = refWidget.getAttribute("accesskey");
      } else { // Fx < 1.5
        buttonLabel = "";
        buttonAccesskey = "";
      }
      const popup = "noscript-notify-popup";
      if(box.appendNotification) { // >= Fx 2.0
       box.appendNotification(label, "noscript", icon, box.PRIORITY_WARNING_HIGH,
        [ {label: buttonLabel, accessKey: buttonAccesskey,  popup: popup } ]); 
      } else if(browser.showMessage) { // Fx <= 1.5.x
        browser.showMessage(browser.selectedBrowser, icon, label, 
              buttonLabel, null,
              null, popup, pos, true,
              buttonAccesskey);
      }
    }
    const delay = (this.ns.getPref("notify.hide") && this.ns.getPref("notify.hideDelay", 3)) || 0;
    if(delay) {
     window.clearTimeout(this.notifyHideTimeout);
     this.notifyHideTimeout = window.setTimeout(
       function() { noscriptOverlay.notificationHide(); },
       1000 * delay);
    }
    return true;
  },
  
  notificationHide: function() {
    var widget = this.getNsNotification(this.getNotificationBox());
     if(widget) {
       if(widget.close) widget.close();
       else widget.setAttribute("hidden", "true");
     }
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
  uninstallCheck: function() {
    const ns = this.ns;
    if(ns.uninstalling) {
      if(!ns.uninstallAlerted) {
        window.setTimeout(function() { noscriptOverlay.uninstallAlert(); }, 10);
        ns.uninstallAlerted = true;
      }
      this._syncInfo.uninstallCheck = false;
      this._disablePopup("noscript-status-popup");
      this._disablePopup("noscript-tbb-popup");
    }
  },
  
  _syncUINow: function() {
   
    const ns = this.ns;
    
    const global=ns.jsEnabled;
    const jsPSs=ns.jsPolicySites;
    var lev;
    const sites = this.getSites();
    var totalScripts = sites.scriptCount;
    var totalPlugins = sites.pluginCount;
    var totalAnnoyances = totalScripts + totalPlugins;
    var notificationNeeded;
    if(global) {
      lev = "glb";
      notificationNeeded = false;
    } else {
      var allowed=0;
      var s=sites.length;
      var total=s;
      var url, site;
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
    var icon = this.getIcon(lev, !totalAnnoyances);
    
   var widget=document.getElementById("noscript-tbb");
   if(widget) {
     widget.setAttribute("tooltiptext",message);
     widget.setAttribute("image", icon);  
   }
   
   widget=document.getElementById("noscript-statusIcon");
   widget.setAttribute("tooltiptext",message);
   widget.setAttribute("src", icon);

   
   
   if(notificationNeeded) { // notifications
      const doc = this.srcWindow.document;
      if(ns.getPref("notify", false)) { 
        this.notificationShow(message, icon, this.checkDocFlag(doc, "_noscript_message_shown"));
      } else {
        this.notificationHide(); 
      }
      if(this.checkDocFlag(doc, "_noscript_sound_played")) {
        ns.playSound(ns.getPref("sound.block"));
      }
    } else {
      this.notificationHide();
      message = "";
    }
    
    widget=document.getElementById("noscript-statusLabelValue");
    widget.setAttribute("value", message ? message.replace(/JavaScript/g,"JS") : "");
    widget.parentNode.style.display = message ? "block" : "none";
  }
,
  notifyHideTimeout: 0
,
  checkDocFlag: function(doc, flag) {
    if(flag in doc && doc[flag] == _noScript_flag) return false;
    doc[flag] = _noScript_flag;
    return true;
  }
}

const _noScript_flag = {};

const noscriptOverlay=new NoScriptOverlay();

const noscriptOverlayPrefsObserver = {
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
         noscriptOverlay.notificationHide();
       break;
      
    }
  },
  register: function() {
    this.ns.prefs.addObserver("",this,false);
    const initPrefs = ["statusIcon", "statusLabel"];
    for(var j = 0; j < initPrefs.length; j++) {
      this.observe(null, null, initPrefs[j]);
    }
  },
  remove: function() {
    this.ns.prefs.removeObserver("",this);
  }
};


function _noScript_onPluginClick(ev) {
  const div = ev.currentTarget;
  const applet = div._noScriptRemovedObject;
  if(applet) {
    if(ev.shiftKey) {
      div.style.display = "none";
      return;
    }
    const ns = noscriptUtil.service;
    const extras = ns.getPluginExtras(div);
    const cache = ns.pluginsCache.get(ns.pluginsCache.findBrowserForNode(div));
    if(!(extras && extras.url && extras.mime && cache) ) return;
    
    var url = extras.url;
    var mime = extras.mime;

    var alwaysAsk = { value: ns.getPref("confirmUnblock", true) };
    if((!alwaysAsk.value) || 
        noscriptUtil.prompter.confirmCheck(window, "NoScript",
          ns.getAllowObjectMessage(url, mime),
          noscriptUtil.getString("alwaysAsk"), alwaysAsk)
    ) {
      ns.setPref("confirmUnblock", alwaysAsk.value);
      cache.forceAllow[url] = mime;
      const lm = ns.lookupMethod;
      var doc = lm(div, "ownerDocument")();
      if(mime == lm(doc, "contentType")()) { // stand-alone plugin
        lm(lm(doc, "location")(), "reload")();
        return;
      }
      div._noScriptRemovedObject = null;
      window.setTimeout(function() { 
        while(lm(div,"hasChildNodes")()) {
          lm(div,"removeChild")(lm(div,"firstChild")());
        }
        lm(lm(div,"parentNode")(),"replaceChild")(applet, div)
      }, 0);
    }
  }
}



function _noScript_syncUI(ev) { 
  noscriptOverlay.syncUI(ev); 
}
function _noScript_uninstallCheck(ev) { 
  noscriptOverlay.uninstallCheck(ev); 
}
function _noScript_prepareCtxMenu(ev) {
  noscriptOverlay.prepareContextMenu(ev);
}


const _noScript_WebProgressListener = {
   onLocationChange: function(aWebProgress, aRequest, aLocation) { 
     if(this.originalOnLocationChange) {
       try {
         this.originalOnLocationChange(aWebProgress, aRequest, aLocation);
       } catch(e) {}
     }
     try {
       if(aRequest && (aRequest instanceof Components.interfaces.nsIChannel) && aRequest.isPending()) {
        var contentType = aRequest.contentType;
      
          if(contentType.substring(0, 5) != "text/" && 
              noscriptOverlay.ns.shouldLoad(5, aRequest.URI, aRequest.URI, aWebProgress.DOMWindow, contentType, true) == -3) {
            aRequest.cancel( 0 /* 0x804b0002 == NS_BINDING_ABORTED */); 
          }
       } else {
         _noScript_syncUI(null);
       }
     } catch(e) {}
   },
   onStatusChange: function() {}, 
   onStateChange: function() {}, 
   onSecurityChange: function() {}, 
   onProgressChange: function() {}
};


function _noScript_onloadInstall(ev) {
  document.getElementById("contentAreaContextMenu")
          .addEventListener("popupshowing", _noScript_prepareCtxMenu, false);
  var b = getBrowser();
  b.addEventListener("load", _noScript_syncUI, true);
  b.addEventListener("click", noscriptOverlay.fixLink, true);
  b.addProgressListener(_noScript_WebProgressListener);
  noscriptOverlay.originalTabProgressListener = b.mTabProgressListener;
  b.mTabProgressListener = function() {
    var l = noscriptOverlay.originalTabProgressListener.apply(this, arguments);
    l.originalOnLocationChange = l.onLocationChange;
    l.onLocationChange = _noScript_WebProgressListener.onLocationChange;
    return l;
  };
}


function _noScript_install() {
 
  window.addEventListener("load", _noScript_onloadInstall, false);
  window.addEventListener("focus", _noScript_uninstallCheck, false);
   
  window.addEventListener("unload", _noScript_dispose,false);
  noscriptOverlayPrefsObserver.register();
}

function _noScript_dispose(ev) {
  var b = getBrowser();
  if(b) {
    b.removeEventListener("click", noscriptOverlay.fixLink, true);
    b.removeProgressListener(_noScript_WebProgressListener);
    b.removeEventListener("load", _noScript_syncUI, true);
  }
  
  noscriptOverlayPrefsObserver.remove();
  
  window.removeEventListener("focus", _noScript_uninstallCheck, false);
  window.removeEventListener("load", _noScript_onloadInstall, false);
  document.getElementById("contentAreaContextMenu")
          .removeEventListener("popupshowing", _noScript_prepareCtxMenu,false);
}

_noScript_install();

