ABE; // kickstart

var RequestGC = {
  INTERVAL: 5000,
  _timer: Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer),
  _pending: [],
  _running: false,
  notify: function(t) {
    try {
      let reqs = this._pending;
      for (let j = reqs.length; j-- > 0;) {
        let r = reqs[j];
        if (r.status || !r.isPending()) {
          ns.cleanupRequest(r);
          reqs.splice(j, 1);
        }
      }
      if (reqs.length === 0) {
        this.dispose();
      }
    } catch(e) {
      ns.dump(e);
    }
  },
  add: function(req) {
    this._pending.push(req);
    if (!this._running) {
      this._running = true;
      this._timer.initWithCallback(this, this.INTERVAL, Ci.nsITimer.TYPE_REPEATING_SLACK);
    }
  },
  dispose() {
    if (this._running) {
      this._timer.cancel();
      this._running = false;
    }
  }
};


function RequestWatchdog() {
  this.injectionChecker = InjectionChecker;
  this.injectionChecker.logEnabled = !!(ns.consoleDump & LOG_INJECTION_CHECK);
  this.init();
}

ns.cleanupRequest = function(channel) {
  PolicyState.detach(channel);
  ABERequest.clear(channel);
};


RequestWatchdog.prototype = {

  OBSERVED_TOPICS: ns.childProcess ? [] : ["http-on-examine-response", "http-on-examine-merged-response", "http-on-examine-cached-response"],

  init: function() {
    for (var topic  of this.OBSERVED_TOPICS) OS.addObserver(this, topic, true);
  },
  dispose: function() {
    for (var topic  of this.OBSERVED_TOPICS) OS.removeObserver(this, topic);
    RequestGC.dispose();
  },

  callback: null,
  externalLoad: null,
  noscriptReload: null,
  DOCUMENT_LOAD_FLAGS: Ci.nsIChannel.LOAD_DOCUMENT_URI
    | Ci.nsIChannel.LOAD_CALL_CONTENT_SNIFFERS, // this for OBJECT subdocs

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),

  observe(channel, topic) {
    try {
      if (!(channel instanceof Ci.nsIHttpChannel)) return;
    } catch (e) {
      ns.dump(`${topic} failed ${uneval(e)}`);
      return;
    }

    if(ns.consoleDump & LOG_SNIFF) {
      ns.dump(topic + ": " + channel.URI.spec + ", " + channel.loadFlags);
    }

    let cached = true;

    switch(topic) {

      case "http-on-examine-response":
      case "http-on-examine-merged-response":

        HTTPS.handleSecureCookies(channel);
        cached = false;

      case "http-on-examine-cached-response":
        ns.serializeReqData(channel);
        if (ns.externalFilters.enabled)
          ns.callExternalFilters(channel, cached);

        if (channel.loadFlags & this.DOCUMENT_LOAD_FLAGS) {
          ns.serializeReqData(channel);
          ABE.handleSandbox(channel);
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

    PolicyState.attach(channel); // this works before bug 797684 fix, see ns.onStateChange for now
    let abeReq = new ABERequest(channel);
    RequestGC.add(channel);

    if (HTTPS.forceChannel(channel)) return null;

    try {

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
          if (newURL && newURL != url && abeReq.redirectChain.map((u) => u.spec).indexOf(newURL) === -1) {
            let requestWatchdog = this;
            abeReq.replace(null, IOUtil.newURI(newURL), function(replacement) {
              if (isReload) requestWatchdog.noscriptReload = newURL;
              replacement.open();
            });
            return null;
          }
        }

        new DOSChecker(abeReq).run(function() {
          MaxRunTime.increase(40);
          return this.filterXSS(abeReq);
        }, this);
      }
      if (!channel.status) {
        this.handleABE(abeReq, isDoc);
      }
      return abeReq;
    } catch(e) {
      this.die(channel, e);
    }
    return null;
  },

  die: function(channel, e) {
    this.abort({ channel: channel, reason: e + " --- " + e.stack, silent: true });
  },

  handleABE: function(abeReq, isDoc) {
    if (abeReq && ABE.enabled) {
      try {
        // ns.dump("handleABE called for " + abeReq.serial + ", " + abeReq.destination + " at " + Components.stack.caller);
        let res = new DOSChecker(abeReq, true).run(function() {
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

        ns.log(`[ABE] < ${lastRule.destinations}> ${lastPredicate} on ${req}\n${rs.name} rule:\n${lastRule}`);
        if (silent || rs != abeRes.lastRuleset || lastPredicate.inclusion)
          return;

        if (lastRule.local && silentLoopback) {
          let host = req.destinationURI.host;
          if (host != "localhost" && host != "127.0.0.1" && req.destinationURI.port <= 0) {
            // this should hugely reduce notifications for users of bogus hosts files,
            // while keeping "interesting" notifications
            let dnsr = DNS.getCached(host);
            if (dnsr && dnsr.entries.indexOf("127.0.0.1") > -1)
              return;
          }
        }

        let browser = this.findBrowser(req.channel);
        if (browser)
          browser.ownerDocument.defaultView.noscriptOverlay
            .notifyABE({
              request: req,
              action: action,
              ruleset: rs,
              lastRule: lastRule,
              lastPredicate: lastPredicate,
              browser: browser,
            });
      }, this);
  },

  get dummyPost() {
    const v = Cc["@mozilla.org/io/string-input-stream;1"].createInstance();
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
    if (requestInfo.browser && !requestInfo.silent) {
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
    try {
      if (browser.contentWindow == window) {
        if (ns.consoleDump) this.dump(channel, "Top level document, resetting former untrusted browser info");
        this.setUntrustedReloadInfo(browser, false);
      }
    } catch (e) {
    }
  },
  setUntrustedReloadInfo: function(browser, status) {
    return ns.setExpando(browser, "untrustedReload", status);
  },
  getUntrustedReloadInfo: function(browser) {
    return ns.getExpando(browser, "untrustedReload");
  },

  _listeners: [],
  addCrossSiteListener(l) {
    if (this._listeners.indexOf(l) === -1) {
      this._listeners.push(l);
    }
  },
  removeCrossSiteListener: function(l) {
    var pos = this._listeners.indexOf(l);
    if (pos > -1) this._listeners.splice(pos);
  },

  onCrossSiteRequest: function(channel, origin, browser) {
    for (var l  of this._listeners) {
      l.onCrossSiteRequest(channel, origin, browser, this);
    }
  },

  isHome: function(url) {
    return url instanceof Ci.nsIURL &&
      this.getHomes().some(function(urlSpec) {
        try {
          return !url.getRelativeSpec(IOUtil.newURI(urlSpec));
        } catch(e) {}
        return false;
      });
  },
  getHomes: function(pref) {
    var homes;
    try {
      homes = ns.prefService.getComplexValue(pref || "browser.startup.homepage",
                         Ci.nsIPrefLocalizedString).data;
    } catch (e) {
      return pref ? [] : this.getHomes("browser.startup.homepage.override");
    }
    return homes ? homes.split("|") : [];
  },

  PAYPAL_BUTTON_RX: /^https:\/\/www\.paypal\.com\/(?:[\w\-]+\/)?cgi-bin\/webscr\b/,

  filterXSS: function(abeReq) {

    const channel = abeReq.channel;

    let reqData = ns.reqData(channel);
    delete reqData.xssChecked; // remove redirected info

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
        channel.loadFlags = (channel.loadFlags & ~Ci.nsIChannel.VALIDATE_ALWAYS) |
                    Ci.nsIChannel.LOAD_FROM_CACHE | Ci.nsIChannel.VALIDATE_NEVER;
        if (channel.loadGroup) {
          channel.loadGroup.loadFlags = (channel.loadGroup.loadFlags & ~Ci.nsIChannel.VALIDATE_ALWAYS) |
                  Ci.nsIChannel.LOAD_FROM_CACHE | Ci.nsIChannel.VALIDATE_NEVER;
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
    

    let origin = abeReq.origin;
    if (origin === "[System Principal]" &&
        !(channel.loadFlags & (channel.VALIDATE_ALWAYS | channel.LOAD_BYPASS_SERVICE_WORKER))) {
      return; // System principal but this is not a reload or a navbar load
    }

    let originSite = null,
      browser = this.findBrowser(channel),
      window = null,
      untrustedReload = false;

    if (!origin) {
      if ((channel instanceof Ci.nsIHttpChannelInternal) && channel.documentURI) {
        if (originalSpec === channel.documentURI.spec) {
          // check untrusted reload
          if (!this.getUntrustedReloadInfo(browser)) {
            if (ns.consoleDump) this.dump(channel, "Trusted reload");
            return;
          }
          origin = originSite = "";
          untrustedReload = true;
          if (ns.consoleDump) this.dump(channel, "Untrusted reload");
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
          !reqData.XSS) {
        // clean up after user action
        window = window || abeReq.window;
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
    if (host[host.length - 1] == "." && ns.getPref("canonicalFQDN", true)) {
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
      window = window || abeReq.window;
      if(ns.autoAllow) {
        if (window && window == window.top || channel.loadInfo && (channel.loadInfo.externalContentPolicyType || channel.loadInfo.contentPolicyType) === 6) {
          targetSite = ns.getQuickSite(originalSpec, ns.autoAllow);
          if(targetSite && !ns.isJSEnabled(targetSite, window)) {
            ns.autoTemp(targetSite);
          }
          targetSite = su.getSite(originalSpec);
        }
      }
      if(!trustedTarget) {
        targetSite = su.getSite(originalSpec);
        trustedTarget = ns.isJSEnabled(targetSite, window);
        if(!trustedTarget) {
          if (ns.checkShorthands(targetSite)) {
            ns.autoTemp(targetSite);
            trustedTarget = true;
          } else {
            ns.recordBlocked(targetSite, originSite);
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
      this.onCrossSiteRequest(channel, origin, browser);
    }

    if (this.callback && this.callback(channel, origin)) return;

    /*
    // uncomment me if you want the "old" behavior of checking only script-enabled targets
    if (!trustedTarget) {
      if (InjectionChecker.checkNoscript(InjectionChecker.urlUnescape(originalSpec)) && ns.getPref("injectionCheckHTML", true)) {
        if (ns.consoleDump) this.dump(channel, "JavaScript disabled target positive to HTML injection check!");
      } else {
        if (ns.consoleDump) this.dump(channel, "Target is not Javascript-enabled, skipping XSS checks.");
        return;
      }
    }
    */
    
     // fast return if nothing to do here
    if (!(ns.filterXPost || ns.filterXGet)) return;

    if (!abeReq.external && this.isUnsafeReload(browser)) {
      if (ns.consoleDump) this.dump(channel, "UNSAFE RELOAD of [" + originalSpec +"] from [" + origin + "], SKIP");
      return;
    }

    let unescapedSpec = unescape(originalSpec);

    if (ns.filterXExceptions) {
      try {
        if (ns.filterXExceptions.test(unescapedSpec) &&
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

    if (abeReq.external && /^https?:\/\/msdn\.microsoft\.com\/query\/[^<]+$/.test(unescapedSpec)) {
      return; // MSDN from Visual Studio
    }

    if (originSite) { // specific exceptions

      if (/^about:(?!blank)/.test(originSite))
        return; // any about: URL except about:blank

      if (/^https?:\/\/my\.ebay\.(?:\w{2,3}|co\.uk)\/ws\/eBayISAPI\.dll\?[^<'"%]*CurrentPage=MyeBayAllFavorites\b[^<'"%]*$/.test(origin) &&
          /^https?:\/\/www\.ebay\.(?:\w{2,3}|co\.uk)\/sch\/i\.html\?[^<'"]*$/.test(unescapedSpec) &&
          url.scheme === abeReq.originURI.scheme &&
          ns.getBaseDomain(ns.getDomain(url)) === ns.getBaseDomain(ns.getDomain(abeReq.originURI)) &&
          ns.getPref("filterXException.ebay")) {
        if (ns.consoleDump) this.dump(channel, "Ebay exception");
        return;
      }

      if (/^https?:\/\/(?:[^/]+\.)photobucket\.com$/.test(originSite) &&
          /^https?:\/\/(?:[^/]+\.)photobucket\.com\/[^<]*$/.test(unescapedSpec) &&
          url.scheme === abeReq.originURI.scheme &&
          ns.getBaseDomain(ns.getDomain(url)) === ns.getBaseDomain(ns.getDomain(abeReq.originURI)) &&
          ns.getPref("filterXException.photobucket")) {
        if (ns.consoleDump) this.dump(channel, "Photobucket exception");
        return;
      }

      if (originSite === "https://www.youtube.com" &&
          /^https:\/\/(?:plus\.googleapis|apis\.google)\.com\/[\w/]+\/widget\/render\/comments\?/.test(originalSpec) &&
          ns.getPref("filterXExceptions.yt_comments")
          ) {
        if (ns.consoleDump) this.dump(channel, "YouTube comments exception");
        return;
      }

      if (channel.requestMethod == "POST") {

        if (originSite === "https://sso.post.ch" && targetSite === "https://app.swisspost.ch") {
          return;
        }

        if (originSite === "https://twitter.com" && /^https:\/\/.*\.twitter\.com$/.test(targetSite)) {
          return;
        }

        {
          let rx = /^https:\/\/(?:[a-z]+\.)?unionbank\.com$/;
          if (rx.test(originSite) && rx.test(targetSite)) {
            return;
          }
        }

        if (/^https?:\/\/csr\.ebay\.(?:\w{2,3}|co\.uk)\/cse\/start\.jsf$/.test(origin) &&
            /^https?:\/\/msa-lfn\.ebay\.(?:\w{2,3}|co\.uk)\/ws\/eBayISAPI\.dll\?[^<'"%]*$/.test(unescapedSpec) &&
            url.scheme === abeReq.originURI.scheme &&
            ns.getPref("filterXException.ebay")) {
          if (ns.consoleDump) this.dump(channel, "Ebay exception");
          return;
        }

        if (/^https:\/\/(?:cap\.securecode\.com|www\.securesuite\.net|(?:.*?\.)?firstdata\.(?:l[tv]|com))$/.test(origin) &&
            ns.getPref("filterXException.visa")) {
          if (ns.consoleDump) this.dump(channel, "Verified by Visa exception");
          return;
        }

        if (/\.verizon\.com$/.test(originSite) &&
            /^https:\/\/signin\.verizon\.com\/sso\/authsso\/forumLogin\.jsp$/.test(originalSpec) &&
            ns.getPref("filterXExceptions.verizon")) {
          if (ns.consoleDump) this.dump(channel, "Verizon login exception");
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

        if (/^https?:\/\/www\.readability\.com\/articles\/queue$/.test(originalSpec) &&
            ns.getPref("filterXExceptions.readability")) {
          if (ns.consoleDump) this.dump(channel, "Readability exception");
          return;
        }

        if (/^https?:\/\/pdf\.printfriendly\.com\/pdfs\/make$/.test(originalSpec) &&
            ns.getPref("filterXExceptions.printfriendly")) {
          if (ns.consoleDump) this.dump(channel, "Printfriendly exception");
          return;
        }

      }

    }



    let originalAttempt;
    let postInjection = false;

    window = window || abeReq.window;

    // neutralize window.name-based attack
    if (window && window.name) {

      if (ns.compatEvernote && window.frameElement && window.name.indexOf("iframe") > 0 &&
          /^https?:\/\/(?:[a-z]+\.)*evernote\.com\/clip\.action$/.test(originalSpec) &&
          channel.requestMethod == "POST") {
        // Evernote Web Clipper hack
        window.frameElement.addEventListener("load", ns.compatEvernote.onload, false);
        if (ns.consoleDump) this.dump(channel, "Evernote frame detected (noscript.compat.evernote)");
        return;
      }
    }


    if (!/^(?:https:\/\/.*\.nwolb\.com){2}$/.test(originSite + targetSite)) {
      reqData.checkWindowName = true;
    } else {
      this.dump(channel, "nwolb.com window.name check exception.");
    }

    let focusedBrowserWin = DOM.mostRecentBrowserWindow;
    let trustedOrigin = globalJS || ns.isJSEnabled(originSite, focusedBrowserWin && focusedBrowserWin.content) ||
        !origin ||
        // we consider null origin as "trusted" (i.e. we check for injections but
        // don't strip POST unconditionally) to make some extensions (e.g. Google Gears)
        // work. For dangerous edge cases we should have moz-null-principal: now, anyway.
        origin.substring(0, 5) == "file:";

    let originDomain = ns.getDomain(originSite),
        targetDomain = ns.getDomain(url);

    if (trustedOrigin) {

      if (origin &&
          (
          /^https?:\/\/(?:[^\/]+.)?facebook\.com\/[\w\.\-\/]+fbml\.php$/.test(originalSpec) && channel.requestMethod == "POST" ||
          /^https?:\/\/www\.facebook\.com\/plugins\/serverfbml.php\?/.test(originalSpec) ||
          /^https?:\/\/api\.connect\.facebook\.com$/.test(originSite)

          ) &&
            ns.getPref("filterXExceptions.fbconnect")) {
        if (ns.consoleDump) this.dump(channel, 'Facebook connect exception');
        return;
      }


      this.resetUntrustedReloadInfo(browser, channel);

      // here we exceptionally consider same site also https->http with same domain

      if (injectionCheck < 3 && originSite && abeReq.originURI.schemeIs("https")) {
        
        if (targetDomain === originDomain || ns.getBaseDomain(originDomain) === ns.getBaseDomain(targetDomain)) {
          this.dump(channel, "Same base domain with HTTPS origin");
          return;
        }
      }
    }

    let stripPost = trustedTarget && originDomain && !trustedOrigin && ns.filterXPost &&
      ns.getBaseDomain(originDomain) !== ns.getBaseDomain(targetDomain);

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
      } else if ("https://secure.przelewy24.pl/" === targetSite)  {
        stripPost = true;
      } else if (/\.adnxs\.com$/.test(originSite) && /\.adnxs\.com$/.test(targetSite)) {
        skipArr = ['udj'];
      } else if (/^https?:\/\/www\.mendeley\.com\/import\/bookmarklet\/$/.test(originalSpec)) {
        skipArr = ['html'];
      } else if (/^https?:\/\/[\w\-\.]+\/talkpost_do(?:\.bml)?$/.test(originalSpec) &&
          ns.getBaseDomain(ns.getDomain(originalSpec)) == ns.getBaseDomain(ns.getDomain(originSite)) &&
          ns.getPref("filterXExceptions.livejournal")) {
        if (ns.consoleDump) this.dump(channel, "Livejournal-like comments exception");
        skipArr = ['body'];
      } else if (url.ref && trustedOrigin &&
          (/^https?:\/\/api\.facebook\.com\//.test(origin) && ns.getPref("filterXExceptions.fbconnect") ||
          /^https:\/\/tbpl\.mozilla\.org\//.test(origin) ||  // work-around for hg reftest DOS
          /^https:\/\/[^\/]+\.googleusercontent\.com\/gadgets\/ifr\?/.test(originalSpec) && ns.getPref("filterXExceptions.ggadgets") // Google gadgets
          )) {
        skipRx = /#[^#]+$/; // remove receiver's hash
      } else if (/^https?:\/\/apps\.facebook\.com\//.test(origin) && ns.getPref("filterXExceptions.fbconnect")) {
        skipRx = /&invite_url=javascript[^&]+/; // Zynga stuff
      } else if (/^https?:\/\/l\.yimg\.com\/j\/static\/frame\?e=/.test(originalSpec) &&
                /\.yahoo\.com$/.test(originSite) &&
                ns.getPref("filterXExceptions.yahoo")) {
        skipArr = ['e'];
        if (ns.consoleDump) this.dump(channel, "Yahoo exception");
      } else if (/^https?:\/\/wpcomwidgets\.com\/\?/.test(originalSpec)) {
        skipArr = ["_data"];
      } else if (/^https:\/\/docs\.google\.com\/picker\?/.test(originalSpec)) {
        skipArr = ["nav", "pp"];
      } else if (/^https:\/\/.*[\?&]scope=/.test(originalSpec)) {
        skipRx = /[\?&]scope=[+\w]+(?=&|$)/;
      }
      if (skipArr) {
        skipRx = new RegExp("(?:^|[&?])(?:" + skipArr.join('|') + ")=[^&]+", "g");
      }


      let injectionChecker = ns.injectionChecker;

      injectionChecker.reset();

      if (!stripPost)
        stripPost = postInjection =
          ns.filterXPost &&
          (!origin || originSite != "chrome:") &&
          channel.requestMethod == "POST" && injectionChecker.checkPost(channel, skipArr);

      let protectName = injectionChecker.nameAssignment;

      injectionAttempt = ns.filterXGet && injectionChecker.checkURL(
        skipRx ? originalSpec.replace(skipRx, '') : originalSpec);

      reqData.protectName = (protectName = (protectName || injectionChecker.nameAssignment));

      if (ns.consoleDump) {
        if (injectionAttempt) this.dump(channel, "Detected injection attempt at level " + injectionCheck);
        if (postInjection) this.dump(channel, "Detected POST injection attempt at level "  + injectionCheck);
        if (protectName) this.dump(channel, "Name assignment detected, gonna protect window.name");
      }
    }

    reqData.xssChecked = true;

    if (trustedOrigin && !(injectionAttempt || stripPost))
      return;

    if (untrustedReload && browser) {
      this.resetUntrustedReloadInfo(browser, channel);
    }


    // -- DANGER ZONE --

    let requestInfo = new RequestInfo(channel, url, origin, window);

    // transform upload requests into no-data GETs
    if (ns.filterXPost && stripPost &&
        (channel instanceof Ci.nsIUploadChannel) && channel.uploadStream
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
          if (channel.referrer instanceof Ci.nsIURL) {
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

      let newURI = url.clone();

      if (injectionAttempt) {
        xsan.brutal = injectionAttempt;
        changes = xsan.sanitizeURL(newURI);
        if (changes.minor) {
          this.notify(this.addXssInfo(requestInfo, {
            reason: "filterXGet",
            originalAttempt: originalAttempt,
            sanitizedURI: newURI,
            silent: !(changes.major || postInjection)
          }));
        }
        if (newURI.spec != url.spec) {
          if (!abeReq.replace(null, newURI)) {
            this.proxyHack(channel);
            url.spec = newURI.spec;
          }
        }
      }
    }

    if (requestInfo.xssMaybe) {
      // avoid surprises from history & cache
      if (channel instanceof Ci.nsICachingChannel) {

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
       if (channel.URI.userPass === "") {
         channel.URI.userPass = "xss:xss";
         // resetting this bit will avoid auth confirmation prompt
         channel.loadFlags = channel.loadFlags & ~channel.LOAD_INITIAL_DOCUMENT_URI;
       }
     }
  },

  abortChannel: function(channel, reason) {
    let originURI = ABERequest.getOrigin(channel);
    let requestInfo = this.addXssInfo(new RequestInfo(channel), {
      reason: reason || "filterXGet",
      originalAttempt: channel.name,
      origin: originURI && originURI.spec || "",
      silent: false,
    });
    this.abort(requestInfo);
    this.attachUnsafeRequest(requestInfo);
  },

  abort: function(requestInfo) {
    var channel = requestInfo.channel;

    if (channel instanceof Ci.nsIRequest)
      IOUtil.abort(channel);

    if (requestInfo.browser) {
      requestInfo.browser.stop(requestInfo.browser.STOP_ALL);
    }
    this.dump(channel, "Aborted - " + requestInfo.reason);

    this.notify(requestInfo);
  },

  mergeDefaults: function(o1, o2) {
    for (let p in o2) {
      if (!(p in o1)) o1[p] = o2[p];
    }
    return o1;
  },

  addXssInfo: function(requestInfo, xssInfo) {
    try {
      requestInfo.window = requestInfo.window || IOUtil.findWindow(requestInfo.channel);
      requestInfo.browser = requestInfo.browser || IOUtil.findBrowser(requestInfo.channel);
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
      let sync = requestInfo.channel.status !== 0;
      let loadInfo = requestInfo.channel.loadInfo;
      let cpType = loadInfo && (loadInfo.externalContentPolicyType || loadInfo.contentPolicyType);
      if (!cpType && requestInfo.window) {
        cpType = requestInfo.window === requestInfo.window.top ? 6 : 7;
      }
      if (requestInfo.silent || !(cpType === 6 || cpType === 7) || !ns.getPref("xss.notify", true))
        return;
      if(cpType !== 6) {
        // subframe

        var cur = this.getUnsafeRequest(requestInfo.browser);
        if(cur && !cur.issued) return;

        requestInfo.unsafeRequest.window = requestInfo.window;
        this.observeSubframeXSS(requestInfo.originalAttempt, requestInfo.unsafeRequest);

        if(!ns.getPref("xss.notify.subframes", true))
          return;

        sync = true;
      }

      if (sync) {
        let overlay = ns.findOverlay(requestInfo.browser);
        if(overlay) overlay.notifyXSS(requestInfo);
      }

      requestInfo.wrappedJSObject = requestInfo;
      ns.reqData(requestInfo.channel).XSS = requestInfo;
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


  findBrowser: function(channel) {
    return IOUtil.findBrowser(channel);
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


};

function RequestInfo(channel, url, origin, window) {
  this.channel = channel;
  if (!url) url = channel.URI;
  this.sanitizedURI = url;
  this.window = window || IOUtil.findWindow(channel);
  if (!origin) {
    let originURI = ABERequest.getOrigin(channel);
    origin = originURI && originURI.spec || "???";
  }
  this.unsafeRequest = {
    URI: url.clone(),
    postData: null,
    referrer: channel.referrer && channel.referrer.clone(),
    origin: origin,
    loadFlags: channel.loadFlags,
    issued: false,
    window: null
  };
}
RequestInfo.prototype = {
  xssMaybe: false
};


function DOSChecker(request, canSpin) {
  this.request = request;
  this.canSpin = canSpin;
  Thread.asap(this.check, this);
}

DOSChecker.abort = function(req, info) {
  if (req) IOUtil.abort(("channel" in req) ? req.channel : req, true);
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
};

var MaxRunTime = {
  branch: Cc["@mozilla.org/preferences-service;1"]
        .getService(Ci.nsIPrefService).getBranch("dom."),
  prefs: ["max_script_run_time", "max_chrome_script_run_time"],
  stored: [],
  increase: function(v) {
    let prefs = this.prefs, stored = this.stored;
    for (let j = prefs.length; j-- > 0;) {
      let cur, pref = prefs[j];
      try {
        cur = this.branch.getIntPref(pref);
      } catch(e) {
        cur = -1;
      }
      if (cur <= 0 || cur >= v) return;
      if (typeof stored[j] === "undefined") try {
        stored[j] = cur;
      } catch(e) {}
      this.branch.setIntPref(pref, v);
    }
  },
  restore: function() {
    let prefs = this.prefs, stored = this.stored;
    for (let j = stored.length; j-- > 0;) {
      this.branch.setIntPref(prefs[j], stored[j]);
    }
    stored.length = 0;
  }
};
