function DNSRecord(record) {
  this.ts = Date.now();
  var ttl;
  if (record) {
    try {
      this.canonicalName = record.canonicalName;
    } catch(e) {}
    this.entries = [];
    while (record.hasMore()) try {
      this.entries.push(record.getNextAddrAsString());
    } catch(e) {
      ABE.log("Error retrieving DNS record " + this.entries.join(", "));
    }
    ttl = this.TTL;
    if (!this.entries.length) this.valid = false;
  } else {
    this.valid = false;
  }
  if (!this.valid) ttl = Thread.canSpin ? this.INVALID_TTL_ASYNC : this.INVALID_TTL_SYNC;
  this.expireTime = this.ts + ttl;
}

DNSRecord.prototype = {
  INVALID_TTL_ASYNC: 3000,
  INVALID_TTL_SYNC: 8000,
  TTL: 60000,
  valid: true,
  ts: 0,
  entries: [],
  canonicalName: '',
  expireTime: 0,
  refreshing: false,
  
  isLocal: function(all) {
    return all
      ? "everyLocal" in this
        ? this.everyLocal
        : this.everyLocal = this.entries.every(DNS.isLocalIP, DNS)
      : "someLocal" in this
        ? this.someLocal
        : this.someLocal = this.entries.some(DNS.isLocalIP, DNS)
      ;
  },
  get expired() {
    return Date.now() > this.expireTime;
  }
}


