
function RequestWatchdog() {
  this.init();
}

RequestWatchdog.prototype = {
  
  OBSERVED_TOPICS: ["http-on-modify-request", "http-on-examine-response", "http-on-examine-merged-response"],
  
  init: function() {
    for each (var topic in this.OBSERVED_TOPICS) OS.addObserver(this, topic, true);
  },
  dispose: function() {
    for each (var topic in this.OBSERVED_TOPICS) OS.removeObserver(this, topic, true);
  },
  
  callback: null,
  externalLoad: null,
  noscriptReload: null,
  DOCUMENT_LOAD_FLAGS: CI.nsIChannel.LOAD_DOCUMENT_URI
    | CI.nsIChannel.LOAD_CALL_CONTENT_SNIFFERS, // this for OBJECT subdocs
  
  QueryInterface: xpcom_generateQI([CI.nsIObserver, CI.nsISupportsWeakReference, CI.nsISupports]),
  
  observe: function(channel, topic, data) {
    
    if (!(channel instanceof CI.nsIHttpChannel)) return;
    
    if(ns.consoleDump & LOG_SNIFF) {
      ns.dump(topic + ": " + channel.URI.spec + ", " + channel.loadFlags);
    }
    var loadFlags = channel.loadFlags;
    var isDoc = loadFlags & this.DOCUMENT_LOAD_FLAGS;
     
    switch(topic) {
      case "http-on-modify-request":
        
        HTTPS.forceChannel(channel);
        
        var ncb = channel.notificationCallbacks;
        if (!(loadFlags || ncb || channel.owner)) {
          try {
            if (channel.getRequestHeader("Content-type") == "application/ocsp-request") {
              if (ns.consoleDump) ns.dump("Skipping cross-site checks for OCSP request " + channel.name);
              return;
            }
          } catch(e) {}
        }
        
        if (ncb instanceof CI.nsIXMLHttpRequest && !ns.isCheckedChannel(channel)) {
          if (ns.consoleDump) ns.dump("Skipping cross-site checks for chrome XMLHttpRequest " + channel.name + ", " + loadFlags + ", "
                                      + channel.owner + ", " + !!PolicyState.hints);
          return;
        }
        
        var abeReq = null;
        try {
          
          abeReq = new ABERequest(channel);
          if (this.externalLoad && this.externalLoad === abeReq.destination) {
            abeReq.external = true;
            this.externalLoad = null;
          }
          
          if (isDoc) {
            new DOSChecker(abeReq).run(function() {
              return this.filterXSS(abeReq);
            }, this);  
          }
          
          if (!channel.status) {
            this.handleABE(abeReq, isDoc);
          }
          
        } catch(e) {
          this.die(channel, e);
        }
      break;
      
      
      case "http-on-examine-response":
        STS.processRequest(channel);
        
      case "http-on-examine-merged-response":
        if (isDoc) {
          ns.onContentSniffed(channel);
        } else {
          if (!ns.checkInclusionType(channel))
            return;
        }
        HTTPS.handleSecureCookies(channel);
      break;
    }
  },
  
  die: function(channel, e) {
    this.abort({ channel: channel, reason: e + " --- " + e.stack, silent: true });
  },
  
  handleABE: function(abeReq, isDoc) {
    if (abeReq && ABE.enabled) {
      try {
        // ns.dump("handleABE called for " + abeReq.serial + ", " + abeReq.destination + " at " + Components.stack.caller);
        var res = new DOSChecker(abeReq, true).run(function() {
          return ABE.checkRequest(abeReq);
        });
        if (res) {
          this.notifyABE(res, !(isDoc && res.fatal && ns.getPref("ABE.notify")));  
          if (res.fatal) return true;
        }
      } catch(e) {
        this.die(abeReq.channel, e);
        return true;
      }
    }
    return false;
  },
  
  notifyABE: function(abeRes, silent) {
    var req = abeRes.request;
    var silentLoopback = !ns.getPref("ABE.notify.namedLoopback");
    abeRes.rulesets.forEach(
      function(rs) {
        var lastRule = rs.lastMatch;
        var lastPredicate = lastRule.lastMatch;
        if (lastPredicate.permissive) return;
        
        var action = lastPredicate.action;
        
        ns.log("[ABE] <" + lastRule.destinations + "> " + lastPredicate + " on " + req
          + "\n" + rs.name + " rule:\n" + lastRule);
        
        if (silent || rs != abeRes.lastRuleset) return;
        
        if (lastRule.local && silentLoopback) {
          var host = req.destinationURI.host;
          if (host != "localhost" && host != "127.0.0.1" && req.destinationURI.port <= 0)
            // this should hugely reduce notifications for users of bogus hosts files, 
            // while keeping "interesting" notifications
            var dnsr = DNS.getCached(host);
            if (dnsr && dnsr.entries.indexOf("127.0.0.1") > -1)
              return;
        }
        
        var w = req.window;
        var browser = this.findBrowser(req.channel, w);
        if (browser)
          browser.ownerDocument.defaultView.noscriptOverlay
            .notifyABE({
              request: req,
              action: action,
              ruleset: rs,
              lastRule: lastRule,
              lastPredicate: lastPredicate,
              browser: browser,
              window: w
            });
      }, this);
  },
  
  get dummyPost() {
    const v = CC["@mozilla.org/io/string-input-stream;1"].createInstance();
    v.setData("", 0);
    this.__defineGetter__("dummyPost", function() { return v; });
    return v;
  },
  
  getUnsafeRequest: function(browser) {
    return ns.getExpando(browser, "unsafeRequest");
  },
  setUnsafeRequest: function(browser, request) {
    return ns.setExpando(browser, "unsafeRequest", request);
  },
  
  
  unsafeReload: function(browser, start) {
    ns.setExpando(browser, "unsafeReload", start);
    if (start) {
      const unsafeRequest = this.getUnsafeRequest(browser);
      if (unsafeRequest) {
        // should we figure out what to do with unsafeRequest.loadFlags?
        var wn = browser.webNavigation;
        if(unsafeRequest.window) {
          // a subframe...
          try {
            wn = DOM.getDocShellForWindow(unsafeRequest.window).QueryInterface(CI.nsIWebNavigation);
          } catch(ex) {
            ns.dump(ex);
          }
          unsafeRequest.window = null;
        }
       
        wn.loadURI(unsafeRequest.URI.spec, 
              wn.LOAD_FLAGS_BYPASS_CACHE | 
              wn.LOAD_FLAGS_IS_REFRESH,
              unsafeRequest.referrer, unsafeRequest.postData, null);
        unsafeRequest.issued = true;
      } else {
        browser.reload();
      }
    }
    return start;
  },

  isUnsafeReload: function(browser) {
    return ns.getExpando(browser, "unsafeReload");
  },
  
  resetUntrustedReloadInfo: function(browser, channel) {
    if (!browser) return;
    var window = IOUtil.findWindow(channel);
    if (browser.contentWindow == window) {
      if (ns.consoleDump) this.dump(channel, "Top level document, resetting former untrusted browser info");
      this.setUntrustedReloadInfo(browser, false);
    }
  },
  setUntrustedReloadInfo: function(browser, status) {
    return ns.setExpando(browser, "untrustedReload", status);
  },
  getUntrustedReloadInfo: function(browser) {
    return ns.getExpando(browser, "untrustedReload");
  },
  
  _listeners: [],
  addCrossSiteListener: function(l) {
    if (!this._listeners.indexOf(l) > -1) this._listeners.push(l);
  },
  removeCrossSiteListener: function(l) {
    var pos = this._listeners.indexOf(l);
    if (pos > -1) this._listeners.splice(pos);
  },
  
  onCrossSiteRequest: function(channel, origin, browser) {
    for each (var l in this._listeners) {
      l.onCrossSiteRequest(channel, origin, browser, this);
    }
  },
  
  isHome: function(url) {
    return url instanceof CI.nsIURL &&
      this.getHomes().some(function(urlSpec) {
        try {
          return !url.getRelativeSpec(IOS.newURI(urlSpec, null, null));
        } catch(e) {}
        return false;
      });
  },
  getHomes: function(pref) {
    var homes;
    try {
      homes = ns.prefService.getComplexValue(pref || "browser.startup.homepage",
                         CI.nsIPrefLocalizedString).data;
    } catch (e) {
      return pref ? [] : this.getHomes("browser.startup.homepage.override");
    }
    return homes ? homes.split("|") : [];
  },
  
  checkWindowName: function(window) {
    var originalAttempt = window.name;
    
    if (/\s*{[\s\S]+}\s*/.test(originalAttempt)) {
      try {
        ns.json.decode(originalAttempt); // fast track for crazy JSON in name like on NYT
        return;
      } catch(e) {}
    }
    
    if (/[%=\(\\]/.test(originalAttempt) && InjectionChecker.checkJS(originalAttempt)) {
      window.name = originalAttempt.replace(/[%=\(\\]/g, " ");
    }
    if (originalAttempt.length > 11) {
      try {
        if ((originalAttempt.length % 4 == 0)) { 
          var bin = window.atob(window.name);
          if(/[=\(\\]/.test(bin) && InjectionChecker.checkJS(bin)) {
            window.name = "BASE_64_XSS";
          }
        }
      } catch(e) {}
    }
    if (originalAttempt != window.name) {
      ns.log('[NoScript XSS]: sanitized window.name, "' + originalAttempt + '" to "' + window.name + '".');
    }
  },
  
  filterXSS: function(abeReq) {
    
    const channel = abeReq.channel;
    
    const url = abeReq.destinationURI;
    const originalSpec = abeReq.destination;


    if (this.noscriptReload == originalSpec) {
      // fast cache route for NoScript-triggered reloads
      this.noscriptReload = null;
      try {
        if (ns.consoleDump) {
          this.dump(channel, "Fast reload, original flags: " + 
            channel.loadFlags + ", " + (channel.loadGroup && channel.loadGroup.loadFlags));
        }
        channel.loadFlags = (channel.loadFlags & ~CI.nsIChannel.VALIDATE_ALWAYS) | 
                    CI.nsIChannel.LOAD_FROM_CACHE | CI.nsIChannel.VALIDATE_NEVER;
        if (channel.loadGroup) {
          channel.loadGroup.loadFlags = (channel.loadGroup.loadFlags & ~CI.nsIChannel.VALIDATE_ALWAYS) | 
                  CI.nsIChannel.LOAD_FROM_CACHE | CI.nsIChannel.VALIDATE_NEVER;
        }
        if (ns.consoleDump) {
          this.dump(channel, "Fast reload, new flags: " + 
            channel.loadFlags + ", " + (channel.loadGroup && channel.loadGroup.loadFlags));
        }
      } catch(e) {
        // we may have a problem here due to something Firekeeper 0.2.11 started doing..
        ns.dump(e);
      }
    }
    
    var origin = abeReq.xOrigin;
    var originSite = null;
    var browser = null;
    var window = null;
    var untrustedReload = false;

    if (!origin) {
      if ((channel instanceof CI.nsIHttpChannelInternal) && channel.documentURI) {
        if (originalSpec == channel.documentURI.spec) {
           originSite = ns.getSite(abeReq.traceBack);
           if (originSite) {
              origin = abeReq.breadCrumbs.join(">>>");
              if (ns.consoleDump) this.dump(channel, "TRACEBACK ORIGIN: " + originSite + " FROM " + origin);
              if ((channel instanceof CI.nsIUploadChannel) && channel.uploadStream) {
                if (ns.consoleDump) this.dump(channel, "Traceable upload with no origin, probably extension. Resetting origin!");
                origin = originSite = "";
              }
           } else {
             // check untrusted reload
             browser = this.findBrowser(channel, abeReq.window);
             if (!this.getUntrustedReloadInfo(browser)) {
               if (ns.consoleDump) this.dump(channel, "Trusted reload");
               return;
             }
             origin = "";
             untrustedReload = true;
             if (ns.consoleDump) this.dump(channel, "Untrusted reload");
           }
        } else {
          origin = channel.documentURI.spec;
          if (ns.consoleDump) this.dump(channel, "ORIGIN (from channel.documentURI): " + origin);
        }
      } else {
        if (ns.consoleDump) this.dump(channel, "***** NO ORIGIN CAN BE INFERRED!!! *****");
      }
    } else {
      if (channel.loadFlags & channel.LOAD_INITIAL_DOCUMENT_URI && channel.originalURI.spec == channel.URI.spec) {
        // clean up after user action
        window = window || abeReq.window;
        browser = browser || this.findBrowser(channel, window);
        this.resetUntrustedReloadInfo(browser, channel);
        var unsafeRequest = this.getUnsafeRequest(browser);
        if (unsafeRequest && unsafeRequest.URI.spec != channel.originalURI.spec && 
            (!window || window == window.top || window == unsafeRequest.window)) {
          this.setUnsafeRequest(browser, null);
        }
      } else origin = origin.replace(/^view-source:/, '');
      if (ns.consoleDump) this.dump(channel, "ORIGIN: " + origin);
    }
    
    const su = SiteUtils;
    originSite = originSite || su.getSite(origin) || '';
    
    var host = channel.URI.host;
    if (host[host.length - 1] == "." && ns.getPref("canonicalFQDN", true) &&
        (Thread.canSpin || ABE.legacySupport)) {
      try {
        if (IOUtil.canDoDNS(channel))
          channel.URI.host = DNS.resolve(host, 2).canonicalName;
        if (ns.consoleDump) ns.dump("Resolving FQDN " + host);
      } catch(ex) {
        this.dump(channel, ex);
      }
    }
    
    var targetSite;
    const globalJS = ns.globalJS;
    var trustedTarget = globalJS;
    if(!trustedTarget) {
      if(ns.autoAllow) {
        window = window || abeReq.window;
        if (window && window == window.top) {
          targetSite = ns.getQuickSite(originalSpec, ns.autoAllow);
          if(targetSite && !ns.isJSEnabled(targetSite)) {
            ns.autoTemp(targetSite);
          }
          targetSite = su.getSite(originalSpec);
        }
      }
      if(!trustedTarget) {
        targetSite = su.getSite(originalSpec);
        trustedTarget = ns.isJSEnabled(targetSite);
        if(!trustedTarget) {
          if (ns.checkShorthands(targetSite)) {
            ns.autoTemp(targetSite);
            trustedTarget = true;
          } else {
            ns.recordBlocked(targetSite);
          }
        }
      }
    }
    
    if (!(origin || (window = abeReq.window))) {
      if (ns.consoleDump) this.dump(channel, "-- This channel doesn't belong to any window/origin: internal browser or extension request, skipping. --");
      return;
    }
      
    if(!targetSite) targetSite = su.getSite(originalSpec);
    
    // noscript.injectionCheck about:config option adds first-line 
    // detection for XSS injections in GET requests originated by 
    // whitelisted sites and landing on top level windows. Value can be:
    // 0 - never check
    // 1 - check cross-site requests from temporary allowed sites
    // 2 - check every cross-site request (default)
    // 3 - check every request
    
    var injectionCheck = ns.injectionCheck;
    
    if (originSite == targetSite) {
      if (injectionCheck < 3) return; // same origin, fast return
    } else {
      this.onCrossSiteRequest(channel, origin, browser = browser || this.findBrowser(channel, abeReq.window));
    }
    
    if (this.callback && this.callback(channel, origin)) return;
    
    if (!trustedTarget) {
      if (InjectionChecker.checkNoscript(InjectionChecker.urlUnescape(originalSpec)) && ns.getPref("injectionCheckHTML", true)) {
        if (ns.consoleDump) this.dump(channel, "JavaScript disabled target positive to HTML injection check!");
      } else {
        if (ns.consoleDump) this.dump(channel, "Target is not Javascript-enabled, skipping XSS checks.");
        return;
      }
    }
    
     // fast return if nothing to do here
    if (!(ns.filterXPost || ns.filterXGet)) return;   
    
    if (!abeReq.external && this.isUnsafeReload(browser = browser || this.findBrowser(channel, abeReq.window))) {
      if (ns.consoleDump) this.dump(channel, "UNSAFE RELOAD of [" + originalSpec +"] from [" + origin + "], SKIP");
      return;
    }
    
    if (ns.filterXExceptions) {
      try {
        if (ns.filterXExceptions.test(unescape(originalSpec)) &&
            !this.isBadException(host)
            ) {
          // "safe" xss target exception
          if (ns.consoleDump) this.dump(channel, "Safe target according to filterXExceptions: " + ns.filterXExceptions.toString());
          return;
        }
  
        if (ns.filterXExceptions.test("@" + unescape(origin))) {
          if (ns.consoleDump) this.dump(channel, "Safe origin according to filterXExceptions: " + ns.filterXExceptions.toString());
          return;
        }

        if (/^https?:\/\/mail\.lycos\.com\/lycos\/mail\/MailCompose\.lycos$/.test(origin) &&
            /\.lycosmail\.lycos\.com$/.test(targetSite) && ns.getPref("filterXExceptions.lycosmail")) {
          if (ns.consoleDump) this.dump(channel, "Lycos Mail Exception");
          return;
        }
        
        
        
      } catch(e) {}
    }
    
    
    
    if (!originSite) { // maybe data or javascript URL?
      if (/^(?:javascript|data):/i.test(origin) && ns.getPref("xss.trustData", true)) {
        originSite = ns.getSite(abeReq.traceBack);
        if (originSite) { 
          origin = abeReq.breadCrumbs.join(">>>");
        }
      }
    }
    
    var originalAttempt;
    var injectionAttempt = false;
    var postInjection = false;
    
    window = window || abeReq.window;
    
    // neutralize window.name-based attack
    if (window && window.name) {
      
      if (ns.compatEvernote && window.frameElement && window.name.indexOf("iframe") > 0 && /^https?:\/\/(?:[a-z]+\.)*evernote\.com\/clip\.action$/.test(originalSpec) && channel.requestMethod == "POST") {
        // Evernote Web Clipper hack
        window.frameElement.addEventListener("load", ns.compatEvernote.onload, false);
        if (ns.consoleDump) this.dump(channel, "Evernote frame detected (noscript.compat.evernote)");
        return;
      }
      
      this.checkWindowName(window);
    
    }
   
    if (globalJS || ns.isJSEnabled(originSite) ||
        !origin // we consider null origin as "trusted" (i.e. we check for injections but 
                // don't strip POST unconditionally) to make some extensions (e.g. Google Gears) 
                // work. For dangerous edge cases we should have moz-null-principal: now, anyway.
      ) {
      
      if (origin && /^http:\/\/(?:[^\/]+.)?facebook\.com\/render_fbml\.php$/.test(originalSpec) &&
            channel.requestMethod == "POST" && ns.getPref("filterXException.fbconnect")) {
        if (ns.consoleDump) this.dump(channel, 'Facebook connect exception');
        return;
      }
      
      this.resetUntrustedReloadInfo(browser = browser || this.findBrowser(channel, window), channel);
      
      // here we exceptionally consider same site also http<->https (target would be blocked by
      // certificate checks if something phishy is going on with DNS)
      
      if (injectionCheck < 3) {
        if (/^https?:/.test(originSite)) {
          var originDomain = ns.getDomain(originSite);
          var targetDomain = ns.getDomain(url);
          if (targetDomain == originDomain) {
            this.dump(channel, "Same domain with HTTP(S) origin");
            return;
          }
        }
      }
      
      // origin is trusted, check for injections
      
      injectionAttempt = injectionCheck && (injectionCheck > 1 || ns.isTemp(originSite)) &&
        (!window || ns.injectionCheckSubframes || window == window.top);
      
      
          
      if (injectionAttempt) {
        postInjection = ns.filterXPost && (!origin || originSite != "chrome:") && channel.requestMethod == "POST" && ns.injectionChecker.checkPost(channel);
        injectionAttempt = ns.filterXGet && ns.injectionChecker.checkURL(originalSpec);
        
        if (ns.consoleDump) {
          if (injectionAttempt) this.dump(channel, "Detected injection attempt at level " + injectionCheck);
          if (postInjection) this.dump(channel, "Detected POST injection attempt at level "  + injectionCheck);
        }
      }
      
      if (!(injectionAttempt || postInjection)) {
        if (ns.consoleDump) this.dump(channel, "externalLoad flag is " + abeReq.external);

        if (abeReq.external) { // external origin ?
          if (ns.consoleDump) this.dump(channel, "External load from " + origin);
          if (this.isHome(url)) {
            if (ns.consoleDump) this.dump(channel, "Browser home page, SKIP");
            return;
          }
          if (ns.getPref("xss.trustExternal", false)) {
            if (ns.consoleDump) this.dump(channel, "noscript.xss.trustExternal is TRUE, SKIP");
            return;
          }
          origin = "///EXTERNAL///";
          originSite = "";
        } else if(ns.getPref("xss.trustTemp", true) || !ns.isTemp(originSite)) { // temporary allowed origin?
          if (ns.consoleDump) {
            this.dump(channel, "Origin " + origin + " is trusted, SKIP");
          }
          return;
        }
        if (ns.consoleDump) 
          this.dump(channel, (abeReq.external ? "External origin" : "Origin " + origin + " is TEMPORARILY allowed") + 
            ", we don't really trust it");
      }
    }
    
    if (untrustedReload && browser) {
      this.resetUntrustedReloadInfo(browser, channel);
    }

    // -- DANGER ZONE --
    
    var requestInfo = new RequestInfo(channel, url, origin, window);

    // transform upload requests into no-data GETs
    if (ns.filterXPost &&
        (postInjection || !injectionAttempt) && // don't strip trusted to trusted uploads if they passed injection checks 
        (channel instanceof CI.nsIUploadChannel) && channel.uploadStream
      ) {
      channel.requestMethod = "GET";
      requestInfo.unsafeRequest.postData = channel.uploadStream;
      channel.setUploadStream(this.dummyUpload, "", -1);
      this.notify(this.addXssInfo(requestInfo, {
        reason: "filterXPost",
        originalAttempt: originalSpec + (postInjection ? "§DATA§" + postInjection : ""),
        silent: untrustedReload
      }));
    }
    
    if (ns.filterXGet && ns.filterXGetRx) {
      var changes = null;
      var xsan = ns.createXSanitizer();
      // sanitize referrer
      if (channel.referrer && channel.referrer.spec) {
        originalAttempt = channel.referrer.spec;
        xsan.brutal = /'"</.test(Entities.convertAll(InjectionChecker.urlUnescape(originalAttempt)));
        try {
          if (channel.referrer instanceof CI.nsIURL) {
            changes = xsan.sanitizeURL(channel.referrer);
          } else {
            channel.referrer.spec =  xsan.sanitizeURIComponent(originalAttempt);
          }
        } catch(e) {
          this.dump("Failed sanitizing referrer " + channel.referrer.spec + ", " + e);
          channel.referrer.spec = "";
        }
        try {
          if (!changes) {
            changes = { 
              minor: !channel.referrer.spec || 
                      unescape(originalAttempt) != unescape(channel.referrer.spec) 
            };
          }
          if (changes.minor) {
            channel.referrer = channel.referrer.clone();
            this.notify(this.addXssInfo(requestInfo, {
              reason: "filterXGetRef",
              originalAttempt: url.spec + " (REF: " + originalAttempt + ")",
              silent: true,
              sanitizedURI: channel.referrer
            }));
          }
        } catch(e) {
          this.dump("Failed notifying referrer sanitization: " + channel.referrer.spec + ", " + e);
          channel.referrer.spec = "";
          channel.referrer = channel.referrer.clone();
        }
      }
      
      originalAttempt = url.spec;
      xsan.brutal = injectionAttempt;
      try {
        changes = xsan.sanitizeURL(url);
      } catch(e) {
        changes = xsan.sanitizeURL(url.clone());
        if (changes.major) {
          requestInfo.reason = url.spec;
          this.abort(requestInfo);
          return;
        }
      }
      if (changes.minor) {
        this.proxyHack(channel);
        this.notify(this.addXssInfo(requestInfo, {
          reason: "filterXGet",
          originalAttempt: originalAttempt,
          silent: !changes.major 
        }));
      }
    }
   
    

    if (requestInfo.xssMaybe) {
      // avoid surprises from history & cache
      if (channel instanceof CI.nsICachingChannel) {
        
        const CACHE_FLAGS = channel.LOAD_FROM_CACHE | 
                            channel.VALIDATE_NEVER | 
                            channel.LOAD_ONLY_FROM_CACHE;
        // if(channel.loadFlags & CACHE_FLAGS) {
          channel.loadFlags = channel.loadFlags & ~CACHE_FLAGS | channel.LOAD_BYPASS_CACHE;
          if (this.consoleDump) this.dump(channel, "SKIPPING CACHE");
        // }
      }
      
      if (requestInfo.window && 
          (requestInfo.window == requestInfo.window.top || 
          requestInfo.window == requestInfo.unsafeRequest.window)
        ) {
        this.setUnsafeRequest(requestInfo.browser, requestInfo.unsafeRequest);
      }
    }
  },
  
  isBadException: function(host) {
    // TLD check for google search
    var m = host.match(/\bgoogle\.((?:[a-z]{1,3}\.)?[a-z]+)$/i);
    return m && ns.getPublicSuffix(host) != m[1];
  },
  
  
  
  proxyHack: function(channel) {
    // Work-around for channel.URI not being used directly here:
    // http://mxr.mozilla.org/mozilla/source/netwerk/protocol/http/src/nsHttpChannel.cpp#504
    
    var proxyInfo = IOUtil.getProxyInfo(channel);
     if (proxyInfo && proxyInfo.type == "http") {
       if (channel.URI.userPass == "") {
         channel.URI.userPass = "xss:xss";
         // resetting this bit will avoid auth confirmation prompt
         channel.loadFlags = channel.loadFlags & ~channel.LOAD_INITIAL_DOCUMENT_URI;
       }
     }
  },
  
  abort: function(requestInfo) {
    var channel = requestInfo.channel;
    
    if (channel instanceof CI.nsIRequest)
      IOUtil.abort(channel);
    
    this.dump(channel, "Aborted - " + requestInfo.reason);
 
    this.notify(requestInfo);
  },
  
  mergeDefaults: function(o1, o2) {
    for (p in o2) {
      if (!(p in o1)) o1[p] = o2[p];
    }
    return o1;
  },
  
  addXssInfo: function(requestInfo, xssInfo) {
    try {
      requestInfo.window = requestInfo.window || IOUtil.findWindow(requestInfo.channel);
      requestInfo.browser = requestInfo.browser || (requestInfo.window && 
                            DOM.findBrowserForNode(requestInfo.window));
    } catch(e) {}
    requestInfo.xssMaybe = true;
    return this.mergeDefaults(xssInfo, requestInfo);
  },
  
  notify: function(requestInfo) {
    var msg = "[NoScript XSS] " + ns.getString("xss.reason." + requestInfo.reason, [ 
        requestInfo.originalAttempt || "N/A",
        requestInfo.unsafeRequest && requestInfo.unsafeRequest.origin || "",
        requestInfo.sanitizedURI && requestInfo.sanitizedURI.spec || ""
      ]);
    this.dump(requestInfo.channel, "Notifying " + msg + "\n\n\n");
    ns.log(msg);
   
    try {
      if (requestInfo.silent || !requestInfo.window || !ns.getPref("xss.notify", true)) 
        return;
      if(requestInfo.window != requestInfo.window.top) { 
        // subframe

        var cur = this.getUnsafeRequest(requestInfo.browser);
        if(cur && !cur.issued) return;
        
        requestInfo.unsafeRequest.window = requestInfo.window;
        this.observeSubframeXSS(requestInfo.originalAttempt, requestInfo.unsafeRequest);
        
        if(!ns.getPref("xss.notify.subframes", true))
          return;

        var overlay = ns.findOverlay(requestInfo.browser);
        if(overlay) overlay.notifyXSS(requestInfo);
      }
      IOUtil.attachToChannel(requestInfo.channel, "noscript.XSS", requestInfo);
    } catch(e) {
      dump(e + "\n");
    }
  },
  
  observeSubframeXSS: function(url, unsafeRequest) {
    unsafeRequest.window.addEventListener("unload", function(ev) {
        var w = ev.currentTarget;
        if(w.location.href != url) return; 
        w.removeEventListener("unload", arguments.callee, false);
        unsafeRequest.window = null;
     }, false);
  },
  
  
  findBrowser: function(channel, window) {
    return DOM.findBrowserForNode(window || IOUtil.findWindow(channel));
  },
  
  dump: function(channel, msg) {
    if (!(ns.consoleDump & LOG_XSS_FILTER)) return;
    dump("[NoScript] ");
    dump((channel.URI && channel.URI.spec) || "null URI?" );
    if (channel.originalURI && channel.originalURI.spec != channel.URI.spec) {
      dump(" (" + channel.originalURI.spec + ")");
    }
    dump(" *** ");
    dump(msg);
    dump("\n");
  }
  
  
}


var Entities = {
  
  get htmlNode() {
    delete this.htmlNode;
    return this.htmlNode =
      (function() {
        try {
          // we need a loose HTML node, only way to get it today seems using hidden window
          var as = CC["@mozilla.org/appshell/appShellService;1"].getService(CI.nsIAppShellService);
          as.hiddenDOMWindow.addEventListener("unload", function(ev) {
            ev.currentTarget.removeEventListener("unload", arguments.callee, false);
            Entities.htmlNode = null;
            doc = null;
            // dump("*** Free Entities.htmlNode ***\n");
          }, false);
          return as.hiddenDOMWindow.document.createElementNS(HTML_NS, "body");
        } catch(e) {
          dump("[NoSript Entities]: Cannot grab an HTML node, falling back to XHTML... " + e + "\n");
          return CC["@mozilla.org/xul/xul-document;1"]
            .createInstance(CI.nsIDOMDocument)
            .createElementNS(HTML_NS, "body")
        }
      })()
  },
  convert: function(e) {
    try {
      this.htmlNode.innerHTML = e;
      var child = this.htmlNode.firstChild || null;
      return child && child.nodeValue || e;
    } catch(ex) {
      return e;
    }
  },
  convertAll: function(s) {
    return s.replace(/[\\&][^<>]+/g, function(e) { return Entities.convert(e) });
  },
  convertDeep: function(s) {
    for (var prev = null; (s = this.convertAll(s)) != prev; prev = s);
    return s;
  },
  neutralize: function(e, whitelist) {
    var c = this.convert(e);
    return (c == e) ? c : (whitelist && whitelist.test(c) ? e : e.replace(";", ","));
  },
  neutralizeAll: function(s, whitelist) {
    return s.replace(/&[\w#-]*?;/g, function(e) { return Entities.neutralize(e, whitelist || null); });
  }
};

function SyntaxChecker() {
  this.sandbox = new CU.Sandbox("about:");
}

SyntaxChecker.prototype = {
  lastError: null,
  lastFunction: null,
  check: function(script) {
    this.sandbox.script = script;
     try {
       return !!(this.lastFunction = this.ev("new Function(script)"));
     } catch(e) {
       this.lastError = e;
     }
     return false;
  },
  unquote: function(s, q) {
    if (!(s[0] == q && s[s.length - 1] == q &&
        !s.replace(/\\./g, '').replace(/^(['"])[^\n\r]*?\1/, "")
      )) return null;
    try {
      return this.ev(s);
    } catch(e) {}
    return null;
  },
  ev: function(s) {
    return CU.ev\u0061lInSandbox(s, this.sandbox);
  }
};

function fuzzify(s) {
  return s.replace(/\w/g, '\\W*$&');
}

const IC_COMMENT_PATTERN = '\\s*(?:\\/[\\/\\*][\\s\\S]+)?';
const IC_WINDOW_OPENER_PATTERN = fuzzify("alert|confirm|prompt|open|print|show") + "\\w*" + fuzzify("Dialog");
const IC_EVAL_PATTERN = fuzzify('eval|set(?:Timeout|Interval)|[fF]unction|Script|toString|Worker|') + IC_WINDOW_OPENER_PATTERN;
const IC_EVENT_PATTERN = "on(?:e(?:rror(?:update)?|nd)|c(?:o(?:nt(?:extmenu|rolselect)|py)|ut|lick|(?:ellc)?hange)|m(?:o(?:ve(?:end|start)?|use(?:o(?:ut|ver)|up|(?:mo|lea)ve|down|wheel|enter))|essage)|lo(?:ad|secapture)|d(?:r(?:ag(?:en(?:d|ter)|drop|over|leave|start)?|op)|ata(?:setc(?:hanged|omplete)|available)|blclick|eactivate)|s(?:t(?:op|art)|elect(?:start)?|croll|ubmit)|b(?:e(?:for(?:e(?:c(?:ut|opy)|p(?:aste|rint)|u(?:pdate|nload)|activate|editfocus)|deactivate)|gin)|lur|ounce)|p(?:ast|ropertychang)e|key(?:up|down|press)|f(?:o(?:cus(?:in|out)?|rm(?:input|change))|i(?:nish|lterchange))|in(?:put|valid)|a(?:fter(?:print|update)|bort|ctivate)|r(?:e(?:s(?:et|ize)|peat|adystatechange)|ow(?:e(?:xit|nter)|s(?:delete|inserted)))|zoom|help|unload)"
  // generated by html5_events.pl, see http://mxr.mozilla.org/mozilla-central/source/parser/html/nsHtml5AtomList.h
  ;
const IC_EVENT_DOS_PATTERN =
      "\\b(?:" + IC_EVENT_PATTERN + ")[\\s\\S]*=[\\s\\S]*\\b(?:" + IC_WINDOW_OPENER_PATTERN + ")\\b"
      + "|\\b(?:" + IC_WINDOW_OPENER_PATTERN + ")\\b[\\s\\S]+\\b(?:" + IC_EVENT_PATTERN + ")[\\s\\S]*=";
      
var InjectionChecker = {
  fuzzify: fuzzify,
  syntax: new SyntaxChecker(),
  _log: function(msg, t, i) {
    if (msg) msg = this._printable(msg);
    if(!(i || t)) {
      msg += " - LINES: ";
      var lines = [];
      for (var stack = Components.stack; (stack = stack.caller);) {
        lines.push(stack.lineNumber);
      }
      msg += lines.join(", ");
    }
    else {
      if (t) msg += " - TIME: " + (Date.now() - t);
      if (i) msg += " - ITER: " + i;
    }
    this.dump("[NoScript InjectionChecker] " + msg + "\n");
  },
  
  _printable: function (msg) {
    return msg.toString().replace(/[^\u0020-\u007e]/g, function(s) { return "{" + s.charCodeAt(0).toString(16) + "}"; });
  },
  
  dump: dump,
  log: function() {},
  get logEnabled() { return this.log == this._log; },
  set logEnabled(v) { this.log = v ? this._log : function() {}; },
  
  
  bb: function(brac, s, kets) {
    for(var j = 3; j-- > 0;) {
      s = brac + s + kets;
      if (this.checkJSSyntax(s)) return true;
    }
    return false;
  },
  
  checkJSSyntax: function(s) {
    // bracket balancing for micro injections like "''), e v a l (name,''"
    if (/^(?:''|"")?[^\('"]*\)/.test(s)) return this.bb("x(\n", s, "\n)");
    if (/^(?:''|"")?[^\['"]*\\]/.test(s)) return this.bb("y[\n", s, "\n]");
    if (/^(?:''|"")?[^\{'"]*\}/.test(s)) return this.bb("function z() {\n", s, "\n}");
    
    s += " /* COMMENT_TERMINATOR */\nDUMMY_EXPR";
    if (this.syntax.check(s)) {
      this.log("Valid fragment " + s);
      return true;
    }
    return false;
  },
  
  get breakStops() {
    var def = "\\/\\?&#;\\s<>"; // we stop on URL, JS and HTML delimiters
    var bs = {
      nq: new RegExp("[" + def + "]")
    };
    Array.forEach("'\"", // special treatment for quotes
      function(c) { bs[c] = new RegExp("[" + def + c + "]"); }
    );
    delete this.breakStops;  
    return this.breakStops = bs;
  },
  
  collapseChars: function(s) {
    return s.replace(/\;+/g, ';').replace(/\/{2,}/g, '//')
      .replace(/\s+/g, function(s) {
      return /\n/g.test(s) ? '\n' : ' ';  
    });
  },
  
  reduceBackSlashes: function(bs) {
    return bs.length % 2 ? "" : "\\";
  },
  
  reduceQuotes: function(s) {
    if (s[0] == '/') {
      // reduce common leading path fragment resembling a regular expression or a comment
      s = s.replace(/^\/[^\/\n\r]+\//, '_RX_').replace(/^\/\/[^\r\n]*/, '//_COMMENT_');
    }
    
    if (/\/\*/.test(s)) // C-style comments, would make everything really tricky
      return s;
    
    
    if (/['"\/]/.test(s)) {
    
      // drop noisy backslashes
      s = s.replace(/\\{2,}/g, this.reduceBackSlashes);
      
      // drop escaped quotes
      s = s.replace(/\\["'\/]/g, "EQ");
      var expr;
      for(;;) {
         expr = s.replace(/(^[^'"\/]*[;,\+\-=\(\[]\s*)\/[^\/]+\//g, "$1_RX_")
                .replace(/(^[^'"\/]*)(["']).*?\2/g, "$1_QS_");
         if(expr == s) break;
         s = expr;
      }
    }
    
                      // remove c++ style comments    
    return s.replace(/^([^'"\\]*?)\/\/[^\r\n]*/g, "//_COMMENT_");
  },
  
 
  reduceJSON: function(s) {
    var m, whole, qred, prev;
    const toStringRx = /^function\s*toString\(\)\s*{\s*\[native code\]\s*\}$/;
    // optimistic case first, one big JSON block
    do {
      whole = s;
      m = s.match(/{[\s\S]*}/);
      if (!m) return s;
      
      expr = m[0];
      var json = ns.json;
      if (json) {
        try {
          if (!toStringRx.test(json.decode(expr).toString))
            return s;
          
          this.log("Reducing big JSON " + expr);
          return s.replace(expr, '_JSON_');
        } catch(e) {}
      }
      
      // heavier duty, scattered JSON blocks
      while((m = s.match(/\{[^\{\}:]+:[^\{\}]+\}/g))) {
        prev = s;
  
        for each(expr in m) {
          if (json) try {
            if (!toStringRx.test(json.decode(expr).toString))
              continue;
            
            this.log("Reducing JSON " + expr);
            s = s.replace(expr, '"_JSON_"');
            continue;
          } catch(e) {}
          
          if (/\btoString\b[\s\S]*:/.test(expr)) continue;
          
          qred = this.reduceQuotes(expr);
          if (/\{(?:\s*(?:(?:\w+:)+\w+)+;\s*)+\}/.test(qred)) {
             this.log("Reducing pseudo-JSON " + expr);
             s = s.replace(expr, '"_PseudoJSON_"');
          } else if (!/[\(=\.]|[^:\s]\s*\[|:\s*(?:location|document|eval|open|show\w*Dialog)\b/.test(qred) && 
             this.checkJSSyntax("JSON = " + qred) // no-assignment JSON fails with "invalid label"
          ) { 
            this.log("Reducing slow JSON " + expr);
            s = s.replace(expr, '"_SlowJSON_"');
          }
        }
        
        if (s == prev) break;
      }
      
    } while (s != whole);

    return s;
  },
  
  reduceXML: function(s) {
    var t;
    while(/^[^"]*</.test(s)) {
        t = s.replace(/^([^"]*)<\??\s*\/?[a-zA-Z][\w\:\-]+(?:[\s\+]+[\w\:\-]+="[\w\:\-\/\.#%\s\+]*")*[\+\s]*\/?\??>/, '$1;xml;');
        if (t == s) break;
        s = t;
    }
    if (t) { s = s.replace(/(?:\s*;xml;\s*)+/g, ';xml;') };
    return s;
  },

  _singleAssignmentRx: new RegExp(
    "(?:\\b" + fuzzify('document') + "\\b[\\s\\S]*\\.|\\s" + fuzzify('setter') + "\\b[\\s\\S]*=)|/.*/[\\s\\S]*(?:\\.(?:"
      + fuzzify('source|toString') + ")|\\[)|" + IC_EVENT_DOS_PATTERN
  ),
  _riskyAssignmentRx: new RegExp(
    "\\b(?:" + fuzzify('location|innerHTML') + ")\\b[\\s\\S]*="
  ),
  _nameRx: new RegExp(
    "=[\\s\\S]*\\b" + fuzzify('name') + "\\b"
  ),
  
  _maybeJSRx: new RegExp(
    // identifier's tail...         optional comment...         
    '[\\w$\\u0080-\\uFFFF\\]\\)]' + IC_COMMENT_PATTERN + 
    // accessor followed by function call or assignment.    
     '(?:(?:[\\[]|\\.\\D)[\\s\\S]*(?:\\([\\s\\S]*\\)|=)' +
       // double function call
       '|\\([\\s\\S]*\\([\\s\\S]*\\)' +
     ')|\\b(?:' + IC_EVAL_PATTERN +
      ')\\b[\\s\\S]*\\(|\\b(?:' +
      fuzzify('setter|location|innerHTML') +
      ')\\b[\\s\\S]*=|' +
      IC_EVENT_DOS_PATTERN +
      "|=[s\\\\[ux]?\d{2}" // escape (unicode/ascii/octal)
  ),
  
  _jsSpecialFuncsRx: new RegExp(
    "\\b(?:" + IC_EVAL_PATTERN + "|on\\w+)\\s*\\("
  ),
  
  maybeJS: function(expr) {
    if(/^(?:[^\(\)="']+=[^\(='"\[]+|(?:[\?a-z_0-9;,&=\/]|\.[\d\.])*)$/i.test(expr) && !/\b=[\s\S]*_QS_\b/.test(expr)) // commonest case, single assignment or simple chained assignments, no break
      return this._singleAssignmentRx.test(expr) || this._riskyAssignmentRx.test(expr) && this._nameRx.test(expr);
    if (/^(?:[\w\-\.]+\/)*\(*[\w\-\s]+\([\w\-\s]+\)[\w\-\s]*\)*$/.test(expr)) // typical "call like" Wiki URL pattern + bracketed session IDs
      return this._jsSpecialFuncsRx.test(expr);
    
    return this._maybeJSRx.test(
        expr.replace(/(?:^|[\/;&#])[\w\-]+\.[\w\-]+[\?;\&#]/g, '', expr) // remove neutral dotted substrings
    ); 
  },
  
  checkNonTrivialJSSyntax: function(expr) {
    return this.maybeJS(this.reduceQuotes(expr)) && this.checkJSSyntax(expr);
  },
  
  checkLastFunction: function() {
    var fn = this.syntax.lastFunction;
    if (!fn) return false;
    var m = fn.toSource().match(/\{([\s\S]*)\}/);
    if (!m) return false;
    var expr = m[1];
    return /=[\s\S]*cookie|\b(?:setter|document|location|innerHTML|\.\W*src)[\s\S]*=|[\w$\u0080-\uffff\)\]]\s*[\[\(]/.test(expr) ||
            this.maybeJS(expr);
  },
  
  _createInvalidRanges: function() {
    function x(n) { return '\\x' + n.toString(16); }
    
    var ret = "";
    var first = -1;
    var last = -1;
    var cur = 0x7e;
    while(cur++ <= 0xff) {
      try {
        ev\u0061l("var _" + String.fromCharCode(cur) + "_=1");
      } catch(e) {
        if (!/illegal char/.test(e.message)) continue;
        if (first == -1) {
          first = last = cur;
          ret += x(cur);
          continue;
        }
        if (cur - last == 1) {
          last = cur;
          continue;
        }
  
        if(last != first) ret += "-" + x(last);
        ret+= x(cur);
        last = first = cur;
      }
    }
    return ret;
  },
  get invalidChars() {
    delete this.invalidChars;
    return this.invalidChars = new RegExp("^[^\"'/]*[" + this._createInvalidRanges() + "][^\"'/]*$");
  },
  checkJSBreak: function(s) {
    // Direct script injection breaking JS string literals or comments
    
    // cleanup most urlencoded noise and reduce JSON/XML
    s = this.reduceXML(this.reduceJSON(this.collapseChars(
        s.replace(/\%\d+[a-z\(]\w*/gi, '`')
          .replace(/[\r\n]+/g, "\n")
          .replace(/[\x01-\x09\x0b-\x20]+/g, ' ')
        )));
    
    if (!this.maybeJS(s)) return false;
    
    const invalidChars = this.invalidChars;
    const findInjection = 
      /(['"#;]|[\/\?=&](?![\?=&])|\*\/)(?=([\s\S]*?(?:\(|\[[\s\S]*?\]|(?:s\W*e\W*t\W*t\W*e\W*r|l\W*o\W*c\W*a\W*t\W*i\W*o\W*n|i\W*n\W*n\W*e\W*r\W*H\W*T\W*M\W*L|\W*o\W*n(?:\W*\w){3,}|\.\D)[^&]*=[\s\S]*?[\w\$\u0080-\uFFFF\.\[\]\-]+)))/g;
    
    findInjection.lastIndex = 0;
    var m, breakSeq, subj, expr, lastExpr, quote, len, bs, bsPos, hunt, moved, script, errmsg, pos;
    
    const MAX_TIME = 8000, MAX_LOOPS = 600;

    const t = Date.now();
    var iterations = 0;
    
    while ((m = findInjection.exec(s))) {
      
      subj = s.substring(findInjection.lastIndex);
      if (!this.maybeJS(subj)) {
         this.log("Fast escape on " + subj, t, iterations);
         return false;
      }
      
      breakSeq = m[1];
      expr = subj.match(/^[\s\S]*?[=\)]/);
      expr = expr && expr[0] || m[2];
      if (expr.length < m[2].length) expr = m[2];
      
      // quickly skip (mis)leading innocuous CGI patterns
      if ((m = subj.match(
        /^(?:(?:[\.\?\w\-\/&:`\[\]]+=[\w \-:\+%#,`\.]*(?:[&\|](?=[^&\|])|$)){2,}|\w+:\/\/\w[\w\-\.]*)/
        // r2l, chained query string parameters, protocol://domain, ...
        ))) {
       
        this.log("Skipping CGI pattern in " + subj);
        findInjection.lastIndex += m[0].length - 1;
        continue;
      }
      
     
      
      quote = breakSeq == '"' || breakSeq == "'" ? breakSeq : '';
      bs = this.breakStops[quote || 'nq']  

      len = expr.length;
      
      for (moved = false, hunt = !!expr, lastExpr = null; hunt;) {
        
        if (Date.now() - t > MAX_TIME) {
          this.log("Too long execution time! Assuming DOS... " + s, t, iterations);
          return true;
        }
        
        hunt = expr.length < subj.length;
        
        if (moved) {
          moved = false;
        } else if (hunt) {
          bsPos = subj.substring(len).search(bs);
          if (bsPos < 0) {
            expr = subj;
            hunt = false;
          } else {
            len += bsPos;
            if (quote && subj[len] == quote) {
              len++;
            }
            expr = subj.substring(0, len);
            if (bsPos == 0) len++;
          }
        }
        
        if(lastExpr == expr) {
          lastExpr = null;
          continue;
        }
        lastExpr = expr;
        
        if(invalidChars.test(expr)) {
          this.log("Quick skipping invalid chars");
          continue;
        }
        
        if(quote) {
          script = this.syntax.unquote(quote + expr, quote);
          if(script && this.maybeJS(script) &&
            (this.checkNonTrivialJSSyntax(script) ||
              /'.+/.test(script) && this.checkNonTrivialJSSyntax("''" + script + "'") ||
              /".+/.test(script) && this.checkNonTrivialJSSyntax('""' + script + '"')
            ) && this.checkLastFunction()
            ) {
            return true;
          }
          script = quote + quote + expr + quote;
        } else {
          script = expr;
        }
        
        if (/^(?:[^'"\/\[\(]*[\]\)]|[^"'\/]*(?:`|[^&]&[\w\.]+=[^=]))/
            .test(script.split("//")[0])) {
           this.log("SKIP (head syntax) " + script, t, iterations);
           break; // unrepairable syntax error in the head move left cursor forward 
        }
        
        if (this.maybeJS(this.reduceQuotes(script))) {

          if (this.checkJSSyntax(script) && this.checkLastFunction()) {
            this.log("JS Break Injection detected", t, iterations);
            return true;
          }
          if (++iterations > MAX_LOOPS) {
            this.log("Too many syntax checks! Assuming DOS... " + s, t, iterations);
            return true;
          }
          if(this.syntax.lastError) { // could be null if we're here thanks to checkLastFunction()
            errmsg = this.syntax.lastError.message;
            this.log(errmsg + " --- " + script + " --- ", t, iterations);
            if(!quote) {
              if (/left-hand/.test(errmsg)) {
                m = subj.match(/^([^\]\(\\'"=\?]+?)[\w$\u0080-\uffff\s]+[=\?]/);
                if (m) {
                  findInjection.lastIndex += m[1].length - 1;
                }
                break;
              } else if (/unterminated string literal/.test(errmsg)) {
                bsPos = subj.substring(len).search(/["']/);
                if(bsPos > -1) {
                  expr = subj.substring(0, len += bsPos + 1);
                  moved = true;
                } else break;
              } else if (/syntax error/.test(errmsg)) {
                bsPos = subj.indexOf("//");
                if (bsPos > -1) {
                  pos = subj.search(/['"\n\\\(]|\/\*/);
                  if (pos < 0 || pos > bsPos)
                    break;
                }
                if (/^([\w\[\]]*=)?\w*&[\w\[\]]*=/.test(subj)) { // CGI param concatenation
                  break;
                }
              }
            } else if (/left-hand/.test(errmsg)) break;
            
            if (/invalid .*\bflag\b|missing ; before statement|invalid label|illegal character/.test(errmsg)) {
              if (!(/illegal character/.test(errmsg) && /#\d*\s*$/.test(script))) // sharp vars exceptional behavior
                break; // unrepairable syntax error, move left cursor forward 
            }
            else if((m = errmsg.match(/\bmissing ([:\]\)\}]) /))) {
              len = subj.indexOf(m[1], len);
              if (len > -1) {
                expr = subj.substring(0, ++len);
                moved = m[1] != ':';
              } else break;
            }
          }
        }
      }
    }
    this.log(s, t, iterations);
    return false;
  },
  
  
  checkJS: function(s, opts) {
    this.log(s);
    // recursive escaping options
    if (!opts) opts = { uni: true, ent: true };
    
    var hasUnicodeEscapes = opts.uni && /\\u[0-9a-f]{4}/.test(s);
    if (hasUnicodeEscapes && /\\u00(?:22|27|2f)/i.test(s)) {
      this.log("Unicode-escaped lower ASCII, why would you?");
      return true;
    }
    
    // the hardcore job!
    if (this.checkAttributes(s)) return true;
    if (/[\\\(]|=[^=]/.test(s) && // quick preliminary screen
        this.checkJSBreak(s))
      return true;
    
    
    // recursive cross-unescaping
    
    if (hasUnicodeEscapes &&
        this.checkJS(this.unescapeJS(s), {
          ent: false, // even if we introduce new entities, they're unrelevant because happen post-spidermonkey
          uni: false
        })) 
      return true;
    
    if (opts.ent) {
      var converted = Entities.convertAll(s);
      if (converted != s && this.checkJS(converted, {
          ent: false,
          uni: true // we might have introduced new unicode escapes
        }))
        return true;
    }
    
    return false;
  },
  
  unescapeJS: function(s) {
    return s.replace(/\\u([0-9a-f]{4})/gi, function(s, c) {
      return String.fromCharCode(parseInt(c, 16));
    });
  },
  
  unescapeCSS: function(s) {
    // see http://www.w3.org/TR/CSS21/syndata.html#characters
    return s.replace(/\\([\da-f]{0,6})\s?/gi, function($0, $1) {
      try {
        return String.fromCharCode(parseInt($1, 16));
      } catch(e) {
        return "";
      }
    });
  },
  
  reduceDashPlus: function(s) {
    // http://forums.mozillazine.org/viewtopic.php?p=5592865#p5592865
    return s.replace(/\-+/g, "-")
        .replace(/\++/g, "+")
        .replace(/\s+/g, ' ')
        .replace(/(?: \-)+/g, ' -')
        .replace(/(?:\+\-)+/g, '+-'); 
  },
  
  attributesChecker: new RegExp(
      "\\W(?:javascript:[\\s\\S]+(?:[=\\(]|%(?:[3a]8|[3b]d))|data:[\\w\\-]+/[\\w\\-]+[;,])|@" + 
      ("import\\W*(?:\\/\\*[\\s\\S]*)?(?:[\"']|url[\\s\\S]*\\()" + 
        "|-moz-binding[\\s\\S]*:[\\s\\S]*url[\\s\\S]*\\(")
        .replace(/[a-rt-z\-]/g, "\\W*$&"), 
      "i"),
  checkAttributes: function(s) {
    s = this.reduceDashPlus(s);
    return this.attributesChecker.test(s) ||
        /\\/.test(s) && this.attributesChecker.test(this.unescapeCSS(s));
  },
  
  HTMLChecker: new RegExp("<[^\\w<>]*(?:[^<>\"'\\s]*:)?[^\\w<>]*(?:" + // take in account quirks and namespaces
   fuzzify("script|form|style|link|object|embed|applet|param|iframe|frame|base|body|meta|ima?g|svg|video|audio|marquee") + 
    ")|(?:<[^>]+|'[^>']*|\"[^>\"]*|\\s+)\\b" + IC_EVENT_PATTERN + "[\\s\\x08]*=", 
    "i"),
  checkHTML: function(s) {
    this.log(s);
    return this.HTMLChecker.test(s);
  },
  
  NoscriptChecker: new RegExp("<[^\\w<>]*(?:[^<>\"'\\s]*:)?[^\\w<>]*(?:" +
    fuzzify("form|style|link|object|embed|applet|iframe|frame|meta|svg|video|audio") + ")"
    ),
  checkNoscript: function(s) {
    this.log(s);
    return this.NoscriptChecker.test(s);
  },
  
  base64: false,
  base64tested: [],
  get base64Decoder() { return Base64 }, // exposed here just for debugging purposes
  checkBase64: function(url) {
    this.log(url);
    var t = Date.now();
    var frags, curf, j, k, pos, ff, f;
    const MAX_TIME = 4000;
    const DOS_MSG = "Too long execution time, assuming DOS in Base64 checks";
    this.base64 = false;
    // standard base64
    // notice that we cut at 8192 chars because of stack overflow in JS regexp implementation
    // (limit appears to be 65335, but cutting here seems quicker for big strings)
    // therefore we need to rejoin continuous strings manually
    url = url.replace(/\s+/g, ''); // base64 can be splitted across lines
    frags = url.match(/[A-Za-z0-9\+\/]{12,8191}=*[^A-Za-z0-9\+\/=]?/g);
    if (frags) {
      f = '';
      for (j = 0; j < frags.length; j++) {
        curf = frags[j];
        if (/[A-Za-z0-9\+\/]$/.test(curf)) {
          f += curf;
          if (j < frags.length - 1) continue;
        } else {
          f += curf.substring(0, curf.length - 1);
        }
        ff = f.split('/');
        if (ff.length > 255) {
          this.log("More than 255 base64 slash chunks, assuming DOS");
          return true;
        }
        while (ff.length) {
          
          if (Date.now() - t > MAX_TIME) {
              this.log(DOS_MSG);
              return true;
          }
          f = ff.join('/');
          if (f.length >= 12 && this.checkBase64Frag(f))
            return true;
          
          ff.shift();
        }
        f = '';
      }
    }
    // URL base64 variant, see http://en.wikipedia.org/wiki/Base64#URL_applications
    frags = url.match(/[A-Za-z0-9\-_]{12,8191}[^A-Za-z0-9\-_]?/g);
    if (frags) {
      f = '';
      for (j = 0; j < frags.length; j++) {
        if (Date.now() - t > MAX_TIME) {
          this.log(DOS_MSG);
          return true;
        }
        curf = frags[j];
        if (/[A-Za-z0-9\-_]$/.test(curf)) {
          f += curf;
          if (j < frags.length - 1) continue;
        } else {
          f += curf.substring(0, curf.length - 1);
        }
        f = f.replace(/-/g, '+').replace(/_/, '/');
        if (this.checkBase64Frag(f)) return true;
        f = '';
      }
    }
    return false;
  },
  
  checkBase64Frag: function(f) {
    if (this.base64tested.indexOf(f) < 0) {
      this.base64tested.push(f);
      try {
          var s = Base64.decode(f);
          if(s && s.replace(/[^\w\(\)]/g, '').length > 7 && (this.checkHTML(s) || this.checkJS(s))) {
            this.log("Detected BASE64 encoded injection: " + f);
            return this.base64 = true;
          }
      } catch(e) {}
    }
    return false;
  },
  
  checkURL: function(url) {
    // let's assume protocol and host are safe, but keep the leading double slash to keep comments in account
    url = url.replace(/^[a-z]+:\/\/.*?(?=\/|$)/, "//"); 
    return this.checkRecursive(url);
  },
  
  checkRecursive: function(s, depth, isPost) {
    if (typeof(depth) != "number")
      depth = 3;
    this.isPost = isPost || false;
    this.base64 = false;
    this.base64tested = [];
    return this._checkRecursive(s, depth);
  },
  
  _checkRecursive: function(s, depth) {
    
    
    if (this.checkHTML(s) || this.checkJS(s))
      return true;
    
    if (--depth <= 0)
      return false;
    
    
    if (/\+/.test(s) && this._checkRecursive(this.urlUnescape(s.replace(/\+/g, ' '), depth)))
      return true;
    
    var unescaped = this.urlUnescape(s);
    
    if (this._checkOverDecoding(s, unescaped))
      return true;
    
    if (!this.isPost && this.checkBase64(s.replace(/^\/{1,3}/, ''))) return true;
    
    if (unescaped != s && this._checkRecursive(unescaped, depth))
      return true;
    
    s = this.ebayUnescape(unescaped);
    if (s != unescaped && this._checkRecursive(s, depth))
      return true;
    
    return false;
  },
  
  _checkOverDecoding: function(s, unescaped) {
    if (/%[8-9a-f]/i.test(s)) {
      const rx = /[<'"]/g;
      var m1 = unescape(this.utf8OverDecode(s, false)).match(rx);
      if (m1) {
        unescaped = unescaped || this.urlUnescape(s);
        var m0 = unescaped.match(rx);
        if (!m0 || m0.length < m1.length) {
          this.log("Potential utf8_decode() exploit!");
          return true;
        }
      }
    }
    return false;
  },
  
  utf8OverDecode: function(url, strict) {
    return url.replace(strict
      ? /%(?:f0%80%80|e0%80|c0)%[8-b][0-f]/gi
      : /%(?:f[a-f0-9](?:%[0-9a-f]0){2}|e0%[4-9a-f]0|c[01])%[a-f0-9]{2}/gi,
      function(m) {
        var hex = m.replace(/%/g, '');
        if (strict) {
          for (var j = 2; j < hex.length; j += 2) {
            if ((parseInt(hex.substring(j, j + 2), 16) & 0xc0) != 0x80) return m;
          }
        }
        switch (hex.length) {
          case 8:
            hex = hex.substring(2);
          case 6:
            c = (parseInt(hex.substring(0, 2), 16) & 0x3f) << 12 |
                   (parseInt(hex.substring(2, 4), 16) & 0x3f) << 6 |
                    parseInt(hex.substring(4, 6), 16) & 0x3f;
            break;
          default:
            c = (parseInt(hex.substring(0, 2), 16) & 0x3f) << 6 |
                    parseInt(hex.substring(2, 4), 16) & 0x3f;
        }
        return encodeURIComponent(String.fromCharCode(c & 0x3f));
      }
    );
  },
  
  urlUnescape: function(url, brutal) {
    var od = this.utf8OverDecode(url, !brutal);
    try {
      return decodeURIComponent(od);
    } catch(warn) {
      if (url != od) url += " (" + od + ")";  
      this.log("Problem decoding " + url + ", maybe not an UTF-8 encoding? " + warn.message);
      return unescape(od);
    }
  },
  
  ebayUnescape: function(url) {
    return url.replace(/Q([\da-fA-F]{2})/g, function(s, c) {
      return String.fromCharCode(parseInt(c, 16));
    });
  },
  
  checkPost: function(channel) {
    if (!((channel instanceof CI.nsIUploadChannel)
          && channel.uploadStream && (channel.uploadStream instanceof CI.nsISeekableStream)))
      return false;
    this.log("Extracting post data...");
    return this.checkPostStream(channel.uploadStream);
  },
  
  checkPostStream: function(stream) {
     var ic = this;
     return new PostChecker(stream).check(
      function(chunk) {
        return chunk.length > 6 && ic.checkRecursive(chunk, 2, true) && chunk;
      }
    );
  },
  
  testCheckPost: function(strData) {
    var stream = CC["@mozilla.org/io/string-input-stream;1"].
            createInstance(CI.nsIStringInputStream);
    stream.setData(strData, strData.length);
    return this.checkPostStream(stream);
  }
  
};

function PostChecker(uploadStream) {
  this.uploadStream = uploadStream;  
}

PostChecker.prototype = {
  boundary: null,
  isFile: false,
  postData: '',
  check: function(callback) {
    var m, chunks, data, size, available, ret;
    const BUF_SIZE = 3 * 1024 * 1024; // 3MB
    const MAX_FIELD_SIZE = BUF_SIZE;
    try {
      var us = this.uploadStream;
      us.seek(0, 0);
      const sis = CC['@mozilla.org/binaryinputstream;1'].createInstance(CI.nsIBinaryInputStream);
      sis.setInputStream(us);
      
      // reset status
      delete this.boundary;
      delete this.isFile;
      delete this.postData;
      var t = Date.now(), t2 = t, d;
      if((available = sis.available())) do {
        size = this.postData.length;
        if (size >= MAX_FIELD_SIZE) return size + " bytes or more in one non-file field, assuming memory DOS attempt!";

        data = sis.readBytes(Math.min(available, BUF_SIZE));

        if (size != 0) {
          this.postData += data;
        } else {
           if (data.length == 0) return false;
           this.postData = data;
        }
        available = sis.available();
        chunks = this.parse(!available);
      
        for (var j = 0, len = chunks.length; j < len; j++) {
          ret = callback(chunks[j]);
          if (ret) return ret;
        }
      } while(available)
    } catch(ex) {
      dump(ex + "\n" + ex.stack + "\n");
      return ex;
    } finally {
        try {
          us.seek(0, 0); // rewind
        } catch(e) {}
    }
    return false; 
  },
  
  parse: function(eof) {
    var postData = this.postData;
    var m;
    
    if (typeof(this.boundary) != "string") {
      m = postData.match(/^Content-type: multipart\/form-data;\s*boundary=(\S*)/i);
      this.boundary = m && m[1] || '';
      if (this.boundary) this.boundary = "--" + this.boundary;
      postData = postData.substring(postData.indexOf("\r\n\r\n") + 2);
    }

    this.postData = '';

    var boundary = this.boundary;
   
    var chunks = [];
    var j, len;

    if (boundary) { // multipart/form-data, see http://www.faqs.org/ftp/rfc/rfc2388.txt  
      if(postData.indexOf(boundary) < 0) {
        // skip big file chunks
        return chunks;
      }
      var parts = postData.split(boundary);
      
      var part, last;
      for(j = 0, len = parts.length; j < len;) {
        part = parts[j];
        last = ++j == len;
        if (j == 1 && part.length && this.isFile) {
          // skip file internal terminal chunk
          this.isFile = false;
          continue;
        }
        m = part.match(/^\s*Content-Disposition: form-data; name="(.*?)"(?:;\s*filename="(.*)"|[^;])\r?\n(Content-Type: \w)?.*\r?\n/i);
        
        if (m) {
          // name and filename are backslash-quoted according to RFC822
          if (m[1]) chunks.push(m[1].replace(/\\\\/g, "\\")); // name and file name 
          if (m[2]) {
            chunks.push(m[2].replace(/\\\\/g, "\\")); // filename
            if (m[3]) {
              // Content-type: skip, it's a file
              this.isFile = true;
              
              if (last && !eof) 
                this.postData = part.substring(part.length - boundary.length);

              continue; 
            }
          }
          if (eof || !last) {
            chunks.push(part.substring(m[0].length)); // parameter body
          } else {
            this.postData = part;
          }
          this.isFile = false;
        } else {
          // malformed part, check it all or push it back
          if (eof || !last) {
            chunks.push(part)
          } else {
            this.postData = this.isFile ? part.substring(part.length - boundary.length) : part;
          }
        }
      }
    } else {
      this.isFile = false;
      parts = postData.split("&");
      if (!eof) this.postData = parts.pop();
      
      for (j = 0, len = parts.length; j < len; j++) {
        m = parts[j].split("=");
        chunks.push(m[0]);
        if (m.length > 1) chunks.push(m[1]);
      }
    }
    return chunks;
  }
}


function XSanitizer(primaryBlacklist, extraBlacklist) {
  this.primaryBlacklist = primaryBlacklist;
  this.extraBlacklist = extraBlacklist;
  this.injectionChecker = InjectionChecker;
}

XSanitizer.prototype = {
  brutal: false,
  base64: false,
  sanitizeURL: function(url) {
    var original = url.clone();
    this.brutal = this.brutal || this.injectionChecker.checkURL(url.spec);
    this.base64 = this.injectionChecker.base64;
    
    const changes = { minor: false, major: false, qs: false };
    // sanitize credentials
    if (url.username) url.username = this.sanitizeEnc(url.username);
    if (url.password) url.password = this.sanitizeEnc(url.password);
    url.host = this.sanitizeEnc(url.host);
    
    if (url instanceof CI.nsIURL) {
      // sanitize path
     
      if (url.param) {
        url.path = this.sanitizeURIComponent(url.path); // param is the URL part after filePath and a semicolon ?!
      } else if(url.filePath) { 
        url.filePath = this.sanitizeURIComponent(url.filePath); // true == lenient == allow ()=
      }1
      // sanitize query
      if (url.query) {
        url.query = this.sanitizeQuery(url.query, changes);
        if (this.brutal) {
          url.query = this.sanitizeWholeQuery(url.query, changes);
        }
      }
      // sanitize fragment
      var fragPos = url.path.indexOf("#");
      if (url.ref || fragPos > -1) {
        if (fragPos >= url.filePath.length + url.query.length) {
          url.path = url.path.substring(0, fragPos) + "#" + this.sanitizeEnc(url.path.substring(fragPos + 1));
        } else {
          url.ref = this.sanitizeEnc(url.ref);
        }
      }
    } else {
      // fallback for non-URL URIs, we should never get here anyway
      if (url.path) url.path = this.sanitizeURIComponent(url.path);
    }
    
    var urlSpec = url.spec;
    var neutralized = Entities.neutralizeAll(urlSpec, /[^\\'"\x00-\x07\x09\x0B\x0C\x0E-\x1F\x7F<>]/);
    if (urlSpec != neutralized) url.spec = neutralized;
    
    if (this.base64) {
      url.spec = url.prePath; // drastic, but with base64 we cannot take the risk!
    }
    
    if (url.getRelativeSpec(original) && unescape(url.spec) != unescape(original.spec)) { // ok, this seems overkill but take my word, the double check is needed
      changes.minor = true;
      changes.major = changes.major || changes.qs || 
                      unescape(original.spec.replace(/\?.*/g, "")) 
                        != unescape(url.spec.replace(/\?.*/g, ""));
      url.spec = url.spec.replace(/'/g, "%27")
      if (changes.major) {
        url.ref = Math.random().toString().concat(Math.round(Math.random() * 999 + 1)).replace(/0./, '') // randomize URI
      }
    } else {
      changes.minor = false;
      url.spec = original.spec.replace(/'/g, "%27");
    }
    return changes;
  },
  
  sanitizeWholeQuery: function(query, changes) {
    var original = query;
    query = Entities.convertAll(query);
    if (query == original) return query;
    var unescaped = InjectionChecker.urlUnescape(original, true);
    query = this.sanitize(unescaped);
    if (query == unescaped) return original;
    if(changes) changes.qs = true;
    return escape(query);
  },
  
  _queryRecursionLevel: 0,
  sanitizeQuery: function(query, changes, sep) {
    const MAX_RECUR = 2;
    
    var canRecur = this._queryRecursionLevel++ < MAX_RECUR;
    // replace every character matching noscript.filterXGetRx with a single ASCII space (0x20)
    changes = changes || {};
    if (!sep) {
      sep = query.indexOf("&") > -1 ? "&" : ";" 
    }
    const parms = query.split(sep);
    var j, pieces, k, pz, origPz, encodedPz, nestedURI, qpos, apos, encodeURL;
    
    for (j = parms.length; j-- > 0;) {
      pieces = parms[j].split("=");
      
      
      try {
        for (k = pieces.length; k-- > 0;) {
          encodedPz =  InjectionChecker.utf8OverDecode(pieces[k]);
          pz = null;
          if (encodedPz.indexOf("+") < 0) {
            try {
              pz = decodeURIComponent(encodedPz);
              encodeURL = encodeURIComponent;
            } catch(e) {}
          }
          if (pz == null) {
            pz = unescape(encodedPz);
            encodeURL = escape;
          }
          origPz = pz;
          
          // recursion for nested (partial?) URIs

          nestedURI = null;
          
          if (canRecur && /^https?:\/\//i.test(pz)) {
            // try to sanitize as a nested URL
            try {
              nestedURI = IOS.newURI(pz, null, null).QueryInterface(CI.nsIURL);
              changes.qs = changes.qs || this.sanitizeURL(nestedURI).major;
              if (unescape(pz).replace(/\/+$/, '') != unescape(nestedURI.spec).replace(/\/+$/, '')) pz = nestedURI.spec;
            } catch(e) {
              nestedURI = null;
            }
          }
          
          if (!nestedURI) {
            if (canRecur &&
                 (qpos = pz.indexOf("?")) > - 1 &&
                 (spos = pz.search(/[&;]/) > qpos)) { 
              // recursive query string?
              // split, sanitize and rejoin
              pz = [ this.sanitize(pz.substring(0, qpos)), 
                    this.sanitizeQuery(pz.substring(qpos + 1), changes)
                   ].join("?")
              
            } else {
              pz = this.sanitize(pz);
            }
            if (origPz != pz) changes.qs = true;
          }
          
          if (origPz != pz) pieces[k] = encodeURL(pz);  
         
        }
        parms[j] = pieces.join("=");
      } catch(e) { 
        // decoding exception, skip this param
        parms.splice(j, 1);
      } 
    }
    this._queryRecursionLevel--;
    return parms.join(sep);
  },
  
  sanitizeURIComponent: function(s) {
    try {
      var unescaped = InjectionChecker.urlUnescape(s, this.brutal);
      var sanitized = this.sanitize(unescaped);
      return sanitized == unescaped ? s : encodeURI(sanitized);
    } catch(e) {
      return "";
    }
  },
  sanitizeEnc: function(s) {
    try {
      return encodeURIComponent(this.sanitize(decodeURIComponent(s)));
    } catch(e) {
      return "";
    }
  },
  sanitize: function(unsanitized) {
    // deeply convert entities
    var s, orig;
    orig = s = Entities.convertDeep(unsanitized);
    
    if (s.indexOf('"') > -1 && !this.brutal) {
      // try to play nice on search engine queries with grouped quoted elements
      // by allowing double quotes but stripping even more aggressively other chars
      
      // Google preserves "$" and recognizes ~, + and ".." as operators
      // All the other non alphanumeric chars (aside double quotes) are ignored.
      // We will preserve the site: modifier as well
      // Ref.: http://www.google.com/help/refinesearch.html
      s = s.replace(/[^\w\$\+\.\~"&;\- :\u0080-\uffff]/g, 
          " " // strip everything but alphnum and operators
          ).replace(":", 
          function(k, pos, s) { // strip colons as well, unless it's the site: operator
            return (s.substring(0, pos) == "site" || s.substring(pos - 5) == " site") ? ":" : " " 
          }
        );
      if (s.replace(/[^"]/g, "").length % 2) s += '"'; // close unpaired quotes
      return s;
    }
    // regular duty
    s = s.replace(this.primaryBlacklist, " ");
    
    s = s.replace(/\bjavascript:+|\bdata:+[\s\w\-\/]*,|-moz-binding|@import/ig, function(m) { return m.replace(/\W/g, " "); });
    
    if (this.extraBlacklist) { // additional user-defined blacklist for emergencies
      s = s.replace(this.extraBlacklist, " "); 
    }
    
    if (this.brutal) { // injection checks were positive
      s = InjectionChecker.reduceDashPlus(s).replace(/['\(\)\=\[\]]/g, " ")
           .replace(this._brutalReplRx, String.toUpperCase)
           .replace(/Q[\da-fA-Fa]{2}/g, "Q20"); // Ebay-style escaping
    }
    
    return s == orig ? unsanitized : s;
  },
  
  _regularReplRx: new RegExp(
    fuzzify('(?:javascript|data)') + '\\W*:+|' +
      fuzzify('-moz-binding|@import'), 
    "ig"
  ),
  _brutalReplRx: new RegExp(
    '(?:' + fuzzify('setter|location|innerHTML|cookie|name|document|toString|') +
    IC_WINDOW_OPENER_PATTERN + '|' + IC_EVENT_PATTERN + ')',
    "g"
  )
  
};

// we need this because of https://bugzilla.mozilla.org/show_bug.cgi?id=439276

const Base64 = {

  decode : function (input) {
    var output = '';
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;
    
    // if (/[^A-Za-z0-9\+\/\=]/.test(input)) return ""; // we don't need this, caller checks for us

    const k = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    while (i < input.length) {

        enc1 = k.indexOf(input.charAt(i++));
        enc2 = k.indexOf(input.charAt(i++));
        enc3 = k.indexOf(input.charAt(i++));
        enc4 = k.indexOf(input.charAt(i++));

        chr1 = (enc1 << 2) | (enc2 >> 4);
        chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        chr3 = ((enc3 & 3) << 6) | enc4;

        output += String.fromCharCode(chr1);

        if (enc3 != 64) {
          output += String.fromCharCode(chr2);
        }
        if (enc4 != 64) {
          output += String.fromCharCode(chr3);
        }

    }
    return output;

  }
};


function RequestInfo(channel, url, origin, window) {
  this.channel = channel;
  this.sanitizedURI = url;
  this.window = window;
  this.unsafeRequest = {
    URI: url.clone(),
    postData: null,
    referrer: channel.referrer && channel.referrer.clone(),
    origin: origin,
    loadFlags: channel.loadFlags,
    issued: false,
    window: null
  }
}
RequestInfo.prototype = {
  xssMaybe: false 
}


function DOSChecker(request, canSpin) {
  this.request = request;
  this.canSpin = canSpin;
  Thread.asap(this.check, this);
}
DOSChecker.abort = function(req, info) {
  IOUtil.abort(("channel" in req) ? req.channel : req, true);
  ns.log("[NoScript DOS] Aborted potential DOS attempt: " +
         ( ("name" in req) ? req.name : req ) +
         "\n" + (info || new Error().stack));
};

DOSChecker.prototype = {
  done: false,
  lastClosure: null,
  run: function(closure, self) {
    this.done = false;
    this.lastClosure = closure;
    try {
      return  self ? closure.apply(self) : closure();
    } finally {
      this.done = true;
    }
  },
  check: function() {
    if (!(this.done || this.canSpin && Thread.activeLoops))
      DOSChecker.abort(this.request, (this.lastClosure && this.lastClosure.toSource()));
  }
}