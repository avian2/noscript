/***** BEGIN LICENSE BLOCK *****

NoScript - a Firefox extension for whitelist driven safe JavaScript execution
Copyright (C) 2004-2008 Giorgio Maone - g.maone@informaction.com

Contributors: 
  Higmmer

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


var noscriptOverlay = noscriptUtil.service ? 
{
  ns: noscriptUtil.service,
  
  getString: function(key, parms) {
    return noscriptUtil.getString(key, parms);
  }
,
  toggleCurrentPage: function(forceLevel) {
    const ns = this.ns;
    var level = ns.getPref("toolbarToggle", 3) || forceLevel;
    if (!level) return false;
    
    const url = ns.getQuickSite(content.document.documentURI, level);
    if (url)
      this.safeAllow(url, !ns.isJSEnabled(url), ns.getPref("toggle.temp"));
    
    return true;
  },

  
  getSites: function() {
    return this.ns.getSites(gBrowser.selectedBrowser);
  },
  
  get prompter() {
    delete this.prompter;
    return this.prompter = noscriptUtil.prompter;
  },
  
  onMenuShowing: function(ev) {
    if (ev.currentTarget != ev.originalTarget) return;
    this.prepareMenu(ev.target);
  },

  prepareContextMenu: function(ev) {
    var menu = document.getElementById("noscript-context-menu");
    if (this.ns.getPref("ctxMenu", true)) {
      menu.removeAttribute("hidden");
    } else {
      menu.setAttribute("hidden", "true");
      return;
    }
    this.updateStatusClass(menu);
    menu.setAttribute("tooltiptext", this.statusIcon.getAttribute("tooltiptext"));
  }
,
  toggleMenuOpt: function(node) {
    var val=node.getAttribute("checked")=="true";
    var k=node.id.lastIndexOf("-opt-");
    if (k>-1) {
      this.ns.setPref(node.id.substring(5+k),val);
    }
    return val;
  }
,

  prepareOptItems: function(popup) {
    const notifications = this.getNotificationBox();
    const opts = popup.getElementsByAttribute("type", "checkbox");
    var k, j, node, id;
    for (j = opts.length; j-- > 0;) {
      node = opts[j];
      var id = node.id;
      if ((k = id.lastIndexOf("-opt-")) > -1) {
        if ((!notifications) && id.indexOf("notification") - 1) {
          node.setAttribute("hidden", "true");
        } else {
          node.setAttribute("checked", this.ns.getPref(node.id.substring(5 + k)));
        }
      }
    }
  },
  
  
  prepareXssMenu: function(popup, invert) {
    this.prepareOptItems(this.populateXssMenu(popup, invert));
  },
  populateXssMenu: function(popup, invert) {
    var ref = document.getElementById("noscript-mi-xss-unsafe-reload");
    var parent = ref.parentNode;
    var inverse = parent.lastChild.id != "noscript-mi-xss-faq";
    invert = inverse && !invert;
    if (parent != popup) {
      while (parent.firstChild) {
        popup.appendChild(invert ? parent.lastChild : parent.firstChild);
      }
    } else if (invert) {
      for (var p, n = parent.lastChild; n; n = p) {
        p = n.previousSibling;
        parent.appendChild(n);
      }
    }
    
    return popup;
  },
  
  prepareMenu: function(popup) {
    const ns = this.ns;

    var j, k, node;
    
    const global = ns.jsEnabled;
    const blockUntrusted = global && ns.alwaysBlockUntrustedContent;
    
    var allSeps = popup.getElementsByTagName("menuseparator");
   
    var seps = { insert: null, stop: null, global: null, untrusted: null };
    var sepName;
    for (j = allSeps.length; j-- > 0;) {
      sepName = (node = allSeps[j]).className;
      node.hidden = false;
      for (k in seps) {
        if (sepName.indexOf("-" + k) > -1) {
          seps[k] = node;
        }
      }
    }
    
    delete allSeps;

    const miGlobal = seps.global.nextSibling;
    
    if (global || ns.getPref("showGlobal")) {
      miGlobal.hidden = seps.global.hidden = false;
      miGlobal.setAttribute("label", this.getString((global ? "forbid" : "allow") + "Global"));
      miGlobal.setAttribute("oncommand","noscriptOverlay.menuAllow("+(!global)+")");
      miGlobal.setAttribute("tooltiptext", this.statusIcon.getAttribute("tooltiptext"));
      miGlobal.setAttribute("class", "menuitem-iconic noscript-glb " + this.getStatusClass(global ? "no" : "yes"));
    } else {
      miGlobal.hidden = seps.global.hidden = true;
    }
    
    node = miGlobal.nextSibling;
    const mainMenu = node.parentNode;
    
    var tempMenuItem = document.getElementById("noscript-revoke-temp-mi");
    if (node != tempMenuItem) {
      node = mainMenu.insertBefore(tempMenuItem, node);
    }
    
    var tempSites = ns.gTempSites.sitesString;
    tempSites = tempSites && (tempSites + " " + ns.tempSites.sitesString).replace(/\s+$/g, '') || ns.tempSites.sitesString;
    if ((tempSites || ns.objectWhitelistLen) && ns.getPref("showRevokeTemp", true)) {
      node.hidden = seps.global.hidden = false;
      node.setAttribute("tooltiptext",
        // remove http/https/file CAPS hack entries 
        "<SCRIPT>: " + 
        (tempSites 
          ? ns.siteUtils.sanitizeString(tempSites.replace(/\b(?:https?|file):\/\//g, ""
              )).split(/\s+/) 
              // .join(",\n") // wait Firefox 3 with its multiline tooltips for this
              .length
          : 0) +
        " | <OBJECT>: " + ns.objectWhitelistLen
      );
    } else {
      node.hidden = true;
    }
    node = node.nextSibling;
    
    tempMenuItem = document.getElementById("noscript-temp-allow-page-mi");
    if (node != tempMenuItem) {
      mainMenu.insertBefore(tempMenuItem, node)
    } else {
      node = node.nextSibling;
    }
    
    var xssMenu = document.getElementById("noscript-xss-menu");
    
    if (xssMenu && node != xssMenu) {
      mainMenu.insertBefore(xssMenu, node);
    }
    this.populateXssMenu(xssMenu.firstChild);
    this.syncXssWidget(xssMenu);
    

    this.prepareOptItems(popup);
      
    var untrustedMenu = null;
    var pluginsMenu = null;
    if (seps.untrusted) {
      
      pluginsMenu = document.getElementById("noscript-menu-blocked-objects");
      untrustedMenu = document.getElementById("noscript-menu-untrusted");
      // cleanup untrustedCount display
      untrustedMenu.setAttribute("label", untrustedMenu.getAttribute("label").replace(/ \(\d+\)$/, ""));
      
      with(seps.untrusted) {
        if (nextSibling != pluginsMenu) {   
          parentNode.insertBefore(untrustedMenu, nextSibling);
          parentNode.insertBefore(pluginsMenu, untrustedMenu);
        }
      }
      // descend from menus to popups and clear children
      for each(node in [pluginsMenu = pluginsMenu.firstChild, untrustedMenu = untrustedMenu.firstChild])
        while (node.firstChild)
          node.removeChild(node.firstChild);
      untrustedMenu.appendCmd = untrustedMenu.appendChild;
    }
    
    node = seps.insert.nextSibling;
    
    var remNode;
    while (node && (node != seps.stop)) {
       remNode = node;
       node = node.nextSibling;
       if (remNode != untrustedMenu && remNode != xssMenu)
         mainMenu.removeChild(remNode);
    }

    mainMenu.appendCmd = function(n) { this.insertBefore(n, seps.stop); };

    const sites = this.getSites();
    j = sites.indexOf(sites.topURL);
    if (j > 0) {
      sites.splice(j, 1);
      sites.push(sites.topURL);
    }
    
    
    try {
      this.populatePluginsMenu(mainMenu, pluginsMenu, sites.pluginExtras);
    } catch(e) {
      if(ns.consoleDump) ns.dump("Error populating plugins menu: " + e);
    }
    var site, enabled, isTop, lev;
    var jsPSs = ns.jsPolicySites;
    var matchingSite;
    var menuGroups, menuSites, menuSite, scount;
    var domain, pos, baseLen, dp;
    var untrusted;
    var cssClass;

    var domainDupChecker = {
      domains: {},
      check: function(d) {
        return this.domains[d] || !(this.domains[d] = true);
      }
    };
    
    const locked = ns.locked;
    const showAddress = locked || ns.getPref("showAddress", false);
    const showDomain = !locked && ns.getPref("showDomain", false);
    const showBase = !locked && ns.getPref("showBaseDomain", true);
    const showUntrusted = ns.getPref("showUntrusted", true);
    const showDistrust = ns.getPref("showDistrust", true);
    const showNothing = !(showAddress || showDomain || showBase || showUntrust);
    // const forbidImpliesUntrust = ns.forbidImpliesUntrust;
    
    const showPermanent = ns.getPref("showPermanent", true);
    const showTemp = !locked && ns.getPref("showTemp", true);
    
    var parent, extraNode;
    var untrustedCount = 0, unknownCount = 0, tempCount = 0;
    const untrustedSites = ns.untrustedSites;
    var docJSBlocked = false;
    
    menuGroups = [];
    for (j = sites.length; j-- > 0;) {
      site = sites[j];
      
      matchingSite = jsPSs.matches(site);
      untrusted = untrustedSites.matches(site);
      if (untrusted) {
        matchingSite = null;
      } else if (blockUntrusted && !matchingSite) {
        matchingSite = site;
      }
      
      isTop = site == sites.topURL;
      enabled = !!matchingSite;
      docJSBlocked = enabled && isTop && !gBrowser.selectedBrowser.webNavigation.allowJavascript;
      if (docJSBlocked) enabled = false;
      
      if (enabled && !global || (matchingSite = untrusted)) {
        if (domainDupChecker.check(matchingSite)) continue;
        menuSites = [matchingSite];
      } else {
        domain = ns.getDomain(site);
        
        if (domain && (dp = ns.getPublicSuffix(domain)) == domain) 
          domain = null; // exclude TLDs
        
        menuSites = (showAddress || showNothing || !domain) ? [site] : [];
        if (domain && (showDomain || showBase)) {
          baseLen = domain.length;
          if (dp) 
            baseLen -= (domain.lastIndexOf(".", baseLen - dp.length - 2) + 1); 
          if (baseLen == domain.length) {
            // IP or 2nd level domain
            if (!domainDupChecker.check(domain)) {
              menuSites.push(domain);
            }
          } else {
            dp = domain;
            for (pos = 0; (pos = domain.indexOf('.', pos)) > 0; dp = domain.substring(++pos)) {
              if (baseLen == dp.length) {
                if (menuSites.length > 0 && !showBase) continue;
              } else {
                if (!showDomain) continue;
              }
              if (!domainDupChecker.check(dp)) {
                menuSites.push(dp);
              }
              if (baseLen == dp.length) break;
            }
          }
        }  
      }
      menuSites.isTop = isTop;
      menuSites.enabled = enabled;
      menuGroups.push(menuSites);
    }
    
    for (j = menuGroups.length; j-- > 0;) {

      if (seps.stop.previousSibling.nodeName != "menuseparator") {
        mainMenu.appendCmd(document.createElement("menuseparator"));
      }
      
      menuSites = menuGroups[j];
      isTop = menuSites.isTop;
      enabled = menuSites.enabled;
      
      for (scount = menuSites.length; scount-- > 0;) {
        menuSite = menuSites[scount];
        
        untrusted = !enabled && (blockUntrusted || ns.isUntrusted(menuSite));
        if (untrusted) 
          untrustedCount++;
        else if (!enabled)
          unknownCount++;
        
        parent = (untrusted && showUntrusted) ? untrustedMenu : mainMenu;
        if (!parent) continue;
        
        node = document.createElement("menuitem");
        cssClass = isTop ? "noscript-toplevel noscript-cmd" : "noscript-cmd";
        
        domain = isTop && docJSBlocked ? "[ " + menuSite + " ]" : menuSite;
        
        node.setAttribute("label", this.getString((enabled ? "forbidLocal" : "allowLocal"), [domain]));
        node.setAttribute("statustext", menuSite);
        node.setAttribute("oncommand", "noscriptOverlay.menuAllow(" + (!enabled) + ", this)");
        node.setAttribute("tooltiptext",
          this.getString("allowed." + (enabled ? "yes" : "no")));
        if (locked || enabled && ns.isPermanent(menuSite)) {
          node.setAttribute("disabled", "true");
        } else {
          cssClass += " menuitem-iconic ";
          if (enabled && ns.isTemp(menuSite)) {
            cssClass += " noscript-temp";
            tempCount++;
          }
        }
        node.setAttribute("class", cssClass + (enabled ? " noscript-forbid" : " noscript-allow"));
        
        if ((showPermanent || enabled) && !(global && enabled)) 
          parent.appendCmd(node);
        
        if (!locked) {
          if (showTemp && !enabled) {
            extraNode = document.createElement("menuitem");
            extraNode.setAttribute("label", this.getString("allowTemp", [domain]));
            extraNode.setAttribute("statustext", menuSite);
            extraNode.setAttribute("oncommand", "noscriptOverlay.menuAllow(true,this,true)");
            extraNode.setAttribute("class", cssClass + " noscript-temp noscript-allow");
            extraNode.setAttribute("tooltiptext", node.getAttribute("tooltiptext"));
            parent.appendCmd(extraNode);
          }
          if (((showUntrusted && untrustedMenu || showDistrust) && !(domain in jsPSs.sitesMap) || blockUntrusted) && !untrusted) {
            extraNode = document.createElement("menuitem");
            extraNode.setAttribute("label", this.getString("distrust", [menuSite]));
            extraNode.setAttribute("statustext", menuSite);
            extraNode.setAttribute("class", cssClass + " noscript-distrust");
            extraNode.setAttribute("oncommand", "noscriptOverlay.menuAllow(false, this, false)");
            extraNode.setAttribute("tooltiptext", node.getAttribute("tooltiptext"));
            (showUntrusted && !blockUntrusted ? untrustedMenu : mainMenu).appendCmd(extraNode);
          }
        }
      }
      
      if (untrustedMenu && untrustedMenu.firstChild) {
        untrustedMenu.appendCmd(document.createElement("menuseparator"));
      }
    }
    if (untrustedMenu && untrustedMenu.firstChild) {
      if (untrustedCount) 
        with(untrustedMenu.parentNode)
          setAttribute("label", getAttribute("label") +
            " (" + untrustedCount + ")"); // see above for cleanup
    }

    
    
    // temp allow all this page
    tempMenuItem.hidden = !(unknownCount && ns.getPref("showTempAllowPage", true));
    // allow all this page
    tempMenuItem.parentNode.insertBefore(document.getElementById("noscript-allow-page-mi"),
        tempMenuItem.nextSibling).hidden = unknownCount + tempCount == 0 || !ns.getPref("showAllowPage", true);
    
    this.normalizeMenu(untrustedMenu, true);
    this.normalizeMenu(mainMenu, false);
    
    if (mainMenu.id == "noscript-tbb-popup") { 
      // this one can go away, better take our stuff back when done
      mainMenu.addEventListener("popuphidden", function(ev) {
        if (ev.target != ev.currentTarget) return;
        ev.currentTarget.removeEventListener(ev.type, arguments.callee, false);
        noscriptOverlay.prepareMenu(document.getElementById("noscript-status-popup"));
      }, false);
    }
    
  },

  populatePluginsMenu: function(mainMenu, menu, extras) {
    if (!menu) return;
    
    menu.parentNode.hidden = true;
    const ns = this.ns;
    if (!(extras && ns.getPref("showBlockedObjects", true)))
      return;
    
    var egroup, e, node, i;
    var pluginExtras = [];
    i = 0;
    for each(egroup in extras) {
      for each(e in egroup) {
         
         if(e.tag && !e.placeholder) continue;
         node = document.createElement("menuitem");
         
         e.label = e.label || ns.mimeEssentials(e.mime) + "@" + ns.urlEssentials(e.url);
         e.title = e.title || e.label.split("@")[0] + e.url;
  
         node.setAttribute("label", this.getString("allowTemp", [e.label]));
         node.setAttribute("tooltiptext", e.title);
         node.setAttribute("oncommand", "noscriptOverlay.allowObject(" + i + ")");
         node.setAttribute("class", "menuitem-iconic noscript-cmd noscript-temp noscript-allow");
         node.style.listStyleImage = ns.cssMimeIcon(e.mime, 16);
         menu.appendChild(node);
         pluginExtras[i++] = e;
      }
    }
    if (i) {
      noscriptOverlay.menuPluginExtras = pluginExtras;
      mainMenu.addEventListener("popuphidden", function(ev) {
          if (ev.currentTarget != ev.target) return;
          ev.currentTarget.removeEventListener(ev.type, arguments.callee, false);
          noscriptOverlay.menuPluginExtras = null;
          noscriptOverlay.menuPluginSites = null;
      }, false);
      var pluginSites = {};
      i = 0;
      for each(e in pluginExtras) {
        if(!(e.site && e.mime)) continue;
        if (e.site in pluginSites) {
          if (pluginSites[e.site].indexOf(e.mime) > -1) 
            continue;
          pluginSites[e.site].push(e.mime);
        } else {
          pluginSites[e.site] = ["*", e.mime];
        }
        i++;
      }
      if (i) {
        noscriptOverlay.menuPluginSites = [];
        i = 0;
        var mime;
        for (var site in pluginSites) {
          menu.appendChild(document.createElement("menuseparator"));
          for each(mime in pluginSites[site]) {
            node = document.createElement("menuitem");
            node.setAttribute("label", this.getString("allowTemp", [ns.mimeEssentials(mime) + "@" + site]));
            node.setAttribute("tooltiptext", mime + "@" + site);
            node.setAttribute("oncommand", "noscriptOverlay.allowObjectSite(" + i + ")");
            node.setAttribute("class", "menuitem-iconic noscript-temp noscript-cmd noscript-allow");
            if(mime != "*")
              node.style.listStyleImage = node.style.listStyleImage = ns.cssMimeIcon(mime, 16);

            menu.appendChild(node);
            noscriptOverlay.menuPluginSites[i++] = [site, mime];
          }
        }
      }
      menu.parentNode.hidden = false;
    }
  },
  
  allowPage: function(permanent) {
    const ns = this.ns;
    const sites = this.getSites();
    const unknown = [];
    const level = ns.getPref("allowPageLevel", 0) || ns.preferredSiteLevel;
    var site;
    for (var j = sites.length; j-- > 0;) {
      site = ns.getQuickSite(sites[j], level);
      if (!(ns.isJSEnabled(site) && !(permanent && ns.isTemp(site))  || ns.isUntrusted(site)))
        unknown.push(site);
    }
    if (unknown.length) this.safeAllow(unknown, true, !permanent);
  },
  
  allowObject: function(i) {
    if(this.menuPluginExtras && this.menuPluginExtras[i]) {
      var e = this.menuPluginExtras[i];
      if(e.placeholder) {
        this.ns.checkAndEnablePlaceholder(e.placeholder);
      } else if (this.ns.confirmEnableObject(window, e)) {
        this.allowObjectURL(e.url, e.mime);
      }
    }
  },
  
  allowObjectSite: function(i) {
    if(this.menuPluginSites && this.menuPluginSites[i]) {
      this.allowObjectURL(this.menuPluginSites[i][0], this.menuPluginSites[i][1]);
    }
  },
  allowObjectURL: function(url, mime) {
    this.ns.allowObject(url, mime);
    if (this.ns.getPref("autoReload", true))
        this.ns.quickReload(gBrowser.selectedBrowser.webNavigation);
  },
  
  normalizeMenu: function(menu, hideParentIfEmpty) {
    if (!menu) return;
    var prev = null;
    var wasSep = true;
    var isSep, haveMenu = false;
    for (var i = menu.firstChild; i; i = i.nextSibling) {
      if (!i.hidden) {
        isSep = i.nodeName == "menuseparator";
        if (isSep && wasSep) {
          i.hidden = true;
        } else {
          haveMenu = haveMenu || !isSep;
          prev = i;
          wasSep = isSep;
        }
      }
    }
    
    if (prev && wasSep) {
      prev.hidden = true;
    }
    if (hideParentIfEmpty && menu.parentNode) {
      menu.parentNode.hidden = !haveMenu;
    }
  }
,
  getBrowserDoc: function(browser) {
    return browser && browser.contentWindow && browser.contentWindow.document || null;
  }
,
  revokeTemp: function() {
    const ns = noscriptOverlay.ns;
    ns.safeCapsOp(function() {
      ns.eraseTemp();
      noscriptOverlay.syncUI();
    }, !ns.getPref("autoReload.allTabsOnPageAction", true));
  }
,
  menuAllow: function(enabled, menuItem, temp) {
    var site = null;
    if (menuItem) { // local 
      site = menuItem.getAttribute("statustext");
      if (!site) return;
      if (menuItem.getAttribute("class").indexOf("-distrust") > -1) {
        this.ns.setUntrusted(site, true);
      }
    } else { // global
      if (enabled && this.ns.getPref("globalwarning", true) &&
          !this.prompter.confirm(window, this.getString("global.warning.title"),
                                this.getString("global.warning.text"))
         ) return;
    }
    this.safeAllow(site, enabled, temp);
  }
,
  safeAllow: function(site, enabled, temp) {
    const ns = this.ns;
    var webNav = gBrowser.selectedBrowser.webNavigation;
    var reloadCurrentTabOnly = (site instanceof Array) &&
      !ns.getPref("autoReload.allTabsOnPageAction", true);

    ns.safeCapsOp(function() {
      if (site) {
        
        ns.setTemp(site, enabled && temp);
        ns.setJSEnabled(site, enabled, false, ns.mustCascadeTrust(site, temp));
        
        if (enabled && !webNav.allowJavascript) {
          var curSite = ns.getSite(webNav.currentURI.spec);
          if (ns.isJSEnabled(curSite)) {
            // force reload
            if (ns.jsEnabled) {
              ns._lastSnapshot.add(curSite); 
            } else {
              ns._lastSnapshot.remove(curSite); 
            }
          }
          webNav.allowJavascript = true;
        }
      } else {
        ns.jsEnabled = enabled;
      }
      noscriptOverlay.syncUI();
    }, reloadCurrentTabOnly);
  }
,
  
  get statusIcon() {
    var statusIcon = document.getElementById("noscript-statusIcon");
    if (!statusIcon) return null; // avoid mess with early calls
    delete this.statusIcon;
    return this.statusIcon = statusIcon;
  },

  getIcon: function(node) {
    if (typeof(node) != "object") node = document.getElementById(node);
    return node.ownerDocument.defaultView.getComputedStyle(node, null)
            .getPropertyValue("list-style-image")
            .replace(/.*url\s*\(\s*"?(.*)\"?\s*\).*/g, '$1');
  },
  
  getStatusClass: function(lev, inactive, currentClass) {
    return "noscript-" + (inactive ? "inactive-" : "") + lev;
  },
  updateStatusClass: function(node, className) {
    if (!className) className = this.statusIcon.className.replace(/.*(\bnoscript-\S*(?:yes|no|glb|prt|yu|untrusted)).*/, "$1");
    node.className = (node.className.replace(/\bnoscript-\S*(?:yes|no|glb|prt|yu|untrusted)\b/g, "") + " " + className).replace(/\s{2,}/g, " ");
  }
