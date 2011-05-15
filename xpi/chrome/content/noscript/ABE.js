INCLUDE('antlr', 'ABEParser', 'ABELexer', 'Lang');

const ABE = {
  RULES_CHANGED_TOPIC: "abe:rules-changed",
  FLAG_CALLED: 0x01,
  FLAG_CHECKED: 0x02,
  
  SITE_RULESET_LIFETIME: 12 * 60 * 60000, // 12 hours
  maxSiteRulesetSize: 8192,
  maxSiteRulesetTime: 16000,
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
  
  init: function(prefParent) {
    const ps = this.prefService = CC["@mozilla.org/preferences-service;1"]
      .getService(CI.nsIPrefService).QueryInterface(CI.nsIPrefBranch);
    ABEStorage.init(ps.getBranch(prefParent+ "ABE.").QueryInterface(CI.nsIPrefBranch2));
    DoNotTrack.init(ps.getBranch(prefParent+ "doNotTrack.").QueryInterface(CI.nsIPrefBranch2));
  },
  
  siteMap: {__proto__: null},
  
  get disabledRulesetNames() {
    return this.rulesets.filter(function(rs) { return rs.disabled; })
      .map(function(rs) { return rs.name; }).join(" ");
  },
  set disabledRulesetNames(names) {
    var rs;
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
    this._localMap = {__proto__: null};
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
        var ctx = ph.context;
        w = ctx.self || ctx.ownerDocument.defaultView;
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
    this.refresh();
  },
  
  refresh: function() {
    this.siteMap = {__proto__: null};
    this._siteRulesets = null;
  },
  
  parse: function(name, source, timestamp) {
    try {
      var rs =  new ABERuleset(name, source, timestamp || Date.now());
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
  
  storeRuleset: function(name, source) {
    if (this.localMap[name] === source) return false;
    ABEStorage.saveRuleset(name, source);
    ABEStorage.persist();
    ABEStorage.loadRules();
    return true;
  },
  
  addLocalRuleset: function(rs) {
     this.localRulesets.push(rs);
     this._localMap = null;
  },
  
  putSiteRuleset: function(rs) {
    this.siteMap[rs.name] = rs;
    this._siteRulesets = null;
  },

  restoreJSONRules: function(data) {
    if (!data.length) return;
    
    var f, change;
    try {
      ABEStorage.clear();
      for each(var rs in data) ABEStorage.saveRuleset(rs.name, rs.source);
    } catch(e) {
      ABE.log("Failed to restore configuration: " + e);
    }
  },
  
  resetDefaults: function() {
    ABEStorage.clear();
    this.clear();
  },
  
  
  checkPolicy: function(origin, destination, type) {
    try {
      return this.checkRequest(new ABERequest(new ABEPolicyChannel(origin, destination, type)));
    } catch(e) {
      ABE.log(e);
      return false;
    }
  },
  
  checkRequest: function(req) {
    if (!(this.enabled && (Thread.canSpin || this.legacySupport)))
      return false;
  
    const channel = req.channel;
    const loadFlags = channel.loadFlags;
    
    var browserReq =  req.originURI.schemeIs("chrome") && !req.external;
    
    if (browserReq &&
        (
          this.skipBrowserRequests &&
          ((loadFlags & this.LOAD_BACKGROUND) ||
           !req.isDoc && req.origin == ABE.BROWSER_URI.spec && !req.window)
        )
      ) {
      if (this.consoleDump) this.log("Skipping low-level browser request for " + req.destination);
      return false;
    }
  
    if (this.localRulesets.length == 0 && !this.siteEnabled)
      return null;
    
    if (this.deferIfNeeded(req))
      return false;
    
    if (DoNotTrack.enabled) DoNotTrack.apply(req);
    
    var t;
    if (this.consoleDump) {
      this.log("Checking #" + req.serial + ": " + req.destination + " from " + req.origin + " - " + loadFlags);
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
      req.checkFlags |= this.FLAG_CHECKED;
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
      action = action.toLowerCase();
      return res.fatal = (res.request.channel instanceof ABEPolicyChannel)
        ? action === "deny" 
        : ABEActions[action](res.request);
    }
    return false;
  },
  
  deferIfNeeded: function(req) {
    var host = req.destinationURI.host;
    if (!(req.canDoDNS && req.deferredDNS) ||
        !ChannelReplacement.supported ||
        DNS.isIP(host) ||
        DNS.getCached(host) || // getCached() rather than isCached(), otherwise we defer even for lazy expiration
        req.channel.redirectionLimit == 0 || req.channel.status != 0 ||
        req.channel.notificationCallbacks instanceof CI.nsIObjectLoadingContent // OBJECT elements can't be channel-replaced :(
        ) 
      return false;

    IOUtil.attachToChannel(req.channel, "ABE.deferred", DUMMYOBJ);
    
    if (IOUtil.runWhenPending(req.channel, function() {
      try {
        
        if (req.channel.status != 0) return;
        
        if ((req.channel instanceof CI.nsITransportEventSink)
            && req.isDoc && !(req.subdoc || req.dnsNotified)) try {
          ABE.log("DNS notification for " + req.destination);
          req.dnsNotified = true; // unexplicable recursions have been reported... 
          req.channel.onTransportStatus(null, 0x804b0003, 0, 0); // notify STATUS_RESOLVING
        } catch(e) {}
        
        req.replace(false, null, function(replacement) {      
          ABE.log(host + " not cached in DNS, deferring ABE checks after DNS resolution for request " + req.serial);

          DNS.resolve(host, 0, function(dnsRecord) {
            replacement.open();
          });
        });
        
      } catch(e) {
        ABE.log("Deferred ABE checks failed: " + e);
      }
    })) {
      ABE.log(req.serial + " not pending yet, will check later.")
    }
    
    return true;
  },
  
  isDeferred: function(chan) {
    return !!IOUtil.extractFromChannel(chan, "ABE.deferred", true);
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
  _abeContentTypeRx: /^application\/|\babe\b|^text\/plain$/i,
  downloadRuleset: function(name, uri, sameQueue) {
    var host = uri.host;
  
    var downloading = this._downloading;

    if (Thread.canSpin && (host in downloading)) {
      ABE.log("Already fetching rulesets for " + host);
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
      IOUtil.attachToChannel(channel, "ABE.preflight", DUMMYOBJ);
      
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
      
      if (!this._abeContentTypeRx.test(xhr.channel.contentType))
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
    IOUtil.attachToChannel(channel, ABE.SANDBOX_KEY, DUMMYOBJ);
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
    var rc = IOUtil.extractFromChannel(channel, "ABE.redirectChain", true);
    if (!rc) {
      var origin = ABERequest.getOrigin(channel);
      rc = origin ? [origin] : [];
      rc.wrappedJSObject = rc;
    };
    return rc;
  },
  
  getOriginalOrigin: function(channel) {
    var rc = this.getRedirectChain(channel);
    return rc.length && rc[0] || null;
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
    
    IOUtil.attachToChannel(oldChannel, "ABE.preflight", DUMMYOBJ);
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
  accept: function(req) {
    return false;  
  },
  deny: function(req) {
    IOUtil.abort(req.channel, true);
    return true;
  },
  
  _idempotentMethodsRx: /^(?:GET|HEAD|OPTIONS)$/i,
  anonymize: function(req, channel, replaced) {
    channel = channel || req.channel;
    if (channel.loadFlags & channel.LOAD_ANONYMOUS) // already anonymous
      return false;
    
    if (!ChannelReplacement.supported) {
      ABE.log("Couldn't replace " + req.destination + " for Anonymize, falling back to Deny.");
      return this.deny(req);
    }

    let cookie;
    try {
      cookie = channel.getRequestHeader("Cookie");
    } catch(e) {
      cookie = '';
    }
    
    req.replace(
      this._idempotentMethodsRx.test(channel.requestMethod) ? null : "GET",
      IOUtil.anonymizeURI(req.destinationURI.clone(), cookie),
      function(replacement) {
        let channel = replacement.channel;
        channel.setRequestHeader("Cookie", '', false);
        channel.setRequestHeader("Authorization", '', false);
        channel.loadFlags |= channel.LOAD_ANONYMOUS;
        replacement.open();
      }
    );

    return false;
  },
  
  sandbox: function(req) {
    ABE.setSandboxed(req.channel);
    if (req.isDoc) {
      var docShell = DOM.getDocShellForWindow(req.window);
      if (docShell) ABE.sandbox(docShell);
    }
    return false;
  }
}


function ABERuleset(name, source, timestamp) {
  this.name = name;
  this.site = name.indexOf(".") !== -1;
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
        if (m) throw new Error(msg, parseInt(m[1]), self.name); // TODO: error console reporting w/ line num
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
    var rule = null,
        predicate = null,
        accumulator = null,
        history  = [],
        rules = [];
    
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
        case ABEParser.INC:
          if (!("inclusions" in predicate)) predicate.inclusions = [];
        break;
        case ABEParser.INC_TYPE:
          if ("inclusions" in predicate) predicate.inclusions.push(node.getText());
          break;
        break;
        case ABEParser.T_FROM:
          accumulator = predicate.origins;
          break;
        case ABEParser.COMMENT:
        case ABEParser.COMMA:
        case ABEParser.LPAR: case ABEParser.RPAR:
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
  this.destination = new AddressMatcher(destinations.filter(this._destinationFilter, this).join(" "));
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
          this.destination && this.destination.test(req.destination, req.canDoDNS, false) ||
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
 
  switch(this.action) {
    case "Accept":
      this.permissive = true;
      break;
    case "Logout": case "Anon":
      this.action = 'Anonymize';
      break;
  }
  
  var methods = p.methods;
  
  if ("inclusions" in p) {
    this.inclusion = true;
    
    // rebuild method string for cosmetic reasons
    let incMethod = "INCLUSION";
    let ii = p.inclusions;
    let j = ii.length;
    if (j) {
      incMethod += "(" + ii.join(", ") + ")";
      let its = [];
      let map = this._inclusionTypesMap;
      while (j-- > 0) {
        let i = ii[j];
        if (i in map) {
          let t = map[i];
          if (typeof t === "number") its.push(t);
          else its.push.apply(its, t);
        } else its.push(0);
      }
      this.inclusionTypes = its;
    } else {
      this.inclusionTypes = this.ANY_TYPE;
    }
    
    methods = p.methods.concat(incMethod);
  }
  
  this.methods = methods.join(" ");
  
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
    this.origin = new AddressMatcher(p.origins.filter(this._originFilter, this).join(" "));
  }
}
ABEPredicate.create = function(p) { return new ABEPredicate(p); };
ABEPredicate.prototype = {
  permissive: false,
  
  subdoc: false,
	self: false,
  sameDomain: false,
  sameBaseDomain: false,
	local: false,
	
	allMethods: true,
	allOrigins: true,
	
	methodRx: null,
	origin: null,
  
  inclusion: false,
  inlcusionTypes: [],
  get ANY_TYPE() {
    delete this.__proto__.ANY_TYPE;
    var its = [];
    var map = this._inclusionTypesMap;
    for (var k in map) {
      let v = map[k];
      if (typeof v === "number") its.push(v);
      else its.push.apply(its, v);
    }
    return this.__proto__.ANY_TYPE = its;
  },
  get _inclusionTypesMap() {
    delete this.__proto__._inclusionTypesMap;
    const CP = CI.nsIContentPolicy;
    return this.__proto__._inclusionTypesMap = 
    {
      "OTHER": CP.TYPE_OTHER,
      "FONT": CP.TYPE_FONT,
      "SCRIPT": CP.TYPE_SCRIPT,
      "IMAGE": CP.TYPE_IMAGE,
      "CSS": CP.TYPE_STYLESHEET,
      "OBJ": [CP.TYPE_OBJECT, CP.TYPE_OBJECT_SUBREQUEST],
      "MEDIA": CP.TYPE_MEDIA,
      "SUBDOC": CI.nsIContentPolicy.TYPE_SUBDOCUMENT,
      "XBL": CI.nsIContentPolicy.TYPE_XBL,
      "PING": CI.nsIContentPolicy.TYPE_PING,
      "XHR": CI.nsIContentPolicy.TYPE_XMLHTTPREQUEST,
      "OBJSUB": CI.nsIContentPolicy.TYPE_OBJECT_SUBREQUEST,
      "DTD": CI.nsIContentPolicy.TYPE_DTD
    };
  },
 
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
      case "SELF+":
        return !(this.sameDomain = true);
      case "SELF++":
        return !(this.sameBaseDomain = true);
			case "LOCAL":
				return !(this.local = true);
			case "ALL":
				return !(this.allOrigins = true);
		}
		return true;
	},
	
  match: function(req) {
    return (this.allMethods || this.subdoc && req.isSubdoc ||
            this.inclusion && req.isOfType(this.inclusionTypes) ||
						this.methodRx && this.methodRx.test(req.method)) &&
			(this.allOrigins ||
        this.self && req.isSelf || this.sameDomain && req.isSameDomain || this.sameBaseDomain && req.isSameBaseDomain ||
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

function ABEPolicyChannel(origin, destination, type) {
  this.originURI = origin;
  this.URI = destination;
  this.type = type;
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

ABERequest.serial = 0;

ABERequest.getOrigin = function(channel) {
  let u = IOUtil.extractFromChannel(channel, "ABE.origin", true);
  return (u instanceof CI.nsIURI) ? u : null;
},
ABERequest.getLoadingChannel = function(window) {
  return window && ("__loadingChannel__" in window) && window.__loadingChannel__;
},

ABERequest.storeOrigin = function(channel, originURI) {
  IOUtil.attachToChannel(channel, "ABE.origin", originURI);
},

ABERequest.clear = function(channel, window) {
  IOUtil.extractFromChannel(channel, "ABE.origin");
}

ABERequest.count = 0;


ABERequest.prototype = Lang.memoize({
	external: false,
	failed: false,
  checkFlags: 0,
  deferredDNS: true,
  replaced: false,
  dnsNotified: false,
  
  _init: function(channel) {
    this.serial = ABERequest.serial++;
    this.channel = channel;
    this.method = channel.requestMethod;
    this.destinationURI = IOUtil.unwrapURL(channel.URI);
    this.destination = this.destinationURI.spec;
    this.destinationDomain = this.destinationURI.host;
    
    this.early = channel instanceof ABEPolicyChannel;
    this.isDoc = !!(channel.loadFlags & channel.LOAD_DOCUMENT_URI);
    
    if (this.isDoc) {
      var w = this.window;
      if (w) w.__loadingChannel__ = channel;
    }
    
    var ou = ABERequest.getOrigin(channel);
    if (ou) {
      this.originURI = ou;
      this.origin = ou.spec;
      this.replaced = true;
    } else {
      if (this.early) ou = channel.originURI;
      else {
        let ph = PolicyState.extract(channel);
        ou = ph && ph.requestOrigin ||
            ((channel.originalURI.spec != this.destination) 
              ? channel.originalURI 
              : IOUtil.extractInternalReferrer(channel)
            ) || null;
      }
      
      if (!ou) {
        if (channel instanceof CI.nsIHttpChannelInternal) {
          ou = channel.documentURI;
          if (!ou || ou.spec === this.destination) ou = null;
        }
      }
      
      if (this.isDoc && (!ou || ou.schemeIs("javascript") || ou.schemeIs("data"))) {
        ou = this.traceBack;
        if (ou) ou = IOS.newURI(ou, null, null);
      }
      
      ou = ou ? IOUtil.unwrapURL(ou) : ABE.BROWSER_URI;
      
      this.origin = ou ? ou.spec : '';
    
      ABERequest.storeOrigin(channel, this.originURI = ou);
    }
  },
   
  replace: function(newMethod, newURI, callback) {
    new ChannelReplacement(this.channel, newURI, newMethod)
      .replace(newMethod || newURI, callback);
  },
  
  isBrowserURI: function(uri) {
    return uri.schemeIs("chrome") || uri.schemeIs("resource");
  },
  
  isLocal: function(uri, all) {
    return DNS.isLocalURI(uri, all);
  },
  
  isOfType: function(types) {
    if (!types) return false;
    return (types instanceof Number)
      ? this.type === types
      : types.indexOf(this.type) !== -1;
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
    return originURI && (this.isBrowserURI(originURI) || originURI.prePath == this.destinationURI.prePath);
  },
  
  _checkSameDomain: function(originURI) {
    try {
      return originURI && this.isBrowserURI(originURI) || originURI.host == this.destinationDomain;
    } catch(e) {}
    return false;
  },
  
  _checkSameBaseDomain: function(originURI) {
    try {
      return originURI && this.isBrowserURI(originURI) || IOUtil.TLDService.getBaseDomainFromHost(originURI.host) == this.destinationBaseDomain;
    } catch(e) {}
    return false;
  },
  
  matchAllOrigins: function(matcher) {
    var canDoDNS = this.canDoDNS;
    return (canDoDNS && matcher.netMatching) 
      ? this.redirectChain.every(function(uri) matcher.testURI(uri, canDoDNS, true))
      : this.redirectChain.every(matcher.testURI, matcher)
      ;
  },
  
  matchSomeOrigins: function(matcher) {
    var canDoDNS = this.canDoDNS;
    return (canDoDNS && matcher.netMatching) 
      ? this.redirectChain.some(function(uri) matcher.testURI(uri, canDoDNS, false))
      : this.redirectChain.some(matcher.testURI, matcher)
      ;
  },
  
  toString: function() {
    var s = "{" + this.method + " " + this.destination + " <<< " +
      this.redirectChain.reverse().map(function(uri) { return uri.spec; })
        .join(", ") + " - " + this.type + "}";
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
    return this.canDoDNS && this.redirectChain.every(this._checkLocalOrigin, this);
  },
  localDestination: function() {
    try {
      return !this.failed && this.canDoDNS && this.isLocal(this.destinationURI, false);
    } catch(e) {
      ABE.log("Local destination DNS check failed for " + this.destination + " from "+ this.origin + ": " + e);
      this.channel.cancel(NS_ERROR_UNKNOWN_HOST);
      this.failed = true;
      return false;
    }
  },
  isSelf: function() {
    return this._checkSelf(this.originURI) && this.redirectChain.every(this._checkSelf, this);
  },
  isSameDomain: function() {
    return this.isSelf || this.redirectChain.every(this._checkSameDomain, this);
  },
  isSameBaseDomain: function() {
    return this.isSameDomain || this.redirectChain.every(this._checkSameBaseDomain, this);
  },
  
  destinationBaseDomain: function() {
    try {
      return IOUtil.TLDService.getBaseDomainFromHost(this.destinationDomain);
    } catch(e) {}
    return this.destinationDomain;
  },
  
  isSubdoc: function() {
    if (this.isDoc) {
      var w = this.window;
      return (w != w.top);
    }
    var channel = this.channel;
    return !!(channel.loadFlags & channel.LOAD_CALL_CONTENT_SNIFFERS);
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
  },
  
  type: function() {
    try {
      return this.early ? this.channel.type : PolicyState.extract(this.channel).contentType;
    } catch(e) {
      ABE.log("Error retrieving type of " + this.destination + ": " + e); // should happen for favicons only
    }
    return CI.nsIContentPolicy.TYPE_OTHER;
  }
  
}
); // end memoize


var ABEStorage = {
  _updating: true,
  _dirty: true,
  init: function(prefs) {
    this.prefs = prefs;
    if (!prefs.getIntPref("migration")) {
      prefs.setIntPref("migration", 1);
      this._migrateLegacyFiles();
    }
    
    for each (let k in prefs.getChildList("", {})) {
      this.observe(prefs, null, k);
    }
    this.loadRules();
    prefs.addObserver("", this, true);
  },
  QueryInterface: xpcom_generateQI([CI.nsIObserver, CI.nsISupportsWeakReference]),
  observe: function(prefs, topic, name) {
    switch(name) {
      case "wanIpAsLocal":
        WAN.enabled = prefs.getBoolPref(name);
      break;
      case "wanIpCheckURL":
        WAN.checkURL = prefs.getCharPref(name);
      break;
      case "localExtras":
        DNS.localExtras = AddressMatcher.create(prefs.getCharPref(name));
      break;
      case "enabled":
      case "siteEnabled":
      case "allowRulesetRedir":
      case "legacySupport":
      case "skipBrowserRequests":
        ABE[name] = prefs.getBoolPref(name);
      break;
      case "disabledRulesetNames":
        ABE[name] = prefs.getCharPref(name);
      break;
      default:
        if (!this._updating && name.indexOf("rulesets.") === 0) {
          this._updating = this._dirty = true;
          Thread.asap(this.loadRules, this);
        }
    }
  },
    
  get _rulesetPrefs() this.prefs.getChildList("rulesets", {}),
  clear: function() {
    const prefs = this.prefs;
    const keys = this._rulesetPrefs;
    for (let j = keys.length; j-- > 0;) {
      let k = keys[j];
      if (prefs.prefHasUserValue(k)) {
        dump("Resetting ABE ruleset " + k + "\n");
        try {
          prefs.clearUserPref(k);
        } catch(e) { dump(e + "\n") }
      }
    }
  },
  
  loadRules: function() {
    this._updating = false;
    if (!this._dirty) return;
    this._dirty = false;
        
    const keys = this._rulesetPrefs;
    keys.sort();
    const prefs = this.prefs;
    var disabled = ABE.disabledRulesetNames;
    ABE.clear();
    for (let j = 0, len = keys.length; j < len; j++) {
      let k = keys[j];
      ABE.parse(k.replace("rulesets.", ""), prefs.getComplexValue(k, CI.nsISupportsString).data);
    }
    ABE.disabledRulesetNames = disabled;
    OS.notifyObservers(ABE, ABE.RULES_CHANGED_TOPIC, null);
  },
  
  saveRuleset: function(name, source) {
    var str = CC["@mozilla.org/supports-string;1"]
      .createInstance(CI.nsISupportsString);
    str.data = source;
    this.prefs.setComplexValue("rulesets." + name, CI.nsISupportsString, str);
  },
  
  persist: function() {
    ABE.prefService.savePrefFile(null);
  },
   
  _migrateLegacyFiles: function() {
    var ret = 0;
    try {
      var dir = CC["@mozilla.org/file/directory_service;1"]
        .getService(CI.nsIProperties).get("ProfD", CI.nsIFile);
      dir.append("ABE");
      dir.append("rules");
      
      if (dir.exists()) {
      
        dump("Migrating legacy ABE ruleset files... ")
        
        var entries = dir.directoryEntries;
        while(entries.hasMoreElements()) {
          let f = entries.getNext();
          if (f instanceof CI.nsIFile) {
            let fname = f.leafName;
            if (/^[^\.\s]*\.abe$/i.test(fname)) {
              try {
                this.saveRuleset(fname.replace(/\.abe$/i, ''), IO.readFile(f));
                ret++;
              } catch(e) {
                dump(e + "\n");
              }
            }
          }
        }
        this.persist();
      }
      dump(ret + " migrated.\n")
    } catch(e) {
      dump("Error migrating legacy ABE ruleset files: " + e + "\n");
    }
    return ret;
  }
}


var OriginTracer = {
  detectBackFrame: function(prev, next, docShell) {
    if (prev.ID != next.ID) return prev.URI.spec;
    if ((prev instanceof CI.nsISHContainer) &&
       (next instanceof CI.nsISHContainer) &&
       (docShell instanceof CI.nsIDocShellTreeNode)
      ) {
      var uri;
      for (var j = Math.min(prev.childCount, next.childCount, docShell.childCount); j-- > 0;) {
        uri = this.detectBackFrame(prev.GetChildAt(j),
                                   next.GetChildAt(j),
                                   docShell.GetChildAt(j));
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
      if (!(uri.schemeIs("javascript") || uri.schemeIs("data"))) {
        site = uri;
        break;
      }
    }
    return wantsBreadCrumbs ? breadCrumbs : site;
  },
  
  traceBack: function(req, breadCrumbs) {
    var res = '';
        try {
      ABE.log("Traceback origin for " + req.destination);
      var window = req.window;
      if (window instanceof CI.nsIInterfaceRequestor) {
        var webNav = window.getInterface(CI.nsIWebNavigation);
        var current = webNav.currentURI;
        var isSameURI = current && current.equals(req.destinationURI);
        if (isSameURI && (req.channel.loadFlags & req.channel.VALIDATE_ALWAYS)) 
          return req.destination; // RELOAD
 
        const sh = webNav.sessionHistory;
        res = sh ? this.traceBackHistory(sh, window, breadCrumbs || null) 
                  : (!isSameURI && current) 
                    ? req.destination
                    : '';
       if (res == "about:blank") {
         res = window.parent.location.href;
         ns.dump(res);
       }
      }
    } catch(e) {
      ABE.log("Error tracing back origin for " + req.destination + ": " + e.message);
    }
    ABE.log("Traced back " + req.destination + " to " + res);
    return res;
  }
}



var DoNotTrack = {
  enabled: true,
  exceptions: null,
  forced: null,

  init: function(prefs) {
    this.prefs = prefs;
    for each (let k in prefs.getChildList("", {})) {
      this.observe(prefs, null, k);
    }
    prefs.addObserver("", this, true);
  },
  QueryInterface: xpcom_generateQI([CI.nsIObserver, CI.nsISupportsWeakReference]),
  observe: function(prefs, topic, name) {
    switch(name) {
      case "enabled":
        this.enabled = prefs.getBoolPref(name);
       break;
      case "exceptions":
      case "forced":
        this[name] = AddressMatcher.create(prefs.getComplexValue(name, CI.nsISupportsString).data);
      break;
    }
  },

  apply: function(/* ABEReq */ req) {
    let url = req.destination;
      
    try {
      if (
          (this.exceptions && this.exceptions.test(url) ||
            req.localDestination ||
            req.isDoc && req.method === "POST" && req.originURI.host === req.destinationURI.host
          ) &&
          !(this.forced && this.forced.test(url))
           // TODO: find a way to check whether this request is gonna be WWW-authenticated
        )
        return;
       
      let channel = req.channel;
      channel.setRequestHeader("DNT", "1", false);
      
      // reorder headers to mirror Firefox 4's behavior
      let conn = channel.getRequestHeader("Connection");
      channel.setRequestHeader("Connection", "", false);
      channel.setRequestHeader("Connection", conn, false);
    } catch(e) {}
  }
}

const WAN = {
  IP_CHANGE_TOPIC: "abe:wan-iface-ip-changed",
  ip: null,
  ipMatcher: null,
  fingerprint: '',
  findMaxInterval: 86400000, // 1 day 
  checkInterval: 14400000, // 4 hours
  fingerInterval: 900000, // 1/4 hour
  checkURL: "https://secure.informaction.com/ipecho/",
  lastFound: 0,
  lastCheck: 0,
  skipIfProxied: true,
  noResource: false,
  logging: true,
  fingerprintLogging: false,
  fingerprintUA: "Mozilla/5.0 (ABE, http://noscript.net/abe/wan)",
  fingerprintHeader: "X-ABE-Fingerprint",
  QueryInterface: xpcom_generateQI([CI.nsIObserver, CI.nsISupportsWeakReference]),
  
  log: function(msg) {
    var cs = CC["@mozilla.org/consoleservice;1"].getService(CI.nsIConsoleService);
    return (this.log = function(msg) {
      if (this.logging) cs.logStringMessage("[ABE WAN] " + msg);
    })(msg);
    
  },
  
  _enabled: false,
  _timer: null,
  _observing: false,
  get enabled() {
    return this._enabled;
  },
  set enabled(b) {
    if (this._timer) this._timer.cancel();
    if (b) {
      const t = CC["@mozilla.org/timer;1"].createInstance(CI.nsITimer);
      t.initWithCallback({
        notify: function() { WAN._periodic() },
        context: null
      }, this.checkInterval, t.TYPE_REPEATING_SLACK);
      this._timer = t;
      Thread.delay(this._periodic, 1000, this, [this._enabled != b]);
      if (!this._observing) {
        this._observing = true;
        const os = OS;
        os.addObserver(this, "network:offline-status-changed", true);
        os.addObserver(this, "wake_notification", true);
      }
    } else {
      this._timer = this.ip = this.ipMatcher = null;
    }
    return this._enabled = b;
  },
  _observingHTTP: false,
  
  observe: function(subject, topic, data) {
    if (!this.enabled) return;
    
    switch(topic) {
      case "wake_notification":
        if (!this._observingHTTP) OS.addObserver(this, "http-on-examine-response", true);
        return;
      case "http-on-examine-response":
        OS.removeObserver(this, "http-on-examine-response");
        this._observingHTTP = false;
        break;
      case "network:offline-status-changed":
        if (data === "online")
          break;
      default:
        return;
    }

    this._periodic(true);
  },
  
  _periodic: function(forceFind) {
    if (forceFind) this.lastFound = 0;
    
    var t = Date.now();
    if (forceFind ||
        t - this.lastFound > this.findMaxInterval ||
        t - this.lastCheck > this.checkInterval) {  
      this.findIP(this._findCallback);
    } else if (this.fingerprint) {
      this._takeFingerprint(this.ip, this._fingerprintCallback);
    }
    this.lastCheck = t;
  },
  
  _findCallback: function(ip) {
    WAN._takeFingerprint(ip);
  },
  _fingerprintCallback: function(fingerprint, ip) {
    if (fingerprint != WAN.fingerprint) {
      WAN.log("Resource reacheable on WAN IP " + ip + " changed!");
      if (ip == WAN.ip) WAN._periodic(true);
    }
  },
  
  _takeFingerprint: function(ip, callback) {
    if (!ip) {
      this.log("Can't fingerprint a null IP");
      return;
    }
    var url = "http://" + (ip.indexOf(':') > -1 ? "[" + ip + "]" : ip);
    var xhr = this._createAnonXHR(url);
    xhr.channel.setRequestHeader("User-Agent", this.fingerprintUA, false);
    var self = this;
    xhr.onreadystatechange = function() {

      if (xhr.readyState == 4) {

      var fingerprint = '';
      try {
        const ch = xhr.channel;

        if (!ch.status) fingerprint =
          xhr.status + " " + xhr.statusText + "\n" +
          (xhr.getAllResponseHeaders() + "\n" + xhr.responseText)
            .replace(/\d/g, '').replace(/\b[a-f]+\b/gi, ''); // remove decimal and hex noise
        } catch(e) {
          self.log(e);
        }   

        if (self.fingerprintLogging)
          self.log("Fingerprint for " + url + " = " + fingerprint);
        
        if (fingerprint && /^\s*Off\s*/i.test(xhr.getResponseHeader(self.fingerprintHeader)))
          fingerprint = '';
        
        if (callback) callback(fingerprint, ip);
        self.fingerprint = fingerprint;
      }
    }
    xhr.send(null);

  },
    
  _createAnonXHR: function(url, noproxy) {
    var xhr = CC["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(CI.nsIXMLHttpRequest);
    xhr.mozBackgroundRequest = true;
    xhr.open("GET", url, true);
    const ch = xhr.channel;
    const proxyInfo = noproxy && IOUtil.getProxyInfo(ch);
    if (!proxyInfo || proxyInfo.type == "direct" || proxyInfo.host && DNS.isLocalHost(proxyInfo.host)) {
      if ((ch instanceof CI.nsIHttpChannel)) {
        // cleanup headers
        this._requestHeaders(ch).forEach(function(h) {
          if (h != 'Host') ch.setRequestHeader(h, '', false); // clear header
        });
      }
      ch.loadFlags = ch.LOAD_BYPASS_CACHE | ch.LOAD_ANONYMOUS;;
    } else xhr = null;
    return xhr;
  },
  
  _callbacks: null,
  _finding: false,
  findIP: function(callback) {
    if (callback) (this._callbacks = this._callbacks || []).push(callback);
    if (IOS.offline) {
      this._findIPDone(null, "offline");
      return;
    }
    if (this._finding) return;
    this._finding = true;
    var sent = false;
    try {
      var xhr = this._createAnonXHR(this.checkURL,this.skipIfProxied);
      if (xhr) {
        let self = this;
        xhr.onreadystatechange = function() {
          if (xhr.readyState == 4) {
            let ip = null;
            if (xhr.status == 200) {
              ip = xhr.responseText.replace(/\s+/g, '');
              if (!/^[\da-f\.:]+$/i.test(ip)) ip = null;
            }
            self._findIPDone(ip, xhr.responseText);
          }
        }
        xhr.send(null);
        this.log("Trying to detect WAN IP...");
        sent = true;
      }
    } catch(e) {
      this.log(e + " - " + e.stack)
    } finally {
      this._finding = sent;
      if (!sent) this._findIPDone(null);
    }
  },
  
  _findIPDone: function(ip) {
    let ipMatcher = AddressMatcher.create(ip);
    if (!ipMatcher) ip = null;
    if (ip) {
      try {
        if (this._callbacks) {
          for each (let cb in this._callbacks) cb(ip);
          this._callbacks = null;
        }
      } catch(e) {
        this.log(e);
      }
      
      if (ip != this.ip) {
        OS.notifyObservers(this, this.IP_CHANGE_TOPIC, ip);
      }
      
      this.ip = ip;
      this.ipMatcher = ipMatcher;
      this.lastFound = Date.now();
      
       this.log("Detected WAN IP " + ip);
    } else {
      this.lastFound = 0;
      this.fingerprint = '';
      this.log("WAN IP not detected!");
    }
   
    this._finding = false;
  },
  
  
  _requestHeaders: function(ch) {
    var hh = [];
    if (ch instanceof CI.nsIHttpChannel)
      ch.visitRequestHeaders({
        visitHeader: function(name, value) { hh.push(name); }
      });
    return hh;
  }
};