
function Cookie(s, host) {
  this.parse(s, host);
}
Cookie.computeId = function(c) {
  return c.name + ";" + c.host + "/" + c.path;
};
Cookie.find = function(f) {
  var cc = Cookie.prototype.cookieManager.enumerator;
  var c;
  while (cc.hasMoreElements()) {
    if (f(c = cc.getNext())) return c;
  }
  return null;
};

Cookie.attributes = { host: 'domain', path: 'path', expires: 'expires', isHttpOnly: 'HttpOnly', isSecure: 'Secure' };
Cookie.prototype = {
  
  name: '',
  value: '',
  source: '',
  domain: '',
  host: '',
  rawHost: '',
  path: '',
  secure: false,
  httponly: false,
  session: true,
  expires: 0,
  
  id: '',
  
  
  toString: function() {
    var c = [this['name'] + "=" + this.value];
    var v;
    const aa = Cookie.attributes;
    for (var k in aa) {
      var p = aa[k];
      v = this[k];
      switch(typeof(v)) {
        case "string":
          if (v) c.push(p + "=" + v);
          break;
        case "boolean":
          if (v) c.push(p);
          break;
        case "number":
          if (!this.isSession) c.push(p + "=" + new Date(v * 1000).toUTCString());
          break;
      }
    }
    return c.join("; ");
  },
  parse: function(s, host) {
    var p;
    if (this.source) {
      // cleanup for recycle
      for (p in this) {
        if (typeof (p) != "function") delete this[p];
      }
    }
    this.source = s;
    this.host = host;
    
    var parts = s.split(/;\s*/);
    var nv = parts.shift().split("=");
    
    this.name = nv.shift() || '';
    this.value = nv.join('=') || '';
    
    var n, v;
    for each (p in parts) {
      nv = p.split("=");
      switch (n = nv[0].toLowerCase()) {
        case 'expires':
          v = Math.round(Date.parse((nv[1] || '').replace(/\-/g, ' ')) / 1000);
        break;
        case 'domain':
        case 'path':
          v = nv[1] || '';
          break;
        case 'secure':
        case 'httponly':
          v = true;
          break;
        default:
          n = 'unknown'
      }
      this[n] = v;
    }
    if (!this.expires) {
      this.session = true;
      this.expires = Math.round(new Date() / 1000) + 31536000;  
    }
    if (this.domain) {
      if (!this.isDomain) this.domain = "." + this.domain;
      this.host = this.domain;
    }
    this.rawHost = this.host.replace(/^\./, '');
    
    this.id = Cookie.computeId(this);
  },
  
  
  get cookieManager() {
    delete Cookie.prototype.cookieManager;
    var cman =  CC["@mozilla.org/cookiemanager;1"]
      .getService(CI.nsICookieManager2).QueryInterface(CI.nsICookieManager);
    return Cookie.prototype.cookieManager = cman; 
  },
  belongsTo: function(host, path) {
    if (path && this.path && path.indexOf(this.path) != 0) return false;
    if (host == this.rawHost) return true;
    var d = this.domain;
    return d && (host == d || this.isDomain && host.slice(-d.length) == d);
  },
  save: function() {
    this.save = ("cookieExists" in this.cookieManager)
      ? function() { this.cookieManager.add(this.host, this.path, this.name, this.value, this.secure, this.httponly, this.session, this.expires); }
      : function() { this.cookieManager.add(this.host, this.path, this.name, this.value, this.secure,                this.session, this.expires);}
    ;
    return this.save();
  },
  exists: function() {
    var cc = this.cookieManager.enumerator;
    while(cc.hasMoreElements()) {
      if (this.sameAs(cc.getNext())) return true;
    }
    return false;
  },
  
  sameAs: function(c) {
    (c instanceof CI.nsICookie) && (c instanceof CI.nsICookie2);
    return Cookie.computeId(c) == this.id;
  },
  
  // nsICookie2 interface extras
  get isSecure() { return this.secure; },
  get expiry() { return this.expires; },
  get isSession() { return this.session; },
  get isHttpOnly() { return this.httponly; },
  get isDomain() { return this.domain && this.domain[0] == '.'; },
  policy: 0,
  status: 0,
  QueryInterface: xpcom_generateQI([CI.nsICookie, CI.nsICookie2, CI.nsISupports])
  
}