,
  _syncTimeout: null,
  syncUI: function(w) {
    if (w) {
      if (w != window.content) return;
    } else {
      w = window.content;
    }
    
    if (this._syncTimeout) {
      window.clearTimeout(this._syncTimeout);
    }
    this._syncTimeout = window.setTimeout(function() {
      if (w != window.content) return;
      noscriptOverlay._syncUINow();
    }, 400);
  },
  
  syncXssWidget: function(widget) {
    if (!widget) widget = document.getElementById("noscript-statusXss");
    const ns = this.ns;
    var unsafeRequest = ns.requestWatchdog.getUnsafeRequest(gBrowser.selectedBrowser);
    if (unsafeRequest && !unsafeRequest.issued) {
      widget.removeAttribute("hidden");
      widget.setAttribute("tooltiptext", "XSS [" +
                  ns.getSite(unsafeRequest.origin) + "]->[" + 
                  ns.getSite(unsafeRequest.URI.spec) + "]");
    } else {
      widget.setAttribute("hidden", "true");
    }
  },
  
  syncRedirectWidget: function() {
    var widget = document.getElementById("noscript-statusRedirect");
    var info = this.getMetaRefreshInfo();
    if (!info) {
      widget.setAttribute("hidden", true);
      return;
    }
    widget.removeAttribute("hidden");
    widget.setAttribute("tooltiptext",
        this.getString("metaRefresh.notify.follow") + " [" + info.uri + "]"); 
  },
  
  showUI: function() {
    var statusIcon = this.statusIcon;
    var popup = document.getElementById("noscript-status-popup");
    if (statusIcon.hidden || statusIcon.parentNode.hidden) {
      var tbb = document.getElementById("noscript-tbb");
      if (tbb && window.getComputedStyle(tbb.parentNode, "").display != "none") {
        tbb.open = true;
        return;
      }
      if (statusIcon.parentNode.hidden) {
        window.setTimeout(function() {
          var popup = document.getElementById("noscript-notify-popup");
          var ref = document.getElementById("appcontent");
          popup.showPopup(ref, ref.boxObject.screenX, ref.boxObject.screenY);
        }, 0);
        return;
      } else {
        popup.addEventListener("popuphidden", function(ev) {
            if (ev.currentTarget != ev.target) return;
            ev.target.removeEventListener(ev.type, arguments.callee, false);
            ev.target.parentNode.hidden = !noscriptOverlay.ns.getPref("statusIcon", true);
        }, false);
        statusIcon.hidden = false;
      }
    }
    popup.showPopup();
  }
