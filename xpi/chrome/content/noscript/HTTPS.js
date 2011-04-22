LAZY_INCLUDE('Cookie');

const HTTPS = {
  ready: false,
  
  secureCookies: false,
  secureCookiesExceptions: null,
  secureCookiesForced: null,
  httpsForced: null,
  httpsForcedExceptions: null,

  get forceChannel() {
    delete this.forceChannel;
    return this.forceChannel = ChannelReplacement.supported
      ? function(channel) this.mustForce(channel.URI) && this.replaceChannel(channel)
      : function(channel) this.forceURI(channel.URI)
  },
  
  replaceChannel: function(channel) {
    if (ChannelReplacement.supported) {
      IOUtil.runWhenPending(channel, function() {
        var uri = channel.URI.clone();
        uri.scheme = "https";
        new ChannelReplacement(channel, uri).replace(true);
        HTTPS.log("Forced Channel " + uri.spec);
      });
      return true;
    }
    
    this.log("Aborting redirection " + channel.name + ", should be HTTPS!");
    IOUtil.abort(channel);
    return false;
  },
  
  forceURI: function(uri, fallback, ctx) {
    if (this.mustForce(uri)) {
      try {
        
        uri.scheme = "https";
        
        this.log("Forced URI " + uri.spec);
        return true;
        
      } catch(e) {
        
        if (ctx && ctx instanceof CI.nsIDOMHTMLImageElement || ctx instanceof CI.nsIDOMHTMLInputElement ||
            ctx instanceof CI.nsIObjectLoadingContent) {
          uri = uri.clone();
          uri.scheme = "https";
          
          var type, attr;
          if (ctx instanceof CI.nsIObjectLoadingContent) {
            type = "Object";
            attr = "data";
          } else {
            type = "Image";
            attr = "src";
          }
          Thread.asap(function() { ctx.setAttribute(attr, uri.spec); });
          
          var msg = type + " HTTP->HTTPS redirection to " + uri.spec;
          this.log(msg);  
          throw msg;
        }
        
        if (fallback && fallback()) {
           this.log("Channel redirection fallback on " + uri.spec);
           return true;
        }
        
        this.log("Error trying to force https on " + uri.spec + ": " + e);
      }
    }
    return false;
  },
  
  mustForce: function(uri) {
    return (uri.schemeIs("http") &&
        (this.httpsForced && this.httpsForced.test(uri.spec) ||
         STS.isSTSURI(uri)) &&
          !(this.httpsForcedExceptions &&
            this.httpsForcedExceptions.test(uri.spec)
        ));
  },
  
  log: function(msg) {
    this.log = ns.getPref("https.showInConsole", true)
      ? function(msg) { ns.log("[NoScript HTTPS] " + msg); }
      : function(msg) {}
      
    return this.log(msg);
  },
  
  onCrossSiteRequest: function(channel, origin, browser, rw) {
    try {
      this.handleCrossSiteCookies(channel, origin, browser);
    } catch(e) {
      this.log(e + " --- " + e.stack);
    }
  },
  
  registered: false,
  handleSecureCookies: function(req) {
  /*
    we check HTTPS responses setting cookies and
    1) if host is in the noscript.secureCookiesExceptions list we let
     it pass through
    2) if host is in the noscript.secureCookiesForced list we append a
       ";Secure" flag to every non-secure cookie set by this response
    3) otherwise, we just log unsafe cookies BUT if no secure cookie
       is set, we patch all these cookies with ";Secure" like in #2.
       However, if current request redirects (directly or indirectly)
       to an unencrypted final URI, we remove our ";Secure" patch to
       ensure compatibility (ref: mail.yahoo.com and hotmail.com unsafe
       behavior on 11 Sep 2008)
  */
    
    if (!this.secureCookies) return;
    
    var uri = req.URI;
    
    if (uri.schemeIs("https") &&
        !(this.secureCookiesExceptions && this.secureCookiesExceptions.test(uri.spec)) &&
        (req instanceof CI.nsIHttpChannel)) {
      try {
        var host = uri.host;
        try {
          var cookies = req.getResponseHeader("Set-Cookie");
        } catch(mayHappen) {
          return;
        }
        if (cookies) {
          var forced = this.secureCookiesForced && this.secureCookiesForced.test(uri.spec);
          var secureFound = false;
          var unsafe = null;
         
          const rw = ns.requestWatchdog;
          var browser = rw.findBrowser(req);
          
          if (!browser) {
            if (ns.consoleDump) ns.dump("Browser not found for " + uri.spec);
          }
          
          var unsafeMap = this.getUnsafeCookies(browser) || {};
          var c;
          for each (var cs in cookies.split("\n")) {
            c = new Cookie(cs, host);
            if (c.secure && c.belongsTo(host)) {
              this.log("Secure cookie set by " + host + ": " + c);
              secureFound = c;
              delete unsafeMap[c.id];
            } else {
              if (!unsafe) unsafe = [];
              unsafe.push(c);
            }
          }
        
          
          if (unsafe && !(forced || secureFound)) {
            // this page did not set any secure cookie, let's check if we already have one
            secureFound = Cookie.find(function(c) {
              return (c instanceof CI.nsICookie) && (c instanceof CI.nsICookie2)
                && c.secure && !unsafe.find(function(x) { return x.sameAs(c); })
            });
            if (secureFound) {
              this.log("Secure cookie found for this host: " + Cookie.prototype.toString.apply(secureFound));
            }
          }
          
          if (secureFound && !forced) {
            this.cookiesCleanup(secureFound);
            return;
          }
          
          if (!unsafe) return;

          var msg;
          if (forced || !secureFound) {
            req.setResponseHeader("Set-Cookie", "", false);
            msg = forced ? "FORCED SECURE" : "AUTOMATIC SECURE";
            forced = true;
          } else {
            msg = "DETECTED INSECURE";
          }
          
          if (!this.registered) {
            this.registered = true;
            rw.addCrossSiteListener(this);
          }
          
          this.setUnsafeCookies(browser, unsafeMap);
          msg += " on https://" + host + ": ";
          for each (c in unsafe) {
            if (forced) {
              c.secure = true;
              req.setResponseHeader("Set-Cookie", c.source + ";Secure", true);
              unsafeMap[c.id] = c;
            }
            this.log(msg + c);
          }
          
        }
      } catch(e) {
        if (ns.consoleDump) ns.dump(e);
      }
    }
  },
  
  handleCrossSiteCookies: function(req, origin, browser) {
     
    var unsafeCookies = this.getUnsafeCookies(browser);
    if (!unsafeCookies) return;
    
    var uri = req.URI;
    var dscheme = uri.scheme;
    
    var oparts = origin && origin.match(/^(https?):\/\/([^\/:]+).*?(\/.*)/);
    if (!(oparts && /https?/.test(dscheme))) return; 
    
    var oscheme = oparts[1];
    if (oscheme == dscheme) return; // we want to check only cross-scheme requests
    
    var dsecure = dscheme == "https";
    
    if (dsecure && !ns.getPref("secureCookies.recycle", false)) return;
   
    var dhost = uri.host;
    var dpath = uri.path;
    
    var ohost = oparts[2];
    var opath = oparts[3];
    
    var ocookieCount = 0, totCount = 0;
    var dcookies = [];
    var c;
    
    for (var k in unsafeCookies) {
      c = unsafeCookies[k];
      if (!c.exists()) {
        delete unsafeCookies[k];
      } else {
        totCount++;
        if (c.belongsTo(dhost, dpath) && c.secure != dsecure) { // either secure on http or not secure on https
          dcookies.push(c);
        }
        if (c.belongsTo(ohost, opath)) {
          ocookieCount++;
        }
      }
    }
    
    if (!totCount) {
      this.setUnsafeCookies(browser, null);
      return;
    }
    
    // We want to "desecurify" cookies only if cross-navigation to unsafe
    // destination originates from a site sharing some secured cookies

    if (ocookieCount == 0 && !dsecure || !dcookies.length) return; 
    
    if (dsecure) {
      this.log("Detected cross-site navigation with secured cookies: " + origin + " -> " + uri.spec);
      
    } else {
      this.log("Detected unsafe navigation with NoScript-secured cookies: " + origin + " -> " + uri.spec);
      this.log(uri.prePath + " cannot support secure cookies because it does not use HTTPS. Consider forcing HTTPS for " + uri.host + " in NoScript's Advanced HTTPS options panel.")
    }
    
    var cs = CC['@mozilla.org/cookieService;1'].getService(CI.nsICookieService).getCookieString(uri, req);
      
    for each (c in dcookies) {
      c.secure = dsecure;
      c.save();
      this.log("Toggled secure flag on " + c);
    }

    if (cs) {
      dcookies.push.apply(
        dcookies, cs.split(/\s*;\s*/).map(function(cs) { var nv = cs.split("="); return { name: nv.shift(), value: nv.join("=") } })
         .filter(function(c) { return dcookies.every(function(x) { return x.name != c.name }) })
      );
    }

    cs = dcookies.map(function(c) { return c.name + "=" + c.value }).join("; ");

    this.log("Sending Cookie for " + dhost + ": " + cs);
    req.setRequestHeader("Cookie", cs, false); // "false" because merge syntax breaks Cookie header
  },
  
  
  cookiesCleanup: function(refCookie) {
    var downgraded = [];

    var ignored = this.secureCookiesExceptions;
    var disabled = !this.secureCookies;
    var bi = DOM.createBrowserIterator();
    var unsafe, k, c, total, deleted;
    for (var browser; browser = bi.next();) {
      unsafe = this.getUnsafeCookies(browser);
      if (!unsafe) continue;
      total = deleted = 0;
      for (k in unsafe) {
        c = unsafe[k];
        total++;
        if (disabled || (refCookie ? c.belongsTo(refCookie.host) : ignored && ignored.test(c.rawHost))) {
          if (c.exists()) {
            this.log("Cleaning Secure flag from " + c);
            c.secure = false;
            c.save();
          }
          delete unsafe[k];
          deleted++;
        }
      }
      if (total == deleted) this.setUnsafeCookies(browser, null);
      if (!this.cookiesPerTab) break;
    }
  },
  
  get cookiesPerTab() {
    return ns.getPref("secureCookies.perTab", false);
  },
  
  _globalUnsafeCookies: {},
  getUnsafeCookies: function(browser) { 
    return this.cookiesPerTab
      ? browser && ns.getExpando(browser, "unsafeCookies")
      : this._globalUnsafeCookies;
  },
  setUnsafeCookies: function(browser, value) {
    return this.cookiesPerTab
      ? browser && ns.setExpando(browser, "unsafeCookies", value)
      : this._globalUnsafeCookies = value;
  },

  _getParent: function(req, w) {
    return  w && w.frameElement || DOM.findBrowserForNode(w || IOUtil.findWindow(req));
  }
  
};


["secureCookies", "secureCookiesExceptions", "secureCookiesForced"].forEach(function(p) {
  var v = HTTPS[p];
  delete HTTPS[p];
  HTTPS.__defineGetter__(p, function() {
    return v;
  });
  HTTPS.__defineSetter__(p, function(n) {
    v = n;
    if (HTTPS.ready) HTTPS.cookiesCleanup();
    return v;
  });
});

["secureCookies", "secureCookiesExceptions", "secureCookiesForced",
  "httpsForced", "httpsForcedExceptions", "STS.enabled"].forEach(function(p) {
  try {
    ns.syncPrefs(ns.prefs, p);
  } catch(e) {
    ns.dump(e.message + ":" + e.stack + " setting " + p + "\n");
  }
});


HTTPS.ready = true;