var HTTPS = {
  secureCookies: false,
  secureCookiesExceptions: null,
  secureCookiesForced: null,
  httpsForced: null,
  httpsForcedExceptions: null,
  
  log: function(msg) {
    this.log = ns.getPref("https.showInConsole", true)
      ? function(msg) { ns.log("[NoScript HTTPS] " + msg); }
      : function(msg) {}
      
    return this.log(msg);
  },
  
  onCrossSiteRequest: function(channel, origin, browser, rw) {
    try {
      if (!this.forceHttps(channel))
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
      Array.prototype.push.apply(
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
  
  shouldForbid: function(site) {
    switch(this.allowHttpsOnly) {
      case 0:
        return false;
      case 1:
        return /^(?:ht|f)tp:\/\//.test(site) && this.isProxied(site);
      case 2:
        return /^(?:ht|f)tp:\/\//.test(site);
    }
    return false;
  },
  
  isProxied: function(u) {
    var ps = CC["@mozilla.org/network/protocol-proxy-service;1"].getService(CI.nsIProtocolProxyService);
   
    this.isProxied = function(u) {
      try {
        if (!(u instanceof CI.nsIURI)) {
          u = IOS.newURI(u, null, null);
        }
        return ps.resolve(u, 0).type != "direct";
      } catch(e) {
        return false;
      }
    }
  },
  
  _getParent: function(req, w) {
    return  w && w.frameElement || DOM.findBrowserForNode(w || IOUtil.findWindow(req));
  },
  
  isRedir: function(req, w) {
    w = w || IOUtil.findWindow(req);
    
    var parent = this._getParent(req, w);
    if (!parent) return false;
    
    var uri = ns.getExpando(parent, "httpsRedirURI");
    return uri && uri.equals(req.URI);
  },
  
  forceHttps: function(req, w, isRedirection) {
    var uri;
    if (this.httpsForced && !(uri = req.URI).schemeIs("https") && this.httpsForced.test(uri.spec) &&
          !(this.httpsForcedExceptions && this.httpsForcedExceptions.test(uri.spec))) {
        
        if (isRedirection) {
          uri.scheme = "https";
          this.log("Forced HTTPS redirection on " + uri.spec);
        } else {
          uri = uri.clone();
          uri.scheme = "https"; 
  
          w = (w || IOUtil.findWindow(req));
          
          // redirect loop check
          var redirectedFrom = IOUtil.extractFromChannel(req, "noscript.redirectFrom");
          if (redirectedFrom && redirectedFrom.spec == uri.spec) {
            req.cancel(NS_ERROR_REDIRECT_LOOP);
            var parent = this._getParent(req, w);
            if (parent) {
              ns.setExpando(parent, "httpsRedirURI", req.URI);
              parent.addEventListener("load", function(ev) {
              ev.currentTarget.removeEventListener(ev.type, arguments.callee, true);
                ns.setExpando(parent, "httpsRedirURI", null);
              }, true);
            }
          }
  
          IOUtil.abort(req, true);
         
          w.location = uri.spec;
          this.log("Forced HTTPS document on " + uri.spec);
        }
        return true;
      }
    return false;
  },
  
  forceHttpsPolicy: function(uri, ctx, type) {
    if (this.httpsForced && this.httpsForced.test(uri.spec) && !(this.httpsForcedExceptions && this.httpsForcedExceptions.test(uri.spec))) {
      var httpsURI = uri.clone();
      httpsURI.scheme = "https";
      if (ctx && type != 6 && type != 7) {
        Thread.asap(function() {
          for each (var attr in ["src", "data", "href"]) {
            try {
              if (attr in ctx) {
                ctx[attr] = httpsURI.spec;
              }
            } catch(e) { HTTPS.log("Error forcing embedded HTTPS policy: " + e.message); }
          }
        });
      }
      this.log("Forcing HTTPS policy on " + uri.spec);
      uri.spec = httpsURI.spec;
      return true;
    }
    return false;
  }
};

(function () {
  ["secureCookies", "secureCookiesExceptions", "secureCookiesForced"].forEach(function(p) {
    var v = HTTPS[p];
    delete HTTPS[p];
    HTTPS.__defineGetter__(p, function() {
      return v;
    });
    HTTPS.__defineSetter__(p, function(n) {
      v = n;
      HTTPS.cookiesCleanup();
      return v;
    });
  });
})();