,
  get notificationPos() {
    return this.notifyBottom ? "bottom" : "top";
  },
  get altNotificationPos() {
    return this.notificationPos == "top" ? "bottom" : "top";
  }
, 
  getNotificationBox: function(pos, browser) {
    var gb = getBrowser();
    browser = browser || gb.selectedBrowser;
    if (!pos) pos = this.notificationPos;
    
    if (gb.getMessageForBrowser) return gb.getMessageForBrowser(browser, pos); // Fx <= 1.5 
    if (!gb.getNotificationBox) return null; // SeaMonkey

    var nb = gb.getNotificationBox(browser);
    
    if (nb && pos == "bottom") 
      this.patchNotificationBox(nb);
   
    return nb;
  },
  patchNotificationBox: function(nb) {
    if (nb._noscriptBottomStack_) return;
    nb._dom_ = {};
    const METHODS = this.notificationBoxPatch;
    for (m in METHODS) {
      nb._dom_[m] = nb[m];
      nb[m] = METHODS[m];
    }
    
    var stacks =  nb.getElementsByTagName("stack");
    var stack = null;
    for (var j = stacks.length; j-- > 0;) {
      if (stacks[j].getAttribute("class") ==  "noscript-bottom-notify") {
        stack = stacks[j];
        break;
      }
    }
    if (!stack) {
     stack = nb.ownerDocument.createElement("stack");
     stack.setAttribute("class", "noscript-bottom-notify");
     nb.appendChild(stack);
    }
    nb._noscriptBottomStack_ = stack;
  },
  
  notificationBoxPatch: {
    insertBefore: function(n, ref) {
      if (n.localName == "notification" && 
          n.getAttribute("value") == "noscript"
          && noscriptOverlay.notificationPos == "bottom") {
        const stack = this._noscriptBottomStack_;
        while (stack.firstChild) 
          stack.removeChild(stack.firstChild);
        
        stack.appendChild(n);
        var hbox = n.ownerDocument.getAnonymousElementByAttribute(
                      n, "class", "notification-inner outset");
        if (hbox) {
          var style = hbox.ownerDocument.defaultView.getComputedStyle(hbox, null);
          var borderProps = ['color', 'style', 'width'];
          var cssProp, jsProp, tmpVal;
          for (var p = borderProps.length; p-- > 0;) {
            cssProp = borderProps[p];
            jsProp = cssProp[0].toUpperCase() + cssProp.substring(1);
            tmpVal = style.getPropertyValue("border-bottom-" + cssProp);
            hbox.style["borderBottom" + jsProp] = style.getPropertyValue("border-top-" + cssProp);
            hbox.style["borderTop" + jsProp] = tmpVal;
          }
        }
        return n;
      }
      if(ref && ref.parentNode != this) {
        var priority = ref.priority;
        ref = null; 
        var notifications = this.allNotifications;
        for (var j = notifications.length; j-- > 0;) {
          if ((ref = notifications[j]).priority < priority && ref.parentNode == this)
            break;
        }
        if(j < 0) ref = null;
      }
      return this._dom_.insertBefore.apply(this, [n, ref]);
    },
    removeChild: function(n) {
      return (n.parentNode == this) ? this._dom_.removeChild.apply(this, arguments) : n.parentNode.removeChild(n); 
    }
  },
  
  getNsNotification: function(widget) {
    if (widget == null) return null;
    if (widget.localName == "notificationbox") return widget.getNotificationWithValue("noscript");
    return this.isNsNotification(widget) && widget || null;
  },
  isNsNotification: function(widget) {
    return widget && widget.getAttribute("value") == "noscript" || widget.popup == "noscript-notify-popup";
  },
  
  
  notificationShow: function(label, icon, canAppend) {
    var box = this.getNotificationBox();
    if (box == null) return false;
    var pos = this.notificationPos;
    
    const gb = getBrowser();
    const browser = gb.selectedBrowser;
    
    var widget = this.getNsNotification(box);
    if (widget) {
     if (widget.localName == "notification") {
       widget.label = label;
       widget.image = icon;
     } else {
       widget.text = label;
       widget.image = icon;
       if (canAppend) widget.removeAttribute("hidden");
     }
    
    } else {
     
      if (!canAppend) return false;
     
      var buttonLabel, buttonAccesskey;
      if (gb.getNotificationBox || /\baButtonAccesskey\b/i.test(gb.showMessage.toSource())) {
        const refWidget = document.getElementById("noscript-options-ctx-menuitem");
        buttonLabel = refWidget.getAttribute("label");
        buttonAccesskey = refWidget.getAttribute("accesskey");
      } else { // Fx < 1.5
        buttonLabel = "";
        buttonAccesskey = "";
      }
      const popup = "noscript-notify-popup";
      if (box.appendNotification) { // >= Fx 2.0
        widget =  box.appendNotification(label, "noscript", icon, box.PRIORITY_WARNING_MEDIUM,
                  [ {label: buttonLabel, accessKey: buttonAccesskey,  popup: popup } ]);
        
      } else if (gb.showMessage) { // Fx <= 1.5.x
        gb.showMessage(browser, icon, label, 
              buttonLabel, null,
              null, popup, pos, true,
              buttonAccesskey);
        widget = this.getNsNotification(box);
      }
     
    }
    if (!widget) return false;
    
    const delay = this.notifyHide && this.notifyHideDelay || 0;
    if (delay) {
     if (this.notifyHideTimeout) window.clearTimeout(this.notifyHideTimeout);
     this.notifyHideTimeout = window.setTimeout(
       function() {
         if (browser == gb.selectedBrowser) {
           noscriptOverlay.notificationHide(browser);
         }
       },
       1000 * delay);
    }
    return true;
  },
  
  getAltNotificationBox: function(browser, value, canAppend) {
    const box = this.getNotificationBox(this.altNotificationPos, browser);
    if (canAppend || (box && 
        box.getNotificationWithValue &&
        box.getNotificationWithValue(value))) return null;
    return box;
  },
  
  notifyXSSOnLoad: function(requestInfo) {
    requestInfo.browser.addEventListener("DOMContentLoaded", function(ev) {
      requestInfo.browser.removeEventListener(ev.type, arguments.callee, false);
      if (requestInfo.unsafeRequest && requestInfo.unsafeRequest.issued) return;
      noscriptOverlay.notifyXSS(requestInfo);
    }, false);
  },
  
  notifyXSS: function(requestInfo) {
    const notificationValue = "noscript-xss-notification"; 
    const box = this.getAltNotificationBox(requestInfo.browser, notificationValue);
    if (!box) return;

    var origin = this.ns.getSite(requestInfo.unsafeRequest.origin);
    origin = (origin && "[" + origin + "]") || this.getString("untrustedOrigin");
    var label = this.getString("xss.notify.generic", [origin]);
    var icon = this.getIcon("noscript-statusXss");
    
    const refWidget = document.getElementById("noscript-options-ctx-menuitem");
    var buttonLabel = refWidget.getAttribute("label");
    var buttonAccesskey = refWidget.getAttribute("accesskey");
    var popup = "noscript-xss-popup";
    
    const tabBrowser = getBrowser();
    if (tabBrowser.showMessage) { // Fx 1.5
      tabBrowser.showMessage(
          requestInfo.browser, 
          icon, label, 
          buttonLabel, null,
          null, popup, this.altNotificationPos, true,
          buttonAccesskey);
    } else { // Fx >= 2.0
      box.appendNotification(
        label, 
        notificationValue, 
        icon, 
        box.PRIORITY_WARNING_HIGH,
        [{
          label: buttonLabel,
          accessKey: buttonAccesskey,
          popup: popup
         }]
        );
    }
  },
  
  notifyMetaRefreshCallback: function(info) {
    noscriptOverlay.notifyMetaRefresh(info);
  },
  notifyMetaRefresh: function(info) {
    var browser = this.ns.domUtils.findBrowser(window, info.document.defaultView);
    if (!browser) return;
    
    const notificationValue = "noscript-metaRefresh-notification";
    const box = this.getAltNotificationBox(browser, notificationValue);
    var notification = null;
    
    if (box && this.ns.getPref("forbidMetaRefresh.notify", true)) {
      var label = this.getString("metaRefresh.notify", [info.uri, info.timeout])
      var icon = this.getIcon("noscript-statusRedirect");
        
      if (box.appendNotification) { // Fx 2
      
        notification = box.appendNotification(
          label, 
          notificationValue, 
          icon, 
          box.PRIORITY_INFO_HIGH,
          [{
              label: this.getString("metaRefresh.notify.follow"),
              accessKey: this.getString("metaRefresh.notify.follow.accessKey"),
              callback: function(notification, buttonInfo) {
                noscriptOverlay.ns.doFollowMetaRefresh(info);
              }
           }]
          );
      }
      browser.addEventListener("beforeunload", function(ev) {
        if (ev.originalTarget == info.document || ev.originalTarget == browser) {
          browser.removeEventListener(ev.type, arguments.callee, false);
          if (notification && notification == box.currentNotification) {
            box.removeCurrentNotification();
          } else {
            noscriptOverlay.ns.doBlockMetaRefresh(info);
          }
          info = browser = null;
        }
      }, false);
    }
    
    this.setMetaRefreshInfo(info, browser);
  },
  
  setMetaRefreshInfo: function(value, browser) {
    return this.ns.setExpando(browser || gBrowser.selectedBrowser, "metaRefreshInfo", value);
  },
  getMetaRefreshInfo: function(browser) {
    return this.ns.getExpando(browser || gBrowser.selectedBrowser, "metaRefreshInfo");
  },
  followMetaRefresh: function(event) {
    this.ns.doFollowMetaRefresh(this.getMetaRefreshInfo(), event.shiftKey);
  },
  
  notifyJarDocument: function(info) {
    var browser = this.ns.domUtils.findBrowser(window, info.document.defaultView.top);
    if (!browser) return false;
    
    const notificationValue = "noscript-jarDoc-notification";
    const box = this.getAltNotificationBox(browser, notificationValue);
  
    if (!(box && box.appendNotification)) return false;
    
    var notification = null;
    
    var label = this.getString("jarDoc.notify", [info.uri]);
    var icon = this.getIcon("noscript-jar-opts");

    notification = box.appendNotification(
      label, 
      notificationValue, 
      icon, 
      box.PRIORITY_WARNING_HIGH,
      [{
          label: this.getString("notify.options"),
          accessKey: this.getString("notify.accessKey"),
          callback: function(notification, buttonInfo) {
            noscriptUtil.openJarOptions();
          }
       }]
      );
    browser.addEventListener("beforeunload", function(ev) {
      if (ev.originalTarget == info.document || ev.originalTarget == browser) {
        browser.removeEventListener(ev.type, arguments.callee, false);
        if (notification && notification == box.currentNotification) {
          box.removeCurrentNotification();
        } 
        info = browser = notification = null;
      }
    }, false);
    
    return true;
  },
  
  unsafeReload: function() {
    const browser = gBrowser.selectedBrowser;
    const ns = this.ns;
    const rw = ns.requestWatchdog;
    var unsafeRequest = rw.getUnsafeRequest(browser);
    var method;
    if (!unsafeRequest) {
      unsafeRequest = {
        URI: browser.webNavigation.currentURI,
        origin: rw.traceBackHistory(browser.webNavigation.sessionHistory, browser.contentWindow).join(">>>")
      };
      method = "URL";
    } else {
      method = (unsafeRequest.postData ? "POST" : "GET");
    }
    var msg = noscriptUtil.getString("unsafeReload.warning",
      [ method, 
        ns.siteUtils.crop(unsafeRequest.URI.spec), 
        ns.siteUtils.crop(unsafeRequest.origin || unsafeRequest.referrer && unsafeRequest.referrer.spec || '?')
      ]);
    msg += noscriptUtil.getString("confirm");
    if (noscriptUtil.confirm(msg, "confirmUnsafeReload")) {
      try {
        getBrowser().getNotificationBox(browser).removeAllNotifications(true);
      } catch(e) {}
      rw.unsafeReload(browser, true);
    }
  },
  
  notificationHide: function(browser, immediate) { // Modified by Higmmer
    var box = this.getNotificationBox(null, browser);
    var widget = this.getNsNotification(box); // Modified by Higmmer
    if (widget) {
      if (widget.parentNode) {
        box = widget.parentNode.parentNode;
        if (box && box.removeNotification) {
          if (immediate && box.currentNotification == widget) {
            box.currentNotification = null;
          }
          box.removeNotification(widget);
        } else if (widget.close) {
          widget.close();
        } else {
          widget.setAttribute("hidden", "true");
        }
      }
      return true;
    }
    return false;
  },
  
  _syncUINow: function() {
    
    const ns = this.ns;
    const global = ns.jsEnabled;
    const jsPSs = ns.jsPolicySites;
    const untrustedSites = ns.untrustedSites;
    var lev;
    
    this.syncXssWidget();
    this.syncRedirectWidget();
    
    const sites = this.getSites();
    var totalScripts = sites.scriptCount;
    var totalPlugins = sites.pluginCount;
    var totalAnnoyances = totalScripts + totalPlugins;
    var notificationNeeded = false;
    var allowedSites = [];
    var allowed = 0;
    var untrusted = 0;
    var isUntrusted = false;
    if (global && !ns.alwaysBlockUntrustedContent) {
      lev = "glb";
    } else {
      var s = sites.length;
      var total = s;
      var url, site;
      while (s-- > 0) {
        url = sites[s];
        isUntrusted = untrustedSites.matches(url);
        site = !isUntrusted && (global ? url : jsPSs.matches(url));
        
        if (site && url == sites.topURL && !gBrowser.selectedBrowser.webNavigation.allowJavascript)
          site = null;
          
        if (site) {
          if (ns.isPermanent(site) || allowedSites.indexOf(site) > -1) {
            total--;
          } else {
            allowedSites.push(site);
          }
        } else {
          if(!notificationNeeded && url != "about:blank") {
            if(isUntrusted) untrusted++;
            else notificationNeeded = true;
          }
        }
      }
      allowed = allowedSites.length;
      lev = (allowed == total && sites.length > 0 && !untrusted) ? (global ? "glb" : "yes")
            : allowed == 0 ? (global ? "untrusted-glb" : "no") 
            : (untrusted > 0 && !notificationNeeded ? (global ? "yu-glb" : "yu") : "prt");
      notificationNeeded = notificationNeeded && totalAnnoyances > 0;
    }
    
    var message = this.getString("allowed." +
        (lev == "yu" ? "prt" : lev == "untrusted" ? "no" : lev));
    
    var shortMessage = message.replace(/JavaScript/g, "JS");
    
    if (notificationNeeded && allowed) 
      message += ", " + allowed + "/" + total + " (" + allowedSites.join(", ") + ")";
    
    var countsMessage = " | <SCRIPT>: " + totalScripts + " | <OBJECT>: " + totalPlugins;
    message += countsMessage;
    shortMessage += countsMessage;
    
    var icon = this.getIcon(this.statusIcon);
    var className = this.getStatusClass(lev, !totalAnnoyances);
    
    var widget = document.getElementById("noscript-tbb");
    if (widget) {
      widget.setAttribute("tooltiptext", shortMessage);
      this.updateStatusClass(widget, className); 
    }
    
    widget = this.statusIcon;
    widget.setAttribute("tooltiptext", shortMessage);
    this.updateStatusClass(widget, className);
    
    if (notificationNeeded) { // notifications
      const win = window.content;
      if (this.notify) {
        this.notificationShow(message,
          this.getIcon(widget), 
          !(ns.getExpando(win, "messageShown") && this.notifyHidePermanent));
        ns.setExpando(win, "messageShown", true);
      } else {
        this.notificationHide(); 
      }
      if (!ns.getExpando(win, "soundPlayed")) {
        ns.soundNotify(window.content.location.href);
        ns.setExpando(win, "soundPlayed");
      }
    } else {
      this.notificationHide();
      message = shortMessage = "";
    }
    
    widget = document.getElementById("noscript-statusLabelValue");
    widget.setAttribute("value", shortMessage);
    widget.parentNode.style.display = message ? "block" : "none";
  }
