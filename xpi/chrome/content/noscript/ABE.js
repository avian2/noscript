INCLUDE('IOUtil', 'antlr', 'ABEParser', 'ABELexer', 'AddressMatcher', 'Thread', 'Lang');

const ABE = {
  FLAG_CALLED: 0x01,
  FLAG_CHECKED: 0x02,
  
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
        disabled: rs.disabled
      });
    }
    return data;
  },
  
  restore: function(data) {
    if (!data.length) return;
    
    var f, change;
    try {
      ABEStorage.clear();
      ABEStorage.reset();
      for each(var rs in data) {
        f = ABEStorage.getRulesetFile(rs.name);
        if (!f.exists()) f.create(f.NORMAL_FILE_TYPE, 384 /*0600*/);
        IO.safeWriteFile(f, rs.source);
        f.lastModifiedTime = rs.timestamp;
      }
      ABEStorage.loadRulesNow();
    } catch(e) {
      ABE.log("Failed to restore configuration: " + e);
    }
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
  
  checkPolicy: function(origin, destination, type) {
    try {
      var res = this.checkRequest(new ABERequest(new ABEPolicyChannel(origin, destination, type)));
      return res && res.fatal;
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
    
    this.updateRules();
    
    if (this.localRulesets.length == 0 && !this.siteEnabled)
      return null;
    
    if (this.deferIfNeeded(req))
      return false;
    
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
      return res.fatal = (res.request.channel instanceof ABEPolicyChannel)
        ? /^Deny$/i.test(action) 
        : ABEActions[action.toLowerCase()](res.request);
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
        
        var replacement = req.replace();
      
        ABE.log(host + " not cached in DNS, deferring ABE checks after DNS resolution for request " + req.serial);
        
        
        
        DNS.resolve(host, 0, function(dnsRecord) {
          replacement.open();
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
  anonymize: function(req, channel, replaced) {
    channel = channel || req.channel;
    if (channel.loadFlags & channel.LOAD_ANONYMOUS) // already anonymous
      return false;
    

    let cookie;
    try {
      cookie = channel.getRequestHeader("Cookie");
    } catch(e) {
      cookie = '';
    }
    
    let uri = IOUtil.anonymizeURI(req.destinationURI.clone(), cookie);
    
    if (channel.isPending()) { // channel is already opened, we must replace it
      
      if (ChannelReplacement.supported && !replaced) {
        try {
          var replacement = req.replace(
              /^(?:GET|HEAD|OPTIONS)$/i.test(channel.requestMethod) ? null : "GET",
              uri);
          
          this.anonymize(req, replacement.channel, true);
          replacement.open();
          return false;
        } catch(e) {
          ABE.log(e);
        }
      }
      ABE.log("Couldn't replace " + uri.spec + " for Anonymize, falling back to Deny.");
      return this.deny(req);
    }
    
    try {
      if (uri.spec != channel.URI.spec)
        channel.URI.spec = uri.spec;
    } catch (e) {
      ABE.log(uri.spec + ": " + e);
      return this.deny(req);
    }
    channel.setRequestHeader("Cookie", '', false);
    channel.setRequestHeader("Authorization", '', false);
    channel.loadFlags |= channel.LOAD_ANONYMOUS;
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
 
  if (this.action == 'Accept') {
    this.permissive = true;
  } else if (/^(Logout|Anon)$/.test(this.action)) {
    this.action = 'Anonymize';
  }
  
  var methods = p.methods;
  
  if ("inclusions" in p) {
    this.inclusion = true;
    
    // rebuild method string for cosmetic reasons
    var incMethod = "INCLUSION";
    if (p.inclusions.length) {
      incMethod += "(" + p.inclusions.join(", ") + ")";
      this.inclusionTypes = p.inclusions.map(this._parseInclusionType, this);
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
      its.push(map[k]);
    }
    return this.__proto__.ANY_TYPE = its;
  },
  get _inclusionTypesMap() {
    delete this.__proto__._inclusionTypesMap;
    return this.__proto__._inclusionTypesMap = 
    {
      "OTHER": CI.nsIContentPolicy.TYPE_OTHER,
      "SCRIPT": CI.nsIContentPolicy.TYPE_SCRIPT,
      "IMAGE": CI.nsIContentPolicy.TYPE_IMAGE,
      "CSS": CI.nsIContentPolicy.TYPE_STYLESHEET,
      "OBJ": CI.nsIContentPolicy.TYPE_OBJECT,
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
  
  _parseInclusionType: function(s) {
    return (s in this._inclusionTypesMap) ? this._inclusionTypesMap[s] : 0; 
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
  return IOUtil.extractFromChannel(channel, "ABE.origin", true);
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
      this.xOriginURI = this.originURI = ou;
      this.xOrigin = this.origin = ou.spec;
      this.replaced = true;
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
  
  
  
  
  replace: function(newMethod, newURI) {
    var replacement = new ChannelReplacement(this.channel, newURI, newMethod)
      .replace(newMethod || newURI);
    
    return replacement;
  },
  
  isBrowserURI: function(uri) {
    return /^(?:chrome|resource)$/i.test(uri.scheme);
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
      ? matcher.testURI(this.originURI, canDoDNS, true) &&
          this.redirectChain.every(function(uri) { return matcher.testURI(uri, canDoDNS, true); })
      : matcher.test(this.origin) && this.redirectChain.every(matcher.testURI, matcher)
      ;
  },
  
  matchSomeOrigins: function(matcher) {
    var canDoDNS = this.canDoDNS;
    return (canDoDNS && matcher.netMatching) 
      ? matcher.testURI(this.originURI, canDoDNS, false) ||
          this.redirectChain.some(function(uri) { return matcher.testURI(uri, canDoDNS, false); })
      : matcher.test(this.origin) || this.redirectChain.some(matcher.testURI, matcher)
      ;
  },
  
  toString: function() {
    var s = "{" + this.method + " " + this.destination + " <<< " +
      this.redirectChain.reverse().map(function(uri) { return uri.spec; }).concat(this.origin)
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
  isSameDomain: function() {
    return this.isSelf || this._checkSameDomain(this.originURI) && this.redirectChain.every(this._checkSameDomain, this);
  },
  isSameBaseDomain: function() {
    return this.isSameDomain || this._checkSameBaseDomain(this.originURI) && this.redirectChain.every(this._checkSameBaseDomain, this);
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
          f.create(f.NORMAL_FILE_TYPE, 384 /*0600*/);
          IO.safeWriteFile(f, this._defaults[d]);
        }
      }
    } catch(e) {
      ABE.log(e);
    }
  },
  
  _initDir: function(dir) {
    if (!dir.exists()) try {
      dir.create(dir.DIRECTORY_TYPE, 493 /*0755*/);
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
    } catch(e) {
      ABE.log(e);
      return false;
    } finally {
      this._lastCheckTS = Date.now();
      ABE.log("Updates checked in " + (this._lastCheckTS - t) + "ms");
    }
    ABE.disabledRulesetNames = disabledNames;
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
