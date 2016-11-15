var MainChild = {
  beforeInit: function() {
    // must register the service manually
    let registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    registrar.registerFactory(this.classID, this.classDescription, this.contractID, this);
    this.onDisposal(() => registrar.unregisterFactory(this.classID, this));
  },
  afterInit: function() {
    this.initContentPolicy(true);
    Cc['@mozilla.org/docloaderservice;1'].getService(nsIWebProgress).addProgressListener(this,
      nsIWebProgress.NOTIFY_LOCATION | nsIWebProgress.NOTIFY_STATE_REQUEST | nsIWebProgress.NOTIFY_STATUS |
      ("NOTIFY_REFRESH" in nsIWebProgress ? nsIWebProgress.NOTIFY_REFRESH : 0));
  },

  "http-on-opening-request": {
    observe: function(channel, topic, data) {
      INCLUDE("Policy");
      delete this.observe;
      (this.observe = this._observe)(channel, topic, data);
    },
    _observe: function(channel, topic, data) {
      if (channel instanceof Ci.nsIHttpChannel) PolicyState.attach(channel);
    }
  },

  blockWhereNeeded(browser) {
    this.traverseDocShells(function(docShell) {
      let site = this.getSite(docShell.currentURI.spec);
      if (!(this.isJSEnabled(site) || this.checkShorthands(site))) {
        try {
          WinScript.block(docShell.document.defaultView);
        } catch(e) {
          ns.log("Failed blocking " + site + ": " + e);
        }
      }
      return false;
    }, this, browser);
  },

  _lastSnapshot: {
    timestamp: 0,
    lastUntrustedSites: null,
    lastTrustedSites: null,
  },
  reload(browser, snapshots, mustReload, reloadPolicy, innerWindowID = 0) {
    let isCurrentFrame = innerWindowID && innerWindowID == browser.content.QueryInterface(Ci.nsIInterfaceRequestor)
                     .getInterface(Ci.nsIDOMWindowUtils).currentInnerWindowID;
    if (!isCurrentFrame && innerWindowID && reloadPolicy === this.RELOAD_ALL) {
      Thread.delay(() => this.reload(browser, snapshots, mustReload, reloadPolicy), 50);
      return;
    }

    this.blockWhereNeeded(browser);

    let { previous, current, timestamp } = snapshots;
    let { lastTrusted, lastUntrusted, lastGlobal, lastObjects } = previous;
    if (timestamp !== this._lastSnapshot.timestamp) {
      this.jsPolicySites.sitesString = current.lastTrusted;
      this.untrustedSites.sitesString = current.lastUntrusted;
      this.objectWhitelist = JSON.parse(current.lastObjects);
      this.globalJS = current.global;
      this._lastSnapshot = {
        timestamp,
        lastTrustedSites: new PolicySites(lastTrusted),
        lastUntrustedSites: new PolicySites(lastUntrusted)
      };
      this.initContentPolicy();
    }
    
    if (!mustReload ||
         !isCurrentFrame && reloadPolicy === this.RELOAD_CURRENT
        ) {
      return;
    }
    
    let { lastTrustedSites, lastUntrustedSites } = this._lastSnapshot;

    let webNav = browser.webNavigation || browser.docShell.QueryInterface(Ci.nsIWebNavigation);
    let sites = this.getSites(browser);
    let allSites = sites.all;
    let noFrames = sites.docSites.length === 1;

    for (let j = 0, len = allSites.length; j < allSites.length; j++) {
      let site = allSites[j];

      let checkTop;

      if (j === 0 && noFrames) // top level, if unchanged and forbidden we won't reload
      {
        checkTop = sites.topSite === site;
        if (!checkTop) {
          checkTop = true;
          site = sites.topSite;
          j = allSites.indexOf(site);
          if (j > -1) {
            allSites.splice(j, 1, sites[0]);
            allSites[j = 0] = site;
          } else {
            len++;
            allSites.unshift(site);
          }
        }
      } else checkTop = false;

      let prevStatus =
        !(lastGlobal ? this.alwaysBlockUntrustedContent && lastUntrustedSites.matches(site)
                     : !(lastTrustedSites.matches(site) || this.checkShorthands(site, lastTrustedSites)) || lastUntrustedSites.matches(site)
        );
      let currStatus = this.isJSEnabled(site) || !!this.checkShorthands(site);

      if (currStatus != prevStatus) {
        this.quickReload(webNav);
        return;
      }
      
      if (checkTop && !currStatus) {
        // top level, unchanged and forbidden: don't reload
        j = len;
        break;
      }
    }

    // check plugin objects
    if (this.consoleDump & LOG_CONTENT_BLOCK) {
      this.dump("Checking object permission changes...");
      try {
        this.dump(sites.toSource() + ", " + lastObjects);
      } catch(e) {}
    }
    if (this.checkObjectPermissionsChange(sites, JSON.parse(lastObjects))) {
       this.quickReload(webNav);
    }
  
  },


  reloadAllowedObjectsChild: function(browser, mime) {
    let docShell = browser.docShell.QueryInterface(Ci.nsIWebNavigation);
    if (mime === "WebGL") {
      let curURL = docShell.currentURI.spec;
      let site = this.getSite(curURL);
      if (site in this._webGLSites) {
        let url = this._webGLSites[site];
        delete this._webGLSites[site];
        if (url !== curURL) {
          docShell.loadURI(url, Ci.nsIWebNavigation.LOAD_FLAGS_NONE, null, null, null);
          return;
        }
      }
    }

    if (this.getPref("autoReload.onMultiContent", false)) {
      this.quickReload(docShell);
      return;
    }
    var reloadEmbedders = this.getPref("autoReload.embedders");
    var canReloadPage = reloadEmbedders == 1 ? this.getPref("autoReload") : !!(reloadEmbedders);

    var sites = this.getSites(browser);
    var egroup, j, e;
    for (egroup  of sites.pluginExtras) {
      for (j = egroup.length; j-- > 0;) {
        e = egroup[j];
        if (this.isAllowedObject(e.url, e.mime, e.site, e.originSite)) {
          if (e.placeholder && e.placeholder.parentNode) {
            e.skipConfirmation = true;
            this.checkAndEnablePlaceholder(e.placeholder);
          } else if (!(e.allowed || e.embed) && canReloadPage) {
            if (e.document) {
              this.quickReload(DOM.getDocShellForWindow(e.document.defaultView));
              break;
            } else {
              this.quickReload(docShell);
              return;
            }
          }
        }
      }
    }
  },

  checkObjectPermissionsChange: function(sites, snapshot) {
    if(this.objectWhitelist == snapshot) return false;
    for (let url in snapshot) {
      let s = this.getSite(url);
      if (!(s in snapshot)) snapshot[s] = snapshot[url];
    }
    for (let s  of sites.pluginSites) {
      s = this.objectKey(s);
      if ((s in snapshot) && !(s in this.objectWhitelist)) {
        return true;
      }
    }

     for (let egroup  of sites.pluginExtras) {
      for (let j = 0, len = egroup.length; j < len; j++) {
        let e = egroup[j];
        let url;
        if (!e.placeholder && e.url && ((url = this.objectKey(e.url)) in snapshot) && !(url in this.objectWhitelist)) {
          return true;
        }
      }
    }
    return false;
  },

  quickReload: function(webNav, checkNullCache) {
    if (!(webNav instanceof Ci.nsIWebNavigation)) {
      webNav = DOM.getDocShellForWindow(webNav);
    }

    var uri = webNav.currentURI;

    if (checkNullCache && (webNav instanceof Ci.nsIWebPageDescriptor)) {
      try {
        var ch = IOUtil.newChannel(uri.spec, null, null);
        if (ch instanceof Ci.nsICachingChannel) {
          ch.loadFlags |= ch.LOAD_ONLY_FROM_CACHE;
          ch.cacheKey = webNav.currentDescriptor.QueryInterface(Ci.nsISHEntry).cacheKey;
          if (ch.open().available() == 0) {
            webNav.reload(webNav.LOAD_FLAGS_BYPASS_CACHE);
            return;
          }
        }
      } catch(e) {
        if (this.consoleDump) this.dump(e);
      } finally {
        try {
          ch.close();
        } catch(e1) {}
      }
    }

    webNav.reload(webNav.LOAD_FLAGS_CHARSET_CHANGE);
  },

    // These catch both Paypal's variant,
  // if (parent.frames.length > 0){ top.location.replace(document.location); }
  // and the general concise idiom with its common reasonable permutations,
  // if (self != top) top.location = location
  _frameBreakNoCapture: /\bif\s*\(\s*(?:(?:(?:window|self|top)\s*\.\s*)*(?:window|self|top)\s*!==?\s*(?:(?:window|self|top)\s*\.\s*)*(?:window|self|top)|(?:(?:window|self|parent|top)\s*\.\s*)*(?:parent|top)\.frames\.length\s*(?:!==?|>)\s*0)\s*\)\s*\{?\s*(?:window\s*\.\s*)?top\s*\.\s*location\s*(?:\.\s*(?:replace|assign)\s*\(|(?:\s*\.\s*href\s*)?=)\s*(?:(?:document|window|self)\s*\.\s*)?location(?:\s*.\s*href)?\s*\)?\s*;?\s*\}?/,
  _frameBreakCapture: /^\(function\s[^\{]+\{\s*if\s*\(\s*(?:(?:(?:window|self|top)\s*\.\s*)*(window|self|top)\s*!==?\s*(?:(?:window|self|top)\s*\.\s*)*(window|self|top)|(?:(?:window|self|parent|top)\s*\.\s*)*(?:parent|top)\.frames\.length\s*(?:!==?|>)\s*0)\s*\)\s*\{?\s*(?:window\s*\.\s*)?top\s*\.\s*location\s*(?:\.\s*(?:replace|assign)\s*\(|(?:\s*\.\s*href\s*)?=)\s*(?:(?:document|window|self)\s*\.\s*)?location(?:\s*.\s*href)?\s*\)?\s*;?\s*\}?/,
  doEmulateFrameBreak: function(w) {
    // If JS is disabled we check the top 5 script elements of the page searching for the first inline one:
    // if it starts with a frame breaker, we honor it.
    var d = w.document;
    var url = d.URL;
    if (url.indexOf("http") !== 0 || this.isJSEnabled(this.getSite(url), w)) return false;
    var ss = d.getElementsByTagName("script");
    var sc, m, code;
    for (var j = 0, len = 5, s; j < len && (s = ss[j]); j++) {
      code = s.textContent;
      if (code && /\S/.test(code)) {
        if (this._frameBreakNoCapture.test(code)) {
          try {
            sc = sc || new SyntaxChecker();
            var m;
            if (sc.check(code) &&
                (m = sc.lastFunction.toSource().match(this._frameBreakCapture)) &&
                (!m[1] || (m[1] == "top" || m[2] == "top") && m[1] != m[2])) {
              var top = w.top;

              var docShell = DOM.getDocShellForWindow(top);
              var allowJavascript = docShell.allowJavascript;
              var allowPlugins = docShell.allowPlugins;
              if (allowJavascript) { // temporarily disable JS & plugins on the top frame to prevent counter-busting
                docShell.allowJavascript = docShell.allowPlugins = false;
                top.addEventListener("pagehide", function(ev) {
                  ev.currentTarget.removeEventListener(ev.type, arguments.calle, false);
                  docShell.allowJavascript = allowJavascript;
                  docShell.allowPlugins = allowPlugins;
                }, false);
              }
              top.location.href = url;
              var body = d.body;
              if (body) while(body.firstChild) body.removeChild(body.firstChild);
              return true;
            }
          } catch(e) {
            this.dump("Error checking " + code + ": " + e.message);
          }
        }
        break; // we want to check the first inline script only
      }
    }
    return false;
  },

  knownFrames: {
    _history: {},
    add: function(url, parentSite) {
      var f = this._history[url] || (this._history[url] = []);
      if (f.indexOf(parentSite) > -1) return;
      f.push(parentSite);
    },
    isKnown: function(url, parentSite) {
      var f = this._history[url];
      return f && f.indexOf(parentSite) > -1;
    },
    reset: function() {
      this._history = {};
    }
  },

  frameContentLoaded: function(w) {
    if (this.emulateFrameBreak && this.doEmulateFrameBreak(w)) return; // we're no more framed
  },

  metaRefreshWhitelist: {},
  processMetaRefresh(document, notifyCallback) {
    let win = document.defaultView;
    var docShell = DOM.getDocShellForWindow(win);
    if (!this.forbidMetaRefresh ||
       this.metaRefreshWhitelist[document.documentURI] ||
       this.isJSEnabled(this.getSite(document.documentURI), win) ||
       !document.getElementsByTagName("noscript")[0]
       ) {
      if (!docShell.allowMetaRedirects) this.disableMetaRefresh(docShell); // refresh blocker courtesy
      return;
    }
    try {
      let rr = document.getElementsByTagName("meta");
      if (!rr[0]) return;
      const refreshRx = /refresh/i;
      for (let refresh of rr) {
        if (!refreshRx.test(refresh.httpEquiv)) continue;
        let node = refresh;
        while (node = node.parentNode) {
          if (node.localName == "noscript")
            break;
        }
        if (!node) continue;
        let content = refresh.content.split(/[,;]/, 2);
        let uri = content[1];
        if (uri && !new AddressMatcher(this.getPref("forbidMetaRefresh.exceptions")).test(document.documentURI)) {
          if (notifyCallback && !(document.documentURI in this.metaRefreshWhitelist)) {
            let timeout = parseInt(content[0]) || 0;
            uri = uri.replace (/^\s*URL\s*=\s*/i, "");
            var isQuoted = /^['"]/.test(uri);
            uri = isQuoted ? uri.match(/['"]([^'"]*)/)[1] : uri.replace(/\s[\s\S]*/, '');
            try {
              notifyCallback({
                baseURI: docShell.currentURI,
                uri: uri,
                timeout: timeout
              });
            } catch(e) {
              dump("[NoScript]: " + e + " notifying meta refresh at " + document.documentURI + "\n");
            }
          }
          document.defaultView.addEventListener("pagehide", function(ev) {
              ev.currentTarget.removeEventListener(ev.type, arguments.callee, false);
              docShell.allowMetaRedirects = true;
              document = docShell = null;
          }, false);
          this.disableMetaRefresh(docShell);
          return;
        }
      }
    } catch(e) {
      dump("[NoScript]: " + e + " processing meta refresh at " + document.documentURI + "\n");
    }
  },
  doFollowMetaRefresh: function(metaRefreshInfo, forceRemember) {
    var document = metaRefreshInfo.document;
    if (forceRemember || this.getPref("forbidMetaRefresh.remember", false)) {
      this.metaRefreshWhitelist[document.documentURI] = metaRefreshInfo.uri;
    }
    var docShell = metaRefreshInfo.docShell || DOM.getDocShellForWindow(document.defaultView);
    this.enableMetaRefresh(docShell);
    if (docShell instanceof Ci.nsIRefreshURI) {
      this.setupRefresh(docShell,
         metaRefreshInfo.baseURI || IOS.newURI(document.documentURI, null, null),
        "0;" + metaRefreshInfo.uri);
    }
  },
  doBlockMetaRefresh: function(metaRefreshInfo) {
    if (this.getPref("forbidMetaRefresh.remember", true)) {
      var document = metaRefreshInfo.document;
      this.metaRefreshWhitelist[document.documentURI] = null;
    }
  },

  enableMetaRefresh: function(docShell) {
    if (docShell) {
      docShell.allowMetaRedirects = true;
      docShell.resumeRefreshURIs();
      // if(this.consoleDump) dump("Enabled META refresh on " + (docShell.currentURI && docShell.currentURI.spec) + "\n");
    }
  },
  disableMetaRefresh: function(docShell) {
    if (docShell) {
      docShell.suspendRefreshURIs();
      docShell.allowMetaRedirects = false;
      if (docShell instanceof Ci.nsIRefreshURI) {
        docShell.cancelRefreshURITimers();
      }
      // if(this.consoleDump) dump("Disabled META refresh on " + (docShell.currentURI && docShell.currentURI.spec) + "\n");
    }
  },

  setupRefresh: function(docShell, baseURI, header) {
    if (docShell instanceof Ci.nsIRefreshURI)
      try {
        // Gecko <= 16
        docShell.setupRefreshURIFromHeader(baseURI, header);
      } catch (e) {
        docShell.setupRefreshURIFromHeader(baseURI, docShell.document.nodePrincipal, header);
      }
  },

  detectJSRedirects: function(document) {
    if (this.jsredirectIgnore) return 0;

    try {
      if (document.documentURI.indexOf("http") !== 0) return 0;

      let window = document.defaultView;
      if (!window) return 0;

      let hasVisibleLinks = this.hasVisibleLinks(document);
      if (!this.jsredirectForceShow && hasVisibleLinks)
        return 0;

      let body = document.body;
      if (!body) return 0;

      let seen = [];
      let cstyle = document.defaultView.getComputedStyle(body, "");
      if (cstyle) {
        if (cstyle.visibility != "visible") {
          body.style.visibility = "visible";
        }
        if (cstyle.display == "none") {
          body.style.display = "block";
        }
      }
      if (!hasVisibleLinks && (document.links[0] || document.forms[0])) {
        let links = document.links;
        for (let j = 0, len = links.length; j < len; j++) {
          let l = links[j];
          if (!(l.href && l.href.indexOf("http") === 0)) continue;
          l = body.appendChild(l.cloneNode(true));
          l.style.visibility = "visible";
          l.style.display = "block";
          seen.push(l.href);
        }


        for (let forms = document.forms, j = 0, f; f = forms[j]; j++) {
          if (f.action) {
            let e;
            for (let els = f.elements, k = 0; e = els[k]; k++) {
              if (e.type === "submit") break;
            }
            if (!e) {
              e = document.createElement("input");
              e.type = "submit";
              e.value = f.action.substring(0, 47);
              if (f.action.length > 48) e.value += "...";
              f.appendChild(e);
            }
          }
        }
      }

      var code;
      var container = null;

      code = body && body.getAttribute("onload");
      const sources = code ? [code] : [];
      var scripts = document.getElementsByTagName("script");
      for (let j = 0, len = scripts.length; j < len; j++)
        sources.push(scripts[j].textContent);

      scripts = null;

      if (sources.length === 0) return 0;

      var follow = false;
      const findURL = /(?:(?:\b(?:open|replace)\s*\(|(?:\b(?:href|location|src|path|pathname|search)|(?:[Pp]ath|UR[IL]|[uU]r[il]))\s*=)\s*['"]|['"](?=https?:\/\/\w|\w*[\.\/\?]))([\?\/\.\w\-%\&][^\s'"]*)/g;
      const MAX_TIME = 1000;
      const MAX_LINKS = 30;
      const ts = Date.now();
      outerLoop:
      for (let j = 0, len = sources.length; j < len; j++) {
        findURL.lastIndex = 0;
        code = sources[j];
        for (let m; m = findURL.exec(code);) {

          if (!container) {
            container = document.createElementNS(HTML_NS, "div");
            with (container.style) {
              backgroundImage = 'url("' + this.pluginPlaceholder + '")';
              backgroundRepeat = "no-repeat";
              backgroundPosition = "2px 2px";
              padding = "4px 4px 4px 40px";
              display = "block";
              minHeight = "32px";
              textAlign = "left";
            }
            follow = this.jsredirectFollow && window == window.top &&
              !window.frames[0] &&
              !document.evaluate('//body[normalize-space()!=""]', document, null,
                Ci.nsIDOMXPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            document.body.appendChild(container);
          }
          let url = m[1];
          if (url.indexOf("\\") !== -1 &&
              url.indexOf('"') === -1 // notice that m[1] is guaranteed not to contain quotes nor whitespace, but we double check anyway :)
            ) {
            // resolve JS escapes, see http://forums.informaction.com/viewtopic.php?f=10&t=8792
            let sandbox = new Cu.Sandbox("about:blank");
            try {
              url = Cu.evalInSandbox('"' + url + '"', sandbox); // this is safe, since we've got no quotes...
            } catch(e) {
              // ...but a trailing backslash could cause a (harmless) syntax error anyway
            }
          }
          let a = document.createElementNS(HTML_NS, "a");
          a.href = url;
          container.appendChild(a);
          if (a.href.toLowerCase().indexOf("http") != 0 || seen.indexOf(a.href) > -1) {
             container.removeChild(a);
             continue;
          }
          seen.push(a.href);
          a.appendChild(document.createTextNode(a.href));
          container.appendChild(document.createElementNS(HTML_NS, "br"));

          if (seen.length >= MAX_LINKS || Date.now() - ts > MAX_TIME) break outerLoop;
        }

        if (follow && seen.length == 1) {
          this.log("[NoScript Following JS Redirection]: " + seen[0] + " FROM " + document.location.href);

          this.doFollowMetaRefresh({
            uri: seen[0],
            document: document
          });
        }

        if (Date.now() - ts > MAX_TIME) break;
      }
      return seen.length;
    } catch(e) {
      this.dump(e.message + " while processing JS redirects");
      return 0;
    }
  },

  cpConsoleFilter: [2, 5, 6, 7, 15],
  cpDump: function(msg, aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aInternalCall, aPrincipal) {
    this.dump("Content " + msg + " -- type: " + aContentType + ", location: " + (aContentLocation && aContentLocation.spec) +
      ", requestOrigin: " + (aRequestOrigin && aRequestOrigin.spec) + ", ctx: " +
        ((aContext instanceof Ci.nsIDOMHTMLElement) ? "<HTML " + aContext.tagName + ">" // try not to cause side effects of toString() during load
          : aContext)  +
        ", mime: " + aMimeTypeGuess + ", Internal: " + aInternalCall +
        ", principal.origin: " + (aPrincipal && aPrincipal.origin));
  },
  reject: function(what, args /* [aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aInternalCall, [aPrincipal] ] */) {

    if (this.consoleDump) {
      if(this.consoleDump & LOG_CONTENT_BLOCK && args.length >= 6) {
        this.cpDump("BLOCKED " + what, args[0], args[1], args[2], args[3], args[4], args[5], args[6] && args[6]);
      }
      if(this.consoleDump & LOG_CONTENT_CALL) {
        this.dump(new Error().stack);
      }
    }
    switch(args[0]) {
      case 9:
        // our take on https://bugzilla.mozilla.org/show_bug.cgi?id=387971
        args[1].spec = this.nopXBL;
        return CP_OK;
      case 5:
        if (args[3]) args[3].__noscriptBlocked = true;
    }

    PolicyState.cancel(args);


    if (args[1]) {
      let win = DOM.findWindow(args[3]);
      let focusedWin = win;
      if (!focusedWin) {
        focusedWin = DOM.mostRecentBrowserWindow;
        focusedWin = focusedWin && focusedWin.content;
      }
      if (focusedWin) {
        this.recordBlocked(focusedWin, this.getSite(args[1].spec) || "", this.getSite(win && win.location.href || args[2] && args[2].spec));
      }
    }

    return CP_REJECT;
  },

  nopXBL: "chrome://global/content/bindings/general.xml#basecontrol",

  forbiddenXMLRequest: function(aRequestOrigin, aContentLocation, aContext, forbidDelegate) {
    let originURL, locationURL;
    if (aContentLocation.schemeIs("chrome") || !aRequestOrigin ||
         // GreaseMonkey Ajax comes from resource: hidden window
         // Google Toolbar Ajax from about:blank
           aRequestOrigin.schemeIs("chrome") || aRequestOrigin.schemeIs("resource") ||
           aRequestOrigin.schemeIs("about") ||
           // Web Developer extension "appears" to XHR towards about:blank
           (locationURL = aContentLocation.spec) == "about:blank"
          ) return false;

    let locationSite = this.getSite(locationURL);
    if (!this.isJSEnabled(locationSite) && this.checkShorthands(locationSite))
        this.autoTemp(locationSite);

    var win = aContext && aContext.defaultView;
    if(win) this.getExpando(win.top.document, "codeSites", []).push(locationSite);

    return forbidDelegate.call(this, originURL, locationURL, win);
  },


  addFlashVars: function(url, embed) {
    // add flashvars to have a better URL ID
    if (embed instanceof Ci.nsIDOMElement) try {
      var flashvars = embed.getAttribute("flashvars");
      if (!flashvars) {
        let params = embed.getElementsByTagName("param");
        for (let j = 0, p; (p = params[j]); j++)
          if (p.name && p.name.toLowerCase() === "flashvars")
            flashvars = p.value;
      }
      if (flashvars) {
        let yahooRx = /\bYUIBridgeCallback=[^&]+/;
        if (yahooRx.test(flashvars)) {
          let d = embed.ownerDocument;
          let m = d && d.URL.match(/(\d+)\.html\b/);
          flashvars = flashvars.replace(yahooRx, m ? "_YUIvid_=" + m[1] : "");
        }
        let videoId = flashvars.match(/video_?id=[^&]+/);
        url += "#!flashvars#" + encodeURI(videoId && videoId[0] || flashvars);
      }
    } catch(e) {
      if (this.consoleDump) this.dump("Couldn't add flashvars to " + url + ":" + e);
    }
    return url;
  },

  addObjectParams: function(url, embed) {
    if (embed instanceof Ci.nsIDOMElement) try {
      var params = embed.getElementsByTagName("param");
      if (!params.length) return url;

      var pp = [];
      for(let j = params.length; j-- > 0;) {
        pp.push(encodeURIComponent(params[j].name) + "=" + encodeURIComponent(params[j].value));
      }
      url += "#!objparams#" + pp.join("&");
    } catch (e) {
      if (this.consoleDump) this.dump("Couldn't add object params to " + url + ":" + e);
    }
    return url;
  },

  tagWindowlessObject: function(o) {
    const rx = /^(?:opaque|transparent)$/i;
    var b;
    try {
      if (o instanceof Ci.nsIDOMHTMLEmbedElement) {
        b = rx.test(o.getAttribute("wmode"));
      } else if (o instanceof Ci.nsIDOMHTMLObjectElement) {
        var params = o.getElementsByTagName("param");
        const wmodeRx = /^wmode$/i;
        for(var j = params.length; j-- > 0 &&
            !(b = wmodeRx.test(params[j].name && rx.test(params[j].value)));
        );
      }
      if (b) this.setExpando(o, "windowless", true);
    } catch (e) {
      if (this.consoleDump) this.dump("Couldn't tag object for window mode.");
    }
  },

  isWindowlessObject: function(o) {
    return this.getExpando(o, "windowless") || o.settings && o.settings.windowless;
  },

  resolveSilverlightURL: function(uri, embed) {
    if(!uri) return "";


    if (embed instanceof Ci.nsIDOMElement) try {

      var url = "";
      var params = embed.getElementsByTagName("param");
      if (!params.length) return uri.spec;

      var name, value, pp = [];
      for (var j = params.length; j-- > 0;) { // iteration inverse order is important for "source"!
        name = params[j].name;
        value = params[j].value;
        if(!(name && value)) continue;

        if (!url && name.toLowerCase() == "source") {
          try {
             url = uri.resolve(value);
             continue;
          } catch(e) {
            if (this.consoleDump)
              this.dump("Couldn't resolve Silverlight URL " + uri.spec + " + " + value + ":" + e);
            url = uri.spec;
          }
        }
        pp.push(encodeURIComponent(name) + "=" + encodeURIComponent(value));
      }
      return (url || uri.spec) + "#!objparams#" + pp.join("&");
    } catch(e1) {
      if (this.consoleDump)  this.dump("Couldn't resolve Silverlight URL " + uri.spec + ":" + e1);
    }
    return uri.spec;
  },

  tagForReplacement: function(embed, pluginExtras) {
    try {
      var doc = embed.ownerDocument;
      if(!doc) {
        if (embed instanceof Ci.nsIDOMDocument) {
          pluginExtras.document = (doc = embed);
          pluginExtras.url = this.getSite(pluginExtras.url);
          this._collectPluginExtras(this.findPluginExtras(doc), pluginExtras);
        }
      } else {
        var node = embed;
        while((node = node.parentNode))
          if (node.__noScriptBlocked)
            return;

        var pe = this.getExpando(doc, "pe");
        if (pe === null) this.setExpando(doc, "pe", pe = []);
        pe.push({embed: embed, pluginExtras: pluginExtras});
      }
      try {
        this.syncUI();
      } catch(noUIex) {
        if(this.consoleDump) this.dump(noUIex);
      }
    } catch(ex) {
      if(this.consoleDump) this.dump(
        "Error tagging object [" + pluginExtras.mime + " from " + pluginExtras.url +
        " - top window " + win + ", embed " + embed +
        "] for replacement: " + ex);
    }
  },

  blockLegacyFrame: function(frame, uri, sync) {

    var verbose = this.consoleDump & LOG_CONTENT_BLOCK;
    if(verbose) {
      this.dump("Redirecting blocked legacy frame " + uri.spec + ", sync=" + sync);
    }


    var url = this.createPluginDocumentURL(uri.spec, "iframe");

    if(sync) {
      if (verbose) dump("Legacy frame SYNC, setting to " + url + "\n");
      frame.contentWindow.location = url;
    } else {
      frame.ownerDocument.defaultView.addEventListener("load", function(ev) {
          if(verbose) dump("Legacy frame ON PARENT LOAD, setting to " + url + "\n");
          ev.currentTarget.removeEventListener("load", arguments.callee, false);
          frame.contentWindow.location = url;
      }, false);
    }
    return true;

  },


  isPluginDocumentURL: function(url, tag) {
    try {
      return url.replace(/(src%3D%22).*?%22/i, '$1%22') == this.createPluginDocumentURL('', tag)
    } catch(e) {}
    return false;
  },

  createPluginDocumentURL: function(url, tag) {
    tag = tag ? tag.toLowerCase() : "embed";
    return 'data:text/html;charset=utf-8,' +
        encodeURIComponent('<html><head></head><body style="padding: 0px; margin: 0px"><' +
          tag + ' src="' + url + '" width="100%" height="100%"></' +
          tag + '></body></html>');
  },

  forbiddenIFrameContext: function(originURL, locationURL) {
    if (this.isForbiddenByHttpsStatus(originURL)) return false;
    var domain = this.getDomain(locationURL, true);
    if (!domain) return false;
    switch (this.forbidIFramesContext) {
      case 0: // all IFRAMES
        return true;
      case 3: // different 2nd level domain or either untrusted parent or origin
        if (!(this.untrustedSites.matches(this.getSite(locationURL)) ||
            this.untrustedSites.matches(this.getSite(originURL))))
          return this.getBaseDomain(this.getDomain(originURL, true)) !=
            this.getBaseDomain(domain);
      case 2: // different domain (unless forbidden by HTTPS status)
        if (this.getDomain(originURL, true) != domain) return true;
        // if we trust only HTTPS both sites must have the same scheme
        if (!this.isForbiddenByHttpsStatus(locationURL.replace(/^https:/, 'http:'))) return false;
      case 1: // different site
        return this.getSite(originURL) != this.getSite(locationURL);
     }
     return false;
  },

  forbiddenXBLContext: function(originURL, locationURL, window) {
    if (locationURL == this.nopXBL) return false; // always allow our nop binding

    var locationSite = this.getSite(locationURL);
    var originSite = this.getSite(originURL);

    switch (this.forbidXBL) {
      case 4: // allow only XBL from the same trusted site or chrome (default)
        if (locationSite != originSite) return true; // chrome is checked by the caller checkXML
      case 3: // allow only trusted XBL on trusted sites
        if (!locationSite) return true;
      case 2: // allow trusted and data: (Fx 3) XBL on trusted sites
        if (!(this.isJSEnabled(originSite, window) ||
            locationSite.indexOf("file:") === 0 // we trust local files to allow Linux theming
             )) return true;
      case 1: // allow trusted and data: (Fx 3) XBL on any site
        if (!(this.isJSEnabled(locationSite, window) || /^(?:data|file|resource):/.test(locationURL))) return true;
      case 0: // allow all XBL
        return false;
    }
    return true;
  },

  forbiddenXHRContext: function(originURL, locationURL, window) {
    if (!window) {
      // live bookmarks
      return false;
    }

    var locationSite = this.getSite(locationURL);
    // var originSite = this.getSite(originURL);
    switch (this.forbidXHR) {
      case 3: // forbid all XHR
        return true;
      case 2: // allow same-site XHR only
        if (locationSite && locationSite != originSite) return true;
      case 1: // allow trusted XHR targets only
        if (locationSite && locationSite !== "moz-nullprincipal:" && !this.isJSEnabled(locationSite, window))
          return true;
      case 0: // allow all XBL
        return false;
    }
    return true;
  },
};