,
  notifyHideTimeout: 0
,
  
  initContentWindow: function(window) {
    window.addEventListener("pagehide", this.listeners.onPageHide, true);
  },
  
  cleanupDocument: function(doc, browser) {
    
    if (!(doc.defaultView && doc.defaultView == doc.defaultView.top)) return;
    
    const ns = this.ns;
    browser = browser || ns.domUtils.findBrowserForNode(doc);
    if (browser) {
      ns.setExpando(browser, "pe", null);
      this.notificationHide(browser, true);
    }
  },
  
  prefsObserver: {
    ns: noscriptUtil.service,
    QueryInterface: noscriptUtil.service.generateQI([
        Components.interfaces.nsISupports, 
        Components.interfaces.nsIObserver, 
        Components.interfaces.nsISupportsWeakReference])
  ,
    observe: function(subject, topic, data) {
      if (subject == this.ns.caps) {
         noscriptOverlay.syncUI();
         return;
      }
      switch (data) {
        case "statusIcon": case "statusLabel":
          window.setTimeout(function() {
              var widget =document.getElementById("noscript-" + data);
              if (widget) {
                widget.setAttribute("hidden", !noscriptOverlay.ns.getPref(data))
              }
            }, 0);
         break;
         case "notify":
         case "notify.bottom":
           noscriptOverlay[data.replace(/\.b/, 'B')] = this.ns.getPref(data);
           if(this._registered) noscriptOverlay.notificationHide();
         break;
         case "keys.ui":
         case "keys.toggle":
           noscriptOverlay.shortcutKeys.setup(data.replace(/^keys\./, ""), this.ns.getPref(data, ""));
           break;
         break;
         case "notify.hidePermanent":
         case "notify.hideDelay":
         case "notify.hide":
           noscriptOverlay[data.replace(/\.h/, 'H')] = this.ns.getPref(data);
         break;
      }
    },
    _registered: false,
    register: function() {
      this.ns.prefs.addObserver("", this, true);
      this.ns.caps.addObserver("", this, true);
      const initPrefs = [
        "statusIcon", "statusLabel", 
        "keys.ui", "keys.toggle",
        "notify", "notify.bottom",
        "notify.hide", "notify.hidePermanent", "notify.hideDelay"
        ];
      for (var j = 0; j < initPrefs.length; j++) {
        this.observe(null, null, initPrefs[j]);
      }
      this._registered = true;
    },
    remove: function() {
      this.ns.prefs.removeObserver("", this);
      this.ns.caps.removeObserver("", this);
    }
  },
  
  
  
  
  
  shortcutKeys: {
    
    execute: function(cmd) {
      switch (cmd) {
        case 'toggle':
          noscriptOverlay.toggleCurrentPage(noscriptOverlay.ns.preferredSiteLevel);
          break;
        case 'ui':
           noscriptOverlay.showUI();
           break;
      }
    },
    
    keys: {},
    setup: function(name, values) { 
      values = values.toLowerCase().replace(/^\s*(.*?)\s*$/g, "$1").split(/\s+/);
      var vpos = values.length;
      if (vpos) {
        
        var mods = { shiftKey: false, altKey: false, metaKey: false, ctrlKey: false };
        
        var keyVal = values[--vpos];
        for (var value; vpos-- > 0;) {
          value = values[vpos] + "Key";
          if (value in mods) {
            mods[value] = true;
          }
        }
        
        var key = { modifiers: mods, charCode: 0, keyCode: 0 };
        
        if (keyVal.length > 3) {
          var pos = keyVal.indexOf('.');
          if (pos > 3) {
            key.charCode = keyVal.charCodeAt(pos + 1) || 0;
            keyVal = keyVal.substring(0, pos);
          }
          key.keyCode = KeyEvent["DOM_" + keyVal.toUpperCase()] || 0;
        } else {
          key.charCode = (key.modifiers.shiftKey ? keyVal.toUpperCase() : keyVal).charCodeAt(0) || 0;
        }
        
        this.keys[name] = key;
      } else {
        delete(this.keys[name]);
      }
    },
    listener: function(ev) {
      const binding = arguments.callee.binding;
      const skk = binding.keys;
      var cmd, k, p, sk, mods;
      for (k in skk) {
        cmd = k;
        sk = skk[k];
        
         
        if (ev.charCode && ev.charCode == sk.charCode || ev.keyCode && ev.keyCode == sk.keyCode) {
          mods = sk.modifiers;
          for (p in mods) {
            if (ev[p] != mods[p]) {
              cmd = null;
              break;
            }
          }
          
          
          if (cmd) {
            ev.preventDefault();
            binding.execute(cmd);
            return;
          }
        }
      }
    },
    
    register: function() {
      this.listener.binding = this;
      window.addEventListener("keypress", this.listener, true);
    },
    remove: function() {
      window.removeEventListener("keypress", this.listener, true);
    }
  },
  
  hideObject: function(p, o) {
    if (!p.mimeRx.test(o.type)) return;
    
    var r = p.document.createElement("object");
    r.style.width = o.offsetWidth + "px";
    r.style.height = o.offsetHeight + "px";
    r.style.display = "inline-block";
    o.className += " " + p.className;
    o.parentNode.insertBefore(r, o);
  },
  
  showObject: function(p, o) {
    var cs = o.className;
    cs = cs.replace(p.classRx, '');
    if (cs != o.className) {
      o.className = cs;
      var r = o.previousSibling;
      if (r instanceof HTMLObjectElement) {
        r.parentNode.removeChild(r);
      }
    }
  },
  
  _tags: ["object", "embed"],
  toggleObjectsVisibility: function(d, v) {
    var ns = noscriptOverlay.ns;
    var rx = ns.hideOnUnloadRegExp;
    if (!rx) return;
    var callback = v ? noscriptOverlay.showObject : noscriptOverlay.hideObject;
    var params = {
      document: d,
      mimeRx: rx,
      classRx: noscriptOverlay.ns.hideObjClassNameRx,
      className: ns.hideObjClassName
    };
    var aa = null;
    var j;
    for each(var t in this._tags) {
      var oo = d.getElementsByTagName(t);
      j = oo.length;
      if (j) {
        aa = aa || [oo[--j]];
        while(j-- > 0) {
          aa.push(oo[j]);
        }
      }
    }
    if (aa) {
      for (j = aa.length; j-- > 0;) {
        callback(params, aa[j]);
      }
    }
  },
  
  listeners: {
    
    onBrowserClick: function(ev) { 
      noscriptUtil.service.processBrowserClick(ev);
    },
  
    
    onTabClose: function(ev) {
      try {
        var browser = ev.target.linkedBrowser;
        noscriptOverlay.ns.cleanupBrowser(browser);
        
        var tabbrowser = getBrowser();
        if (tabbrowser._browsers) tabbrowser._browsers = null;
        if (tabbrowser.getNotificationBox) {
          tabbrowser.getNotificationBox(browser).removeAllNotifications(true);
        }
      } catch(e) {}
    },
    
    webProgressListener: {
      QueryInterface: noscriptUtil.service.generateQI([
        Components.interfaces.nsIWebProgressListener]),
      STATE_STOP: Components.interfaces.nsIWebProgressListener.STATE_STOP,
      onLocationChange: function(aWebProgress, aRequest, aLocation) {
        const domWindow = aWebProgress.DOMWindow;
        if (domWindow) {
          noscriptOverlay.syncUI(domWindow);
        }
      },
      onStatusChange: function() {}, 
      onStateChange: function(aWebProgress, aRequest, stateFlags, status) {
        if (stateFlags & this.STATE_STOP) {
          const domWindow = aWebProgress.DOMWindow;
          if (domWindow == domWindow.top) {
            noscriptOverlay.syncUI(domWindow);
          }
        } 
      }, 
      onSecurityChange: function() {}, 
      onProgressChange: function() {}
    },
    
    onContentLoad: function(ev) {

      var doc = ev.originalTarget;
      if (doc instanceof HTMLDocument) {
        var w = doc.defaultView;
        if (w) {
          const ns = noscriptOverlay.ns;
          noscriptOverlay.ns.setExpando(w, "contentLoaded", true);
          if (w == w.top) {
            ns.processMetaRefresh(doc, noscriptOverlay.notifyMetaRefreshCallback);
            if (w == window.content) {
              noscriptOverlay._syncUINow();
            }
          } else {
            noscriptOverlay.syncUI(w.top);
          }
          w.addEventListener("load", noscriptOverlay.listeners.onDocumentLoad, false);
        }
      }
    },
    onDocumentLoad: function(ev) {
      if (ev.originalTarget instanceof HTMLDocument) {
        ev.currentTarget.removeEventListener("load", arguments.callee, false);
        ev.currentTarget.setTimeout(function() {
          noscriptOverlay.ns.detectJSRedirects(this.document);
        }, 0);
      }
    },
    
    onPageShow: function(ev) {
      if (ev.persisted && (ev.target instanceof HTMLDocument)) {
        noscriptOverlay.toggleObjectsVisibility(ev.target, true);
      }
    },
    onPageHide: function(ev) {
      var d = ev.target;
      if (d instanceof HTMLDocument) {
        noscriptOverlay.cleanupDocument(d);
        noscriptOverlay.toggleObjectsVisibility(d, false);
      }
    },
    
    onContextMenu:  function(ev) { noscriptOverlay.prepareContextMenu(ev) },
    
    onLoad: function(ev) {
      window.removeEventListener("load", arguments.callee, false);
      window.addEventListener("unload", noscriptOverlay.listeners.onUnload, false);
      try {
        noscriptOverlay.listeners.setup(); 
        noscriptOverlay.wrapBrowserAccess();
        window.setTimeout(noscriptOverlay.pdfDownloadHack, 0);
      } catch(e) {
        var msg = "[NoScript] Error initializing new window " + e + "\n"; 
        noscriptOverlay.ns.log(msg);
        noscriptOverlay.ns.dump(msg);
      }
    },
    onUnload: function(ev) {
      window.removeEventListener("unload", arguments.callee, false);
      noscriptOverlay.listeners.teardown();
      window.browserDOMWindow = null;
      noscriptOverlay.dispose();
    },
    
    setup: function() {
      
      var context = document.getElementById("contentAreaContextMenu");
      if (!context) return; // not a browser window?
      
      context.addEventListener("popupshowing", this.onContextMenu, false);
     
      var b = getBrowser();
        
      b.addEventListener("click", this.onBrowserClick, true);
     
      const nsIWebProgress = Components.interfaces.nsIWebProgress;
      b.addProgressListener(this.webProgressListener, nsIWebProgress.NOTIFY_STATE_WINDOW | nsIWebProgress.NOTIFY_LOCATION);
  
      if (b.tabContainer) {
        b.tabContainer.addEventListener("TabClose", this.onTabClose, false);
      }
      
      window.addEventListener("DOMContentLoaded", this.onContentLoad, false);
      
      
      window.addEventListener("pageshow", this.onPageShow, true);
      window.addEventListener("pagehide", this.onPageHide, true);

      noscriptOverlay.shortcutKeys.register();
      noscriptOverlay.prefsObserver.register();

      window.setTimeout(noscriptOverlay.firstRunCheck, 10);

    },
    
    
   
    teardown: function() {

      var b = getBrowser();
      if (b) {
        b.removeEventListener("click", this.onBrowserClick, true);
        if (b.tabContainer) {
          b.tabContainer.removeEventListener("TabClose", this.onTabClose, false);
        }
        
        b.removeProgressListener(this.webProgressListener);
      }
      
      window.removeEventListener("pagehide", this.onPageHide, true);
      window.removeEventListener("pageshow", this.onPageShow, true);
      window.removeEventListener("DOMContentLoaded", this.onContentLoad, false);

      noscriptOverlay.prefsObserver.remove();
      noscriptOverlay.shortcutKeys.remove();
      
      document.getElementById("contentAreaContextMenu")
              .removeEventListener("popupshowing", this.onContextMenu, false);
              
    }
    
  }, // END listeners
  
  firstRunCheck: function() {
    var ns = noscriptUtil.service;
    const prevVer = ns.getPref("version", "");
    if (prevVer != ns.VERSION) {
      ns.setPref("version", ns.VERSION);
      if (prevVer && prevVer < "1.1.4.070304") ns.sanitize2ndLevs();
      if (ns.getPref("firstRunRedirection", true)) {
          window.setTimeout(function() {
            const url = "http://noscript.net?ver=" + noscriptUtil.service.VERSION + "&prev=" + prevVer;
            const browser = getBrowser();
            browser.selectedTab = browser.addTab(url, null);
            noscriptUtil.service.savePrefs();
          }, 100);
       }
    }
  },
  
 
  
  wrapBrowserAccess: function() { // called onload
    if (!window.nsBrowserAccess) {
      noscriptOverlay.ns.log("[NoScript] nsBrowserAccess not found?!");
      return;
    }
  
    if (!nsBrowserAccess.prototype.wrappedJSObject) {
      nsBrowserAccess.prototype.__defineGetter__("wrappedJSObject", noscriptOverlay.browserAccess.self);
    }
    
    if (!(window.browserDOMWindow && browserDOMWindow.wrappedJSObject && (browserDOMWindow.wrappedJSObject instanceof nsBrowserAccess))) {
      if (!'retryCount' in arguments.callee) {
        arguments.callee.retryCount = 10;
      } else if (arguments.callee.retryCount) {
        noscriptOverlay.ns.log("[NoScript] browserDOMWindow not found or not set up, retrying " + arguments.callee.retryCount + " times");
        arguments.callee.retryCount--;
      }
      window.setTimeout(arguments.callee, 0);
      return;
    }
    
    browserDOMWindow.wrappedJSObject.openURI = noscriptOverlay.browserAccess.openURI;
    
    if(noscriptOverlay.ns.consoleDump) 
      noscriptOverlay.ns.dump("[NoScript] browserDOMWindow wrapped for external load interception");
  },
  
  browserAccess: {
    self: function() { return this; },
    openURI: function(aURI, aOpener, aWhere, aContext) {
      const ns = noscriptUtil.service;

      var external = aContext == Components.interfaces.nsIBrowserDOMWindow.OPEN_EXTERNAL && aURI;
      if (external) {
        if (aURI.schemeIs("http") || aURI.schemeIs("https")) {
           // remember for filter processing
           ns.requestWatchdog.externalLoad = aURI.spec;
        } else {
           // don't let the external protocol open dangerous URIs
           if (aURI.schemeIs("javascript") || aURI.schemeIs("data")) {
             var err = "[NoScript] external non-http load blocked: " + aURI.spec;
             ns.log(err);
             throw err;
           }
        }
      }
      
      if (aURI && ns.extraCapturedProtocols && ns.extraCapturedProtocols.indexOf(aURI.scheme) > -1) {
        return aOpener || window.content;
      }
      
      var w = null;
      try {
        w = nsBrowserAccess.prototype.openURI.apply(this, arguments);
        if (external && ns.consoleDump) ns.dump("[NoScript] external load intercepted");
      } finally {
        if (external && !w) ns.requestWatchdog.externalLoad = null;
      }
      return w;
    }
  },
  
  pdfDownloadHack: function() {
    if (typeof(mouseClick) != "function") return;
    var tb = getBrowser();
    tb.removeEventListener("click", mouseClick, true);
    tb.addEventListener("click", mouseClick, false);
  },
  
  install: function() {
    // this.ns.dump("*** OVERLAY INSTALL ***\n");
    this.ns.setPref("badInstall", false);
    this.ns.domUtils._winType = document.documentElement.getAttribute("windowtype");
    window.addEventListener("load", this.listeners.onLoad, false);
  },

  dispose: function() {

    for (var bb = getBrowser().browsers, j = bb.length; j-- > 0;) {
      try {
        this.cleanupDocument(bb[j].contentWindow.document, bb);
      } catch(e) {
        this.ns.dump(e);
      }
      this.ns.cleanupBrowser(bb[j]);
    }
    // this.ns.dump("*** OVERLAY DISPOSE ***\n");
  }
} : {
  install: function() {
    window.addEventListener("load", function(ev) {
      ev.currentTarget.removeEventListener("load", arguments.callee, false); 
      var node = null;
      for each(var id in ["noscript-context-menu", "noscript-tbb", "noscript-statusIcon"]) {
        node = document.getElementById(id);
        if (node) node.hidden = true;
      }
      node = null;
      var prefs = this.prefService = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefService).getBranch("noscript.");
      try {
        if (prefs.getBoolPref("badInstall")) return;
      } catch(e) {}
      prefs.setBoolPref("badInstall", true);
      prefs = null;
      window.setTimeout(function() {
        alert("NoScript is not properly installed and cannot operate correctly.\n" + 
              "Please install it again and check the Install FAQ section on http://noscript.net/faq if this problem persists.");
        gBrowser.selectedTab = gBrowser.addTab("http://noscript.net/faq#faqsec2", null);
      },10);
    }, false);
  }
}
noscriptOverlay.install();

