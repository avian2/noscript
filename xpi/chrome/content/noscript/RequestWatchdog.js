ABE; // kickstart

function RequestWatchdog() {  
  this.injectionChecker = InjectionChecker;
  this.pendingChannels = [];
  this.init();
}
RequestWatchdog.pendingChannels = [];
RequestWatchdog.timer = (function () {
    var timer = CC["@mozilla.org/timer;1"].createInstance(CI.nsITimer);
    timer.initWithCallback({
      notify: function() {
        try {
        let channels = RequestWatchdog.pendingChannels;
        for (let j = channels.length; j-- > 0;) {
          let c = channels[j];
          if (c.status || !c.isPending()) {
            ns.cleanupRequest(c);
            channels.splice(j, 1);
          }
        }
        } catch(e) {
          ns.dump(e);
        }
      }
    }, 1000, CI.nsITimer.TYPE_REPEATING_SLACK);
    return timer;
  })();

ns.cleanupRequest = function(channel) {
  PolicyState.detach(channel);
  ABERequest.clear(channel);
};
  

RequestWatchdog.prototype = {
  
  OBSERVED_TOPICS: ["http-on-examine-response", "http-on-examine-merged-response", "http-on-examine-cached-response"],
  
  init: function() {
    for each (var topic in this.OBSERVED_TOPICS) OS.addObserver(this, topic, true);
  },
  dispose: function() {
    for each (var topic in this.OBSERVED_TOPICS) OS.removeObserver(this, topic);
  },
  
  callback: null,
  externalLoad: null,
  noscriptReload: null,
  DOCUMENT_LOAD_FLAGS: CI.nsIChannel.LOAD_DOCUMENT_URI
    | CI.nsIChannel.LOAD_CALL_CONTENT_SNIFFERS, // this for OBJECT subdocs
  
  QueryInterface: xpcom_generateQI([CI.nsIObserver, CI.nsISupportsWeakReference]),
  
  observe: function(channel, topic, data) {
   
    if (!(channel instanceof CI.nsIHttpChannel)) return;
    
    if(ns.consoleDump & LOG_SNIFF) {
      ns.dump(topic + ": " + channel.URI.spec + ", " + channel.loadFlags);
    }

    
    switch(topic) {

      case "http-on-examine-response":
        
        STS.processRequest(channel);
        
      case "http-on-examine-merged-response":
        
        HTTPS.handleSecureCookies(channel);
        cached = false;
        
      case "http-on-examine-cached-response":
        
        if (ns.externalFilters.enabled)
          ns.callExternalFilters(channel, cached);
        
        if (channel.loadFlags & this.DOCUMENT_LOAD_FLAGS) {
          ns.onContentSniffed(channel);
        } else {
          if (!((ns.inclusionTypeChecking || ns.nosniff) && ns.checkInclusionType(channel)))
            return;
        }
      break;
    }
  },
  
  onHttpStart: function(channel) {
    const loadFlags = channel.loadFlags;
    let isDoc = loadFlags & this.DOCUMENT_LOAD_FLAGS;

    PolicyState.attach(channel);
    RequestWatchdog.pendingChannels.push(channel);
    
    HTTPS.forceChannel(channel);

    if (isDoc) {
      let ph = PolicyState.extract(channel); 
      if (ph && ph.context) isDoc = !(ph.context instanceof CI.nsIDOMHTMLEmbedElement);
    }
    
    
  
    try {
      
      let abeReq = new ABERequest(channel);
      if (this.externalLoad && this.externalLoad === abeReq.destination) {
        abeReq.external = true;
        this.externalLoad = null;
      }
      
      if (isDoc) {
        
        let url = abeReq.destination;
        if (url.indexOf("#!") > 0 &&
          (url.indexOf("?") === -1 || url.indexOf("?_escaped_fragment_=") > 0) &&
          ns.getPref("ajaxFallback.enabled")) {
          let qs = '?_escaped_fragment_=' + url.match(/#!(.*)/)[1].replace(/[\s&=]/g, encodeURIComponent);
          
          let newURL = "", isReload = false;
          if (ns.isJSEnabled(ns.getSite(url))) {
            if (url.indexOf(qs) > 0 && (isReload = this.noscriptReload === url)) {
              newURL = url.replace(qs, "").replace(/([^#&]+)&/, '$1?');
            }   
          } else if (url.indexOf(qs) === -1) {
            newURL = url.replace(/(?:\?_escaped_fragment_=[^&#]*)|(?=#!)/, qs);
          }
          if (newURL && newURL != url && abeReq.redirectChain.map(function(u) u.spec).indexOf(newURL) === -1) {
            channel.URI.spec = abeReq.destination = newURL;
            if (isReload) this.noscriptReload = newURL;
          }
        }
        
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
        
        if (silent || rs != abeRes.lastRuleset || lastPredicate.inclusion)
          return;
        
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
  attachUnsafeRequest: function(requestInfo) {
    if (requestInfo.window && 
        (requestInfo.window == requestInfo.window.top || 
        requestInfo.window == requestInfo.unsafeRequest.window)
      ) {
      this.setUnsafeRequest(requestInfo.browser, requestInfo.unsafeRequest);
    }
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
            wn = DOM.getDocShellForWindow(unsafeRequest.window);
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
  
  
  PAYPAL_BUTTON_RX: /^https:\/\/www\.paypal\.com\/(?:[\w\-]+\/)?cgi-bin\/webscr\b/,
  
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
    
    let origin = abeReq.origin,
      originSite = null,
      browser = null,
      window = null,
      untrustedReload = false;

    if (!origin) {
      if ((channel instanceof CI.nsIHttpChannelInternal) && channel.documentURI) {
        if (originalSpec === channel.documentURI.spec) {
           originSite = ns.getSite(abeReq.traceBack);
           if (originSite && abeReq.traceBack !== originalSpec) {
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
             origin = originSite = "";
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
      if (channel.loadFlags & channel.LOAD_INITIAL_DOCUMENT_URI &&
          channel.originalURI.spec == url.spec &&
          !IOUtil.extractFromChannel(channel, "noscript.XSS", true)
          ) {
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
    
    let host = url.host;
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
    
    let targetSite;
    const globalJS = ns.globalJS;
    let trustedTarget = globalJS;
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
      
    if (!targetSite) targetSite = su.getSite(originalSpec);
    
    // noscript.injectionCheck about:config option adds first-line 
    // detection for XSS injections in GET requests originated by 
    // whitelisted sites and landing on top level windows. Value can be:
    // 0 - never check
    // 1 - check cross-site requests from temporary allowed sites
    // 2 - check every cross-site request (default)
    // 3 - check every request
    
    let injectionCheck = ns.injectionCheck;
    
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
      } catch(e) {}
    }
    
    if (originSite) { // specific exceptions
      
      if (/^about:(?!blank)/.test(originSite))
        return; // any about: URL except about:blank
      
      if (channel.requestMethod == "POST") {
        
        if (originSite === "https://cap.securecode.com" && ns.getPref("filterXException.visa")) {
          if (ns.consoleDump) this.dump(channel, "Verified by Visa (cap.securecode.com) exception");
          return;
        }
        
        if (/^https?:\/\/mail\.lycos\.com\/lycos\/mail\/MailCompose\.lycos$/.test(origin) &&
            /\.lycosmail\.lycos\.com$/.test(targetSite) &&
            ns.getPref("filterXExceptions.lycosmail")) {
          if (ns.consoleDump) this.dump(channel, "Lycos Mail exception");
          return;
        }
        
        if (/\.livejournal\.com$/.test(originSite) &&
            /^https?:\/\/www\.livejournal\.com\/talkpost_do\.bml$/.test(originalSpec) &&
            ns.getPref("filterXExceptions.livejournal")) {
          if (ns.consoleDump) this.dump(channel, "Livejournal comments exception");
          return;
        }
        
        if (originSite == "https://ssl.rapidshare.com" &&
            ns.getBaseDomain(ns.getDomain(targetSite)) == "rapidshare.com") {
          if (ns.consoleDump) this.dump(channel, "Rapidshare upload exception");
          return;
        }
        
        if (originSite == "http://wm.letitbit.net" &&
            /^http:\/\/http\.letitbit\.net:81\/cgi-bin\/multi\/upload\.cgi\?/.test(originalSpec) &&
            ns.getPref("filterXExceptions.letitibit")
            ) {
          if (ns.consoleDump) this.dump(channel, "letitbit.net upload exception");
          return;
        }
        
        if (/\.deviantart\.com$/.test(originSite) &&
            /^http:\/\/my\.deviantart\.com\/journal\/update\b/.test(originalSpec) &&
             ns.getPref("filterXExceptions.deviantart")
            ) {
          if (ns.consoleDump) this.dump(channel, "deviantart.com journal post exception");
          return;
        }
        
        if (originSite == "https://www.mymedicare.gov" &&
            targetSite == "https://myporal.medicare.gov" &&
            ns.getPref("filterXExceptions.medicare")
            ) {
          if (ns.consoleDump) this.dump(channel, "mymedicare.gov exception");
          return;
        }
        
        if (/^https?:\/\/(?:draft|www)\.blogger\.com\/template-editor\.g\?/.test(origin) &&
            /^https?:\/\/[\w\-]+\.blogspot\.com\/b\/preview\?/.test(originalSpec) &&
            ns.getPref("filterXExceptions.blogspot")
            ) {
          if (ns.consoleDump) this.dump(channel, "blogspot.com template preview exception");
          return;
        }
        
        if (originalSpec === "https://www.readability.com/articles/queue" &&
            ns.getPref("filterXExceptions.readability")) {
          if (ns.consoleDump) this.dump(channel, "Readability exception");
          return;
        }
        
      }
    
    } else { // maybe data or javascript URL?
      
      if (/^(?:javascript|data):/i.test(origin) && ns.getPref("xss.trustData", true)) {
        originSite = ns.getSite(abeReq.traceBack);
        if (originSite) { 
          origin = abeReq.breadCrumbs.join(">>>");
        }
      }
      
    }
    
    let originalAttempt;
    let postInjection = false;
    
    window = window || abeReq.window;
    
    // neutralize window.name-based attack
    if (window && window.name) {
      
      if (ns.compatEvernote && window.frameElement && window.name.indexOf("iframe") > 0
          && /^https?:\/\/(?:[a-z]+\.)*evernote\.com\/clip\.action$/.test(originalSpec)
          && channel.requestMethod == "POST") {
        // Evernote Web Clipper hack
        window.frameElement.addEventListener("load", ns.compatEvernote.onload, false);
        if (ns.consoleDump) this.dump(channel, "Evernote frame detected (noscript.compat.evernote)");
        return;
      }
      
      this.checkWindowName(window);
    
    }
    
    
    
    let trustedOrigin = globalJS || ns.isJSEnabled(originSite) ||
        !origin // we consider null origin as "trusted" (i.e. we check for injections but 
                // don't strip POST unconditionally) to make some extensions (e.g. Google Gears) 
                // work. For dangerous edge cases we should have moz-null-principal: now, anyway.
                || 
        origin.substring(0, 5) == "file:";
    
    if (trustedOrigin) {

      if (origin &&
          (
          /^http:\/\/(?:[^\/]+.)?facebook\.com\/[\w\.\-\/]+fbml\.php$/.test(originalSpec) &&
            channel.requestMethod == "POST" ||
          /^https?:\/\/api\.connect\.facebook\.com$/.test(originSite)
            
          ) &&
            ns.getPref("filterXExceptions.fbconnect")) {
        if (ns.consoleDump) this.dump(channel, 'Facebook connect exception');
        return;
      }
      
      
      this.resetUntrustedReloadInfo(browser = browser || this.findBrowser(channel, window), channel);
      
      // here we exceptionally consider same site also http<->https (target would be blocked by
      // certificate checks if something phishy is going on with DNS)
      
      if (injectionCheck < 3) {
        if (/^https?:/.test(originSite)) {
          let originDomain = ns.getDomain(originSite), targetDomain = ns.getDomain(url);
          if (targetDomain == originDomain) {
            this.dump(channel, "Same domain with HTTP(S) origin");
            return;
          }
        }
      }
    }
    
    let stripPost = !trustedOrigin && ns.filterXPost; 
    
    // check for injections
      
    let injectionAttempt = injectionCheck && (injectionCheck > 1 || !trustedOrigin || ns.isTemp(originSite)) &&
      (!window || ns.injectionCheckSubframes || window == window.top);

    if (injectionAttempt) {
      let skipArr, skipRx;
      let isPaypal = this.PAYPAL_BUTTON_RX.test(originalSpec);
      
      if (isPaypal) {
        stripPost = false;
        // Paypal buttons encrypted parameter causes a DOS, strip it out
        skipArr = ['encrypted'];
      } else if (/^https?:\/\/www\.mendeley\.com\/import\/bookmarklet\/$/.test(originalSpec)) {
        skipArr = ['html'];
      } else if (/^https?:\/\/[\w\-\.]+\/talkpost_do(?:\.bml)?$/.test(originalSpec) &&
          ns.getBaseDomain(ns.getDomain(originalSpec)) == ns.getBaseDomain(ns.getDomain(originSite)) &&
          ns.getPref("filterXExceptions.livejournal")) {
        if (ns.consoleDump) this.dump(channel, "Livejournal-like comments exception");
        skipArr = ['body'];
      } else if (url.ref && /^https?:\/\/api\.facebook\.com\//.test(origin) && ns.getPref("filterXExceptions.fbconnect")) {
        skipRx = /#[^#]+$/; // remove receiver's hash
      } else if (/^https?:\/\/apps\.facebook\.com\//.test(origin) && ns.getPref("filterXExceptions.fbconnect")) {
        skipRx = /&invite_url=javascript[^&]+/; // Zynga stuff
      }
      
      if (skipArr) {
        skipRx = new RegExp("(?:^|&)(?:" + skipArr.join('|') + ")=[^&]+");
      }
      
      if (!stripPost)
        stripPost = postInjection =
          ns.filterXPost &&
          (!origin || originSite != "chrome:") &&
          channel.requestMethod == "POST" && ns.injectionChecker.checkPost(channel, skipArr);
      
      injectionAttempt = ns.filterXGet && ns.injectionChecker.checkURL(
        skipRx ? originalSpec.replace(skipRx, '') : originalSpec);
      
      if (ns.consoleDump) {
        if (injectionAttempt) this.dump(channel, "Detected injection attempt at level " + injectionCheck);
        if (postInjection) this.dump(channel, "Detected POST injection attempt at level "  + injectionCheck);
      }
    }
    
    
    if (trustedOrigin && !(injectionAttempt || stripPost))
      return;
    
    if (untrustedReload && browser) {
      this.resetUntrustedReloadInfo(browser, channel);
    }


    // -- DANGER ZONE --
    
    let requestInfo = new RequestInfo(channel, url, origin, window);

    // transform upload requests into no-data GETs
    if (ns.filterXPost && stripPost && 
        (channel instanceof CI.nsIUploadChannel) && channel.uploadStream
      ) {
      try {
        channel.requestMethod = "GET";
      } catch (e) {}
      requestInfo.unsafeRequest.postData = channel.uploadStream;
      channel.setUploadStream(this.dummyUpload, "", -1);
      this.notify(this.addXssInfo(requestInfo, {
        reason: "filterXPost",
        originalAttempt: originalSpec + (postInjection ? "###DATA###" + postInjection : ""),
        silent: untrustedReload
      }));
      
      this.attachUnsafeRequest(requestInfo);
    }
    
    if (!(injectionAttempt || postInjection)) return;
    
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
              originalAttempt: originalSpec + " (REF: " + originalAttempt + ")",
              silent: !postInjection,
              sanitizedURI: channel.referrer
            }));
          }
        } catch(e) {
          this.dump("Failed notifying referrer sanitization: " + channel.referrer.spec + ", " + e);
          channel.referrer.spec = "";
          channel.referrer = channel.referrer.clone();
        }
      }
      
      originalAttempt = originalSpec;
      
      if (injectionAttempt) {
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
            silent: !(changes.major || postInjection) 
          }));
        }
      }
    }
   
    if (requestInfo.xssMaybe) {
      // avoid surprises from history & cache
      if (channel instanceof CI.nsICachingChannel) {
        
        const CACHE_FLAGS = channel.LOAD_FROM_CACHE | 
                            channel.VALIDATE_NEVER | 
                            channel.LOAD_ONLY_FROM_CACHE;
        
        channel.loadFlags = channel.loadFlags & ~CACHE_FLAGS | channel.LOAD_BYPASS_CACHE;
        if (this.consoleDump) this.dump(channel, "SKIPPING CACHE");
      }
      
      this.attachUnsafeRequest(requestInfo);
    }
  },
  
  isBadException: function(host) {
    // TLD check for Google search
    let m = host.match(/\bgoogle\.((?:[a-z]{1,3}\.)?[a-z]+)$/i);
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
      requestInfo.wrappedJSObject = requestInfo;
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
    var impl = CC["@mozilla.org/xul/xul-document;1"].createInstance(CI.nsIDOMDocument).implementation;
    return this.htmlNode = (("createHTMLDocument" in impl)
      ? impl.createHTMLDocument("")
      : impl.createDocument(
        HTML_NS, "html", impl.createDocumentType(
          "html", "-//W3C//DTD HTML 4.01 Transitional//EN", "http://www.w3.org/TR/html4/loose.dtd"  
        ))
      ).createElementNS(HTML_NS, "body");
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
    return CU.evalInSandbox(s, this.sandbox);
  }
};

const wordCharRx = /\w/g;
function fuzzify(s) {
  return s.replace(wordCharRx, '\\W*$&');
}

const IC_COMMENT_PATTERN = '\\s*(?:\\/[\\/\\*][\\s\\S]+)?';
const IC_WINDOW_OPENER_PATTERN = fuzzify("alert|confirm|prompt|open(?:URL)?|print|show") + "\\w*" + fuzzify("Dialog");
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
    var def = "\\/\\?&#;\\s\\x00<>"; // we stop on URL, JS and HTML delimiters
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
      s = s.replace(/\\["'\/]/g, " EQ ");
      var expr;
      for(;;) {
         expr = s.replace(/(^[^'"\/]*[;,\+\-=\(\[]\s*)\/[^\/]+\//g, "$1 _RX_ ")
                .replace(/(^[^'"\/]*)(["']).*?\2/g, "$1 _QS_ ");
         if(expr == s) break;
         s = expr;
      }
    }
    
    // remove c++ style comments    
    return s.replace(/^([^'"\\]*?)\/\/[^\r\n]*/g, "$1//_COMMENT_");
  },
  
  reduceURLs: function(s) {
    // nested URLs with protocol are parsed as C++ style comments, and since
    // they're potentially very expensive, we preemptively remove them if possible
    while (/^[^'"]*?:\/\//.test(s)) {
      s = s.replace(/:\/\/.*/, ':');
    }    
    s = s.replace(/:\/\/[^'"\n]*/g, ':');
    
    return (/\bhttps?:$/.test(s) && !/\bh\W*t\W*t\W*p\W*s?.*=/.test(s))
      ? s.replace(/https?:$/, '')
      : s;
  },
  
  reduceJSON: function(s) {
    const toStringRx = /^function\s*toString\(\)\s*{\s*\[native code\]\s*\}$/;
    // optimistic case first, one big JSON block
    for (;;) {
     
      let m = s.match(/{[\s\S]*}/);
      if (!m) return s;
      
      let whole = s;
      let expr = m[0];
      let json = ns.json;
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
        let prev = s;
  
        for each(expr in m) {
          if (json) try {
            if (!toStringRx.test(json.decode(expr).toString))
              continue;
            
            this.log("Reducing JSON " + expr);
            s = s.replace(expr, '"_JSON_"');
            continue;
          } catch(e) {}
          
          if (/\btoString\b[\s\S]*:/.test(expr)) continue;
          
          let qred = this.reduceQuotes(expr);
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
      
      if (s == whole) break;
    }

    return s;
  },
  
  reduceXML: function(s) {
    var res;
    
    for (;;) {
      let pos = s.indexOf("<");
      if (pos === -1) break;
      
      let head = s.substring(0, pos);
      let tail = s.substring(pos);
      let qnum = 0;
      for (pos = -1; (pos = head.indexOf('"', ++pos)) > -1; ) {
        if (pos === 0 || head[pos - 1] != '\\') qnum++;
      }
      if (qnum % 2) break; // odd quotes

      let t = tail.replace(/^<\??\s*\/?[a-zA-Z][\w\:\-]*(?:[\s\+]+[\w\:\-]+="[\w\:\-\/\.#%\s\+\*\?&;=`]*")*[\+\s]*\/?\??>/, ';xml;');
      if (t === tail) break;
      
      (res || (res = [])).push(head);
      s = t;
    }
    if (res) {
      res.push(s);
      s = res.join('').replace(/(?:\s*;xml;\s*)+/g, ';xml;');
    }
    
    return s;
  }
,

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
     '(?:(?:\\[[\\s\\S]*\\]|\\.\\D)[\\s\\S]*(?:\\([\\s\\S]*\\)|=)' +
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
  
  _dotRx: /\./g,
  _removeDots: function(p) { return p.replace(InjectionChecker._dotRx, '_'); },
  
  maybeJS: function(expr) {
    expr = // dotted URL components can lead to false positives, let's remove them
      expr.replace(/(?:[\/\?&#]|^)[\w\.\-]+(?=[\/\?&#]|$)/g, this._removeDots);
    
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
    function x(n) { return '\\u' + ("0000" + n.toString(16)).slice(-4); }
    
    var ret = "";
    var first = -1;
    var last = -1;
    var cur = 0x7e;
    while(cur++ <= 0xffff) {
      try {
        eval("var _" + String.fromCharCode(cur) + "_=1");
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
  
  get invalidCharsRx() {
    delete this.invalidCharsRx;
    return this.invalidCharsRx = new RegExp("^[^\"'/]*[" + this._createInvalidRanges() + "]");
  },
  
  checkJSBreak: function InjectionChecker_checkJSBreak(s) {
    // Direct script injection breaking JS string literals or comments
    
    // cleanup most urlencoded noise and reduce JSON/XML
    s = this.reduceXML(this.reduceJSON(this.collapseChars(
        s.replace(/\%\d+[a-z\(]\w*/gi, '`')
          .replace(/[\r\n]+/g, "\n")
          .replace(/[\x01-\x09\x0b-\x20]+/g, ' ')
        )));
    
    if (!this.maybeJS(s)) return false;

    const MAX_TIME = 8000, MAX_LOOPS = 1200;

    const
      invalidCharsRx = /[\u007f-\uffff]/.test(s) && this.invalidCharsRx,
      dangerRx = /(?:\(|\[[^\]+\]|(?:setter|location|innerHTML|on\w{3,}|\.\D)[^&]*=[\s\S]*?[\w\$\u0080-\uFFFF\.\[\]\-]+)/,
      exprMatchRx = /^[\s\S]*?[=\)]/,
      safeCgiRx = /^(?:(?:[\.\?\w\-\/&:`\[\]]+=[\w \-:\+%#,`\.]*(?:[&\|](?=[^&\|])|$)){2,}|\w+:\/\/\w[\w\-\.]*)/,
        // r2l, chained query string parameters, protocol://domain, ...
      headRx = /^(?:[^'"\/\[\(]*[\]\)]|[^"'\/]*(?:`|[^&]&[\w\.]+=[^=]))/
    ;
    
    const injectionFinderRx = /(['"#;>:]|[\/\?=](?![\?&=])|&(?![\w\-\.\[\]&!]*=)|\*\/)(?!\1)/g;
    injectionFinderRx.lastIndex = 0;    
    
    const t = Date.now();
    var iterations = 0;
    
    for (let dangerPos = 0; (m = injectionFinderRx.exec(s));) {
    
      
      let startPos = injectionFinderRx.lastIndex;
      let subj = s.substring(startPos);
      if (startPos > dangerPos) {
        dangerRx.lastIndex = startPos;
        if (!dangerRx.exec(s)) return false;
        dangerPos = dangerRx.lastIndex;
      }
       

      if (!this.maybeJS(subj)) {
         this.log("Fast escape on " + subj, t, iterations);
         return false;
      }

      
      let breakSeq = m[1];

      let script = this.reduceURLs(subj);
    
      if (script.length < subj.length) {
        if (!this.maybeJS(script)) {
          this.log("Skipping to first nested URL in " + subj, t, iterations);
          injectionFinderRx.lastIndex += subj.indexOf("://") + 1;
          continue;
        }
        subj = script;
        script = this.reduceURLs(subj.substring(0, dangerPos - startPos));
      } else {
        script = subj.substring(0, dangerPos - startPos);
      }
 
      let expr = subj.match(exprMatchRx);

      if (expr) {
        expr = expr[0];
        if (expr.length < script.length) {
          expr = script;
        }
      } else {
        expr = script;
      }

      // quickly skip (mis)leading innocuous CGI patterns
      if ((m = subj.match(safeCgiRx))) {
       
        this.log("Skipping CGI pattern in " + subj);

        injectionFinderRx.lastIndex += m[0].length - 1;
        continue;
      }
      

      
      let quote = breakSeq == '"' || breakSeq == "'" ? breakSeq : '';
      let bs = this.breakStops[quote || 'nq']  
   
      for (let len = expr.length, moved = false, hunt = !!expr, lastExpr = ''; hunt;) {
        
        if (Date.now() - t > MAX_TIME) {
          this.log("Too long execution time! Assuming DOS... " + (Date.now() - t), t, iterations);
          return true;
        }
     
        hunt = expr.length < subj.length;
             
        if (moved) {
          moved = false;
        } else if (hunt) {
          let pos = subj.substring(len).search(bs);
          if (pos < 0) {
            expr = subj;
            hunt = false;
          } else {
            len += pos;
            if (quote && subj[len] == quote) {
              len++;
            }
            expr = subj.substring(0, len);
            if (pos == 0) len++;
          }
        }
        
        if(lastExpr === expr) {
          lastExpr = '';
          continue;
        }
        
        lastExpr = expr;
           
        if(invalidCharsRx && invalidCharsRx.test(expr)) {
          this.log("Quick skipping invalid chars");
 
          break;
        }
     
        if(quote) {
          script = this.syntax.unquote(quote + expr, quote);
          if(script && this.maybeJS(script) &&
            (this.checkNonTrivialJSSyntax(script) ||
              /'./.test(script) && this.checkNonTrivialJSSyntax("''" + script + "'") ||
              /"./.test(script) && this.checkNonTrivialJSSyntax('""' + script + '"')
            ) && this.checkLastFunction()
            ) {
            this.log("JS quote Break Injection detected", t, iterations);
            return true;
          }
          script = quote + quote + expr + quote;
        } else {
          script = expr;
        }
        
        if (headRx.test(script.split("//")[0])) {
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
            let errmsg = this.syntax.lastError.message;
            this.log(errmsg + " --- " + script + " --- ", t, iterations);
            if(!quote) {
              if (errmsg.indexOf("left-hand") !== -1) {
                let m = subj.match(/^([^\]\(\\'"=\?]+?)[\w$\u0080-\uffff\s]+[=\?]/);
                if (m) {
                  injectionFinderRx.lastIndex += m[1].length - 1;
                }
                break;
              } else if (errmsg.indexOf("unterminated string literal") !== -1) {
                let quotePos = subj.substring(len).search(/["']/);
                if(quotePos > -1) {
                  expr = subj.substring(0, len += ++quotePos);
                  moved = true;
                } else break;
              } else if (errmsg.indexOf("syntax error") !== -1) {
                let dblSlashPos = subj.indexOf("//");
                if (dblSlashPos > -1) {
                  let pos = subj.search(/['"\n\\\(]|\/\*/);
                  if (pos < 0 || pos > dblSlashPos)
                    break;
                }
                if (/^([\w\[\]]*=)?\w*&[\w\[\]]*=/.test(subj)) { // CGI param concatenation
                  break;
                }
              }
            } else if (errmsg.indexOf("left-hand") !== -1) break;
            
            if (/invalid .*\bflag\b|missing ; before statement|invalid label|illegal character|identifier starts immediately/.test(errmsg)) {
              if (errmsg.indexOf("illegal character") === -1 && /#\d*\s*$/.test(script)) { // sharp vars exceptional behavior
                if (!quote) break;
                // let's retry without quotes
                quote = lastExpr = '';
                hunt = moved = true;
              } else break;
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
      "\\W(?:javascript:[\\s\\S]+(?:[=\\\\\\(<]|%(?:[3a]8|[3b]d))|data:[^,]+,[\\w\\W]*?<[^<]*\\w[^<]*>)|@" + 
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
   fuzzify("script|form|style|svg|marquee|(?:link|object|embed|applet|param|iframe|frame|base|body|meta|ima?ge?|video|audio|bindings") + 
    ")[^>\\w])|(?:<[^>]+|'[^>']*|\"[^>\"]*|\\s+)\\b(?:formaction|" + IC_EVENT_PATTERN +
     ")[\\s\\x08]*=|<\\W*(?:a|map)\\b[\\s\\S]+\\bstyle\\W*=", 
    "i"),
  checkHTML: function(s) {
    this.log(s);
    return this.HTMLChecker.test(s);
  },
  
  NoscriptChecker: new RegExp("<[^\\w<>]*(?:[^<>\"'\\s]*:)?[^\\w<>]*(?:" +
    fuzzify("style|form|svg|(?:link|object|embed|applet|param|iframe|frame|meta|video|audio|base") +
      ")[^>])|(?:<[^>]+|'[^>']*|\"[^>\"]*|\\s+)\\bformaction[\\s\\x08]*=",
    "i"
    ),
  checkNoscript: function(s) {
    this.log(s);
    return this.NoscriptChecker.test(s) || this.checkSQLI(s);
  },
  
  checkSQLI: function(s) /\bunion\b[\w\W]+\bselect\b[\w\W]+(?:(?:0x|x')[0-9a-f]{16}|(?:0b|b')[01]{64}|\(|\|\||\+)/.test(s),
  
  base64: false,
  base64tested: [],
  get base64Decoder() { return Base64 }, // exposed here just for debugging purposes
  
  
  checkBase64: function(url) {
    this.base64 = false;
    
    const MAX_TIME = 8000;
    const DOS_MSG = "Too long execution time, assuming DOS in Base64 checks";
    
    this.log(url);
   
    
    var parts = url.split("#"); // check hash
    if (parts.length > 1 && this.checkBase64FragEx(unescape(parts[1])))
      return true;
    
    parts = parts[0].split(/[&;]/); // check query string
    if (parts.length > 0 && parts.some(function(p) {
        var pos = p.indexOf("=");
        if (pos > -1) p = p.substring(pos + 1);
        return this.checkBase64FragEx(unescape(p));
      }, this))
      return true;
    
    url = parts[0];
    parts = Base64.purify(url).split("/");
    if (parts.length > 255) {
      this.log("More than 255 base64 slash chunks, assuming DOS");
      return true;
    }
    
    
    var t = Date.now();
    if (parts.some(function(p) {
        if (Date.now() - t > MAX_TIME) {
            this.log(DOS_MSG);
            return true;
        }
        return this.checkBase64Frag(Base64.purify(Base64.alt(p)));
      }, this))
      return true;
    
    
    var uparts = Base64.purify(unescape(url)).split("/");
    
    t = Date.now();
    while(parts.length) {
      if (Date.now() - t > MAX_TIME) {
          this.log(DOS_MSG);
          return true;
      }
      if (this.checkBase64Frag(parts.join("/")) ||
          this.checkBase64Frag(uparts.join("/")))
        return true;
      
      parts.shift();
      uparts.shift();
    }

    return false;
  },
  
  
  checkBase64Frag: function(f) {
    if (this.base64tested.indexOf(f) < 0) {
      this.base64tested.push(f);
      try {
        var s = Base64.decode(f);
        if(s && s.replace(/[^\w\(\)]/g, '').length > 7 &&
           (this.checkHTML(s) ||
              this.checkAttributes(s))
           // this.checkJS(s) // -- alternate, whose usefulness is doubious but which easily leads to DOS
           ) {
          this.log("Detected BASE64 encoded injection: " + f + " --- (" + s + ")");
          return this.base64 = true;
        }
      } catch(e) {}
    }
    return false;
  },
  
  checkBase64FragEx: function(f) {
    return this.checkBase64Frag(Base64.purify(f)) || this.checkBase64Frag(Base64.purify(Base64.alt(f)));
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
    
    if (ASPIdiocy.affects(s) && this.checkRecursive(ASPIdiocy.filter(s), depth, isPost)) {
      return true;
    }

    if (this.isPost) {
      s = this.formUnescape(s);
      if (this.checkBase64Frag(Base64.purify(s))) return true;
      
      if (s.indexOf("<") > -1) {
        // remove XML-embedded Base64 binary data
        s = s.replace(/<((?:\w+:)?\w+)>[0-9a-zA-Z+\/]+=*<\/\1>/g, '');
      }
      
      s = "#" + s;
    } else {
      if (this.checkBase64(s.replace(/^\/{1,3}/, ''))) return true;
    }
    
    if (this.isPost) s = "#" + s; // allows the string to be JS-checked as a whole
    return this._checkRecursive(s, depth);
  },
  
  _checkRecursive: function(s, depth) {
    
    
    if (this.checkHTML(s) || this.checkJS(s) || this.checkSQLI(s))
      return true;
    
    if (--depth <= 0)
      return false;
    
    
    if (/\+/.test(s) && this._checkRecursive(this.formUnescape(s), depth))
      return true;
    
    var unescaped = this.urlUnescape(s);
    
    if (this._checkOverDecoding(s, unescaped))
      return true;
    
    if (/[\n\r\t]|&#/.test(unescaped)) {
      var unent = Entities.convertAll(unescaped).replace(/[\n\r\t]/g, '');
      if (unescaped != unent && this._checkRecursive(unent, depth)) {
        this.log("Trash-stripped nested URL match!"); // http://mxr.mozilla.org/mozilla-central/source/netwerk/base/src/nsURLParsers.cpp#100
        return true;
      }
    }

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
      return unescape(brutal ? ASPIdiocy.filter(od) : od);
    }
  },
  
  formUnescape: function(s, brutal) {
    return this.urlUnescape(s.replace(/\+/g, ' '), brutal);
  },
  
  aspUnescape: function(s) {
    return unescape(ASPIdiocy.filter(s).replace(/\+/g, ' '));
  },
  
  ebayUnescape: function(url) {
    return url.replace(/Q([\da-fA-F]{2})/g, function(s, c) {
      return String.fromCharCode(parseInt(c, 16));
    });
  },
  
  checkPost: function(channel, skip) {
    if (!((channel instanceof CI.nsIUploadChannel)
          && channel.uploadStream && (channel.uploadStream instanceof CI.nsISeekableStream)))
      return false;
    
    var clen = -1;
    try {
      clen = chan.getRequestHeader("Content-length");
    } catch(e) {}
    MaxRunTime.increase(clen < 0 || clen > 300000 ? 60 : Math.ceil(20 * clen / 100000));
    
    this.log("Extracting post data...");
    return this.checkPostStream(channel.URI.spec, channel.uploadStream, skip);
  },
  
  checkPostStream: function(url, stream, skip) {
     var ic = this;
     var pc = new PostChecker(url, stream, skip);
     return pc.check(
      function(chunk) {
        return chunk.length > 6 &&
          ic.checkRecursive(chunk, 2, !pc.isFile) && chunk;
      }
    );
  },
  
  testCheckPost: function(url, strData) {
    var stream = CC["@mozilla.org/io/string-input-stream;1"].
            createInstance(CI.nsIStringInputStream);
    stream.setData(strData, strData.length);
    return this.checkPostStream(url, stream);
  }
  
};

function PostChecker(url, uploadStream, skip) {
  this.url = url;
  this.uploadStream = uploadStream;
  this.skip = skip || false;
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
     
      if ((available = sis.available())) do {
        size = this.postData.length;
        if (size >= MAX_FIELD_SIZE) return size + " bytes or more in one non-file field, assuming memory DOS attempt!";

        data = sis.readBytes(Math.min(available, BUF_SIZE));

        if (size !== 0) {
          this.postData += data;
        } else {
           if (data.length === 0) return false;
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
    var j, len, name;
    
    var skip = this.skip;
    
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
          name = m[1];
          if (name) {
            chunks.push(name.replace(/\\\\/g, "\\")); // name and file name
          }
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
            if (!(skip && skip.indexOf(name) !== -1))
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
      
      parts = postData.replace(/^\s+/, '').split("&");
      if (!eof) this.postData = parts.pop();

      for (j = 0, len = parts.length; j < len; j++) {
        m = parts[j].split("=");
        name = m[0];
        if (skip && skip.indexOf(name) > -1) continue;
        chunks.push(name, m[1] || '');
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
    
    for (let j = parms.length; j-- > 0;) {
      let pieces = parms[j].split("=");

      try {
        for (let k = pieces.length; k-- > 0;) {
          
          let encodedPz =  InjectionChecker.utf8OverDecode(pieces[k]);
          
          let pz = null, encodeURL = null;
          if (encodedPz.indexOf("+") < 0) {
            try {
              pz = decodeURIComponent(encodedPz);
              encodeURL = encodeURIComponent;
            } catch(e) {}
          }
          if (pz == null) {
            pz = unescape(ASPIdiocy.filter(encodedPz));
            encodeURL = escape;
          }
          
          let origPz = pz;
          
          // recursion for nested (partial?) URIs

          let nestedURI = null;
          
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
            let qpos;
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
    
    s = s.replace(/\bjavascript:+|\bdata:[^,]+,(?=[^<]*<)|-moz-binding|@import/ig, function(m) { return m.replace(/(.*?)(\w)/, "$1#no$2"); });
    
    if (this.extraBlacklist) { // additional user-defined blacklist for emergencies
      s = s.replace(this.extraBlacklist, " "); 
    }
    
    if (this.brutal) { // injection checks were positive
      s = InjectionChecker.reduceDashPlus(s)
        .replace(/['\(\)\=\[\]<]/g, " ")
        .replace(/0x[0-9a-f]{16,}|0b[01]{64,}/gi, " ")
        .replace(this._brutalReplRx, String.toUpperCase)
        .replace(/Q[\da-fA-Fa]{2}/g, "Q20") // Ebay-style escaping
        .replace(/%[\n\r\t]*[0-9a-f][\n\r\t]*[0-9a-f]/gi, " ")
        ; 
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
  
  purify: function(input) {
    return input.replace(/[^A-Za-z0-9\+\/=]+/g, '');
  },
  
  alt: function(s) {
    // URL base64 variant, see http://en.wikipedia.org/wiki/Base64#URL_applications
    return s.replace(/-/g, '+').replace(/_/g, '/')
  },
  
  decode: function (input, strict) {  
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
    MaxRunTime.restore();
    
    if (!(this.done || this.canSpin && Thread.activeLoops))
      DOSChecker.abort(this.request, (this.lastClosure && this.lastClosure.toSource()));
  }
}

var MaxRunTime = {
  branch: CC["@mozilla.org/preferences-service;1"]
        .getService(CI.nsIPrefService).getBranch("dom."),
  pref: "max_script_run_time",
  increase: function(v) {
    var cur;
    try {
      cur = this.branch.getIntPref(this.pref);
    } catch(e) {
      cur = -1;
    }
    if (cur <= 0 || cur >= v) return;
    if (typeof(this.storedValue) === "undefined") try {
      this.storedValue = cur;
    } catch(e) {}
    this.branch.setIntPref(this.pref, v);
  },
  restore: function() {
    if (typeof(this.storedValue) !== "undefined") {
      this.branch.setIntPref(this.pref, this.storedValue);
      delete this.storedValue;
    }
  }
};


var ASPIdiocy = {
  _replaceRx: /%u([0-9a-fA-F]{4})/g,
  _affectsRx: /%u[0-9a-fA-F]{4}/,
  affects: function(s) {
    return this._affectsRx.test(s);
  },
  filter: function(s) {
    return s.replace(this._replaceRx, this._replace);
  },
  _replace: function(match, hex) {
     // lazy init
     INCLUDE("ASPIdiocy");
     return ASPIdiocy._replace(match, hex);
  }
}

