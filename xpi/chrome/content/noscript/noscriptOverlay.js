var noscriptOverlay = (function() {

var $ = function(id) { return document.getElementById(id) };
const CC = Components.classes;
const CI = Components.interfaces;


return noscriptUtil.service ? {

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
    return this.ns.getSites(this.currentBrowser);
  },
  
  get prompter() {
    delete this.prompter;
    return this.prompter = noscriptUtil.prompter;
  },
  
  openPopup: function(popup, anchor) {
    popup.openPopup(anchor);
  },
  onContextMenu: function(ev) {
    var parent = ev.currentTarget;
    var popup = parent.firstChild;
    if (!(popup && popup.openPopup)) return;
    if (this.stickyUI) {
      popup._context = true;
    }
    ev.preventDefault();
    noscriptOverlay.openPopup(popup, parent);
  },
  
  onMenuShowing: function(ev, noSticky) {
    
    var popup = ev.currentTarget;
  
    if (popup != ev.originalTarget) return;
   
    var stickyUI = this.stickyUI;
    
    if (stickyUI) {
      popup.setAttribute("sticky", !noSticky &&
       (popup == stickyUI ||
        !popup._context && this.useStickyUI));
      
      popup._context =  false;
    } else {
      popup.removeAttribute("sticky");
    }
    
    if (!popup.hasAttribute("onclick")) {
      popup.setAttribute("onclick", "noscriptOverlay.onCommandClick(event)");
    }
    
    popup.addEventListener("popuphidden", function(ev) { noscriptOverlay.onMenuHidden(ev) }, false);
    popup.addEventListener("popupshown", noscriptOverlay.onMenuShown, false);
    
    this.prepareMenu(popup);
  },
  
  onUIOver: function(ev) {
    let parent = ev.currentTarget;
    let popup = parent.firstChild || !this.installPopups() && parent.firstChild;
    
    if (!(popup && popup.openPopup) ||
        ("_hovering" in popup) && popup._hovering ||
        !this.hoverUI)
      return;
   
    if (popup.state !== "open") {
      popup._context = false;
      popup._hovering = 1;
      parent._lastMoved = 0;
      const delayStop = this.ns.getPref("hoverUI.delayStop");
      let delay = Math.max(this.ns.getPref("hoverUI.delayEnter"), delayStop);
      if (delay > 0) {
        window.setTimeout(function() {
          if (!popup._hovering) return;
          if (parent._lastMoved && (Date.now() - parent._lastMoved) > delayStop) {
            noscriptOverlay.openPopup(popup, parent);
          } else if (delayStop > 0) {
            window.setTimeout(arguments.callee, delayStop);
          }
        }, delay);
      } else {
        this.openPopup(popup, parent);
      }
    } else {
      popup._hovering = 2;
    }
  },
  
  onUIMove: function(ev) {
    let parent = ev.currentTarget;
    let rect = parent.getBoundingClientRect();
    let x = ev.clientX, y = ev.clientY; 
    parent._lastMoved =
      (x > rect.left + 1 && x < rect.right - 1 &&
       y > rect.top + 1 && y < rect.bottom - 1)
      ? Date.now() : 0;
  },
  
  _uiOutTimeout: 0,
  onUIOut: function(ev) {
    let parent = ev.currentTarget;
    let popup = parent.firstChild;
    
    parent._lastMoved = 0;
    
    if (!("_hovering" in popup && popup._hovering && popup._hovering !== -1))
      return;
    
    let related = ev.relatedTarget;
    if (related) {
      for (let node = related; node; node = node.parentNode) 
        if (node == parent) return;
    }
    
    if (this._uiOutTimeout) window.clearTimeout(this._uiOutTimeout);
    this._uiOutTimeout = window.setTimeout(function() {
        if (!popup._hovering) {
          switch(popup.state) {
            case "open":
            case "showing":
              popup.hidePopup();
              break;
          }
        }
      },
      this.ns.getPref("hoverUI.delayExit" +
        (popup._hovering == 1
          ? "1"
          : "2"
        ), 250)
    );

    ev.currentTarget.removeEventListener(ev.type, arguments.callee, false);
    popup._hovering = 0;
  },
  
  onUICommand: function(ev) {
    if (ev.currentTarget !== ev.target) return;
    
    if (!(this.hoverUI && this.ns.getPref("hoverUI.excludeToggling")) &&
      this.toggleCurrentPage())
      ev.preventDefault();
  },
  
  onUIUp: function(ev) {
    let tb = ev.currentTarget;
    if (tb !== ev.target) return;
   
    if (tb.id === "noscript-tbb" &&
        (tb.type !== "menu-button" || ev.originalTarget.tagName == "xul:toolbarbutton") && 
        ev.button === 0 &&
        !(this.hoverUI && this.ns.getPref("hoverUI.excludeToggling")) &&
         this.toggleCurrentPage()
        ) {
      // discriminate dropdown button from main click area
      ev.preventDefault();
      return;
    }
   
    if (ev.button === 1) {
      this.allowPage();
      ev.preventDefault();
      return;
    }
    
    let popup = tb.firstChild || !this.installPopups() && tb.firstChild;
    if ("_hovering" in popup && popup._hovering === 1 || // reopen if still hovering the icon
        this.hoverUI && !this.isOpenOrJustClosed(popup)) {
      popup._hovering = -1;
      if (ev.button !== 2) this.openPopup(popup, tb);
    } 
  },
  
  
  onCommandClick: function(ev) {
    if (!(ev.button == 1 || ev.button == 0 && ev.shiftKey)) return;
    
    if (noscriptUtil.openInfo(ev.target.getAttribute("statustext"))) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.currentTarget.hidePopup();
    }

  },
  
  onMenuShown: function(ev) {
    let popup = ev.currentTarget;
    popup.removeEventListener(ev.type, arguments.callee, false);
    if (/^before_/.test(popup.position)) {
      let scroller = popup.ownerDocument.getAnonymousElementByAttribute(popup, "class", "popup-internal-box");
      scroller.scrollPosition = popup.scrollHeight; // scroll to bottom
    }
  },
  
  _reloadDirty: false,
  
  isOpenOrJustClosed: function(popup) {
    return popup.state && popup.state == "open" ||
      this._currentPopup == popup ||
      (new Date() - (popup._lastClosed || 0)) < 300;
  },
  
  onMenuHidden: function(ev) {
    var popup = ev.currentTarget;
    if (ev.originalTarget != popup) return;
    
    popup.removeEventListener(ev.type, arguments.callee, false);
    
    if ("_hovering" in popup && popup._hovering !== 1)
      popup._hovering = 0;
    
    if (this._reloadDirty && !this.liveReload) {
      this.ns.reloadWhereNeeded();
      this.ns.savePrefs();
    }
    
    if (popup.id === "noscript-tbb-popup") {
      // take back our stuff
      this._currentPopup = null;
      noscriptOverlay.prepareMenu($("noscript-status-popup"));
    }
    popup._lastClosed = Date.now();
    this._reloadDirty = false;
    this._currentPopup = null;
  },

  prepareContextMenu: function(ev) {
    var menu = $("noscript-context-menu");
    if (this.ns.getPref("ctxMenu", true)) {
      menu.removeAttribute("hidden");
    } else {
      menu.setAttribute("hidden", "true");
      return;
    }
    this.updateStatusClass(menu);
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
    var ref = $("noscript-mi-xss-unsafe-reload");
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
  
  
  
  getSiteTooltip: function(enabled, full) {
    const info = this.getString("siteInfo.tooltip");
    const sep = "\n";
    const no = this.getString("allowed.no");
    const noFull = no + sep + info;
    const yes = this.getString("allowed.yes");
    const yesFull = yes + sep + info;
    return (this.getSiteTooltip = function(enabled, full) {
      return enabled ? full && yesFull || yes : full && noFull || no;
    })(enabled, full);
  },
  
  getRevokeTooltip: function(tempSites) {
    const ns = this.ns;
    const sep = "\n\n";
     
    // remove http/https/file CAPS hack entries
    var tip = "<SCRIPT>: ";
    if (tempSites) {
      tempSites = this.ns.siteUtils.sanitizeString(tempSites.replace(/\b(?:https?|file):\/\//g, "")).split(/\s+/);
      tip += tempSites.join(", ");
    } else tip += "0";
    
    var len = ns.objectWhitelistLen;
    if (len) tip += sep + "<OBJECT>: " + len;
    
    len = ns.clearClickHandler && ns.clearClickHandler.whitelistLen;
    if (len) tip += sep + "ClearClick: " + len;
    
    return tip;
  },
  
  
  initPopups: function(install) {
    const sticky = this.stickyUI; // early init
    
    const popup = $("noscript-status-popup");
    if (!popup) return; // Fennec?
    
    const tbb = $("noscript-tbb");
    if (tbb) {
      tbb.setAttribute("type", this.hoverUI ? "button" : this.ns.getPref("toolbarToggle") ? "menu-button" : "menu");
    }
    
    const buttons = [tbb, $("noscript-statusLabel")];
    let statusIcon = $("noscript-statusIcon");
    if ($("addon-bar")) {
      // Fx 4 or above
      if (install) {  
        window.addEventListener("aftercustomization", function(ev) {
          noscriptOverlay.initPopups();
        }, false);
      }
      
      if (statusIcon) statusIcon.parentNode.removeChild(statusIcon);
    } else {
      // Fx 3.6.x or below
      if (install) {  
        let btcd = window.BrowserToolboxCustomizeDone;
        if (btcd) window.BrowserToolboxCustomizeDone = function(done) {
          btcd(done);
          if (done) noscriptOverlay.initPopups();
        }
      }
      
      buttons.push(statusIcon);
    }
    // copy status bar menus
    for each(let button in buttons) {
      if (!button) continue;
      let localPopup = button.firstChild;
      if (!(localPopup && /popup/.test(localPopup.tagName))) {
        localPopup = popup.cloneNode(true);
        localPopup.id  = button.id + "-popup";
        button.insertBefore(localPopup, button.firstChild);
        if (!sticky) localPopup._context = true;
      }
      localPopup.position = /^(?:addon|status)-bar$/.test(button.parentNode.id)
        ? "before_start"
        : "after_start";
    }
  },
  
  
 
  _currentPopup: null,
  
  prepareMenu: function(popup, sites) {
    let mustReverse;
    
    if (popup.id === "noscript-tbb-popup") {
      mustReverse = popup.position === "after_start";
      if (/\bnoscript-(?:about|options)\b/.test(popup.lastChild.className)) {
      // already reversed: we need it straight to populate
        this.reverse(popup);
      }
    } else mustReverse = false;

    const ns = this.ns;
    const sticky = popup.getAttribute("sticky") == "true";
    
    popup.removeAttribute("disabled");
    
    if (this._currentPopup && this._currentPopup != popup) {
      this._currentPopup.hidePopup();
    }
    this._currentPopup = popup;
    
    
    
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
      miGlobal.setAttribute("oncommand", "noscriptOverlay.menuCmd(event)");
      miGlobal.setAttribute("tooltiptext", this.statusIcon.getAttribute("tooltiptext"));
      miGlobal.setAttribute("class", "menuitem-iconic noscript-glb " + (global ? "noscript-forbid" : "noscript-allow"));
    } else {
      miGlobal.hidden = seps.global.hidden = true;
    }
    
    node = miGlobal.nextSibling;
    const mainMenu = node.parentNode;

    var tempMenuItem = $("noscript-revoke-temp-mi");
    if (node != tempMenuItem) {
      node = mainMenu.insertBefore(tempMenuItem, node);
    }
    
    var tempSites = ns.gTempSites.sitesString;
    tempSites = tempSites && (tempSites + " " + ns.tempSites.sitesString).replace(/\s+$/g, '') || ns.tempSites.sitesString;

    if ((tempSites || ns.objectWhitelistLen || ns.clearClickHandler && ns.clearClickHandler.whitelistLen) && ns.getPref("showRevokeTemp", true)) {
      node.hidden = seps.global.hidden = false;
      node.setAttribute("tooltiptext", this.getRevokeTooltip(tempSites));
    } else {
      node.hidden = true;
    }
    node = node.nextSibling;
    
    tempMenuItem = $("noscript-temp-allow-page-mi");
    if (node != tempMenuItem) {
      mainMenu.insertBefore(tempMenuItem, node)
    } else {
      node = node.nextSibling;
    }
    
    var xssMenu = $("noscript-xss-menu");
    
    if (xssMenu && node != xssMenu) {
      mainMenu.insertBefore(xssMenu, node);
    }
    this.populateXssMenu(xssMenu.firstChild);
    this.syncXssWidget(xssMenu);
    

    this.prepareOptItems(popup);
      
    var untrustedMenu = null,
        recentMenu = null,
        pluginsMenu = null;

    if (seps.untrusted) {
      
      pluginsMenu = $("noscript-menu-blocked-objects");
      recentMenu = $("noscript-menu-recent-blocked");
      untrustedMenu = $("noscript-menu-untrusted");
      // cleanup untrustedCount display
      untrustedMenu.setAttribute("label", untrustedMenu.getAttribute("label").replace(/ \(\d+\)$/, ""));
      
      with (seps.untrusted) {
        if ((extraNode = nextSibling) != pluginsMenu) {
          for each(node in [pluginsMenu, recentMenu, untrustedMenu]) {
            parentNode.insertBefore(node, extraNode);
          }
        }
      }
      
      this.populateExternalFilters(pluginsMenu);
      
      extraNode = $("noscript-mi-recent-blocked-reset"); // save reset command
      // descend from menus to popups and clear children
      for each(node in [pluginsMenu = pluginsMenu.firstChild, recentMenu = recentMenu.firstChild, untrustedMenu = untrustedMenu.firstChild])
        while(node.firstChild) node.removeChild(node.firstChild);
      
      recentMenu.appendChild(extraNode);
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

    sites = sites || this.getSites();
    
    const topSite = sites.topSite;
    
    j = sites.indexOf(topSite);
    var topDown = !/-sep-stop\b/.test(mainMenu.lastChild.className); 
    if (j > -1 && j != (topDown ? sites.length - 1 : 0)) {
      sites.splice(j, 1);
      if (topDown) sites.push(topSite);
      else sites.unshift(topSite);
    }
    
    
    try {
      this.populatePluginsMenu(mainMenu, pluginsMenu, sites.pluginExtras);
    } catch(e) {
      if(ns.consoleDump) ns.dump("Error populating plugins menu: " + e);
    }
    
    const jsPSs = ns.jsPolicySites;
    var site, enabled, isTop, lev;

    var matchingSite;
    var menuGroups, menuSites, menuSite, scount;
    var domain, pos, baseLen;
    var untrusted;
    var cssClass;

    const dupeChecker = {
      sites: {},
      check: function(s) (s in this.sites) || (this.sites[s] = false)
    };
    
    const locked = ns.locked;
    const addressOnly = locked;
    const showAddress = addressOnly || ns.getPref("showAddress", false);;
    const showDomain = !addressOnly && ns.getPref("showDomain", false);
    const showBase = !addressOnly && ns.getPref("showBaseDomain", true);
    const showUntrusted = ns.getPref("showUntrusted", true);
    const showDistrust = ns.getPref("showDistrust", true);
    const showNothing = !(showAddress || showDomain || showBase || showUntrusted);
    const showPermanent = ns.getPref("showPermanent", true);
    const showTemp = !locked && ns.getPref("showTemp", true);
    
    var parent = null, extraNode = null;
    var untrustedCount = 0, unknownCount = 0, tempCount = 0;
    const untrustedSites = ns.untrustedSites;
    var docJSBlocked = false;
    
    const ignorePorts = ns.ignorePorts;
    const portRx = /:\d+$/;
    
    const hideUntrustedPlaceholder = !ns.showUntrustedPlaceholder;
    var embedOnlySites = null;
    if (ns.contentBlocker && !ns.alwaysShowObjectSources &&
        sites.pluginSites.length) {
      // add untrusted plugin sites if placeholders are not shown for untrusted sources
      embedOnlySites = sites.pluginSites.filter(function(s) {
        return sites.indexOf(s) === -1;
      });
      sites.push.apply(sites, embedOnlySites);
    }
    
    menuGroups = [];
    for (j = 0; j < sites.length; j++) {
      site = sites[j];
      
      matchingSite = jsPSs.matches(site);
      untrusted = untrustedSites.matches(site);
      let hasPort = portRx.test(site);
      
      isTop = site == topSite;
      
      if (untrusted) {
        matchingSite = null;
      } else if (!matchingSite) {
        
        if (ignorePorts && hasPort) {
          matchingSite =  jsPSs.matches(site.replace(portRx, ''));
          if (matchingSite) {
            site = matchingSite;
            hasPort = false;
          }
        }
        
        if (blockUntrusted)
          matchingSite = site;
      }
      

      enabled = !!matchingSite;
      
      let showInMain = embedOnlySites
        ? embedOnlySites.indexOf(site) === -1 || hideUntrustedPlaceholder && enabled : true;
      
      docJSBlocked = enabled && isTop && !ns.dom.getDocShellForWindow(content).allowJavascript;
      if (docJSBlocked) enabled = false;
      
      if (enabled && !global || (matchingSite = untrusted)) {
        if (ignorePorts && hasPort) {
          site = jsPSs.matches(site.replace(portRx, ''));
          if (site) matchingSite = site;
        }
        if (dupeChecker.check(matchingSite)) continue;
        menuSites = [matchingSite];
        
      } else {
        domain = !ns.isForbiddenByHttpsStatus(site) && ns.getDomain(site);
        let dp = ns.getPublicSuffix(domain);
        
        if (dp == domain || // exclude TLDs
            ns.isJSEnabled(domain) != enabled || // exclude ancestors with different permissions
            hasPort && !ignorePorts // or any ancestor if this is a non-standard port
          ) {
          domain = null; 
        }
        
        
        if (hasPort && ignorePorts) {
          site = site.replace(portRx, '');
          if (jsPSs.matches(site))
            continue;
        }
        
        if (dupeChecker.check(site)) continue;
        
        menuSites = (showAddress || showNothing || !domain) ? [site] : [];
        
        if (domain && (showDomain || showBase)) {
          baseLen = domain.length;
          if (dp) 
            baseLen -= (domain.lastIndexOf(".", baseLen - dp.length - 2) + 1); 
          if (baseLen == domain.length) {
            // IP or 2nd level domain
            if (!dupeChecker.check(domain)) {
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
              if (!dupeChecker.check(dp)) {
                menuSites.push(dp);
              }
              if (baseLen == dp.length) break;
            }
          }
        }  
      }
      menuSites.isTop = isTop;
      menuSites.showInMain = showInMain;
      menuSites.enabled = enabled;
      menuGroups.push(menuSites);
    }
    
    
    var blurred;

    const untrustedFrag = showUntrusted ? document.createDocumentFragment() : null;
    const mainFrag = document.createDocumentFragment();
    const sep = document.createElement("menuseparator");
    
    j = menuGroups.length;
    
    var refMI = document.createElement("menuitem");
    refMI.setAttribute("oncommand", "noscriptOverlay.menuCmd(event)");
    if (sticky && (this.liveReload || j > 1 || enabled)) {
      refMI.setAttribute("closemenu", "none");
    }
    
    recentMenu.parentNode.hidden = true;
    if (recentMenu && ns.getPref("showRecentlyBlocked")) {
      let level = ns.getPref("recentlyBlockedLevel") || ns.preferredSiteLevel;
      let max = ns.getPref("recentlyBlockedCount");
      let dejaVu = [],
          count = 0,
          recent = ns.recentlyBlocked,
          current = false;
      
      let tooltip = noscriptOverlay.getSiteTooltip(false, !!ns.getPref("siteInfoProvider"));
      
      for (let j = recent.length; j-- > 0;) {
        
        let r = recent[j];
        let s = r.site;
        
        if (!s || sites.indexOf(s) > -1) continue;
        
        let jsEnabled = ns.isJSEnabled(s);
        
        if (jsEnabled && (!ns.contentBlocker || ns.isAllowedObject("!", "*", s)))
          continue;
        
        s = ns.getQuickSite(s, level);
        if (dejaVu.indexOf(s) > -1)
          continue;
        
        dejaVu.push(s);

        recentMenu.appendChild(sep.cloneNode(false));
        
        let node = refMI.cloneNode(false);
        let cssClass = "noscript-cmd menuitem-iconic noscript-allow-from";
        
        node.setAttribute("tooltiptext", tooltip);
        node.setAttribute("statustext", s);
        if (locked || ns.isForbiddenByHttpsStatus(s)) node.setAttribute("disabled", "true");
        
        if (r.origins.indexOf(topSite) > -1) {
          cssClass += " noscript-toplevel";
          current = true;
        }
        
        if (jsEnabled) {
          cssClass += " noscript-embed";
        } else {
          node.setAttribute("class", cssClass);
          node.setAttribute("label", ns.getString("allowFrom", [s]));
          recentMenu.appendChild(node);
          node = node.cloneNode(false);
        } 
        
        node.setAttribute("class", cssClass + " noscript-temp");
        node.setAttribute("label", ns.getString("allowTempFrom", [s]));
        recentMenu.appendChild(node);
        
        if (++count >= max) break;
      }
      if (count) {
        let menuItem = recentMenu.parentNode;
        menuItem.hidden = false;
        ns.dom.toggleClass(menuItem, "noscript-toplevel", current);
      }
    }
    
    if (j > 0 && seps.stop.previousSibling.nodeName != "menuseparator")
      mainFrag.appendChild(sep.cloneNode(false));
    
    var fullTip = !!ns.getPref("siteInfoProvider");
    var disabled;
    
    
    while (j-- > 0) {
      
      menuSites = menuGroups[j];
      isTop = menuSites.isTop;
      enabled = menuSites.enabled;
      let showInMain = menuSites.showInMain;
      
      if (untrustedFrag && untrustedFrag.firstChild) {
        untrustedFrag.appendChild(sep.cloneNode(false));
      }
      
      scount = menuSites.length;
      if (scount > 0 && mainFrag.lastChild && mainFrag.lastChild.tagName != "menuseparator")
        mainFrag.appendChild(sep.cloneNode(false));
        
      while (scount-- > 0) {
        menuSite = menuSites[scount];
        
        untrusted = !enabled && (blockUntrusted || ns.isUntrusted(menuSite));
        if (untrusted) {
          untrustedCount++;
          showInMain = true;
        }
        else if (!enabled)
          unknownCount++;
        
        parent = (untrusted && showUntrusted) ? untrustedFrag : mainFrag;
        if (!parent) continue;
                
        domain = isTop && docJSBlocked ? "[ " + menuSite + " ]" : menuSite;
        
        node = refMI.cloneNode(false);
        if (isTop) {
          cssClass = "noscript-toplevel noscript-cmd";
          // can we make it default here?
        }
        else cssClass = "noscript-cmd";
        
        
        blurred = false;
        disabled = locked || (enabled ? ns.isMandatory(menuSite) : blurred = ns.isForbiddenByHttpsStatus(menuSite));
        if (disabled) {
          node.setAttribute("disabled", "true");
        } else {
          cssClass += " menuitem-iconic ";
          if (enabled && ns.isTemp(menuSite)) {
            cssClass += " noscript-temp";
            tempCount++;
          }
        }
         
        
        node.setAttribute("label", this.getString((enabled ? "forbidLocal" : "allowLocal"), [domain]));
        node.setAttribute("statustext", menuSite);
        node.setAttribute("tooltiptext", this.getSiteTooltip(enabled, fullTip));
    
        node.setAttribute("class", cssClass + (enabled ? " noscript-forbid" : " noscript-allow"));
        
        if ((showPermanent || enabled) && !(global && enabled) && showInMain) 
          parent.appendChild(node);
      
        if (!disabled) {
          if (showTemp && !(enabled || blurred) && showInMain) {
            extraNode = node.cloneNode(false);
            extraNode.setAttribute("label", this.getString("allowTemp", [domain]));
            extraNode.setAttribute("class", cssClass + " noscript-temp noscript-allow");
            parent.appendChild(extraNode);
          }
          if (((showUntrusted && untrustedMenu || showDistrust) && !(domain in jsPSs.sitesMap) ||
                blockUntrusted && (showUntrusted || showDistrust)
                ) && !untrusted) {
            parent = (showUntrusted && !blockUntrusted ? untrustedFrag : mainFrag);
            
            extraNode = refMI.cloneNode(false);
            extraNode.setAttribute("label", this.getString("distrust", [menuSite]));
            extraNode.setAttribute("statustext", menuSite);
            extraNode.setAttribute("class", cssClass + " noscript-distrust");
            extraNode.setAttribute("tooltiptext", node.getAttribute("tooltiptext"));
            parent.appendChild(extraNode);
          }
        }
      }
    }
    if (untrustedFrag && untrustedFrag.firstChild) {
      if (untrustedCount > 0) 
        with (untrustedMenu.parentNode)
          setAttribute("label", getAttribute("label") +
            " (" + untrustedCount + ")"); // see above for cleanup
          
      untrustedMenu.appendChild(untrustedFrag);
    }

    mainMenu.appendCmd(mainFrag);
    
    // temp allow all this page
    if (!(tempMenuItem.hidden = !(unknownCount && ns.getPref("showTempAllowPage", true)))) {
      tempMenuItem.setAttribute("tooltiptext", this.allowPage(false, true, sites).join(", "));
    }

    
    // allow all this page
    node = $("noscript-allow-page-mi");
    if (node.nextSibling != tempMenuItem) {
      tempMenuItem.parentNode.insertBefore(node, tempMenuItem);
    }
    if (!(node.hidden = unknownCount == 0 || !ns.getPref("showAllowPage", true))) {
      node.setAttribute("tooltiptext", this.allowPage(true, true, sites).join(", "));
    }
    
    // make permanent
    node = $("noscript-temp2perm-mi");
    if (tempMenuItem.nextSibling != node) {
      tempMenuItem.parentNode.insertBefore(node, tempMenuItem.nextSibling);
    }
    if (!(node.hidden = tempCount == 0 || !ns.getPref("showTempToPerm"))) {
      node.setAttribute("tooltiptext", this.tempToPerm(true, sites).join(", "));
    }

    this.normalizeMenu(untrustedMenu, true);
    this.normalizeMenu(mainMenu, false);
    
    if (mustReverse) this.reverse(popup);
  },

  reverse: function(m) {
    var a = [];
    var mi;
    while((mi = m.lastChild)) {
      a.push(m.removeChild(mi));
    }
    for each(mi in a) {
      m.appendChild(mi);
    }
  },
  
 
  
  populateExternalFilters: function(anchor) {
    const ns = this.ns;
    const externalFilters = ns.externalFilters;
    
    var parent = anchor.parentNode;
    Array.slice(parent.getElementsByClassName("noscript-ef"), 0)
      .forEach(function(node) { parent.removeChild(node); });
    
    if (!(externalFilters.enabled && ns.getPref("showExternalFilters"))) return;
    
    var menus = {};
    var domains = [];
    var filterNames = [];
    var info = externalFilters.getFiltersInfo(content);
    var f, menu, domain, whitelisted, item;
    
    for (var url in info) {
      domain = ns.getBaseDomain(ns.getDomain(url));
      if (domains.indexOf(domain) !== -1) continue;
      domains.push(domain);
      
      f = info[url];
      if (f.name in menus) {
        menu = menus[f.name];
      } else {
        menu = menus[f.name] = { active: false, filter: f, items: [] };
        filterNames.push(f.name);
      }
      
      item = { domain: domain };
      
      whitelisted = f.whitelist && f.whitelist.test("https://" + domain);
      
      item.disabled = whitelisted &&
        !f.isDomainException(domain); // we cannot reliably un-whitelist custom rules
      
      if ((item.active = !whitelisted)) menu.active = true;
      
      menu.items.push(item);
    }
    
    if (!domains.length) return;
      
    filterNames.sort();
    
    var df = document.createDocumentFragment();
    var node;
    for each(var filterName in filterNames) {
      menu = menus[filterName];
      menu.items.sort(function(a, b) { return a.domain > b.domain ? 1 : a.domain < b.domain ? -1 : 0; })
      node = df.appendChild(document.createElement("menu"));
      node.setAttribute("label", filterName);
      node.setAttribute("class", "menu-iconic noscript-ef" + (menu.active ? '' : ' inactive'));
      
      parent = node.appendChild(document.createElement("menupopup"));
      parent.__ef__ = menu.filter;
      for each(item in menu.items) {
        node = parent.appendChild(document.createElement("menuitem"));
        node.setAttribute("label", ns.getString("ef.activate", [item.domain]));
        node.setAttribute("type", "checkbox");
        node.setAttribute("statustext", item.domain);
        node.setAttribute("oncommand", "noscriptOverlay.onFilterSwitch(event)");
        if (item.active)
          node.setAttribute("checked", "true");
         if (item.disabled)
          node.setAttribute("disabled", "true");
      }
      
      parent.appendChild(document.createElement("menuseparator"));
      node = parent.appendChild(document.createElement("menuitem"));
      node.setAttribute("label", ns.getString("ef.options", [filterName]));
      node.setAttribute("statustext", filterName);
      node.setAttribute("oncommand", "noscriptUtil.openEFOptions(this)");
    }
    
    anchor.parentNode.insertBefore(df, anchor);
  },
  
  onFilterSwitch: function(ev) {
    const ns = this.ns;
    var node = ev.target;
    var enabled = node.getAttribute("checked") == "true";
    var f = node.parentNode.__ef__;
    if (!f) return;
    var domain = node.getAttribute("statustext");
    ns.switchExternalFilter(f.name, domain, enabled);
  },
  
  populatePluginsMenu: function(mainMenu, menu, extras) {
    if (!menu) return;

    menu.parentNode.hidden = true;
    const ns = this.ns;
  
    if (!(extras && ns.getPref("showBlockedObjects")))
      return;
  
    var pluginExtras = [],
        seen = [];
    var i = 0;
    for each(let egroup in extras) {
      for (let j = egroup.length; j-- > 0;) {
        let e = egroup[j];
        
        if (ns.isAllowedObject(e.url, e.mime, e.originSite) && !e.placeholder ||
            typeof(e) != "object" || (e.tag && !e.placeholder)
          )
          continue;
        
        let key = e.mime + "@" + ns.objectKey(e.url, e.originSite);
        if (seen.indexOf(key) > -1) continue;
        
        seen.push(key);
        
        let node = document.createElement("menuitem");
        
        e.label = e.label || ((/<I?FRAME>/.test(e.tag) ? e.tag : ns.mimeEssentials(e.mime)) + "@" + ns.urlEssentials(e.url));
        e.title = e.title || e.label.split("@")[0] + "@" + e.url + "\n(" + e.originSite + ")";
 
        node.setAttribute("label", this.getString("allowTemp", [e.label]));
        node.setAttribute("tooltiptext", e.title);
        node.setAttribute("oncommand", "noscriptOverlay.allowObject(" + i + ")");
        node.setAttribute("class", "menuitem-iconic noscript-cmd noscript-temp noscript-allow");
        node.style.listStyleImage = ns.cssMimeIcon(e.mime, 16);
        menu.appendChild(node);
        pluginExtras[i++] = e;
      }
    }
    
    if (pluginExtras.length) {
      noscriptOverlay.menuPluginExtras = pluginExtras;
      mainMenu.addEventListener("popuphidden", function(ev) {
          if (ev.currentTarget != ev.target) return;
          ev.currentTarget.removeEventListener(ev.type, arguments.callee, false);
          noscriptOverlay.menuPluginExtras = null;
          noscriptOverlay.menuPluginSites = null;
      }, false);
      
      let pluginSites = {};
      seen = [];
      for each(let e in pluginExtras) {
        if(!(e.site && e.mime) || ns.isAllowedObject(e.site, e.mime, e.site, e.originSite))
          continue;
        let objectKey = ns.objectKey(e.site, e.originSite);
        let key = e.mime + "@" + objectKey;
        if (seen.indexOf(key) !== -1) continue;
        
        if (seen.indexOf(objectKey) === -1) {
          if (!(e.site in pluginSites)) {
            pluginSites[e.site] = [{mime: "*", site: e.site}];
          }
          pluginSites[e.site].push({mime: "*", site: e.site, originSite: e.originSite});
          seen.push(objectKey);
        }
        pluginSites[e.site].push(e, {mime: e.mime, site: e.site});
        seen.push(key);
      }
      if (seen.length) {
        noscriptOverlay.menuPluginSites = [];
        i = 0;
        for (let site in pluginSites) {
          menu.appendChild(document.createElement("menuseparator"));
          for each(let e in pluginSites[site]) {
            let where = e.site;
            if (e.originSite) where += " (" + e.originSite + ")";
            let mime = e.mime;
            
            node = document.createElement("menuitem");
            node.setAttribute("label", this.getString("allowTemp", [ns.mimeEssentials(mime) + "@" + where]));
            node.setAttribute("tooltiptext", mime + "@" + where);
            node.setAttribute("oncommand", "noscriptOverlay.allowObjectSite(" + i + ")");
            node.setAttribute("class", "menuitem-iconic noscript-temp noscript-cmd noscript-allow");
            if(mime != "*")
              node.style.listStyleImage = node.style.listStyleImage = ns.cssMimeIcon(mime, 16);

            menu.appendChild(node);
            noscriptOverlay.menuPluginSites[i++] = e;
          }
        }
      }
      menu.parentNode.hidden = false;
    }
  },
  
  allowPage: function(permanent, justTell, sites) {
    const ns = this.ns;
    sites = sites || this.getSites();
    const unknown = [];
    const level = ns.getPref("allowPageLevel", 0) || ns.preferredSiteLevel;
    const trusted = ns.jsPolicySites;
    const tempToPerm = permanent === -1;
    var site;
    for (var j = sites.length; j-- > 0;) {
      if (tempToPerm) {
        site = trusted.matches(sites[j]);
        if (!(site && ns.isTemp(site)) || ns.isUntrusted(site)) continue;
      } else {
        site = ns.getQuickSite(sites[j], level);
        if (ns.isJSEnabled(site) || ns.isUntrusted(site)) continue;
      }
      unknown.push(site);
    }
    if (!justTell) {
      if (unknown.length) {
        var browser = this.currentBrowser;
        ns.setExpando(browser, "allowPageURL", content.document.URL);
        this.safeAllow(unknown, true, !permanent);
      }
    }
    return unknown;
  },
  
  tempToPerm: function(justTell, sites) {
    return this.allowPage(-1, justTell, sites);
  },
  
  allowObject: function(i) {
    if(this.menuPluginExtras && this.menuPluginExtras[i]) {
      var e = this.menuPluginExtras[i];
      if (this.ns.confirmEnableObject(window, e)) {
        this.allowObjectURL(e.url, e.mime, e.originSite);
      }
    }
  },
  
  allowObjectSite: function(i) {
    if(this.menuPluginSites && this.menuPluginSites[i]) {
      this.allowObjectURL(this.menuPluginSites[i].site, this.menuPluginSites[i].mime, this.menuPluginSites[i].originSite);
    }
  },
  allowObjectURL: function(url, mime, originSite) {
    this.ns.allowObject(url, mime, originSite);
    this.ns.reloadAllowedObjects(this.currentBrowser);
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
    this.ns.safeCapsOp(function(ns) {
      ns.eraseTemp();
      noscriptOverlay.syncUI();
    }, this.ns.getPref("autoReload.allTabsOnPageAction", true) ? this.ns.RELOAD_ALL : this.ns.RELOAD_CURRENT);
  }
,
  menuCmd: function(event) {
    if (event.shiftKey) return; // site info
    const ns = this.ns;
    const menuItem = event.target;
    var site = null;
    var reloadPolicy = ns.RELOAD_ALL;
    var cl = menuItem.getAttribute("class") || "";
    var cmd = cl.match(/-(forbid|allow|distrust)\b/);
    if (!(cmd && (cmd = cmd[1]))) return;
    var enabled = cmd == "allow";
    var temp = /-temp\b/.test(cl);
    if (/-glb\b/.test(cl)) {
      // global allow/forbid
      if (enabled && ns.getPref("globalwarning", true) &&
          !this.prompter.confirm(window, this.getString("global.warning.title"),
                                this.getString("global.warning.text"))
        ) return;
    } else {
      // local allow/forbid
      site = menuItem.getAttribute("statustext");
      if (!site) return;
      
      if (cmd == "distrust") {
        ns.setUntrusted(site, true);
      }
      
      if (menuItem.getAttribute("closemenu") == "none") {
        menuItem.removeAttribute("statustext"); // prevent double-firing
        // sticky UI feedback
        if (this._currentPopup) {
          this._currentPopup.setAttribute("disabled", "true");
        }
        this._reloadDirty = true;
        reloadPolicy = this.liveReload ? ns.RELOAD_CURRENT : ns.RELOAD_NO;
      }
      
      if (enabled && /\ballow-from\b/.test(cl)) {
        
        ns.allowObject(site, "*");
        if (ns.isJSEnabled(site)) return;
        reloadPolicy = ns.RELOAD_NO;
      }
      
    }
    this.safeAllow(site, enabled, temp, reloadPolicy);
  }
,
  safeAllow: function(site, enabled, temp, reloadPolicy) {
    const ns = this.ns;
    var docShell = ns.dom.getDocShellForWindow(content);
    
    if (!reloadPolicy && (site instanceof Array) &&
          !ns.getPref("autoReload.allTabsOnPageAction", true)) {
      reloadPolicy = 1 // current tab only, for multiple items
    }
    var allowTemp = enabled && temp;
    
    
    function op(ns) {
      if (site) {    
        ns.setTemp(site, allowTemp);
        ns.setJSEnabled(site, enabled, false, ns.mustCascadeTrust(site, temp));
        
        if (enabled && !docShell.allowJavascript) {
          var curSite = ns.getSite(docShell.currentURI.spec);
          if (ns.isJSEnabled(curSite)) {
            // force reload
            if (ns.jsEnabled) {
              ns._lastSnapshot.trusted.add(curSite); 
            } else {
              ns._lastSnapshot.trusted.remove(curSite); 
            }
          }
          docShell.allowJavascript = true;
        }
      } else {
        ns.jsEnabled = enabled;
      }
      
      if (reloadPolicy == ns.RELOAD_NO) {
        noscriptOverlay._syncUINow();
        if (!allowTemp) ns.savePrefs();
      }
      else noscriptOverlay.syncUI();
      
    }
    
    if (reloadPolicy == ns.RELOAD_NO) {
      op(ns);
    } else {
      window.clearInterval(noscriptOverlay._savePrefsTimeout);
      ns.setExpando(content.document, "contentLoaded", false);
      ns.safeCapsOp(op, reloadPolicy, allowTemp);
    }
  
  },
  
  _savePrefsTimeout: 0,
  savePrefs: function(now) {
    if (now) {
      noscriptOverlay.ns.savePrefs();
      return;
    }
    
    if (this._savePrefsTimeout) {
      window.clearTimeout(this._savePrefsTimeout);
    }
    window.setTimeout(arguments.callee, 5000, true);
  },

  
  get statusIcon() {
    var statusIcon = $("noscript-statusIcon") || $("noscript-tbb");
    if (!statusIcon) return null; // avoid mess with early calls
    delete this.statusIcon;
    return this.statusIcon = statusIcon;
  },

  getIcon: function(node) {
    if (typeof(node) != "object") node = $(node);
    return node.ownerDocument.defaultView.getComputedStyle(node, null)
            .listStyleImage.replace(/.*url\s*\(\s*"?([^"\s\)]*).*/g, '$1');
  },
  
  getStatusClass: function(lev, inactive, currentClass) {
    return "noscript-" + (inactive ? "inactive-" : "") + lev;
  },
  updateStatusClass: function(node, className) {
    if (!className) className = this.statusIcon.className.replace(/.*(\bnoscript-\S*(?:yes|no|glb|prt|emb|yu|untrusted)).*/, "$1");
    node.className = (node.className.replace(/\bnoscript-\S*(?:yes|no|glb|prt|emb|yu|untrusted)\b/g, "") + " " + className).replace(/\s{2,}/g, " ");
  }
,
  _syncTimeout: 0,
  syncUI: function() {
    window.addEventListener("DOMContentLoaded", function(ev) {
      if (ev.originalTarget instanceof HTMLDocument) {
        window.removeEventListener(ev.type, arguments.callee, true);
        noscriptOverlay.syncUI = noscriptOverlay._syncUIReal;
        noscriptOverlay.syncUI();
      }
    }, true);
    this.sincUI = function() {};
  }, // we entirely skip on startup
  _syncUIReal: function(w) {
    if (this._syncTimeout) {
      return;
    }
    if (w) {
      if (w != content) return;
    } else {
      w = content;
    }

    
    this._syncTimeout = window.setTimeout(function() {
      noscriptOverlay._syncTimeout = 0;
      noscriptOverlay._syncUINow();
    }, 400);
  },
  

  syncXssWidget: function(widget) {
    if (!widget) widget = $("noscript-statusXss");
    if (!widget) return;

    const ns = this.ns;
    var unsafeRequest = ns.requestWatchdog.getUnsafeRequest(this.currentBrowser);
    if (unsafeRequest && !unsafeRequest.issued) {
      widget.removeAttribute("hidden");
      widget.setAttribute("tooltiptext", "XSS [" +
                  ns.getSite(unsafeRequest.origin) + "]->[" + 
                  ns.getSite(unsafeRequest.URI.spec) + "]");
    return;
    }
    widget.setAttribute("hidden", "true");
  },
  
  syncRedirectWidget: function() {
    var widget = $("noscript-statusRedirect");
    if (!widget) return;
    var info = this.getMetaRefreshInfo();
    if (!info) {
      widget.setAttribute("hidden", true);
      return;
    }
    widget.removeAttribute("hidden");
    widget.setAttribute("tooltiptext",
        this.getString("metaRefresh.notify.follow") + " [" + info.uri + "]"); 
  },
  
  get stickyUI() {
    var ui = $("noscript-sticky-ui");
    if (ui == null) return null;
    delete this.stickyUI;
    if (!ui.openPopup) {
      ui = null;
    } else {
      ui.hidden = false;
    }
    return this.stickyUI = ui;
  },
  
  get useStickyUI() {
    return this.ns.getPref("stickyUI");
  },
  
  hoverUI: true,
  
  showUI: function(toggle) {
    var popup = null;
    
    var useSticky = this.stickyUI && this.ns.getPref("stickyUI.onKeyboard");

    popup =  (useSticky && (popup = this.stickyUI)) ||
      $("noscript-status-popup");
    if (!this.isOpenOrJustClosed(popup)) {
      popup._context = !useSticky;
      popup.showPopup(null, -1, -1, "context", null, null);
    } else if (toggle) {
      popup.hidePopup();
    }
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
    // this won't get any notification for Fennec, which is good.
    
    var gb = getBrowser();
    browser = browser || gb.selectedBrowser;
    if (!pos) pos = this.notificationPos;

    if (!gb.getNotificationBox) return null; // SeaMonkey, Fennec...

    var nb = gb.getNotificationBox(browser);
    
    if (nb) 
      this.patchNotificationBox(nb, pos);
   
    return nb;
  },
  
  patchNotificationBox: function(nb, pos) {
    if (nb._noscriptPatched) return;
    
    nb._noscriptPatched = true;
    
    nb.__defineGetter__("_closedNotification", function() {
      var cn = this.__ns__closedNotification;
      return (cn && cn.parentNode ? cn : null);
    });
    
    nb.__defineSetter__("_closedNotification", function(cn) {
      this.__ns__closedNotification = cn;
    });
    
    if (pos != "bottom") return;
    
    nb._dom_ = {};
    const METHODS = this.notificationBoxPatch;
    for (let m in METHODS) {
      nb._dom_[m] = nb[m];
      nb[m] = METHODS[m];
    }

    var stacks =  nb.getElementsByTagName("stack");
    var stack = null;
    for (var j = stacks.length; j-- > 0;) {
      if (stacks[j].getAttribute("class") == "noscript-bottom-notify") {
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
        
        stack.insertBefore(n, null);
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
        var j = notifications.length;
        while (j-- > 0) {
          if ((ref = notifications[j]).priority < priority && ref.parentNode == this)
            break;
        }
        if(j < 0) ref = null;
      }
      return this._dom_.insertBefore.apply(this, [n, ref]);
    },
    removeChild: function(n) {
      return (n.parentNode == this) ? this._dom_.removeChild.apply(this, arguments) : n.parentNode && n.parentNode.removeChild(n); 
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
    
    const popup = "noscript-notify-popup";
    
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
      
      const refWidget = $("noscript-options-menuitem");
      buttonLabel = refWidget.getAttribute("label");
      buttonAccesskey = refWidget.getAttribute("accesskey");
      
      widget = box.appendNotification(label, "noscript", icon, box.PRIORITY_WARNING_MEDIUM,
                  [ {label: buttonLabel, accessKey: buttonAccesskey,  popup: popup} ]);
    }
    if (!widget) return false;
    
    const delay = this.notifyHide && this.notifyHideDelay || 0;
    if (delay) {
     if (this.notifyHideTimeout) window.clearTimeout(this.notifyHideTimeout);
     this.notifyHideTimeout = window.setTimeout(
       function() {
         if (browser == gb.selectedBrowser) {
            if ($(popup) == noscriptOverlay._currentPopup) {
              noscriptOverlay.notifyHideTimeout = window.setTimeout(arguments.callee, 1000);
              return;
            }
            noscriptOverlay.notificationHide(browser);
         }
       },
       1000 * delay);
    }
    return true;
  },
  
  getAltNotificationBox: function(browser, value, canAppend) {
    
    const box = (("Browser" in window) && Browser.getNotificationBox)
      ? Browser.getNotificationBox()
      : this.getNotificationBox(this.altNotificationPos, browser);
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
    
    const refWidget = $("noscript-options-menuitem");
    var buttonLabel = refWidget.getAttribute("label");
    var buttonAccesskey = refWidget.getAttribute("accesskey");
    var popup = $("noscript-xss-popup");
    if ("Browser" in window) popup.className = "noscript-menu";
    
    box.appendNotification(
      label, 
      notificationValue, 
      icon, 
      box.PRIORITY_WARNING_HIGH,
      [{
        label: buttonLabel,
        accessKey: buttonAccesskey,
        popup: popup.id
       }]
      );
  },
  
  notifyMetaRefreshCallback: function(info) {
    noscriptOverlay.notifyMetaRefresh(info);
  },
  notifyMetaRefresh: function(info) {
    var browser = this.ns.dom.findBrowser(window, info.document.defaultView);
    if (!browser) return;
    
    const notificationValue = "noscript-metaRefresh-notification";
    const box = this.getAltNotificationBox(browser, notificationValue);
    var notification = null;
    
    if (box && this.ns.getPref("forbidMetaRefresh.notify", true)) {
      var urlForLabel = info.uri;
      if (urlForLabel.length > 30) urlForLabel = urlForLabel.substring(0, 30) + "...";
      var label = this.getString("metaRefresh.notify", [urlForLabel, info.timeout])
      var icon = this.getIcon("noscript-statusRedirect");
        
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
    return this.ns.setExpando(browser || this.currentBrowser, "metaRefreshInfo", value);
  },
  getMetaRefreshInfo: function(browser) {
    return this.ns.getExpando(browser || this.currentBrowser, "metaRefreshInfo");
  },
  followMetaRefresh: function(event) {
    this.ns.doFollowMetaRefresh(this.getMetaRefreshInfo(), event.shiftKey);
  },
  
  get supportsNotifications() {
    delete this.supportsNotification;
    return this.supportsNotification = !!document.getElementsByTagName("notificationbox").length;
  },
  
  notifyABE: function(info) {
    var browser = info.browser;
    
    const notificationValue = "noscript-abe-notification";
    const box = this.getAltNotificationBox(browser, notificationValue);
    
    var label = this.getString("ABE.notify", [info.request, info.lastRule.destinations, info.lastPredicate]);
    
    if (!(box && box.appendNotification)) {
      if (!this.supportsNotifications && this.ns.getPref("ABE.legacyPrompt")) {
        var prompter = noscriptUtil.prompter;
        if (prompter.confirmEx(
          window,
          "NoScript - Application Boundary Enforcer",
          label,
          prompter.BUTTON_POS_0 * prompter.BUTTON_TITLE_IS_STRING |
          prompter.BUTTON_POS_1 * prompter.BUTTON_TITLE_OK,
          this.getString("notify.options").replace(this.getString("notify.accessKey"), "&$&"),
          "", "", null, { value: false }
        ) == 0) noscriptUtil.openABEOptions(info);
      }
      return false;
    }
    var notification = null;
    
    
    var icon = this.getIcon("noscript-abe-opts");

    notification = box.appendNotification(
      label, 
      notificationValue, 
      icon, 
      box.PRIORITY_WARNING_HIGH,
      [
       this.fennec
       ?  {
            label: this.getString("disable", ["ABE"]),
            accessKey: this.getString("disable.accessKey"),
            callback: function(notification, buttonInfo) {
              noscriptOverlay.ns.setPref("ABE.enabled", false);
            }
          }
       :  {
            label: this.getString("notify.options"),
            accessKey: this.getString("notify.accessKey"),
            callback: function(notification, buttonInfo) {
              noscriptUtil.openABEOptions(info);
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
    const browser = this.currentBrowser;
    const ns = this.ns;
    const rw = ns.requestWatchdog;
    var unsafeRequest = rw.getUnsafeRequest(browser);
    var method;
    if (!unsafeRequest) {
      unsafeRequest = {
        URI: browser.webNavigation.currentURI,
        origin: ns.OriginTracer.traceBackHistory(browser.webNavigation.sessionHistory, browser.contentWindow).join(">>>")
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
  
  notificationHide: function(browser) { // Modified by Higmmer
    var box = this.getNotificationBox(null, browser);
    var widget = this.getNsNotification(box); // Modified by Higmmer
    if (widget) {
      if (box._timer) clearTimeout(box._timer);
      if (widget.close) {
        if (box.currentNotification == widget) {
          box.currentNotification = null;
        }
        widget.close();
        box.style.width = "";
        window.setTimeout(function() {
          box.style.width = "100%"
          window.setTimeout(function() {
            box.style.width = "";
          }, 10);
        }, 10);
      } else {
        widget.setAttribute("hidden", "true");
      }
      return true;
    }
    return false;
  },
  
  get _oldStylePartial() {
    delete this._oldStylePartial;
    return this._oldStylePartial = this.ns.getPref("oldStylePartial", false);
  },
  
  _syncUINow: function() {
    
    if (this._syncTimeout) {
      window.clearTimeout(this._syncTimeout);
      this._syncTimeout = 0;
    }
    
    const ns = this.ns;
    const global = ns.jsEnabled;
    const jsPSs = ns.jsPolicySites;
    const untrustedSites = ns.untrustedSites;

    
    this.syncRedirectWidget();
    
    const sites = this.getSites();
    
    const oldStylePartial = this._oldStylePartial;
    
    if (this._currentPopup && this._currentPopup.getAttribute("sticky") == "true" && this._currentPopup.state == "open") {
      this.prepareMenu(this._currentPopup, sites);
    }
    
    var lev; 
    var totalScripts = sites.scriptCount;
    var totalPlugins = sites.pluginCount;
    var totalAnnoyances = totalScripts + totalPlugins;
    var notificationNeeded = false;
    
    var allowedSites = [];
    var activeSites = sites.pluginSites.concat(sites.docSites);
    var allowed = 0;
    var untrusted = 0;
    var active = 0;
    var blockedObjects = 0;
    var total = 0;
        
    var topTrusted = false;
    var topUntrusted = false;

    
    if (global && !ns.alwaysBlockUntrustedContent) {
      lev = "glb";
    } else {
      
      let pes = sites.pluginExtras;
      if (pes) {
        for (let j = pes.length; j-- > 0;) {
          let pe = pes[j];
          for (let k = pe.length; k-- > 0;) {
            let e = pe[k];
            if (e && (e.placeholder || e.document)) blockedObjects++;
          }
        }
      }

      let s = sites.length;
      total = s + blockedObjects;
      while (s-- > 0) {
        let url = sites[s];
        let isUntrusted = untrustedSites.matches(url);
        let site = !isUntrusted && (global ? url : jsPSs.matches(url));
        
        if (url == sites.topSite) {
          if (site && ns.dom.getDocShellForWindow(content).allowJavascript) topTrusted = true;
          else {
            site = null;
            if (isUntrusted) topUntrusted = true;
          }
        }
        
        if (site) {
          if (oldStylePartial || activeSites.indexOf(url) > -1) active++;
          if (ns.isMandatory(site) || allowedSites.indexOf(site) > -1) {
            total--;
          } else {
            allowedSites.push(site);
          }
        } else {
          if (isUntrusted) untrusted++;
          else if(!notificationNeeded && url != "about:blank") {
            notificationNeeded = true;
          }
        }
      }
      
      if (!untrusted && sites.pluginSites.some(untrustedSites.matches, untrustedSites)) {
        untrusted = 1;
      }
      
      allowed = allowedSites.length;
      lev = (allowed == total && sites.length > 0 && !untrusted) ? (global ? "glb" : "yes")
            : (allowed == 0 || active == 0) ? (global
                                              ? "untrusted-glb" :
                                                topUntrusted
                                                  ? "untrusted" :
                                                    blockedObjects ? "no-emb" : "no") 
            : (untrusted > 0 && !notificationNeeded
                ? (blockedObjects ? "yu-emb" : global ? "yu-glb" : "yu") 
                : topTrusted
                  ? allowed == total - blockedObjects
                      ? "emb"
                      : "prt"
                  : ns.docShellJSBlocking == 2
                      ? "no"
                      : "subprt"
              );
      notificationNeeded = notificationNeeded && totalAnnoyances > 0;
    }
    
    let message = this.getString(
      "allowed." +
        (lev == "yu" || lev == "subprt" || lev == "emb" || lev == "yu-emb"
         ? "prt"
         : (lev == "untrusted" || lev == "no-emb") ? "no" : lev)
      );
    
    let shortMessage = message.replace("JavaScript", "JS");
    
    if (notificationNeeded && active) 
      message += ", " + allowed + "/" + total + " (" + allowedSites.join(", ") + ")";
    
    let countsMessage = " | <SCRIPT>: " + totalScripts + " | <OBJECT>: " + totalPlugins;
    message += countsMessage;
    shortMessage += countsMessage;
    
    
    const className = this.getStatusClass(lev, !(totalScripts || topUntrusted) /* inactive */ );  
    let widget = this.statusIcon;
    const hoverUI = this.hoverUI;
    for (let wg = widget; wg;) {
      if (hoverUI) wg.removeAttribute("tooltiptext");
      else wg.setAttribute("tooltiptext", shortMessage);
      this.updateStatusClass(wg, className);
      
      if (wg.id === "noscript-tbb") break;
      wg = $("noscript-tbb");
    }
    
    if (notificationNeeded) { // notifications
      let win = content;
      if (this.notify) {
        this.notificationShow(message,
          this.getIcon(widget), 
          !(ns.getExpando(win, "messageShown") && this.notifyHidePermanent));
        ns.setExpando(win, "messageShown", true);
      } else {
        this.notificationHide(); 
      }
      if (!ns.getExpando(win, "soundPlayed")) {
        ns.soundNotify(content.location.href);
        ns.setExpando(win, "soundPlayed");
      }
    } else {
      this.notificationHide();
      message = shortMessage = "";
    }
    
    widget = $("noscript-statusLabelValue");
    if (widget) {
      widget.setAttribute("value", shortMessage);
      widget.parentNode.style.display = message ? "" : "none";
    }
    
    widget =  $("noscript-tbb-revoke-temp");
    if (widget) {
      if (ns.gTempSites.sitesString || ns.tempSites.sitesString || ns.objectWhitelistLen || ns.clearClickHandler && ns.clearClickHandler.whitelistLen) {
        widget.removeAttribute("disabled");
      } else {
        widget.setAttribute("disabled", "true");
      }
    }
    
    widget =  $("noscript-tbb-temp-page");
    if (widget) {
      if (allowed < total) {
        widget.removeAttribute("disabled");
      } else {
        widget.setAttribute("disabled", "true");
      }
    }
  }
,
  notifyHideTimeout: 0,
  liveReload: false,
  
  initContentWindow: function(window) {
    window.addEventListener("pagehide", this.listeners.onPageHide, true);
  },
  
  cleanupDocument: function(doc, browser) {
    
    if (!(doc.defaultView && doc.defaultView == doc.defaultView.top)) return;
    
    const ns = this.ns;
    browser = browser || ns.dom.findBrowserForNode(doc);
    if (browser) {
      ns.setExpando(browser, "pe", null);
    }
  },
  
  presetChanged: function(menulist) {
    this.ns.applyPreset(menulist.selectedItem.value);
  },
  
  prefsObserver: {
    ns: noscriptUtil.service,
    QueryInterface: noscriptUtil.service.generateQI([
        CI.nsIObserver, 
        CI.nsISupportsWeakReference])
  ,
    observe: function(subject, topic, data) {
      
      if (topic == "noscript:sync-ui") {
        noscriptOverlay.syncUI(subject);
        return;
      }
      
      if (subject == this.ns.caps) {
         noscriptOverlay.syncUI();
         return;
      }
      
      switch (data) {
        case "preset":
          if (data == "off") noscriptOverlay.statusIcon.setAttribute("hidden", "true");
          else noscriptOverlay.statusIcon.removeAttribute("hidden");
          noscriptOverlay.syncUI();
        break;
        case "statusIcon": case "statusLabel" :
          window.setTimeout(function() {
              var widget =$("noscript-" + data);
              if (widget) {
                widget.setAttribute("hidden", !noscriptOverlay.ns.getPref(data))
              }
            }, 0);
        break;
        
        case "notify":
        case "notify.bottom":
          noscriptOverlay[data.replace(/\.b/, 'B')] = this.ns.getPref(data);
          if (this._registered) noscriptOverlay.notificationHide();
        break;
        
        case "keys.ui":
        case "keys.toggle":
          noscriptOverlay.shortcutKeys.setup(data.replace(/^keys\./, ""), this.ns.getPref(data, ""));
        break;
        
        case "notify.hidePermanent":
        case "notify.hideDelay":
        case "notify.hide":
          noscriptOverlay[data.replace(/\.h/, 'H')] = this.ns.getPref(data);
        break;
        
        case "stickyUI.liveReload":
          noscriptOverlay.liveReload = this.ns.getPref(data);
        break;
        
        case "hoverUI":
        case "toolbarToggle":
          noscriptOverlay[data] = this.ns.getPref(data);
          noscriptOverlay.initPopups();
          
        break;
      }
    },
    _registered: false,
    register: function() {
      const ns = this.ns;
      ns.os.addObserver(this, "noscript:sync-ui", true);
      ns.prefs.addObserver("", this, true);
      ns.caps.addObserver("", this, true);
      const initPrefs = [
        "statusIcon", "statusLabel", "preset",
        "keys.ui", "keys.toggle",
        "notify", "notify.bottom",
        "notify.hide", "notify.hidePermanent", "notify.hideDelay",
        "stickyUI.liveReload",
        "hoverUI"
        ];
      for (var j = 0; j < initPrefs.length; j++) {
        this.observe(null, null, initPrefs[j]);
      }
      this._registered = true;
    },
    remove: function() {
      const ns = this.ns;
      ns.os.removeObserver(this, "noscript:sync-ui");
      ns.prefs.removeObserver("", this);
      ns.caps.removeObserver("", this);
    }
  },
  
  
  
  
  
  shortcutKeys: {
    
    execute: function(cmd, ev) {
      switch (cmd) {
        case 'toggle':
          noscriptOverlay.toggleCurrentPage(noscriptOverlay.ns.preferredSiteLevel);
        break;
        case 'ui':
          noscriptOverlay.showUI(true);
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
        var which = ev.which;
         
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
            binding.execute(cmd, ev);
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
      QueryInterface: noscriptUtil.service.generateQI([CI.nsIWebProgressListener]),
      STATE_STOP: CI.nsIWebProgressListener.STATE_STOP,
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
          let url = doc.URL;
          const jsBlocked = !ns.jsEnabled && /^https?:/.test(url) && !ns.isJSEnabled(ns.getSite(url));
          
          ns.setExpando(doc, "contentLoaded", true);
          if (w == w.top) {
            if (jsBlocked) {
              ns.processMetaRefresh(doc, noscriptOverlay.notifyMetaRefreshCallback);
              w.addEventListener("load", noscriptOverlay.listeners.onDocumentLoad, false);
            }
            
            if (w == content) {
              noscriptOverlay.syncUI(w);
            } else {
              let browser = ns.dom.findBrowserForNode(w);
              if (browser) ns.getSites(browser); // force placeholders
            }
          } else {
            ns.frameContentLoaded(w);
            noscriptOverlay.syncUI(w.top);
          } 
        }
      }
      
    },
    onDocumentLoad: function(ev) {
      if (ev.originalTarget instanceof HTMLDocument) {
        var w = ev.currentTarget;
        w.removeEventListener("load", arguments.callee, false);
          window.setTimeout(function() {
          noscriptOverlay.ns.detectJSRedirects(w.document);
        }, 50);
      }
    },
    
    onPageShow: function(ev) {
      if (ev.persisted && (ev.target instanceof HTMLDocument)) {
        var d = ev.target;
        var ns = noscriptOverlay.ns;
        noscriptOverlay.toggleObjectsVisibility(d, true);
      }
      noscriptOverlay.syncUI();
    },
    
    onPageHide: function(ev) {
      var d = ev.target;
      if (d instanceof HTMLDocument) {
        var ns = noscriptOverlay.ns;
        noscriptOverlay.toggleObjectsVisibility(d, false);
      }
    },
    
    onMainContextMenu:  function(ev) { noscriptOverlay.prepareContextMenu(ev) },
    
    onLoad: function(ev) {
      noscriptOverlay.ns.dom._winType = document.documentElement.getAttribute("windowtype");
      
      window.removeEventListener("load", arguments.callee, false);
      window.addEventListener("unload", noscriptOverlay.listeners.onUnload, false);
    
      try {
        noscriptOverlay.listeners.setup();
        noscriptOverlay.initPopups(true);
        noscriptOverlay.wrapBrowserAccess();
        let hacks = noscriptOverlay.Hacks;
        hacks.torButton();
        window.setTimeout(hacks.pdfDownload, 0);
        
        
      } catch(e) {
        let msg = "[NoScript] Error initializing new window " + e + "\n" + e.stack; 
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
    
    onAddonOptionsLoad: function(ev) {
      var presetUI = $("noscript-preset-menu");
      if (presetUI) {
        const ns = noscriptOverlay.ns;
        const preset = ns.getPref("preset");
        var mi;
        try {
        for (var j = presetUI.itemCount; j-- > 0;) {
          mi = presetUI.getItemAtIndex(j);
          if (mi && mi.getAttribute("value") == preset) {
            presetUI.selectedIndex = j;
            break;
          }
        }
        } catch(e) { ns.log(e) }
      }
    },
    
    onActivation: function() {
      noscriptOverlay.syncUI();
    },
    
    setup: function() {
      
      var b = getBrowser();
      if (!b) {
        setTimeout(function() noscriptOverlay.listeners.setup(), 100);
        return;
      }
      var tabs = $("tabs") || b.tabContainer;
      if (tabs) {
        tabs.addEventListener("TabClose", this.onTabClose, false);
      }
      
      var addonsList = $("addons-list");
      if (addonsList) {
        // Fennec
        addonsList.addEventListener("AddonOptionsLoad", this.onAddonOptionsLoad, false);
        $("browsers").addEventListener("load", this.onContentLoad, true);
        tabs.addEventListener("TabSelect", this.onActivation, true);
      } else {
      
        var context = $("contentAreaContextMenu");
        if (!context) return; // not a browser window?
      
        context.addEventListener("popupshowing", this.onMainContextMenu, false);
        window.addEventListener("DOMContentLoaded", this.onContentLoad, false);
        b.addProgressListener(this.webProgressListener);
        
      }

      window.addEventListener("pageshow", this.onPageShow, true);
      window.addEventListener("pagehide", this.onPageHide, true);

      noscriptOverlay.shortcutKeys.register();
      noscriptOverlay.prefsObserver.register();
      
      
      
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
      
     $("contentAreaContextMenu").removeEventListener("popupshowing", this.onMainContextMenu, false);
      
    }
    
  }, // END listeners
  
  
  get _browserReady() {
    return ("gBrowser" in window) && window.gBrowser ||
          ("Browser" in window) && window.Browser &&
            (("browsers" in Browser) || Browser._canvasBrowser || Browser._content);
  },
  get currentBrowser() {
    if (!this._browserReady) return null;
    delete this.currentBrowser;
    this.__defineGetter__("currentBrowser",
      window.gBrowser && function() { return gBrowser.selectedBrowser; }
      || Browser.selectedBrowser && function() { return Browser.selectedBrowser; }
      || Browser.currentBrowser && function() { return Browser.currentBrowser; }
    );
    return this.currentBrowser;
  },
  
  get fennec() {
    if (!this._browserReady) return false;
    delete this.fennec;
    return this.fennec = "Browser" in window;
  },
  
  get browsers() {
    if (!this._browserReady) return [];
    delete this.browsers;
    var browsersContainer = window.Browser // Fennec
        ? ("browsers" in Browser) && Browser || Browser._canvasBrowser || Browser._content  
        : window.gBrowser; // desktop Firefox

    this.__defineGetter__("browsers", function() { return browsersContainer.browsers; });
     
    if ("Browser" in window && window.Browser._content) { // Fennec Alpha 1
      getBrowserForDisplay = function() { Browser._content.getBrowserForDisplay.apply(Browser._content, arguments); };
    }
    return this.browsers;
  },
  
  isBrowserEnabled: function(browser) {
    browser = browser || this.currentBrowser;
    return browser.docShell.allowJavascript;
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
      noscriptOverlay.ns.dump("browserDOMWindow wrapped for external load interception");
  },
  
  browserAccess: {
    self: function() { return this; },
    openURI: function(aURI, aOpener, aWhere, aContext) {
      const ns = noscriptUtil.service;

      var external = aContext == CI.nsIBrowserDOMWindow.OPEN_EXTERNAL && aURI;
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
        return aOpener || content;
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
  
  Hacks: {
  
    pdfDownload: function() {
      if (typeof(mouseClick) != "function") return;
      var tb = getBrowser();
      tb.removeEventListener("click", mouseClick, true);
      tb.addEventListener("click", mouseClick, false);
    },
    
    torButton: function() {
      if ("torbutton_update_tags" in window && typeof(window.torbutton_update_tags) == "function") {
        // we make TorButton aware that we could have a part in suppressing JavaScript on the browser
        noscriptOverlay.ns.log("TB: " + window.torbutton_update_tags);
        window.eval(
          window.torbutton_update_tags.toSource().replace(/\bgetBoolPref\("javascript\.enabled"\)/g,
          "$& && (!noscriptOverlay || noscriptOverlay.isBrowserEnabled(browser))"));
        noscriptOverlay.ns.log("Patched TB: " + window.torbutton_update_tags);
      }
    }
  },
  
  install: function() {
    // this.ns.dump("*** OVERLAY INSTALL ***\n");
    this.ns.setPref("badInstall", false);
    window.addEventListener("load", this.listeners.onLoad, false);
  },

  dispose: function() {

    for (var bb = this.browsers, j = bb.length; j-- > 0;) {
      try {
        this.cleanupDocument(bb[j].contentWindow.document, bb);
      } catch(e) {
        this.ns.dump(e);
      }
      this.ns.cleanupBrowser(bb[j]);
    }
    // this.ns.dump("*** OVERLAY DISPOSE ***\n");
  }
}
: {
    install: function() {
      window.addEventListener("load", function(ev) {
        ev.currentTarget.removeEventListener("load", arguments.callee, false); 
        var node = null;
        for each(var id in ["noscript-context-menu", "noscript-tbb", "noscript-statusIcon"]) {
          node = $(id);
          if (node) node.hidden = true;
        }
        node = null;
        var prefs = this.prefService = CC["@mozilla.org/preferences-service;1"]
          .getService(CI.nsIPrefService).getBranch("noscript.");
        try {
          if (prefs.getBoolPref("badInstall")) return;
        } catch(e) {}
        prefs.setBoolPref("badInstall", true);
        prefs = null;
        window.setTimeout(function() {
          alert("NoScript is not properly installed and cannot operate correctly.\n" + 
                "Please install it again and check the Install FAQ section on http://noscript.net/faq if this problem persists.");
          noscriptUtil.browse("http://noscript.net/faq#faqsec2", null);
            
        },10);
      }, false);
  }
}})()

noscriptOverlay.install();