var DNS = {
  get _dns() {
    delete this._dns;
    return this._dns = CC["@mozilla.org/network/dns-service;1"]
                  .getService(CI.nsIDNSService);
  },
  
  _cache: {
    CAPACITY: 400, // when we purge, we cut this to half
    _map: {},
    _ext: {},
    
    get count() {
      return this._map.__count__;
    },
    get: function(key) {
      return key in this._map && this._map[key];
    },
    put: function(key, entry) {
      if (!(key in this._map)) {
        if (this.count >= this.CAPACITY) {
          this.purge();
        }
      }
      this._map[key] = entry;
    },
    evict: function(host) {
      return (host in this._map) && (delete this._map[host]);
    },
    
    purge: function() {
      var max = this.CAPACITY / 2;
      if (this.count < max) return;
      var l = [];
      var map = this._map;
      for (var key in map) {
        l.push({ k: key, t: map[key].ts});
      }
      this._doPurge(map, l, max);
    },
    
    _oldLast: function(a, b) {
      return a.t > b.t ? -1 : a.t < b.t ? 1 : 0; 
    },
    
    putExt: function(host) {
      this._ext[host] = true; // Date.now();
      // we prefer to store a few bytes indefinitely rather than fall for DNS rebinding...
      // if (this._ext.__count__ > 800) this._purgeExtCache();
    },
    isExt: function(host) {
      return host in this._ext;
    },
    
    _purgeExtCache: function() {
      var l = [];
      var map = this._extCache;
      for (var key in map) {
        l.push({ k: key, t: map[key]});
      }
      this._doPurge(map, l, l.length / 2);
    },
    
    _doPurge: function(map, l, max) {
      l.sort(this._oldLast);
      for (var j = l.length; j-- > max;) {
        delete map[l[j].k];
      }
    }
  },
  
  checkHostName: function(host) {
    const invalidRx = /[^\w-\.]/;
    if (invalidRx.test(host) && !this.isIP(host)) {
      try {
       host = CC["@mozilla.org/network/idn-service;1"].createInstance(CI.nsIIDNService).convertUTF8toACE(host);
      } catch(e) {
        return false;
      }
      return !invalidRx.test(host);
    }
    return true;
  },
  
  _resolving: {},
  resolve: function(host, flags, callback) { 
    flags = flags || 0;

    var elapsed = 0, t;
    var cache = this._cache;
    var async = IOUtil.asyncNetworking && Thread.canSpin || !!callback;
    
    var dnsRecord = cache.get(host);
    if (dnsRecord) {
      // cache invalidation, if needed
      if (dnsRecord.expired && !dnsRecord.refreshing) {
        if (dnsRecord.valid && !(flags & 1)) {
          // refresh async
          dnsRecord.refreshing = true;
          DNS._dns.asyncResolve(host, flags, new DNSListener(function() {
              cache.put(host, dnsRecord = new DNSRecord(this.record));
            }), Thread.currentQueue);
        } else {
          flags |= 1;
        }
        if (flags & 1) {  
          dnsRecord = null;
          cache.evict(host);
        }
      }
    }
    if (dnsRecord) {
      if (ABE.consoleDump) ABE.log("Using cached DNS record for " + host);
    } else if (this.checkHostName(host)) {
      
      if (async) {
        var resolving = this._resolving;
  
        if (host in resolving) {
          ABE.log("Already resolving " + host);
          
          if (callback) {
            resolving[host].push(callback);
            return null;
          }
        } else resolving[host] = callback ? [callback] : [];
        
        var ctrl = {
          running: true,
          startTime: Date.now()
        };
        
        var status = Components.results.NS_OK;
        
        
        var resolve = function() {
          DNS._dns.asyncResolve(host, flags, new DNSListener(function() {
            cache.put(host, dnsRecord = new DNSRecord(this.record));
            ctrl.running = false;
            var callbacks = resolving[host];
            delete resolving[host];
            if (ABE.consoleDump && t) {
              elapsed = Date.now() - t;
              ABE.log("Async DNS query on " + host + " done, " + elapsed + "ms, callbacks: " + (callbacks && callbacks.length));
            }
            
            if (callbacks && callbacks.length)
              for each(var cb in callbacks)
                cb(dnsRecord);
            
          }), Thread.currentQueue);
          if (ABE.consoleDump) ABE.log("Waiting for DNS query on " + host);
          if (!callback) Thread.spin(ctrl);
        }
        
        if (callback) {
          t = Date.now();
          resolve();
          return null;
        }
        
        Thread.runWithQueue(resolve);
        
        if (!Components.isSuccessCode(status)) throw status;
        
        elapsed = ctrl.elapsed || 0;
      } else {
        t = Date.now();
        if (ABE.consoleDump) ABE.log("Performing DNS query on " + host);
        cache.put(host, dnsRecord = new DNSRecord(this._dns.resolve(host, flags)));
        elapsed = Date.now() - t;
      }
    } else {
      this._cache.put(host, dnsRecord = new DNSRecord(null)); // invalid host name
    }
    
    if (ABE.consoleDump) ABE.log("DNS query on " + host + " done, " + elapsed + "ms");
    
    if (callback) {
      callback(dnsRecord);
    } else {
      if (!(dnsRecord && dnsRecord.valid)) throw Components.results.NS_ERROR_UNKNOWN_HOST;
    }
    return dnsRecord;
  },
  
  evict: function(host) {
    ABE.log("Removing DNS cache record for " + host);
    return this._cache.evict(host);
  },
  
  invalidate: function(host) {
    var dnsRecord = this._cache.get(host);
    if (!dnsRecord.valid) return false;
    dnsRecord.valid = false;
    dnsRecord.expireTime = 0;
    return true;
  },
  
  getCached: function(host) {
    return this._cache.get(host);
  },
  
  isCached: function(host) {
    var res =  this._cache.get(host);
    return res && (res.valid || !res.expired);
  },
  
  isLocalURI: function(uri, all) {
    var host;
    try {
      host = uri.host;
    } catch(e) {
      return false;
    }
    if (!host) return true; // local file:///
    return this.isLocalHost(host, all);
  },
  
  isLocalHost: function(host, all) {
    if (host == "localhost") return true;
    if (this.isIP(host)) {
      return this.isLocalIP(host);
    }

    if (all && this._cache.isExt(host)) return false;
  
    var res = this.resolve(host, 0).isLocal(all);

    if (!res) {
      this._cache.putExt(host);
    }
    
    return res;
  },
  
  isLocalIP: function(addr) {
    // see https://bug354493.bugzilla.mozilla.org/attachment.cgi?id=329492 for a more verbose but incomplete (missing IPV6 ULA) implementation
    // Relevant RFCs linked at http://en.wikipedia.org/wiki/Private_network
    return /^(?:(?:0|127|10|169\.254|172\.(?:1[6-9]|2\d|3[0-1])|192\.168)\..*\.[^0]\d*$|(?:(?:255\.){3}255|::1?)$|F(?:[CDF][0-9A-F]|E[89AB])[0-9A-F:]+::)/i.test(addr);
  },
  
  isIP: function(host) {
    return /^(?:\d+\.){3}\d+$|:.*:/.test(host);
  }
  
};

function DNSListener(callback) {
  if (callback) this.callback = callback;
};
DNSListener.prototype = {
  QueryInterface: xpcom_generateQI([CI.nsIDNSListener, CI.nsISupports]),
  record: null,
  status: 0,
  callback: null,
  onLookupComplete: function(req, rec, status) {
    this.record = rec;
    this.status = status;
    if (this.callback) this.callback();
  }
};