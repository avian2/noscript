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
        t.cancel();
        this._running = false;
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
  }
}


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
  DOCUMENT_LOAD_FLAGS: Ci.nsIChannel.LOAD_DOCUMENT_URI
    | Ci.nsIChannel.LOAD_CALL_CONTENT_SNIFFERS, // this for OBJECT subdocs

  QueryInterface: xpcom_generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),

  observe: function(channel, topic, data) {

    if (!(channel instanceof Ci.nsIHttpChannel)) return;

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

    PolicyState.attach(channel); // this works before bug 797684 fix, see ns.onStateChange for now
    let abeReq = new ABERequest(channel);
    RequestGC.add(channel);

    if (HTTPS.forceChannel(channel)) return null;

    if (isDoc) {
      let ph = PolicyState.extract(channel);
      let context = ph && ph.context;
      if (context) {
        isDoc = !(context instanceof Ci.nsIDOMHTMLEmbedElement || /^application\/x-/i.test(ph.mimeType));
        if (isDoc && Bug.$677050 && !(loadFlags & channel.LOAD_REPLACE) && (context instanceof Ci.nsIDOMHTMLObjectElement)) {
          (new ChannelReplacement(channel)).replace();
          return null;
        }
      }
    }

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
          if (newURL && newURL != url && abeReq.redirectChain.map(function(u) u.spec).indexOf(newURL) === -1) {
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

  checkWindowName: function (window, url) {
     var originalAttempt = window.name;
     try {
       if (/^https?:\/\/(?:[^/]*\.)?\byimg\.com\/rq\/darla\//.test(url) &&
          ns.getPref("filterXExceptions.darla_name")) {
         window.name = "DARLA_JUNK";
         return;
       }

       if (/\s*{[\s\S]+}\s*/.test(originalAttempt)) {
         try {
           ns.json.decode(originalAttempt); // fast track for crazy JSON in name like on NYT
           return;
         } catch(e) {}
       }

       if (/[%=\(\\<]/.test(originalAttempt) && InjectionChecker.checkURL(originalAttempt)) {
         window.name = originalAttempt.replace(/[%=\(\\<]/g, " ");
       }

       if (originalAttempt.length > 11) {
         try {
           if ((originalAttempt.length % 4 === 0)) {
             var bin = window.atob(window.name);
             if(/[%=\(\\]/.test(bin) && InjectionChecker.checkURL(bin)) {
               window.name = "BASE_64_XSS";
             }
           }
         } catch(e) {}
       }
    } finally {
      if (originalAttempt != window.name) {
        ns.log('[NoScript XSS]: sanitized window.name, "' + originalAttempt + '"\nto\n"' + window.name + '"\nURL: ' + url);
        ns.log(url + "\n" + window.location.href)
      }
    }
  },


  PAYPAL_BUTTON_RX: /^https:\/\/www\.paypal\.com\/(?:[\w\-]+\/)?cgi-bin\/webscr\b/,

  filterXSS: function(abeReq) {

    const channel = abeReq.channel;

    IOUtil.extractFromChannel(channel, "noscript.xssChecked"); // remove redirected info

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

    let origin = abeReq.origin,
      originSite = null,
      browser = null,
      window = null,
      untrustedReload = false;

    if (!origin) {
      if ((channel instanceof Ci.nsIHttpChannelInternal) && channel.documentURI) {
        if (originalSpec === channel.documentURI.spec) {
           originSite = ns.getSite(abeReq.traceBack);
           if (originSite && abeReq.traceBack !== originalSpec) {
              origin = abeReq.breadCrumbs.join(">>>");
              if (ns.consoleDump) this.dump(channel, "TRACEBACK ORIGIN: " + originSite + " FROM " + origin);
              if ((channel instanceof Ci.nsIUploadChannel) && channel.uploadStream) {
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
        if (window && window == window.top || channel.loadInfo && channel.loadInfo.contentPolicyType === 6) {
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
          } else if (window) {
            ns.recordBlocked(window, targetSite, originSite);
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
    }

    IOUtil.attachToChannel(channel, "noscript.checkWindowName", DUMMY_OBJ);

    let focusedBrowserWin = DOM.mostRecentBrowserWindow;
    let trustedOrigin = globalJS || ns.isJSEnabled(originSite, focusedBrowserWin && focusedBrowserWin.content) ||
        !origin // we consider null origin as "trusted" (i.e. we check for injections but
                // don't strip POST unconditionally) to make some extensions (e.g. Google Gears)
                // work. For dangerous edge cases we should have moz-null-principal: now, anyway.
                ||
        origin.substring(0, 5) == "file:";

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


      this.resetUntrustedReloadInfo(browser = browser || this.findBrowser(channel, window), channel);

      // here we exceptionally consider same site also https->http with same domain

      if (injectionCheck < 3 && originSite && abeReq.originURI.schemeIs("https")) {
        let originDomain = ns.getDomain(originSite), targetDomain = ns.getDomain(url);
        if (targetDomain == originDomain) {
          this.dump(channel, "Same domain with HTTPS origin");
          return;
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
          (/^https?:\/\/api\.facebook\.com\//.test(origin) && ns.getPref("filterXExceptions.fbconnect")
          || /^https:\/\/tbpl\.mozilla\.org\//.test(origin)  // work-around for hg reftest DOS
          || /^https:\/\/[^\/]+\.googleusercontent\.com\/gadgets\/ifr\?/.test(originalSpec) && ns.getPref("filterXExceptions.ggadgets") // Google gadgets
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

      if ((protectName = (protectName || injectionChecker.nameAssignment)))
        IOUtil.attachToChannel(channel, "noscript.protectName", DUMMY_OBJ); // remove redirected info



      if (ns.consoleDump) {
        if (injectionAttempt) this.dump(channel, "Detected injection attempt at level " + injectionCheck);
        if (postInjection) this.dump(channel, "Detected POST injection attempt at level "  + injectionCheck);
        if (protectName) this.dump(channel, "Name assignment detected, gonna protect window.name");
      }
    }

    IOUtil.attachToChannel(channel, "noscript.xssChecked", DUMMY_OBJ); // remove redirected info

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
       if (channel.URI.userPass == "") {
         channel.URI.userPass = "xss:xss";
         // resetting this bit will avoid auth confirmation prompt
         channel.loadFlags = channel.loadFlags & ~channel.LOAD_INITIAL_DOCUMENT_URI;
       }
     }
  },

  abortChannel: function(channel, reason) {
    let originURI = ABERequest.getOrigin(channel)
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
      let sync = requestInfo.channel.status !== 0;
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

        sync = true;
      }

      if (sync) {
        let overlay = ns.findOverlay(requestInfo.browser);
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
    var impl = Cc["@mozilla.org/xul/xul-document;1"].createInstance(Ci.nsIDOMDocument).implementation;
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
    for (var prev = null; (s = this.convertAll(s)) !== prev || (s = unescape(s)) !== prev; prev = s);
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

const wordCharRx = /\w/g;
function fuzzify(s) {
  return s.replace(wordCharRx, '\\W*$&');
}

const IC_COMMENT_PATTERN = '\\s*(?:\\/[\\/\\*][\\s\\S]+)?';
const IC_WINDOW_OPENER_PATTERN = fuzzify("alert|confirm|prompt|open(?:URL)?|print|show") + "\\w*" + fuzzify("Dialog");
const IC_EVAL_PATTERN = fuzzify('eval|set(?:Timeout|Interval)|[fF]unction|Script|toString|Worker|document|constructor|generateCRMFRequest|jQuery|write(?:ln)?|__(?:define[SG]etter|noSuchMethod)__|definePropert(?:y|ies)')
  + "|\\$|" + IC_WINDOW_OPENER_PATTERN;
const IC_EVENT_PATTERN = "on(?:d(?:r(?:ag(?:en(?:ter|d)|leave|start|drop|over)?|op)|ata(?:setc(?:omplete|hanged)|available)|eactivate|blclick)|b(?:e(?:for(?:e(?:u(?:nload|pdate)|p(?:aste|rint)|c(?:opy|ut)|editfocus|activate)|deactivate)|gin)|ounce|lur)|m(?:o(?:use(?:(?:lea|mo)ve|o(?:ver|ut)|enter|wheel|down|up)|ve(?:start|end)?)|essage)|r(?:ow(?:s(?:inserted|delete)|e(?:nter|xit))|e(?:adystatechange|s(?:ize|et)|peat))|f(?:o(?:rm(?:change|input)|cus(?:out|in)?)|i(?:lterchange|nish))|c(?:o(?:nt(?:rolselect|extmenu)|py)|(?:ellc)?hange|lick|ut)|s(?:(?:elec(?:tstar)?|ubmi)t|t(?:art|op)|croll)|a(?:fter(?:update|print)|ctivate|bort)|e(?:rror(?:update)?|nd)|p(?:ropertychang|ast)e|key(?:press|down|up)|lo(?:secapture|ad)|in(?:valid|put)|unload|help|zoom)"
  // generated by html5_events.pl, see http://mxr.mozilla.org/mozilla-central/source/parser/html/nsHtml5AtomList.h
  ;
const IC_EVENT_DOS_PATTERN =
      "\\b(?:" + IC_EVENT_PATTERN + ")[\\s\\S]*=[\\s\\S]*\\b(?:" + IC_WINDOW_OPENER_PATTERN + ")\\b"
      + "|\\b(?:" + IC_WINDOW_OPENER_PATTERN + ")\\b[\\s\\S]+\\b(?:" + IC_EVENT_PATTERN + ")[\\s\\S]*=";

var InjectionChecker = {
  reset: function () {

    this.isPost =
      this.base64 =
      this.nameAssignment = false;

    this.base64tested = [];

  },

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

  escalate: function(msg) {
    this.log(msg);
    ns.log("[NoScript InjectionChecker] " + msg);
  },

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
    var def = "\\/\\?&#;\\s\\x00}<>"; // we stop on URL, JS and HTML delimiters
    var bs = {
      nq: new RegExp("[" + def + "]")
    };
    Array.forEach("'\"`", // special treatment for quotes
      function(c) { bs[c] = new RegExp("[" + def + c + "]"); }
    );
    delete this.breakStops;
    return this.breakStops = bs;
  },

  collapseChars: function(s)
      s.replace(/\;+/g, ';').replace(/\/{4,}/g, '////')
        .replace(/\s+/g, function(s) /\n/g.test(s) ? '\n' : ' ')
  ,

  _reduceBackslashes: function(bs) bs.length % 2 ? "\\" : "",

  reduceQuotes: function(s) {
    if (s[0] == '/') {
      // reduce common leading path fragment resembling a regular expression or a comment
      s = s.replace(/^\/[^\/\n\r]+\//, '_RX_').replace(/^\/\/[^\r\n]*/, '//_COMMENT_');
    }

    if (/\/\*/.test(s)) // C-style comments, would make everything really tricky
      return s;


    if (/['"\/]/.test(s)) {

      // drop noisy backslashes
      s = s.replace(/\\{2,}/g, this._reduceBackslashes);

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
    return s.replace(/^([^'"`\\]*?)\/\/[^\r\n]*/g, "$1//_COMMENT_");
  },

  reduceURLs: function(s) {
    // nested URLs with protocol are parsed as C++ style comments, and since
    // they're potentially very expensive, we preemptively remove them if possible
    while (/^[^'"]*?:\/\//.test(s)) {
      s = s.replace(/:\/\/[^*\s]*/, ':');
    }
    s = s.replace(/:\/\/[^'"*\n]*/g, ':');

    return (/\bhttps?:$/.test(s) && !/\bh\W*t\W*t\W*p\W*s?.*=/.test(s))
      ? s.replace(/\b(?:[\w.]+=)?https?:$/, '')
      : s;
  },

  reduceJSON: function(s) {
    const toStringRx = /^function\s*toString\(\)\s*{\s*\[native code\]\s*\}$/;
    // optimistic case first, one big JSON block
    for (;;) {

      let m = s.match(/{[\s\S]+}/);
      if (!m) return s;

      let whole = s;
      let expr = m[0];
      let json = ns.json;
      if (json) {
        try {
          if (!toStringRx.test(json.decode(expr).toString))
            return s;

          this.log("Reducing big JSON " + expr);
          return s.replace(expr, '{}');
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
            s = s.replace(expr, '{}');
            continue;
          } catch(e) {}

          if (/\btoString\b[\s\S]*:/.test(expr)) continue;

          let qred = this.reduceQuotes(expr);
          if (/\{(?:\s*(?:(?:\w+:)+\w+)+;\s*)+\}/.test(qred)) {
             this.log("Reducing pseudo-JSON " + expr);
             s = s.replace(expr, '{}');
          } else if (!!/[\(=\.]|[^:\s]\s*\[|:\s*(?:location|document|set(?:Timeout|Interval)|eval|open|show\w*Dialog|alert|confirm|prompt)\b|(?:\]|set)\s*:/.test(qred) &&
             this.checkJSSyntax("JSON = " + qred) // no-assignment JSON fails with "invalid label"
          ) {
            this.log("Reducing slow JSON " + expr);
            s = s.replace(expr, '{}');
          }
        }

        if (s == prev) break;
      }

      if (s == whole) break;
    }

    return s;
  },

  reduceXML: function reduceXML(s) {
    var res;

    for (let pos = s.indexOf("<"); pos !== -1; pos = s.indexOf("<", 1)) {

      let head = s.substring(0, pos);
      let tail = s.substring(pos);

      let qnum = 0;
      for (pos = -1; (pos = head.indexOf('"', ++pos)) > -1; ) {
        if (pos === 0 || head[pos - 1] != '\\') qnum++;
      }
      if (qnum % 2)  break; // odd quotes

      let t = tail.replace(/^<(\??\s*\/?[a-zA-Z][\w:-]*)(?:[\s+]+[\w:-]+="[^"]*")*[\s+]*(\/?\??)>/, '<$1$2>');

      (res || (res = [])).push(head);
      s = t;
    }
    if (res) {
      res.push(s);
      s = res.join('');
    }

    return s;
  }
,

  _singleAssignmentRx: new RegExp(
    "(?:\\b" + fuzzify('document') + "\\b[\\s\\S]*\\.|\\s" + fuzzify('setter') + "\\b[\\s\\S]*=)|/.*/[\\s\\S]*(?:\\.(?:" +
     "\\b" + fuzzify("onerror") + "\\b[\\s\\S]*=|" +
      + fuzzify('source|toString') + ")|\\[)|" + IC_EVENT_DOS_PATTERN
  ),
  _riskyAssignmentRx: new RegExp(
    "\\b(?:" + fuzzify('location|innerHTML|outerHTML') + ")\\b[\\s\\S]*="
  ),
  _nameRx: new RegExp(
    "=[\\s\\S]*\\b" + fuzzify('name') + "\\b|" +
    fuzzify("hostname") + "[\\s\\S]*=[\\s\\S]*(?:\\b\\d|[\"'{}~^|<*/+-])"
  ),

  _maybeJSRx: new RegExp(
    // accessor followed by function call or assignment.
    '(?:(?:\\[[\\s\\S]*\\]|\\.\\D)[\\s\\S]*(?:\\([\\s\\S]*\\)|`[\\s\\S]+`|=[\\s\\S]*\\S)' +
    // double function call
    '|\\([\\s\\S]*\\([\\s\\S]*\\)' +
    ')|(?:^|\\W)(?:' + IC_EVAL_PATTERN +
    ')(?:\\W+[\\s\\S]*|)[(`]|(?:[=(]|\\{[\\s\\S]+:)[\\s\\S]*(?:' + // calling eval-like functions directly or...
    IC_EVAL_PATTERN + // ... assigning them to another function possibly called by the victim later
    ')[\\s\\S]*[\\n,;:|]|\\b(?:' +
    fuzzify('setter|location|innerHTML|outerHTML') +  // eval-like assignments
    ')\\b[\\s\\S]*=|' +
    '.' + IC_COMMENT_PATTERN + "src" + IC_COMMENT_PATTERN + '=' +
    IC_EVENT_DOS_PATTERN +
    "|\\b" + fuzzify("onerror") + "\\b[\\s\\S]*=" +
    "|=[s\\\\[ux]?\d{2}" + // escape (unicode/ascii/octal)
    "|\\b(?:toString|valueOf)\\b" + IC_COMMENT_PATTERN + "=[\\s\\S]*(?:" + IC_EVAL_PATTERN + ")" +
    "|(?:\\)|(?:[^\\w$]|^)[$a-zA-Z_\\u0ff-\\uffff][$\\w\\u0ff-\\uffff]*)" + IC_COMMENT_PATTERN + '=>' + // concise function definition
    "|(?:[^\\w$]|^)" + IC_EVENT_PATTERN + IC_COMMENT_PATTERN + "="
  )
 ,

  _riskyParensRx: new RegExp(
    "(?:^|\\W)(?:(?:" + IC_EVAL_PATTERN + "|on\\w+)\\s*[(`]|" +
    fuzzify("with") + "\\b[\\s\\S]*\\(|" +
    fuzzify("for") + "\\b[\\s\\S]*\\([\\s\\S]*[\\w$\\u0080-\\uffff]+[\\s\\S]*\\b(?:" +
    fuzzify ("in|of") + ")\\b)"
  ),

  _dotRx: /\./g,
  _removeDotsRx: /^openid\.[\w.-]+(?==)|(?:[?&#\/]|^)[\w.-]+(?=[\/\?&#]|$)|[\w\.]*\.(?:\b[A-Z]+|\w*\d|[a-z][$_])[\w.-]*|=[a-z.-]+\.(?:com|net|org|biz|info|xxx|[a-z]{2})(?:[;&/]|$)/g,
  _removeDots: function(p) p.replace(InjectionChecker._dotRx, '|'),
  _arrayAccessRx: /\s*\[\d+\]/g,
  _riskyOperatorsRx: /[+-]{2}\s*(?:\/[*/][\s\S]+)?(?:\w+(?:\/[*/][\s\S]+)?[[.]|location)|(?:\]|\.\s*(?:\/[*/][\s\S]+)?\w+|location)\s*(?:\/[*/][\s\S]+)?([+-]{2}|[+*\/<>~-]+\s*(?:\/[*/][\s\S]+)?=)/, // inc/dec/self-modifying assignments on DOM props
  _assignmentRx: /^(?:[^()="'\s]+=(?:[^(='"\[+]+|[?a-zA-Z_0-9;,&=/]+|[\d.|]+))$/,
  _badRightHandRx: /=[\s\S]*(?:_QS_\b|[|.][\s\S]*source\b|<[\s\S]*\/[^>]*>)/,
  _wikiParensRx: /^(?:[\w.|-]+\/)*\(*[\w\s-]+\([\w\s-]+\)[\w\s-]*\)*$/,
  _neutralDotsRx: /(?:^|[\/;&#])[\w-]+\.[\w-]+[\?;\&#]/g,
  _openIdRx: /^scope=(?:\w+\+)\w/, // OpenID authentication scope parameter, see http://forums.informaction.com/viewtopic.php?p=69851#p69851
  _gmxRx: /\$\(clientName\)-\$\(dataCenter\)\.(\w+\.)+\w+/, // GMX webmail, see http://forums.informaction.com/viewtopic.php?p=69700#p69700

  maybeJS: function(expr) {

    if (/`[\s\S]*`/.test(expr) ||  // ES6 templates, extremely insidious!!!
        this._riskyOperatorsRx.test(expr) // this must be checked before removing dots...
        ) return true;

    expr = // dotted URL components can lead to false positives, let's remove them
      expr.replace(this._removeDotsRx, this._removeDots)
        .replace(this._arrayAccessRx, '_ARRAY_ACCESS_')
        .replace(/<([\w:]+)>[^</(="'`]+<\/\1>/g, '<$1/>') // reduce XML text nodes
        .replace(/<!--/g, '') // remove HTML comments preamble (see next line)
        .replace(/(^|[=;.+-])\s*[\[(]+/g, '$1') // remove leading parens and braces
        .replace(this._openIdRx, '_OPENID_SCOPE_=XYZ')
        .replace(this._gmxRx, '_GMX_-_GMX_')
        ;

    if (expr.indexOf(")") !== -1) expr += ")"; // account for externally balanced parens
    if(this._assignmentRx.test(expr) && !this._badRightHandRx.test(expr)) // commonest case, single assignment or simple chained assignments, no break
       return this._singleAssignmentRx.test(expr) || this._riskyAssignmentRx.test(expr) && this._nameRx.test(expr);

    return this._riskyParensRx.test(expr) ||
      this._maybeJSRx.test(expr.replace(this._neutralDotsRx, '')) &&
        !this._wikiParensRx.test(expr);

  },

  checkNonTrivialJSSyntax: function(expr) {
    return this.maybeJS(this.reduceQuotes(expr)) && this.checkJSSyntax(expr);
  },


  wantsExpression: function(s) /(?:^[+-]|[!%&(,*/:;<=>?\[^|]|[^-]-|[^+]\+)\s*$/.test(s),

  stripLiteralsAndComments: function(s) {
    "use strict";

    const MODE_NORMAL = 0;
    const MODE_REGEX = 1;
    const MODE_SINGLEQUOTE = 2;
    const MODE_DOUBLEQUOTE = 3;
    const MODE_BLOCKCOMMENT = 4;
    const MODE_LINECOMMENT = 6;
    const MODE_INTERPOLATION = 7;

    let mode = MODE_NORMAL;
    let escape = false;
    let res = [];
    function handleQuotes(c, q, type) {
       if (escape) {
          escape = false;
        } else if (c == '\\') {
          escape = true;
        } else if (c === q) {
          res.push(type);
          mode = MODE_NORMAL;
        }
    }
    for (let j = 0, l = s.length; j < l; j++) {

        switch(mode) {
          case MODE_REGEX:
            handleQuotes(s[j], '/', "_REGEXP_");
            break;
          case MODE_SINGLEQUOTE:
            handleQuotes(s[j], "'", "_QS_");
            break;
          case MODE_DOUBLEQUOTE:
            handleQuotes(s[j], '"', "_DQS_");
            break;
          case MODE_INTERPOLATION:
            handleQuotes(s[j], '`', "``");
            break;
          case MODE_BLOCKCOMMENT:
            if (s[j] === '/' && s[j-1] === '*') {
               res.push("/**/");
               mode = MODE_NORMAL;
            }
            break;
          case MODE_LINECOMMENT:
            if (s[j] === '\n') {
               res.push("//\n");
               mode = MODE_NORMAL;
            }
            break;
        default:
          switch(s[j]) {
             case '"':
                mode = MODE_DOUBLEQUOTE;
                break;
             case "'":
                mode = MODE_SINGLEQUOTE;
                break;
             case "`":
                mode = MODE_INTERPOLATION;
                break;
             case '/':
                switch(s[j+1]) {
                   case '*':
                      mode = MODE_BLOCKCOMMENT;
                      j+=2;
                      break;
                   case '/':
                      mode = MODE_LINECOMMENT;
                      break;
                   default:
                      let r = res.join('');
                      res = [r];
                      if (this.wantsExpression(r)) mode = MODE_REGEX;
                      else res.push('/'); // after a self-contained expression: division operator
                }
                break;
             default:
                res.push(s[j]);
          }

       }
    }
    return res.join('');
  },

  checkLastFunction: function() {
    var fn = this.syntax.lastFunction;
    if (!fn) return false;
    var m = fn.toSource().match(/\{([\s\S]*)\}/);
    if (!m) return false;
    var expr = this.stripLiteralsAndComments(m[1]);
    return /=[\s\S]*cookie|\b(?:setter|document|location|(?:inn|out)erHTML|\.\W*src)[\s\S]*=|[\w$\u0080-\uffff\)\]]\s*[\[\(]/.test(expr) ||
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
    return this.invalidCharsRx = new RegExp("^[^\"'`/<>]*[" + this._createInvalidRanges() + "]");
  },

  checkJSBreak: function InjectionChecker_checkJSBreak(s) {
    // Direct script injection breaking JS string literals or comments


    // cleanup most urlencoded noise and reduce JSON/XML
    s = ';' + this.reduceXML(this.reduceJSON(this.collapseChars(
        s.replace(/\%\d+[a-z\(]\w*/gi, '§')
          .replace(/[\r\n\u2028\u2029]+/g, "\n")
          .replace(/[\x01-\x09\x0b-\x20]+/g, ' ')
        )));

    if (s.indexOf("*/") > 0 && /\*\/[\s\S]+\/\*/.test(s)) { // possible scrambled multi-point with comment balancing
      s += ';' + s.match(/\*\/[\s\S]+/);
    }

    if (!this.maybeJS(s)) return false;

    const MAX_TIME = 8000, MAX_LOOPS = 1200;

    const logEnabled = this.logEnabled;

    const
      invalidCharsRx = /[\u007f-\uffff]/.test(s) && this.invalidCharsRx,
      dangerRx = /\(|(?:^|[+-]{2}|[+*/<>~-]+\\s*=)|`[\s\S]*`|\[[^\]]+\]|(?:setter|location|(?:inn|out)erHTML|cookie|on\w{3,}|\.\D)[^&]*=[\s\S]*?(?:\/\/|[\w$\u0080-\uFFFF.[\]})'"-]+)/,
      exprMatchRx = /^[\s\S]*?(?:[=\)]|`[\s\S]*`|[+-]{2}|[+*/<>~-]+\\s*=)/,
      safeCgiRx = /^(?:(?:[\.\?\w\-\/&:§\[\]]+=[\w \-:\+%#,§\.]*(?:[&\|](?=[^&\|])|$)){2,}|\w+:\/\/\w[\w\-\.]*)/,
        // r2l, chained query string parameters, protocol://domain
      headRx = /^(?:[^'"\/\[\(]*[\]\)]|[^"'\/]*(?:§|[^&]&[\w\.]+=[^=]))/
        // irrepairable syntax error, such as closed parens in the beginning
    ;

    const injectionFinderRx = /(['"`#;>:{}]|[/?=](?![?&=])|&(?![\w-.[\]&!-]*=)|\*\/)(?!\1)/g;
    injectionFinderRx.lastIndex = 0;

    const t = Date.now();
    var iterations = 0;

    for (let dangerPos = 0, m; (m = injectionFinderRx.exec(s));) {

      let startPos = injectionFinderRx.lastIndex;
      let subj = s.substring(startPos);
      if (startPos > dangerPos) {
        dangerRx.lastIndex = startPos;
        if (!dangerRx.exec(s)) {
          this.log("Can't find any danger in " + s);
          return false;
        }
        dangerPos = dangerRx.lastIndex;
      }

      let breakSeq = m[1];
      let quote = breakSeq in this.breakStops ? breakSeq : '';

      if (!this.maybeJS(quote ? quote + subj : subj)) {
         this.log("Fast escape on " + subj, t, iterations);
         return false;
      }

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
            if (quote && subj[len] === quote) {
              len++;
            } else if (subj[len - 1] === '<') {
              // invalid JS, and maybe in the middle of XML block
              len++;
              continue;
            }
            expr = subj.substring(0, len);
            if (pos === 0) len++;
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



        if (quote) {
          if (this.checkNonTrivialJSSyntax(expr)) {
            this.log("Non-trivial JS inside quoted string detected", t, iterations);
            return true;
          }
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
          let balanced = script.replace(/^[^"'{}(]*\)/, 'P ');
          if (balanced !== script && balanced.indexOf('(') > -1) {
            script = balanced + ")";
          } else {
            this.log("SKIP (head syntax) " + script, t, iterations);
            break; // unrepairable syntax error in the head, move left cursor forward
          }
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
            if (logEnabled) this.log(errmsg + " --- " + this.syntax.sandbox.script + " --- ", t, iterations);
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
            else if((m = errmsg.match(/\b(?:property id\b|missing ([:\]\)\}]) )/))) {
              let char = m[1] || '}';
              let newLen = subj.indexOf(char, len);
              let nextParamPos = subj.substring(len).search(/[^&]&(?!&)/)
              if (newLen !== -1 && (nextParamPos === -1 || newLen <= len + nextParamPos)) {
                this.log("Extending to next " + char);
                expr = subj.substring(0, len = ++newLen);
                moved = char !== ':';
              } else if (char !== ':') {
                let lastChar = expr[expr.length - 1];
                if (lastChar === char && (len > subj.length || lastChar != subj[len - 1])) break;
                expr += char;
                moved = hunt = true;
                len++;
                this.log("Balancing " + char, t, iterations);
              } else {
                 break;
              }
            }
            else if (/finally without try/.test(errmsg)) {
              expr = "try{" + expr;
              hunt = moved = true;
            }
          }
        }
      }
    }
    this.log(s, t, iterations);
    return false;
  },


  checkJS: function(s, unescapedUni) {
    this.log(s);

    if (/\?name\b[\s\S]*:|[^&?]\bname\b/.test(s)) {
      this.nameAssignment = true;
    }

    var hasUnicodeEscapes = !unescapedUni && /\\u[0-9a-f]{4}/i.test(s);
    if (hasUnicodeEscapes && /\\u00[0-7][0-9a-f]/i.test(s)) {
      this.escalate("Unicode-escaped lower ASCII");
      return true;
    }

    if (/\\x[0-9a-f]{2}[\s\S]*['"]/i.test(s)) {
      this.escalate("Obfuscated string literal");
      return true;
    }

    if (/`[\s\S]*\$\{[\s\S]+[=(][\s\S]+\}[\s\S]*`/.test(s)) {
      this.escalate("ES6 string interpolation");
      return true;
    }

    this.syntax.lastFunction = null;
    let ret = this.checkAttributes(s) ||
      (/[\\\(]|=[^=]/.test(s) || this._riskyOperatorsRx.test(s)) &&  this.checkJSBreak(s) || // MAIN
      hasUnicodeEscapes && this.checkJS(this.unescapeJS(s), true); // optional unescaped recursion
    if (ret) {
      let msg = "JavaScript Injection in " + s;
      if (this.syntax.lastFunction) {
        msg += "\n" + this.syntax.lastFunction.toSource();
      }
      this.escalate(msg);
    }
    return ret;
  },

  unescapeJS: function(s) {
    return s.replace(/\\u([0-9a-f]{4})/gi, function(s, c) {
      return String.fromCharCode(parseInt(c, 16));
    });
  },
   unescapeJSLiteral: function(s) {
    return s.replace(/\\x([0-9a-f]{2})/gi, function(s, c) {
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

  _rxCheck: function(checker, s) {
    var rx = this[checker + "Checker"];
    var ret = rx.exec(s);
    if (ret) {
      this.escalate(checker + " injection:\n" + ret + "\nmatches " + rx.source);
      return true;
    }
    return false;
  },

  AttributesChecker: new RegExp(
    "(?:\\W|^)(?:javascript:(?:[\\s\\S]+[=\\\\\\(`\\[\\.<]|[\\s\\S]*(?:\\bname\\b|\\\\[ux]\\d))|" +
    "data:(?:(?:[a-z]\\w+/\\w[\\w+-]+\\w)?[;,]|[\\s\\S]*;[\\s\\S]*\\b(?:base64|charset=)|[\\s\\S]*,[\\s\\S]*<[\\s\\S]*\\w[\\s\\S]*>))|@" +
    ("import\\W*(?:\\/\\*[\\s\\S]*)?(?:[\"']|url[\\s\\S]*\\()" +
      "|-moz-binding[\\s\\S]*:[\\s\\S]*url[\\s\\S]*\\(")
      .replace(/[a-rt-z\-]/g, "\\W*$&"),
    "i"),
  checkAttributes: function(s) {
    s = this.reduceDashPlus(s);
    if (this._rxCheck("Attributes", s)) return true;
    if (/\\/.test(s) && this._rxCheck("Attributes", this.unescapeCSS(s))) return true;
    let dataPos = s.search(/data:\S*\s/i);
    if (dataPos !== -1) {
      let data = this.urlUnescape(s.substring(dataPos).replace(/\s/g, ''));
      if (this.checkHTML(data) || this.checkAttributes(data)) return true;
    }
    return false;
  },

  HTMLChecker: new RegExp("<[^\\w<>]*(?:[^<>\"'\\s]*:)?[^\\w<>]*(?:" + // take in account quirks and namespaces
   fuzzify("script|form|style|svg|marquee|(?:link|object|embed|applet|param|i?frame|base|body|meta|ima?ge?|video|audio|bindings|set|isindex|animate") +
    ")[^>\\w])|['\"\\s\\0/](?:formaction|style|background|src|lowsrc|ping|" + IC_EVENT_PATTERN +
     ")[\\s\\0]*=", "i"),

  checkHTML: function(s) {
     let links = s.match(/\b(?:href|src|(?:form)?action)[\s\0]*=[\s\0]*(?:(["'])[\s\S]*?\1|[^'"<>][^>\s]*)/ig);
     if (links) {
      for each (let l in links) {
        l = l.replace(/[^=]*=[\s\0]*/i, '');
        l = /^["']/.test(l) ? l.replace(/^(['"])([\s\S]*)\1/g, '$2') : l.replace(/[\s>][\s\S]*/, '');
        if (/^(?:javascript|data):/i.test(l) || this._checkRecursive(l, 3)) return true;
      }
    }
    return this._rxCheck("HTML", s);
  },

  checkNoscript: function(s) {
    this.log(s);
    return s.indexOf("\x1b(J") !== -1 && this.checkNoscript(s.replace(/\x1b\(J/g, '')) || // ignored in iso-2022-jp
     s.indexOf("\x7e\x0a") !== -1 && this.checkNoscript(s.replace(/\x7e\x0a/g, '')) || // ignored in hz-gb-2312
      this.checkHTML(s) || this.checkSQLI(s) || this.checkHeaders(s);
  },

  HeadersChecker: /[\r\n]\s*(?:content-(?:type|encoding))\s*:/i,
  checkHeaders: function(s) this._rxCheck("Headers", s),
  SQLIChecker: /(?:(?:(?:\b|[^a-z])union[^a-z]|\()[\w\W]*(?:\b|[^a-z])select[^a-z]|(?:updatexml|extractvalue)(?:\b|[^a-z])[\w\W]*\()[\w\W]+(?:(?:0x|x')[0-9a-f]{16}|(?:0b|b')[01]{64}|\(|\|\||\+)/i
  ,
  checkSQLI: function(s) this._rxCheck("SQLI", s),

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
    return this.checkRecursive(url
      // assume protocol and host are safe, but keep the leading double slash to keep comments in account
      .replace(/^[a-z]+:\/\/.*?(?=\/|$)/, "//")
      // Remove outer parenses from ASP.NET cookieless session's AppPathModifier
      .replace(/\/\((S\(\w{24}\))\)\//, '/$1/')
    );
  },

  checkRecursive: function(s, depth, isPost) {
    if (typeof(depth) != "number")
      depth = 3;

    this.reset();
    this.isPost = isPost || false;

    if (ASPIdiocy.affects(s)) {
      if (this.checkRecursive(ASPIdiocy.process(s), depth, isPost))
        return true;
    } else if (ASPIdiocy.hasBadPercents(s) && this.checkRecursive(ASPIdiocy.removeBadPercents(s), depth, isPost))
      return true;

    if (FlashIdiocy.affects(s)) {
      let purged = FlashIdiocy.purgeBadEncodings(s);
      if (purged !== s && this.checkRecursive(purged, depth, isPost))
        return true;
      let decoded = FlashIdiocy.platformDecode(purged);
      if (decoded !== purged && this.checkRecursive(decoded, depth, isPost))
        return true;
    }

    if (s.indexOf("coalesced:") !== 0) {
      let coalesced = ASPIdiocy.coalesceQuery(s);
      if (coalesced !== s && this.checkRecursive("coalesced:" + coalesced, depth, isPost))
        return true;
    }

    if (isPost) {
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

    if (isPost) s = "#" + s; // allows the string to be JS-checked as a whole
    return this._checkRecursive(s, depth);
  },

  _checkRecursive: function(s, depth) {

    if (this.checkHTML(s) || this.checkJS(s) || this.checkSQLI(s) || this.checkHeaders(s))
      return true;

    if (s.indexOf("&") !== -1) {
      let unent = Entities.convertAll(s);
      if (unent !== s && this._checkRecursive(unent, depth)) return true;
    }

    if (--depth <= 0)
      return false;

    if (s.indexOf('+') !== -1 && this._checkRecursive(this.formUnescape(s), depth))
      return true;

    var unescaped = this.urlUnescape(s);
    let badUTF8 = this.utf8EscapeError;

    if (this._checkOverDecoding(s, unescaped))
      return true;

    if (/[\n\r\t]|&#/.test(unescaped)) {
      let unent = Entities.convertAll(unescaped).replace(/[\n\r\t]/g, '');
      if (unescaped != unent && this._checkRecursive(unent, depth)) {
        this.log("Trash-stripped nested URL match!"); // http://mxr.mozilla.org/mozilla-central/source/netwerk/base/src/nsURLParsers.cpp#100
        return true;
      }
    }

    if (/\\x[0-9a-f]/i.test(unescaped)) {
      let literal = this.unescapeJSLiteral(unescaped);
      if (unescaped !== literal && this._checkRecursive(literal, depth)) {
        this.log("Escaped literal match!");
        return true;
      }
    }

    if (unescaped.indexOf("\x1b(J") !== -1 && this._checkRecursive(unescaped.replace(/\x1b\(J/g, ''), depth) || // ignored in iso-2022-jp
        unescaped.indexOf("\x7e\x0a") !== -1 && this._checkRecursive(unescaped.replace(/\x7e\x0a/g, '')) // ignored in hz-gb-2312
      )
      return true;

    if (unescaped !== s) {
      if (badUTF8) {
        try {
          if (this._checkRecursive(this.toUnicode(unescaped, "UTF-8"))) return true;
        } catch (e) {
          this.log(e);
        }
      }
      if (this._checkRecursive(unescaped, depth)) return true;
    }

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

  toUnicode: function(s, charset) {
    let sis = Cc["@mozilla.org/io/string-input-stream;1"]
          .createInstance(Ci.nsIStringInputStream);
    sis.setData(s, s.length);
    let is = Cc["@mozilla.org/intl/converter-input-stream;1"]
          .createInstance(Ci.nsIConverterInputStream);
    is.init(sis, charset || null, 0, is.DEFAULT_REPLACEMENT_CHARACTER);
    let str = {};
    if (is.readString(4096, str) === 0) return str.value;
    let ret = [str.value];
    while (is.readString(4096, str) !== 0) {
      ret.push(str.value);
    }
    return ret.join('');
  },

  utf8EscapeError: true,
  urlUnescape: function(url, brutal) {
    var od = this.utf8OverDecode(url, !brutal);
    this.utf8EscapeError = false;
    try {
      return decodeURIComponent(od);
    } catch(warn) {
      this.utf8EscapeError = true;
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
    if (!((channel instanceof Ci.nsIUploadChannel)
          && channel.uploadStream && (channel.uploadStream instanceof Ci.nsISeekableStream)))
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
    var stream = Cc["@mozilla.org/io/string-input-stream;1"].
            createInstance(Ci.nsIStringInputStream);
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
      const sis = Cc['@mozilla.org/binaryinputstream;1'].createInstance(Ci.nsIBinaryInputStream);
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

    if (url instanceof Ci.nsIURL) {
      // sanitize path

      if (url.param) {
        url.path = this.sanitizeURIComponent(url.path); // param is the URL part after filePath and a semicolon ?!
      } else if(url.filePath) {
        url.filePath = this.sanitizeURIComponent(url.filePath); // true == lenient == allow ()=
      }
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

    if (this.base64 ||
        FlashIdiocy.affects(urlSpec) ||
        FlashIdiocy.affects(unescape(urlSpec))
      ) {
      url.spec = url.prePath; // drastic, but with base64 / FlashIdiocy we cannot take the risk!
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
    if (query === original) return query;
    var unescaped = InjectionChecker.urlUnescape(original, true);
    query = this.sanitize(unescaped);
    if (query === unescaped) return original;
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
      sep = query.indexOf("&") > -1 || this.brutal ? "&" : ";"
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
              nestedURI = IOUtil.newURI(pz).QueryInterface(Ci.nsIURL);
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

    if (this.brutal) {
      s = s.replace(/\x1bJ\(/g, '').replace(/\x7e\x0a/g, ''); // ignored in some encodings
    }
    // regular duty
    s = s.replace(this.primaryBlacklist, " ")
      .replace(/\bjavascript:+|\bdata:[^,]+,(?=[^<]*<|%25%20|%\s+[2-3][0-9a-f])|-moz-binding|@import/ig,
                function(m) { return m.replace(/(.*?)(\w)/, "$1#no$2"); });

    if (this.extraBlacklist) { // additional user-defined blacklist for emergencies
      s = s.replace(this.extraBlacklist, " ");
    }

    if (this.brutal) { // injection checks were positive
      s = InjectionChecker.reduceDashPlus(s)
        .replace(/\bdata:/ig, "nodata:")
        .replace(/['\(\)\=\[\]<\r\n`]/g, " ")
        .replace(/0x[0-9a-f]{16,}|0b[01]{64,}/gi, " ")
        .replace(this._brutalReplRx, String.toUpperCase)
        .replace(/Q[\da-fA-Fa]{2}/g, "Q20") // Ebay-style escaping
        .replace(/%[\n\r\t]*[0-9a-f][\n\r\t]*[0-9a-f]/gi, " ")
        // .replace(/percnt/, 'percent')
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
    '(?:' + fuzzify('setter|location|innerHTML|outerHTML|cookie|name|document|toString|') +
    IC_EVAL_PATTERN + '|' + IC_EVENT_PATTERN + ')',
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
}

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


var ASPIdiocy = {
  _replaceRx: /%u([0-9a-fA-F]{4})/g,
  _affectsRx: /%u[0-9a-fA-F]{4}/,
  _badPercentRx: /%(?!u[0-9a-fA-F]{4}|[0-9a-fA-F]{2})|%(?:00|u0000)[^&=]*/g,

  hasBadPercents: function(s) this._badPercentRx.test(s),
  removeBadPercents: function(s) s.replace(this._badPercentRx, ''),
  affects: function(s) this._affectsRx.test(s),
  process: function(s) {
    s = this.filter(s);
    return /[\uff5f-\uffff]/.test(s) ? s + '&' + s.replace(/[\uff5f-\uffff]/g, '?') : s;
  },
  filter: function(s) this.removeBadPercents(s).replace(this._replaceRx, this._replace),

  coalesceQuery: function(s) { // HPP protection, see https://www.owasp.org/images/b/ba/AppsecEU09_CarettoniDiPaola_v0.8.pdf
    let qm = s.indexOf("?");
    if (qm < 0) return s;
    let p = s.substring(0, qm);
    let q = s.substring(qm + 1);
    if (!q) return s;

    let unchanged = true;
    let emptyParams = false;

    let pairs = (function rearrange(joinNames) {
      let pairs = q.split("&");
      let accumulator = { __proto__: null };
      for (let j = 0, len = pairs.length; j < len; j++) {
        let nv = pairs[j];
        let eq = nv.indexOf("=");
        if (eq === -1) {
          emptyParams = true;
          if (joinNames && j < len - 1) {
            pairs[j + 1] = nv + "&" + pairs[j + 1];
            delete pairs[j];
          }
          continue;
        }
        let key = "#" + unescape(nv.substring(0, eq)).toLowerCase();
        if (key in accumulator) {
          delete pairs[j];
          pairs[accumulator[key]] += ", " + nv.substring(eq + 1);
          unchanged = false;
        } else {
          accumulator[key] = j;
        }
      }
      return (emptyParams && !(unchanged || joinNames))
        ? pairs.concat(rearrange(true).filter(function(p) pairs.indexOf(p) === -1))
        : pairs;
    })();

    if (unchanged) return s;
    for (let j = pairs.length; j-- > 0;) if (!pairs[j]) pairs.splice(j, 1);
    return p + pairs.join("&");
  },

  _replace: function(match, hex) {
     // lazy init
     INCLUDE("ASPIdiocy");
     return ASPIdiocy._replace(match, hex);
  }
}

var FlashIdiocy = {
  _affectsRx: /%(?:[8-9a-f]|[0-7]?[^0-9a-f])/i, // high (non-ASCII) percent encoding or invalid second digit
  affects: function(s) this._affectsRx.test(s),

  purgeBadEncodings: function(s) {
    INCLUDE("FlashIdiocy");
    return this.purgeBadEncodings(s);
  }
}
