INCLUDE('IOUtil', 'antlr', 'ABEParser', 'ABELexer', 'URIPatternList', 'Thread', 'Lang');

const CHECKED_ABE = 0x01;
const CHECKED_XSS = 0x10;
const CHECKED_ASYNC = 0x20;

const ABE = {
  SITE_RULESET_LIFETIME: 12 * 60 * 60000, // 12 hours
  maxSiteRulesetSize: 8192,
  maxSiteRulesetTime: 16000, // 4kbit/sec :P
  enabled: false,
  siteEnabled: false,
  legacySupport: false,
  allowRulesetRedir: false,
  skipBrowserRequests: true,
  
  BROWSER_URI: IOS.newURI("chrome://browser/content/", null, null),
  LOAD_BACKGROUND: CI.nsIChannel.LOAD_BACKGROUND,
  LOAD_INITIAL_DOCUMENT_URI: CI.nsIChannel.LOAD_INITIAL_DOCUMENT_URI,
  SANDBOX_KEY: "abe.sandbox",
  localRulesets: [],
  _localMap: null,
  
  _siteRulesets: null,
  siteMap: {},
  
  get disabledRulesetNames() {
    return this.rulesets.filter(function(rs) { return rs.disabled; })
      .map(function(rs) { return rs.name; }).join(" ");
  },
  set disabledRulesetNames(names) {
    var rs;
    this.updateRules();
    for each (rs in this.rulesets) rs.disabled = false;
    if (names) try {
      for each (var name in names.split(/\s+/)) {
        rs = this.localMap[name] || this.siteMap[name];
        if (rs) rs.disabled = true; 
      }
    } catch(e) {}
    
    return names;
  },
  
  get localMap() {
    if (this._localMap) return this._localMap;
    this._localMap = {};
    for each (var rs in this.localRulesets) {
      this._localMap[rs.name] = rs;
    }
    return this._localMap;
  },
  
  get siteRulesets() {
    if (this._siteRulesets) return this._siteRulesets;
    this._siteRulesets = [];
    var rs;
    for (var name in this.siteMap) {
      rs = this.siteMap[name];
      if (rs && !rs.empty) this._siteRulesets.push(rs);
    }
    this._siteRulesets.sort(function(r1, r2) { return r1.name > r2.name; });
    return this._siteRulesets;
  },
  
  get rulesets() {
    return this.localRulesets.concat(this.siteRulesets);
  },
  
  checkFrameOpt: function(w, chan) {
    try {
      if (!w) {
        var ph = PolicyState.extract(chan);
        w = ph[3].self || ph[3].ownerDocument.defaultView;
      }
      
      switch (chan.getResponseHeader("X-FRAME-OPTIONS").toUpperCase()) {
        case "DENY":
          return true;
        case "SAMEORIGIN":
          return chan.URI.prePath != w.top.location.href.match(/^https?:\/\/[^\/]*/i)[0];
      }
    } catch(e) {}
    return false;
  },
  
  clear: function() {
    this.localRulesets = [];
    this.siteMap = {};
    this._siteRulesets = null;
    ABEStorage.reset();
  },
  
  refresh: function() {
    var disabled = this.disabledRulesetNames;
    this.clear();
    this.updateRulesNow();
    this.disabledRulesetNames = disabled;
  },
  
  parse: function(name, source, timestamp) {
    try {
      var rs =  new ABERuleset(name, source, timestamp);
      if (rs.site) {
        this.putSiteRuleset(rs);
      } else {
        this.addLocalRuleset(rs);
      }
      return rs;
    } catch(e) {
      this.log(e);
    }
    return false;
  },
  
  addLocalRuleset: function(rs) {
     this.localRulesets.push(rs);
     this._localMap = null;
  },
  
  putSiteRuleset: function(rs) {
    this.siteMap[rs.name] = rs;
    this._siteRulesets = null;
  },

  serialize: function() {
    var data = [];
    for each (var rs in this.localRulesets) {
      data.push({
        source: rs.source,
        name: rs.name,
        timestamp: rs.timestamp,
        disable: rs.disabled
      });
    }
  },
  
  restore: function(data) {
    if (!data.length) return;
    
    var f, change;
    ABEStorage.clear();
    for each(var i in data) {
      f = ABEStorage.getRulesetFile(i.name);
      if (f.lastModifiedTime < i.timestamp) {
        IO.writeFile(f, i.source);
        f.lastModifiedTime = i.timestamp;
        change = true;
      }
    }
    if (change) ABEStorage.loadRulesNow();
  },
  
  resetDefaults: function() {
    ABEStorage.clear();
    this.clear();
    this.updateRulesNow();
  },
  
  updateRules: function() {
    return ABEStorage.loadRules();
  },
  updateRulesNow: function(reset) {
    if (reset) ABEStorage.reset();
    return ABEStorage.loadRulesNow();
  },
  getRulesetFile: function(name) {
    return ABEStorage.getRulesetFile(name);
  },
  
  checkPolicy: function(origin, destination, method) {
    try {
      var res = this.checkRequest(new ABERequest(new ABEPolicyChannel(origin, destination, method)));
      return res && res.fatal;
    } catch(e) {
      ABE.log(e);
      return false;
    }
  },
  
  checkRequest: function(req, deferredCallback) {
    if (!(this.enabled && (Thread.canSpin || this.legacySupport)))
      return false;
  
    const channel = req.channel;
    const loadFlags = channel.loadFlags;
    
    var browserReq =  req.originURI.schemeIs("chrome") && !req.external;
    
    if (browserReq && (loadFlags & this.LOAD_BACKGROUND) && this.skipBrowserRequests) return false;
    
    this.updateRules();
    
    if (this.localRulesets.length == 0 && !this.siteEnabled)
      return null;
    
    if (req.deferredDNS && this._deferIfNeeded(req, deferredCallback))
      return false; 
    
    var t;
    if (this.consoleDump) {
      this.log("Checking " + req.destination + " from " + req.origin + " - " + loadFlags);
      t = Date.now();
    }
    
    try {
      var res = new ABERes(req);
      var rs;
      for each (rs in this.localRulesets) {
        if (this._check(rs, res)) break;
      }
      
      if (!(browserReq || res.fatal) &&
          this.siteEnabled && channel instanceof CI.nsIHttpChannel &&
          !IOUtil.extractFromChannel(channel, "ABE.preflight", true) &&
          req.destinationURI.schemeIs("https") &&
          req.destinationURI.prePath != req.originURI.prePath &&
          !(this.skipBrowserRequests && req.originURI.schemeIs("chrome") && !req.window) // skip preflight for window-less browser requests
      ) {
        
        var name = this._host2name(req.destinationURI.host);
        if (!(name in this.siteMap)) {
          ABE.log("Preflight for " + req.origin + ", " + req.destination + ", " + loadFlags);
          this.downloadRuleset(name, req.destinationURI, req.sameQueue);
        }
        
        rs = this.siteMap[name];
        if (rs && Date.now() - rs.timestamp > this.SITE_RULESET_LIFETIME)
          rs = this.downloadRuleset(name, req.destinationURI, req.sameQueue);
        
        if (rs) this._check(rs, res);
      }
    } finally {
      if (this.consoleDump) this.log(req.destination + " Checked in " + (Date.now() - t));
      req.checkFlags |= CHECKED_ABE;
      req.detach();
    }
    return res.lastRuleset && res;
  },
  
  _check: function(rs, res) {
    var action = rs.check(res.request);
    if (action) {
      var r = rs.lastMatch;
      this.log(r);
      this.log(res.request + ' matches "' + r.lastMatch + '"');
      (res.rulesets || (res.rulesets = [])).push(rs);
      res.lastRuleset = rs;
      return res.fatal = (res.request.channel instanceof ABEPolicyChannel)
        ? /^Deny$/i.test(action) 
        : ABEActions[action.toLowerCase()](res.request.channel);
    }
    return false;
  },
  
  _deferIfNeeded: function(req, callback) {
    var host;
    if (req.canDoDNS && !DNS.getCached(host = req.destinationURI.host, true)) {
      ABE.log(host + " not cached in DNS, deferring ABE checks after DNS resolution");
      req.attach();
      DNS.resolve(host, 0, function(dnsRecord) {
        try {
          if (!(dnsRecord && dnsRecord.valid)) {
            req.channel.cancel(Components.results.NS_ERROR_UNKNOWN_HOST);
          } else {
            if (req.deferredDNS) // it won't be so if we've been cancelled first
              if (callback) callback();
              else ABE.checkRequest(req);
          }
        } finally {
          req.detach();
        }
      });
      return true;
    }
    return false;
  },
  
  hasSiteRulesFor: function(host) {
    return this._host2Name(host) in this.siteMap;
  },
  
 
  _host2name: function(host) {
    return "." + host;
  },
  
  isSubdomain: function(parentHost, childHost) {
    if (parentHost.length > childHost.length) return false;
    parentHost = "." + parentHost;
    childHost = "." + childHost;
    return parentHost == childHost.substring(childHost.length - parentHost.length);
  },
  
  _downloading: {},
  downloadRuleset: function(name, uri, sameQueue) {
    var host = uri.host;
  
    var downloading = this._downloading;

    if (Thread.canSpin && (host in downloading)) {
      ABE.log("Already fetching rulesets for " + host);
      // Thread.yieldAll();
      // Thread.spinWithQueue({ get running() { return host in downloading; }});
      // return false;
    }
    
    var ts = Date.now();
    
    var ctrl = {
      _r: true,
      set running(v) { if (!v) delete downloading[host]; return this._r = v; },
      get running() { return this._r; },
      startTime: ts,
      maxTime: ABE.maxSiteRulesetTime
    };
    
    var elapsed;
    
    try {
      downloading[host] = true;
      
      this.log("Trying to fetch rules for " + host + ", sameQueue=" + sameQueue);
      
      uri = uri.clone();
      uri.scheme = "https";
      uri.path = "/rules.abe";
        
      var xhr = CC["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(CI.nsIXMLHttpRequest);
      xhr.mozBackgroundRequest = true;
      xhr.open("GET", uri.spec, Thread.canSpin); // async if we can spin our own event loop
      
      var channel = xhr.channel; // need to cast
      IOUtil.attachToChannel(channel, "ABE.preflight", {});
      
      if (channel instanceof CI.nsIHttpChannel && !this.allowRulesetRedir)
        channel.redirectionLimit = 0;
      
      if (channel instanceof CI.nsICachingChannel)
        channel.loadFlags |= channel.LOAD_BYPASS_LOCAL_CACHE_IF_BUSY; // see bug 309424
      
      
      xhr.onreadystatechange = function() {
        switch(xhr.readyState) {
          case 2:
            if (xhr.status >= 400) {
              ABE.log("Early abort with status " + xhr.status + " for ruleset at " + uri.spec);
              break;
            }
            return;
          case 3:
            var size = xhr.responseText.length; // todo: use https://developer.mozilla.org/En/Using_XMLHttpRequest#Monitoring_progress
            if (size > ABE.maxSiteRulesetSize) {
              ABE.log("Ruleset at " + uri.spec + " too big: " + size + " > " + ABE.maxSiteRulesetSize);
              break;
            }
            return;
          case 4:
            // end
            ctrl.running = false;
            return;
          default: // 0, 1
            return;
        }
        xhr.abort();
        ctrl.running = false;
      }
      
      if (Thread.canSpin) {
        var send = function() {
          xhr.send(null);
          return Thread.spin(ctrl);
        };
        
        if (sameQueue ? send() : Thread.runWithQueue(send)) {
          var size = 0;
          try {
            size = xhr.responseText.length;
          } catch(e) {}
          ABE.log("Ruleset at " + uri.spec + " timeout: " + size + " chars received in " + ctrl.elapsed + "ms");
          xhr.abort();
          return false;
        }
      } else {
        xhr.send(null);
      }
      
      if (xhr.channel != channel && xhr.channel) // shouldn't happen, see updateRedirectChain()...
        this._handleDownloadRedirection(channel, xhr.channel); 

      if (xhr.status != 200)
        throw new Error("Status: " + xhr.status);
      
      if (!/^application\/|\babe\b|^text\/plain$/i.test(xhr.channel.contentType))
        throw new Error("Content-type: " + xhr.channel.contentType);
      
      var source = xhr.responseText || '';
      
      elapsed = Date.now() - ts;
      if (source) ABE.log("Fetched ruleset for "+ host + " in " + elapsed + "ms");
      
      return this.parse(name, source);
    } catch(e) {
      elapsed = elapsed || Date.now() - ts;
      this.log("Can't fetch " + uri.spec + " (" + elapsed + "ms elapsed)");
      this.log(e.message);
    } finally {
      if (!(name in this.siteMap)) this.parse(name, '');
      else this.siteMap[name].timestamp = ts;
      ctrl.running = false;
    }
    
    return false;
  },
  
  
  isSandboxed: function(channel) {
    return IOUtil.extractFromChannel(channel, ABE.SANDBOX_KEY, true);
  },
  setSandboxed: function(channel) {
    IOUtil.attachToChannel(channel, ABE.SANDBOX_KEY, {});
  },
  sandbox: function(docShell) {
    docShell.allowJavascript = docShell.allowPlugins =
        docShell.allowMetaRedirects= docShell.allowSubframes = false;
  },
  
  
  updateRedirectChain: function(oldChannel, newChannel) {
    this._handleDownloadRedirection(oldChannel, newChannel);
    
    var redirectChain = this.getRedirectChain(oldChannel);
    redirectChain.push(oldChannel.URI);
    IOUtil.attachToChannel(newChannel, "ABE.redirectChain", redirectChain);
  },
  
  getRedirectChain: function(channel) {
    return IOUtil.extractFromChannel(channel, "ABE.redirectChain", true) || [];
  },
  
  _handleDownloadRedirection: function(oldChannel, newChannel) {
    if (!IOUtil.extractFromChannel(oldChannel, "ABE.preflight", true)) return;
    
    var uri = oldChannel.URI;
    var newURI = newChannel.URI;
        
    if (uri.spec != newURI.spec && // redirected, check if it same path and same domain or upper
        (uri.path != newURI.path || 
          !(newURI.schemeIs("https") && this.isSubdomain(newURI.host, uri.host))
        )
      ) {
      var msg = "Illegal ABE rule redirection " + uri.spec + " -> " + newURI.spec;
      ABE.log(msg);
      oldChannel.cancel(NS_BINDING_ABORTED);
      throw new Error(msg);
    }
    
    IOUtil.attachToChannel(oldChannel, "ABE.preflight", {});
  },
  
  
  consoleDump: false,
  log: function(msg) {
    if (this.consoleDump) {
      if (msg.stack) msg = msg.message + "\n" + msg.stack;
      dump("[ABE] " + msg + "\n");
    }
  }
}

function ABERes(req) {
  this.request = req;
}

ABERes.prototype = {
  rulesets: null,
  lastRuleset: null,
  fatal: false
}

var ABEActions = {
  accept: function(channel) {
    return false;  
  },
  deny: function(channel) {
    channel.cancel(Components.results.NS_ERROR_ABORT);
    return true;
  },
  logout: function(channel) {
    channel.setRequestHeader("Cookie", '', false);
    channel.setRequestHeader("Authorization", '', false);
    channel.loadFlags |= channel.LOAD_ANONYMOUS;
    return false;
  },
  
  sandbox: function(channel) {
    ABE.setSandboxed(channel);
    if (channel.loadFlags & channel.LOAD_DOCUMENT_URI) {
      var docShell = DOM.getDocShellForWindow(IOUtil.findWindow(channel));
      if (docShell) ABE.sandbox(docShell);
    }
    return false;
  }
}




function ABERuleset(name, source, timestamp) {
  this.name = name;
  this.site = /\./.test(name);
  this.source = source;
  this.empty = !source;
  this.timestamp = timestamp || Date.now();
  if (!this.empty) {
    try {
      // dirty hack
      var self = this;
      org.antlr.runtime.BaseRecognizer.prototype.emitErrorMessage = function(msg) {
        // we abort immediately to prevent infinite loops
        var m = msg.match(/^line (\d+)/i, msg);
        if (m) throw new Error(msg, parseInt(m[1]), ABE.getRulesetFile(self.name)); // TODO: error console reporting w/ line num
        throw new Error(msg)
      };
      
      this._init(new ABEParser(new org.antlr.runtime.CommonTokenStream(
        new ABELexer(new org.antlr.runtime.ANTLRStringStream(source))))
            .ruleset().getTree());
    } catch(e) {
      if (this.errors) this.errors.push(e.message)
      else this.errors = [e.message];
    }
  }
}

ABERuleset.prototype = {
  site: false,
  empty: false,
  errors: null,
  disabled: false,
  rules: [],
  expires: 0,
  
  _init: function(tree) {
    var rule = null;
    var predicate = null;
    var accumulator = null;
    var history  = [];
    var rules = [];
    
    walk(tree);
    
    if (!this.errors) this.rules = rules;
    rule = predicate = accumulator = history = null;
  
    
    function walk(tree) {
      var node, t;
      for (var j = 0, l = tree.getChildCount(); j < l; j++) {
        node = tree.getChild(j);
        examine(node);
        walk(node.getTree());
      }
    }
    
    function examine(node) {
      var t = node.getToken();
      
      switch(t.type) {
        case ABEParser.T_SITE:
        case ABEParser.EOF:
          if (rule) commit();
          if (t.type == ABEParser.T_SITE) {
            rule = { destinations: [], predicates: [] };
            accumulator = rule.destinations;		
          }
          break;
        case ABEParser.T_ACTION:
          if (rule) {
            rule.predicates.push(predicate = { actions: [], methods: [], origins: [] });
            accumulator = predicate.actions;
          }
          break;
        case ABEParser.T_METHODS:
          accumulator = predicate.methods;
          break;
        case ABEParser.T_FROM:
          accumulator = predicate.origins;
          break;
        case ABEParser.COMMENT:
          break;
        default:
          if (accumulator) accumulator.push(node.getText());
      }
    }
    
    function commit() {
      rules.push(new ABERule(rule.destinations, rule.predicates));
      rule = null;
    }
  },
  
  lastMatch: null,
	check: function(req) {
    if (this.disabled) return '';
    
		var res;
		for each (var r in this.rules) {
			res = r.check(req);
			if (res) {
        this.lastMatch = r;
        return res;
      }
		}
		return '';
	}
}

function ABERule(destinations, predicates) {
  this.destinations = destinations.join(" ");
  this.destination = new URIPatternList(destinations.filter(this._destinationFilter, this).join(" "));
  this.predicates = predicates.map(ABEPredicate.create);
}

ABERule.prototype = {
  local: false,
  
	allDestinations: false,
  lastMatch: null,
	_destinationFilter: function(s) {
		switch(s) {
			case "SELF":
				return false; // this is illegal, should we throw an exception?
			case "LOCAL":
				return !(this.local = true);
			case "ALL":
				return !(this.allDestinations = true);
		}
		return true;
	},
	
  check: function(req) {
    if (!req.failed &&
        (this.allDestinations ||
          this.destination && this.destination.test(req.destination) ||
          this.local && req.localDestination)
        ) {
      for each (var p in this.predicates) {
        if (p.match(req)) {
          this.lastMatch = p;
          return p.action;
        }
        if (req.failed) break;
      }
    }
    return '';
  },
  
  toString: function() {
    var s = "Site " + this.destinations + "\n" + this.predicates.join("\n");
    this.toString = function() { return s; };
    return s;
  }
}

function ABEPredicate(p) {
  this.action = p.actions[0];
  this.permissive = this.action == "Accept";
  this.methods = p.methods.join(" ");
    if (this.methods.length) {
      this.allMethods = false;
      var mm = p.methods.filter(this._methodFilter, this);
      if (mm.length) this.methodRx = new RegExp("^\\b(?:" + mm.join("|") + ")\\b$", "i");
    }
    this.origins = p.origins.join(" ");
    if (p.origins.length) {
            this.allOrigins = false;
    if (this.permissive) { // if Accept any, accept browser URLs 
      p.origins.push("^(?:chrome|resource):");
    }
    this.origin = new URIPatternList(p.origins.filter(this._originFilter, this).join(" "));
  }
}
ABEPredicate.create = function(p) { return new ABEPredicate(p); };
ABEPredicate.prototype = {
	subdoc: false,
	self: false,
	local: false,
	
	allMethods: true,
	allOrigins: true,
	
	methodRx: null,
	origin: null,
  
	_methodFilter: function(m) {
		switch(m) {
			case "SUB":
				return !(this.subdoc = true);
			case "ALL":
				return !(this.allMethods = true);
		}
		return true;
	},
	_originFilter: function(s) {
		switch(s) {
			case "SELF":
				return !(this.self = true);
			case "LOCAL":
				return !(this.local = true);
			case "ALL":
				return !(this.allOrigins = true);
		}
		return true;
	},
	
  match: function(req) {
    return (this.allMethods || this.subdoc && req.isSubdoc ||
						this.methodRx && this.methodRx.test(req.method)) &&
			(this.allOrigins || this.self && req.isSelf ||
				(this.permissive ? req.matchAllOrigins(this.origin) : req.matchSomeOrigins(this.origin)) ||
				this.local && req.localOrigin
			);
  },
  
  toString: function() {
    var s = this.action;
    if (this.methods) s += " " + this.methods;
    if (this.origins) s += " from " + this.origins;
    this.toString = function() { return s; };
    return s;
  }
}

function ABEPolicyChannel(origin, destination, method) {
  this.originURI = origin;
  this.URI = destination;
  if (method) this.requestMethod = method;
}
ABEPolicyChannel.prototype = {
  requestMethod: "GET",
  cancelled: false,
  loadFlags: 0,
  cancel: function() {
    this.cancelled = true;
  }
}

function ABERequest(channel) {
	this._init(channel);
}

ABERequest.fromChannel = function(channel) {
  return IOUtil.extractFromChannel(channel, "ABE.request", true);
}

ABERequest.newOrRecycle = function(channel) {
  var req = this.fromChannel(channel);
  if (req) {
    delete req.localDestination;
    delete req.localOrigin;
  } else req = new ABERequest(channel);
}


ABERequest.getOrigin = function(channel) {
  IOUtil.extractFromChannel(channel, "ABE.origin", true);
},
ABERequest.storeOrigin = function(channel, origin) {
  IOUtil.attachToChannel(channel, "ABE.origin", true);
},

ABERequest.clear = function(channel) {
  IOUtil.extractFromChannel(channel, "ABE.origin");
  var req = this.fromChannel(channel);
  if (req) req.detach();
}
ABERequest.count = 0;


ABERequest.prototype = Lang.memoize({
	external: false,
	failed: false,
  checkFlags: 0,
  deferredDNS: true,
  detached: true,
  
  _init: function(channel) {
   
    this.channel = channel;
    this.method = channel.requestMethod;
    this.destinationURI = IOUtil.unwrapURL(channel.URI);
    this.destination = this.destinationURI.spec;
    this.early = channel instanceof ABEPolicyChannel;
    this.isDoc = !!(channel.loadFlags & channel.LOAD_DOCUMENT_URI);
    
    var ou = ABERequest.getOrigin(channel);
    if (ou) {
      this.xOriginURI = this.originURI = ou;
      this.xOrigin = this.origin = ou.spec;
    } else {
      this.xOriginURI = this.early
        ? channel.originURI
        : XOriginCache.pick(this.destinationURI, true) || // picks and remove cached entry
            ((channel.originalURI.spec != this.destination) 
              ? channel.originalURI 
              : IOUtil.extractInternalReferrer(channel)
            ) || null;
      
      this.xOrigin = this.xOriginURI && this.xOriginURI.spec || '';
      
      var ou = this.xOrigin && this.xOriginURI;
      if (!ou) {
        if (channel instanceof CI.nsIHttpChannelInternal) {
          ou = channel.documentURI;
          if (!ou || ou.spec == this.destination) ou = null;
        }
      }
      if (this.isDoc && (!ou || /^(?:javascript|data)$/i.test(ou.scheme))) {
        ou = this.traceBack;
        if (ou) ou = IOS.newURI(ou, null, null);
      }
      
      this.originURI = ou && IOUtil.unwrapURL(ou) || ABE.BROWSER_URI;
      
      this.origin = this.originURI && this.originURI.spec || '';
    
      ABERequest.storeOrigin(channel, this.originURI);
    }
  },
  
  
  attach: function() {
    if (!this.early) {
      IOUtil.attachToChannel(this.channel, "ABE.request", this);
      ABERequest.count++;
      this.detached = false;
    }
  },
  
  detach: function() {
    if (!this.early) {
      IOUtil.extractFromChannel(this.channel, "ABE.request", this);
      ABERequest.count--;
      this.detached = true;
      this.deferredDNS = false;
    }
  },
  
  isBrowserURI: function(uri) {
    return /^(?:chrome|resource)$/i.test(uri.scheme);
  },
  
  isLocal: function(uri, all) {
    return DNS.isLocalURI(uri, all);
  },
  
  _checkLocalOrigin: function(uri) {
    try {
      return !this.failed && uri && (this.isBrowserURI(uri) || this.isLocal(uri, true)); // we cache external origins to mitigate DNS rebinding
    } catch(e) {
      ABE.log("Local origin DNS check failed for " + uri.spec + ": " + e);
      try {
        if (this.destinationURI.host == uri.host) {
          this.channel.cancel(NS_ERROR_UNKNOWN_HOST);
          this.failed = true;
        }
      } catch(e) {
      }
      return false;
    }
  },
  
  _checkSelf: function(originURI) {
    return originURI &&  (this.isBrowserURI(originURI) || originURI.prePath == this.destinationURI.prePath);
  },
  
  matchAllOrigins: function(upl) {
    return upl.test(this.origin) && this.redirectChain.every(upl.testURI, upl);
  },
  
  matchSomeOrigins: function(upl) {
    return upl.test(this.origin) || this.redirectChain.some(upl.testURI, upl);
  },
  
  toString: function() {
    var s = "{" + this.method + " " + this.destination + " <<< " +
      this.redirectChain.map(function(uri) { return uri.spec; }).concat(this.origin)
        .join(", ") + "}";
    this.toString = function() { return s; }
    return s;
  }
},
// lazy properties
{
  traceBack: function() {
    this.breadCrumbs = [this.destination];
    return !this.early && OriginTracer.traceBack(this, this.breadCrumbs);
  },
  traceBackURI: function() {
    var tbu = this.traceBack;
    return tbu && IOS.newURI(tbu, null, null);
  },
  canDoDNS: function() {
    return (this.channel instanceof CI.nsIChannel) && // we want to prevent sync DNS resolution for resources we didn't already looked up
      IOUtil.canDoDNS(this.channel);
  },
  localOrigin: function() {
    return this.canDoDNS &&  this._checkLocalOrigin(this.originURI) &&
        this.redirectChain.every(this._checkLocalOrigin, this);
  },
  localDestination: function() {
    try {
      return !this.failed && this.canDoDNS && this.isLocal(this.destinationURI, false);
    } catch(e) {
      ABE.log("Local destination DNS check failed for " + this.destination +" from "+ this.origin + ": " + e);
      this.channel.cancel(NS_ERROR_UNKNOWN_HOST);
      this.failed = true;
      return false;
    }
  },
  isSelf: function() {
    return this._checkSelf(this.originURI) && this.redirectChain.every(this._checkSelf, this);
  },
  isSubdoc: function() {
    var channel = this.channel;
    if (this.isDoc) {
      var w = this.window;
      return w != w.top;
    }
    return false;
  },
  redirectChain: function() {
    return ABE.getRedirectChain(this.channel);
  },
  sameQueue: function() {
    return this.isDoc || !!(this.channel.loadFlags & this.channel.LOAD_BACKGROUND) || !this.window
      ;
  },
  window: function() {
    return IOUtil.findWindow(this.channel);
  }
}
); // end memoize


var ABEStorage = {
  _lastCheckTS: 0,
  _delay: 360000, // wait 1 hour to check and fetch
  _defaults: {
    SYSTEM: "# Prevent Internet sites from requesting LAN resources.\r\nSite LOCAL\r\nAccept from LOCAL\r\nDeny",
    USER: "# User-defined rules. Feel free to experiment here.\r\n\r\n"
  },
  
  _initDefaults: function(dir) {
    try {
      var f, content;
      for (var d in this._defaults) {
        f = dir.clone();
        f.append(d + ".abe");
        if (!f.exists()) {
          f.create(f.NORMAL_FILE_TYPE, 0600);
          IO.writeFile(f, this._defaults[d]);
        }
      }
    } catch(e) {
      ABE.log(e);
    }
  },
  
  _initDir: function(dir) {
    if (!dir.exists()) try {
      dir.create(dir.DIRECTORY_TYPE, 0755);
      this._initDefaults(dir);
    } catch(e) {
      ABE.log(e);
    }
  },
  
  get dir() {
    var dir = CC["@mozilla.org/file/directory_service;1"].getService(
        CI.nsIProperties).get("ProfD", CI.nsIFile);
    dir.append("ABE");
    dir.append("rules");
    this._initDir(dir);
    
    delete this.dir;
    return this.dir = dir;
  },
  
  
  
  clear: function() {
    this.dir.remove(true);
    this._initDir(this.dir);
  },
  
  reset: function() {
    this._lastCheckTS = 0;
  },
  
  getRulesetFile: function(name) {
    var f = this.dir.clone();
    f.append(name + ".abe");
    return f;
  },
  
  loadRules: function() {
    return !(this._lastCheckTS &&
              Date.now() - this._lastCheckTS < this._delay) &&
          this.loadRulesNow();
  },
  
  loadRulesNow: function() {
    ABE.log("Checking for updated rules...");
    var t = Date.now();
    try {
      var dir = this.dir;
      try {
        var entries = dir.directoryEntries;
      } catch(e) {
        this._initDir(dir);
        entries =  dir.directoryEntries;
      }
      var ff = [];
      var mustUpdate = dir.lastModifiedTime > this._lastCheckTS;
      var f;
      while(entries.hasMoreElements()) {
        f = entries.getNext();
        if (f instanceof CI.nsIFile && /^[^\.\s]*\.abe$/i.test(f.leafName)) {
          ff.push(f);
          if (!mustUpdate && f.lastModifiedTime > this._lastCheckTS) mustUpdate = true;
        }
      }
      
      if (!mustUpdate) return false;
      
      ABE.log("Rules changed, reloading!")
      
      ff.sort(function(a, b) { return a.leafName > b.leafName; });
      
      var disabledNames = ABE.disabledRulesetNames;
      ABE.clear();
      ff.forEach(this.loadRuleFile, this);
      ABE.disableRulesetNames = disabledNames;
      
    } catch(e) {
      ABE.log(e);
      return false;
    } finally {
      this._lastCheckTS = Date.now();
      ABE.log("Updates checked in " + (this._lastCheckTS - t) + "ms");
    }
    return true;
  },
  
  loadRuleFile: function(f) {
    try {
      ABE.parse(f.leafName.replace(/\.abe$/i, ''), IO.readFile(f), f.lastModifiedTime);
    } catch(e) {
      ABE.log(e);
    }
  }
  
}


var XOriginCache = {
  LIFE: 180000, // 3 mins, more than enough for most DNS timeout confs
  PURGE_INTERVAL: 60000,
  MAX_ENTRIES: 100,
  _entries: [],
  _lastPurge: Date.now(),
  _lastDestination: null,
  
  store: function(origin, destination) {
    if (destination === this._lastDestination)
      return; // we can afford it because we deal with nsIURI pointers and origins are invariants
    
    this._lastDestination = destination;
    
    var ts = Date.now();
    this._entries.push({ o: origin, d: destination, ts: ts });
    
    if (this._entries.length > this.MAX_ENTRIES)
      this._entries.shift();
      
    if (ts - this._lastPurge > this.PURGE_INTERVAL) this.purge(ts);
  },
  pick: function(destination, remove) {
    var ee = this._entries;
    for (var j = ee.length, e;  j--> 0;) {
      if ((e = ee[j]).d === destination) {
        if (remove) ee.splice(j, 1);
        return e.o;
      }
    }
    return null;
  },
  purge: function(ts) {
    ts = ts || Date.now();
    var ee = this._entries;
    var j = 0, len = ee.length;
    for(; j < len && ee[j].ts + this.LIFE < ts; j++);
    if (j > 0) ee.splice(0, j);
    this._lastPurge = ts;
    this._lastDestination = null;
  }
}

var OriginTracer = {
  detectBackFrame: function(prev, next, ds) {
    if (prev.ID != next.ID) return prev.URI.spec;
    if ((prev instanceof CI.nsISHContainer) &&
       (next instanceof CI.nsISHContainer) &&
       (ds instanceof CI.nsIDocShellTreeNode)
      ) {
      var uri;
      for (var j = Math.min(prev.childCount, next.childCount, ds.childCount); j-- > 0;) {
        uri = this.detectBackFrame(prev.GetChildAt(j),
                                   next.GetChildAt(j),
                                   ds.GetChildAt(j));
        if (uri) return uri.spec;
      }
    }
    return null;
  },
  
  traceBackHistory: function(sh, window, breadCrumbs) {
    var wantsBreadCrumbs = !breadCrumbs;
    breadCrumbs = breadCrumbs || [window.document.documentURI];
    
    var he;
    var uri = null;
    var site = '';
    for (var j = sh.index; j > -1; j--) {
       he = sh.getEntryAtIndex(j, false);
       if (he.isSubFrame && j > 0) {
         uri = this.detectBackFrame(sh.getEntryAtIndex(j - 1), h,
           DOM.getDocShellForWindow(window)
         );  
       } else {
        // not a subframe navigation 
        if (window == window.top) {
          uri = he.URI.spec; // top frame, return history entry
        } else {
          window = window.parent;
          uri = window.document.documentURI;
        }
      }
      if (!uri) break;
      if (breadCrumbs[0] && breadCrumbs[0] == uri) continue;
      breadCrumbs.unshift(uri);
      if (!/^(?:javascript|data)$/i.test(uri.scheme)) {
        site = uri;
        break;
      }
    }
    return wantsBreadCrumbs ? breadCrumbs : site;
  },
  
  traceBack: function(req, breadCrumbs) {
    var res = '';
    try {
      ABE.log("Traceback origin for " +req.destination);
      var window = req.window;
      if (window instanceof CI.nsIInterfaceRequestor) {
        var webNav = window.getInterface(CI.nsIWebNavigation);
        const sh = webNav.sessionHistory;
        res = sh ? this.traceBackHistory(sh, window, breadCrumbs || null) 
                  : webNav.currentURI && !webNav.currentURI.equals(req.destinationURI) 
                    ? webNav.currentURI.spec
                    : '';
      }
    } catch(e) {
      ABE.log("Error tracing back origin for " + req.destination + ": " + e.message);
    }
    ABE.log("Traced back " + req.destination + " to " + res);
    return res;
  }
}
