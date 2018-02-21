var org = { antlr: { runtime: { tree: {} } } }; // work-around for an antlr scoping bug

INCLUDE('antlr', 'ABEParser', 'ABELexer', 'Lang');

var ABE = {
  RULES_CHANGED_TOPIC: "abe:rules-changed",
  FLAG_CALLED: 0x01,
  FLAG_CHECKED: 0x02,

  SITE_RULESET_LIFETIME: 12 * 60 * 60000, // 12 hours
  maxSiteRulesetSize: 8192,
  maxSiteRulesetTime: 16000,
  enabled: false,
  siteEnabled: false,
  allowRulesetRedir: false,
  skipBrowserRequests: true,

  BROWSER_URI: IOS.newURI("chrome://browser/content/", null, null),
  LOAD_BACKGROUND: Ci.nsIChannel.LOAD_BACKGROUND,
  LOAD_INITIAL_DOCUMENT_URI: Ci.nsIChannel.LOAD_INITIAL_DOCUMENT_URI,
  SANDBOX_KEY: "abe.sandbox",
  localRulesets: [],
  _localMap: null,
  _siteRulesets: null,

  init: function(prefParent) {
    const ps = this.prefService = Cc["@mozilla.org/preferences-service;1"]
      .getService(Ci.nsIPrefService).QueryInterface(Ci.nsIPrefBranch);
    ABEStorage.init(ps.getBranch(prefParent+ "ABE."));
    DoNotTrack.init(ps.getBranch(prefParent+ "doNotTrack."));
  },

  dispose() {
    ABEStorage.dispose();
    WAN.enabled = false;
  },

  siteMap: Object.create(null),

  get disabledRulesetNames() {
    return this.rulesets.filter(function(rs) { return rs.disabled; })
      .map(function(rs) { return rs.name; }).join(" ");
  },
  set disabledRulesetNames(names) {
    var rs;
    for (rs  of this.rulesets) rs.disabled = false;
    if (names) try {
      for (var name  of names.split(/\s+/)) {
        rs = this.localMap[name] || this.siteMap[name];
        if (rs) rs.disabled = true;
      }
    } catch(e) {}

    return names;
  },

  get localMap() {
    if (this._localMap) return this._localMap;
    this._localMap = Object.create(null);
    for (let rs  of this.localRulesets) {
      this._localMap[rs.name] = rs;
    }
    return this._localMap;
  },

  get siteRulesets() {
    if (this._siteRulesets) return this._siteRulesets;
    this._siteRulesets = [];
    for (let name in this.siteMap) {
      let rs = this.siteMap[name];
      if (rs && !rs.empty) this._siteRulesets.push(rs);
    }
    this._siteRulesets.sort(function(r1, r2) { return r1.name > r2.name; });
    return this._siteRulesets;
  },

  get rulesets() {
    return this.localRulesets.concat(this.siteRulesets);
  },

  clear: function() {
    this.localRulesets = [];
    this.refresh();
  },

  refresh: function() {
    this.siteMap = Object.create(null);
    this._siteRulesets = null;
  },

  createRuleset: (name, source, timestamp) => new ABERuleset(name, source, timestamp || Date.now()),

  parse: function(name, source, timestamp) {
    try {
      var rs = typeof name === "string" ? this.createRuleset(name, source, timestamp) : name;
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
    try {
      ABEStorage.clear();
      for (let rs  of data) {
        ABEStorage.saveRuleset(rs.name, rs.source);
      }
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
    if (!this.enabled)
      return false;

    const channel = req.channel;
    const loadFlags = channel.loadFlags;

    var browserReq = req.originURI.schemeIs("chrome") && !req.external;

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
      for (rs  of this.localRulesets) {
        if (this._check(rs, res)) break;
      }

      if (!(browserReq || res.fatal) &&
          this.siteEnabled && channel instanceof Ci.nsIHttpChannel &&
          !ABE.reqData(channel).preflght &&
          req.destinationURI.schemeIs("https") &&
          req.destinationURI.prePath != req.originURI.prePath &&
          !(this.skipBrowserRequests && req.originURI.schemeIs("chrome") && !req.window) // skip preflight for window-less browser requests
      ) {

        var name = this._host2name(req.destinationURI.host);
        if (!(name in this.siteMap)) {
          ABE.log("Preflight for " + req.origin + ", " + req.destination + ", " + loadFlags);
          this.downloadRuleset(name, req.destinationURI);
        }

        rs = this.siteMap[name];
        if (rs && Date.now() - rs.timestamp > this.SITE_RULESET_LIFETIME)
          rs = this.downloadRuleset(name, req.destinationURI);

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
      action = action.toLowerCase();
      let outcome = (res.request.channel instanceof ABEPolicyChannel)
        ? (action === "deny" ? ABERes.FATAL : ABERes.SKIPPED)
        : ABEActions[action](res.request);
      if (outcome !== ABERes.SKIPPED) {
        let r = rs.lastMatch;
        this.log(r);
        this.log(res.request + ' matches "' + r.lastMatch + '"');
        (res.rulesets || (res.rulesets = [])).push(rs);
        res.lastRuleset = rs;
        return res.fatal = outcome === ABERes.FATAL;
      }
    }
    return false;
  },

  deferIfNeeded: function(req) {
    var host = req.destinationURI.host;
    if (!(req.canDoDNS && req.deferredDNS) ||
        DNS.isIP(host) ||
        DNS.isCached(host) ||
        req.channel.redirectionLimit === 0 || req.channel.status !== 0 
        )
      return false;

    ABE.reqData(req.channel).deferred = true;

    if (ChannelReplacement.runWhenPending(req.channel, function() {
      try {

        if (req.channel.status !== 0) return;

        if ((req.channel instanceof Ci.nsITransportEventSink)
            && req.isDoc && !(req.subdoc || req.dnsNotified)) try {
          Thread.asap(function() {
            if (!req.dnsNotified) {
              ABE.log("DNS notification for " + req.destination);
              req.dnsNotified = true; // unexplicable recursions have been reported...
              req.channel.onTransportStatus(null, 0x804b0003, 0, 0); // notify STATUS_RESOLVING
            }
          });
        } catch(e) {}

        req.replace(false, null, function(replacement) {
          ABE.log(host + " not cached in DNS, deferring ABE checks after DNS resolution for request " + req.serial);

          DNS.resolve(host, 0, function(dnsRecord) {
            req.dnsNotified = true; // prevents spurious notifications
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

  reqData(req, remove = false) {
    return IOUtil.reqData(req, "net.noscript/ABE.channelData", remove);
  },

  isDeferred: function(chan) {
    return !!ABE.reqData(chan).deferred;
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
  downloadRuleset: function(name, uri) {
    var host = uri.host;

    var downloading = this._downloading;

    if (host in downloading) {
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

      this.log("Trying to fetch rules for " + host);

      uri = uri.clone();
      uri.scheme = "https";
      uri["path" in uri ? "path" : "pathQueryRef"] = "/rules.abe";

      var xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
      xhr.mozBackgroundRequest = true;
      xhr.open("GET", uri.spec, true); // async if we can spin our own event loop

      var channel = xhr.channel; // need to cast
      ABE.reqData(channel).preflight = true;

      if (channel instanceof Ci.nsIHttpChannel && !this.allowRulesetRedir)
        channel.redirectionLimit = 0;

      if (channel instanceof Ci.nsICachingChannel)
        channel.loadFlags |= channel.LOAD_BYPASS_LOCAL_CACHE_IF_BUSY; // see bug 309424


      xhr.addEventListener("readystatechange", function() {
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
      }, false);


      var send = function() {
        xhr.send(null);
        return Thread.spin(ctrl);
      };

      if (send()) {
        var size = 0;
        try {
          size = xhr.responseText.length;
        } catch(e) {}
        ABE.log("Ruleset at " + uri.spec + " timeout: " + size + " chars received in " + ctrl.elapsed + "ms");
        xhr.abort();
        return false;
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


  isSandboxed(channel) {
    return ABE.reqData(channel).sandboxed;
  },
  setSandboxed(channel, sandboxed = true) {
    ABE.reqData(channel).sandboxed = sandboxed;
  },

  get cspHeaderValue() {
    delete this.cspHeaderValue;
    let prefs = ABEStorage.prefs;
    let delim;
    try {
      delim = prefs.getCharPref("cspHeaderDelim") || "ABE";
    } catch (e) {
      delim = `ABE${Math.random().toString().replace(".", "-")}`;
      prefs.setCharPref("cspHeaderDelim", delim);
    }
    let value = `${delim}; child-src 'self'; object-src 'none'; script-src 'none'; ${delim};`;
    return (this.cspHeaderValue = value);
  },
  enforceSandbox(channel, enforcing) {
    const CSP = "Content-Security-Policy";
    let value = this.cspHeaderValue;
    try {
      let currentPolicy = channel.getResponseHeader(CSP);
      if (currentPolicy.includes(value)) {
        if (enforcing) {
          return true;
        }
        channel.setResponseHeader(CSP, currentPolicy.replace(value, ''), false);
        return false;
      }
    } catch (e) {}
    if (enforcing) {
       try {
         channel.setResponseHeader(CSP, value, true);
         return true;
       }catch(e) {
         Cu.reportError(e);
       }
    }
    return false;
  },
  handleSandbox(channel) {
    this.enforceSandbox(channel, this.isSandboxed(channel));
  },

  updateRedirectChain: function(oldChannel, newChannel) {
    this._handleDownloadRedirection(oldChannel, newChannel);

    var redirectChain = this.getRedirectChain(oldChannel);
    redirectChain.push(oldChannel.URI);
    ABE.reqData(newChannel).redirectChain = redirectChain;
  },

  getRedirectChain: function(channel) {
    var rc = ABE.reqData(channel).redirectChain;
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
    if (!ABE.reqData(oldChannel).preflight) return;

    var uri = oldChannel.URI;
    var newURI = newChannel.URI;

    if (uri.spec !== newURI.spec && // redirected, check if it same path and same domain or upper
        (uri.filePath !== newURI.filePath ||
          !(newURI.schemeIs("https") && this.isSubdomain(newURI.host, uri.host))
        )
      ) {
      var msg = "Illegal ABE rule redirection " + uri.spec + " -> " + newURI.spec;
      ABE.log(msg);
      oldChannel.cancel(NS_BINDING_ABORTED);
      throw new Error(msg);
    }

    ABE.reqData(oldChannel).preflight = true;
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
ABERes.SKIPPED = 0;
ABERes.DONE = 1;
ABERes.FATAL = 2;

ABERes.prototype = {
  rulesets: null,
  lastRuleset: null,
  fatal: false
}

var ABEActions = {
  accept: function(req) {
    return ABERes.DONE;
  },
  deny: function(req) {
    IOUtil.abort(req.channel, true);
    return ABERes.FATAL;
  },

  _idempotentMethodsRx: /^(?:GET|HEAD|OPTIONS)$/i,
  anonymize: function(req) {
    var channel = req.channel;
    let cookie;
    try {
      cookie = channel.getRequestHeader("Cookie");
    } catch(e) {
      cookie = '';
    }
    let auth;
    try {
      auth = channel.getRequestHeader("Authorization");
    } catch(e) {
      auth = '';
    }
    let anonURI = IOUtil.anonymizeURI(req.destinationURI.clone(), cookie);
    let idempotent = this._idempotentMethodsRx.test(channel.requestMethod);

    if (idempotent &&
        !(auth || cookie || anonURI.spec != req.destinationURI.spec) &&
        ABE.reqData(channel).anon) {// already anonymous
      if (!(channel.loadFlags & channel.LOAD_ANONYMOUS)) {
        // loadFlags gets lost in redirection with e10s
        channel.loadFlags |= channel.LOAD_ANONYMOUS;
      }
      return ABERes.SKIPPED;
    }

    req.replace(
      idempotent ? null : "GET",
      anonURI,
      function(replacement) {
        let channel = replacement.channel;
        channel.setRequestHeader("Cookie", '', false);
        channel.setRequestHeader("Authorization", '', false);
        ABE.reqData(channel).anon = true;
        channel.loadFlags |= channel.LOAD_ANONYMOUS;
        replacement.open();
      },
      true
    );

    return ABERes.DONE;
  },

  sandbox: function(req) {
    ABE.setSandboxed(req.channel);
    return ABERes.DONE;
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
		for (var r  of this.rules) {
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
      for (var p  of this.predicates) {
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
      this.inclusionTypes = null;
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
  inclusionTypes: null,

  get _inclusionTypesMap() {
    delete this.__proto__._inclusionTypesMap;
    const CP = Ci.nsIContentPolicy;
    let map = {
      CSS: CP.TYPE_STYLESHEET,
      DOCUMENT: CP.TYPE_DOCUMENT, // placeholder, should never happen for inclusions
      DTD: CP.TYPE_DTD,
      FONT: CP.TYPE_FONT,
      IMAGE: [CP.TYPE_IMAGE, CP.TYPE_IMAGESET],
      MEDIA: CP.TYPE_MEDIA,
      OBJ: [CP.TYPE_OBJECT, CP.TYPE_OBJECT_SUBREQUEST],
      OBJSUB: CP.TYPE_OBJECT_SUBREQUEST,
      OTHER: [CP.TYPE_OTHER],
      SCRIPT: CP.TYPE_SCRIPT,
      SUBDOC: CP.TYPE_SUBDOCUMENT,
      UNKNOWN: CP.TYPE_OTHER,
      XHR: [CP.TYPE_XMLHTTPREQUEST, CP.TYPE_FETCH],
    };
    let mappedTypes = new Set();
    for (let k in map) {
      let v = map[k];
      if (Array.isArray(v)) {
        for (let t of v) mappedTypes.add(t);
      } else {
        mappedTypes.add(v);
      }
    }

    let cpTypes = Object.keys(CP).filter(k => k.startsWith("TYPE_") && !k.startsWith("TYPE_INTERNAL_"));
    for (let key of cpTypes) {
      let name = key.substring(5);
      if (!(name in map)) {
        let type = CP[key];
        map[name] = type;
        if (!mappedTypes.has(type)) map.OTHER.push(type);
      }
    }
    return (this.__proto__._inclusionTypesMap = map);
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
              this.self && req.isSelf ||
              this.sameDomain && req.isSameDomain ||
              this.sameBaseDomain && req.isSameBaseDomain ||
		(this.permissive
                  ? req.matchAllOrigins(this.origin)
                  : req.matchSomeOrigins(this.origin)) || this.local && req.localOrigin
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
  let u = ABE.reqData(channel).origin;
  return (u instanceof Ci.nsIURI) ? u : null;
},
ABERequest.getLoadingChannel = function(window) {
  return window && ("__loadingChannel__" in window) && window.__loadingChannel__;
},

ABERequest.storeOrigin = function(channel, originURI) {
  ABE.reqData(channel).origin = originURI;
},

ABERequest.clear = function(channel, window) {
  // fille me as needed
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
      if (w) try {
        w.__loadingChannel__ = channel;
      } catch (e) {}
    }

    var ou = ABERequest.getOrigin(channel);
    if (ou) {
      this.originURI = ou;
      this.origin = ou.spec;
      this.replaced = true;
    } else {
      if (this.early) ou = channel.originURI;
      else {
        let loadInfo = channel.loadInfo;
        if (loadInfo) {
          let principal = loadInfo.triggeringPrincipal || loadInfo.loadingPrincipal;
          ou = principal && (principal.URI || principal.originNoSuffix || principal.origin);
        } else {
          dump(`loadInfo is null for channel ${channel.name}\n`);
        }
      }
      
      if (ou) {
        if (ou.spec) {
          ou = IOUtil.unwrapURL(ou);
          this.origin = ou.spec;
        } else {
          this.origin = ou;
          try {
            ou = IOS.newURI(ou, null, null);
          } catch (e) {
            ou = ABE.BROWSER_URI;
          }
        }
      } else {
        ou = ABE.BROWSER_URI;
      }

      ABERequest.storeOrigin(channel, this.originURI = ou);
    }
  },

  replace: function(newMethod, newURI, callback, forceInternal) {
    new ChannelReplacement(this.channel, newURI, newMethod)
        .replace(!forceInternal && (newMethod || newURI), callback);
    return true;
  },

  isBrowserURI: function(uri) {
    return uri.schemeIs("chrome") || uri.schemeIs("resource") || uri.schemeIs("about") || uri.schemeIs("moz-extension");
  },

  isLocal: function(uri, all) {
    return DNS.isLocalURI(uri, all);
  },

  isOfType: function(types) {
    if (types === null) return this.type !== Ci.nsIContentPolicy.TYPE_DOCUMENT;
    return (typeof types === "number")
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
    return (canDoDNS && matcher.netMatching) ?
      this.redirectChain.every((uri) => matcher.testURI(uri, canDoDNS, true))
      : this.redirectChain.every(matcher.testURI, matcher)
      ;
  },

  matchSomeOrigins: function(matcher) {
    var canDoDNS = this.canDoDNS;
    return (canDoDNS && matcher.netMatching)
      ? this.redirectChain.some(uri => matcher.testURI(uri, canDoDNS, false))
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
  canDoDNS: function() {
    return (this.channel instanceof Ci.nsIChannel) && // we want to prevent sync DNS resolution for resources we didn't already looked up
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

  window: function() {
    return IOUtil.findWindow(this.channel);
  },

  type: function() {
    try {
      return this.early ? this.channel.type : this.channel.loadInfo.externalContentPolicyType ||
        PolicyState.extract(this.channel).contentType;
    } catch(e) {
      ABE.log("Error retrieving type of " + this.destination + ": " + e); // should happen for favicons only
    }
    return Ci.nsIContentPolicy.TYPE_OTHER;
  }

}
); // end memoize


var ABEStorage = {
  _updating: true,
  _dirty: true,
  init: function(prefs) {
    this.prefs = prefs;
    if (!prefs.getIntPref("migration")) try {
      prefs.setIntPref("migration", 1);
      this._migrateLegacyFiles();
    } catch (e) {}
    this.loadRules();
    for (let k  of prefs.getChildList("", {})) this.observe(prefs, null, k);
    prefs.addObserver("", this, true);
  },
  dispose() {
    try {
      this.prefs.removeObserver("", this, true);
    } catch (e) {
    }
  },
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),
  observe: function(prefs, topic, name) {
    if (typeof ABE === "undefined") {
      prefs.removeObserver("", this, true);
      return;
    }
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

  get _rulesetPrefs() { return this.prefs.getChildList("rulesets", {}); },
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
      ABE.parse(k.replace("rulesets.", ""), COMPAT.getStringPref(prefs, k));
    }
    ABE.disabledRulesetNames = disabled;
    OS.notifyObservers(ABE, ABE.RULES_CHANGED_TOPIC, null);
  },

  saveRuleset: function(name, source) {
    COMPAT.setStringPref(this.prefs, "rulesets." + name, source);
  },

  persist: function() {
    ABE.prefService.savePrefFile(null);
  },

  _migrateLegacyFiles: function() {
    var ret = 0;
    try {
      var dir = Cc["@mozilla.org/file/directory_service;1"]
        .getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
      dir.append("ABE");
      dir.append("rules");

      if (dir.exists()) {

        dump("Migrating legacy ABE ruleset files... ")

        var entries = dir.directoryEntries;
        while(entries.hasMoreElements()) {
          let f = entries.getNext();
          if (f instanceof Ci.nsIFile) {
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

var WAN = {
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
  fingerprintUA: "Mozilla/5.0 (ABE, https://noscript.net/abe/wan)",
  fingerprintHeader: "X-ABE-Fingerprint",
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),

  log: function(msg) {
    var cs = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
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
    if (!IPC.parent) return false;

    if (this._timer) this._timer.cancel();
    if (b) {
      const t = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      t.initWithCallback({
        notify: function() { WAN._periodic() },
        context: null
      }, this.checkInterval, t.TYPE_REPEATING_SLACK);
      this._timer = t;
      Thread.delay(this._periodic, 1000, this, [this._enabled != b]);
      if (!this._observing) {
        this._observing = true;
        OS.addObserver(this, "network:offline-status-changed", true);
        OS.addObserver(this, "wake_notification", true);
      }
    } else {
      this._timer = this.ip = this.ipMatcher = null;
      if (this._observing) {
        this._observing = false;
        OS.removeObserver(this, "network:offline-status-changed");
        OS.removeObserver(this, "wake_notification");
      }
    }
    return (this._enabled = b);
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
    var ch = xhr.channel;
    ch.setRequestHeader("User-Agent", this.fingerprintUA, false);
    ch.loadFlags = ch.loadFlags & ~ch.LOAD_ANONYMOUS; // prevents redirect loops on some routers
    var self = this;
    xhr.addEventListener("readystatechange", function() {

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
    }, false);
    xhr.send(null);

  },

  _createAnonXHR: function(url, noproxy) {
    var xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
    xhr.mozBackgroundRequest = true;
    xhr.open("GET", url, true);
    const ch = xhr.channel;
    const proxyInfo = noproxy && IOUtil.getProxyInfo(ch);
    if (!proxyInfo || proxyInfo.type == "direct" || proxyInfo.host && DNS.isLocalHost(proxyInfo.host)) {
      if ((ch instanceof Ci.nsIHttpChannel)) {
        // cleanup headers
        this._requestHeaders(ch).forEach(function(h) {
          if (h != 'Host') ch.setRequestHeader(h, '', false); // clear header
        });
      }
      ch.loadFlags = ch.LOAD_BYPASS_CACHE | ch.LOAD_ANONYMOUS;
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
        xhr.addEventListener("readystatechange", function() {
          if (xhr.readyState == 4) {
            let ip = null;
            if (xhr.status == 200) {
              ip = xhr.responseText.replace(/\s+/g, '');
              if (!/^[\da-f\.:]+$/i.test(ip)) ip = null;
            }
            self._findIPDone(ip, xhr.responseText);
          }
        }, false);
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
          for (let cb  of this._callbacks) cb(ip);
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
    if (ch instanceof Ci.nsIHttpChannel)
      ch.visitRequestHeaders({
        visitHeader: function(name, value) { hh.push(name); }
      });
    return hh;
  }
};
