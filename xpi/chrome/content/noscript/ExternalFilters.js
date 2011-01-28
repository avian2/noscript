var ExternalFilters = {
  prefs: null,
  _filters: [],
  enabled: false,
  supported: true,
  lastFilterName: null,
  
  get _builtIns() {
    delete this._builtIns;
    return this._builtIns = [
      new ExternalFilter("Blitzableiter", null, "shockwave|futuresplash", ".hulu.com .youtube.com")
    ];
  },
  
  isBuiltIn: function (f) {
    return this._builtIns.some(f.same, f);
  },
  
  cloneFilters: function() {
    return this._filters.concat(
        this._builtIns.filter(function(bif) !this._filters.some(bif.same, bif), this )
      ).map(function(f) new ExternalFilter(f.name, f.exe, f.contentType, f.whitelist)
    );
  },
  
  save: function(filters) {
    if (filters) this._filters = filters; // filters.filter(function(f) f.valid);
    
    const prefs = this.prefs;
    for each(let key in prefs.getChildList("", {})) {
      try {
        prefs.clearUserPref(key);
      } catch(e) {}
    }
    prefs.setBoolPref("enabled", this.enabled);
    
    const props = ["name", "exe", "contentType", "whitelist"];
    
    this._filters.forEach(function(f) {
      for each(let p in props) {   
        prefs.setCharPref(f.name + "." + p,
          p == "exe" ? f[p] && f[p].path || '' :
            p == "whitelist" ? f[p] && f[p].source || '' :
              f[p]                                 
        );
      }
    });
  },
  
  get whitelists() {
    if (!("_whitelists" in this)) {
      let wl = {}, some = false;
      if (this._filters.length) {
        for each(let f in this._filters) {
          if (f.whitelist) wl[f.name] = f.whitelist;
          some = true;
        }
      }
      this._whitelists = some ? wl : null;
    }
    return this._whitelists;
  },
  
  register: function(f) {
    if (f.valid) {
      const ff = this._filters;
      for (let j = ff.length; j-- > 0;) {
        if (f.same(ff[j])) ff.splice(j, 1);
      }
      this._filters.push(f);
      delete this._whitelists;
      return true;
    } 
    return false;
  },
  
  get ioUtil() {
    delete this.ioUtil;
    return this.ioUtil = CC["@mozilla.org/io-util;1"].getService(CI.nsIIOUtil);
  },
  
  get tmpDir() {
    delete this.tmpDir;
    return this.tmpDir = CC["@mozilla.org/file/directory_service;1"]
        .getService(CI.nsIProperties)
        .get("TmpD", CI.nsILocalFile);
  },
  
  
  createProcess: function() {
    const clazz = CC["@mozilla.org/process/util;1"];
    const iface = "nsIProcess2" in CI ? CI.nsIProcess2 : CI.nsIProcess;
    delete this.createProcess;
    return (this.createProcess = function() clazz.createInstance(iface))()
  },
  
  createTempFile: function() {
    let tf = this.tmpDir.clone();
    tf.append(Math.round(Math.random() * 99999999).toString(16));
    tf.createUnique(tf.FILE_TYPE, 384);
    return tf;
  },
  
  handle: function(channel, extraType, ctx, cached) {
    if (channel instanceof CI.nsITraceableChannel) {
    
      let contentType;
      try {
        contentType = channel.contentType;
      } catch(e) {
        contentType = extraType || '';
      }
      
      if (contentType || extraType) {
        contentType = extraType || contentType;
        for each (let f in this._filters) {
          if (f.handle(channel, contentType, ctx, cached)) {
            this.storeFilterInfo(ctx, f, channel.name);
            return f;
          }
        }
      }
    }
    
    return null;
  },
  
  getFiltersInfo: function(top) {
    return top.__externalContentFilters__ || (top.__externalContentFilters__ = {});
  },
  
  getObjFilterInfo: function(obj) {
    return obj.__externalContentFilter__ || null;
  },
  
  storeFilterInfo: function(ctx, filter, url) {
    ctx.__externalContentFilter__ = { url: url, filter: filter };
    
    var info = this.getFiltersInfo(ctx.ownerDocument.defaultView.top);
    info[url] = filter;
    return info;
  },
  
  byName: function(name) {
    for (var j = this._filters.length; j-- > 0;) {
      if (this._filters[j].name == name) return this._filters[j];
    }
    return null;
  },

  
  log: function(msg) {
    dump("[External Filters] " + msg + "\n");
  },
  
  initFromPrefs: function(prefRoot) {
    this.prefs = CC["@mozilla.org/preferences-service;1"].getService(CI.nsIPrefService)
      .getBranch(prefRoot).QueryInterface(CI.nsIPrefBranch2);
    this._syncPrefs();
    
  },
  
  _observingPrefs: false,
  _syncPrefs: function() {
    const prefs = this.prefs;
    if ((this.enabled = prefs.getBoolPref("enabled"))) {
      this._filters = [];
      var args,
          name, member
          map = {};
      for each(let key in prefs.getChildList("", {})) {
        [name, member] = key.split(".");
        if (!(name && member)) continue;
        
        if (!(name in map)) map[name] = { name: name };
        try {
          map[name][member] = prefs.getCharPref(key);
        } catch(e) {}
      }
      for (name in map) {
        this._createAndRegister(map[name]);
      }
    }
    if (!this._observingPrefs) {
      prefs.addObserver("", this, true);
      this._observingPrefs = true;
    }
    EFCacheSessions.purge();
  },
  
  _createAndRegister: function(args) {
    var f = args
      ? new ExternalFilter(args.name, args.exe, args.contentType || '', "whitelist" in args && args.whitelist)
      : null;
    if (f && f.name) this.register(f);
    return f;
  },
  
  create: function(name, exe, contentType, whitelist) {
    return new ExternalFilter(name, exe, contentType, whitelist);
  },
  
  observe: function(prefs, topic, key) {
    this.prefs.removeObserver("", this, true);
    this._observingPrefs = false;
    Thread.asap(this._syncPrefs, this);
  },
  
  testSetup: function() {
    if (!this._filters.length)
      new ExternalFilter("Blitzableiter",
                         "G:\\Install\\Blitzableiter.rev125.binary\\Blitzableiter.exe",
                         "shockwave|futuresplash"
                        );
  },
  
  QueryInterface: xpcom_generateQI([CI.nsIObserver, CI.nsISupportsWeakReference])
}


function ExternalFilter(name, exe, contentType, whitelist) {
  name = name.replace(/^\W+/, '').replace(/\s+$/, '');
  if (!name) return this;
  this.name = name[0].toUpperCase() + name.substring(1); 
  try {
    
    
    this.contentType = contentType;
      
    if (whitelist)
      this.whitelist = new AddressMatcher(
        (whitelist instanceof AddressMatcher)
        ? whitelist.source
        : whitelist
      );
      
    if (exe instanceof CI.nsIFile) {
      this.exe = exe;
    } else if (exe) {
      this.exe = CC["@mozilla.org/file/local;1"].createInstance(CI.nsILocalFile);
      this.exe.initWithPath(exe);
    }
    
    if (this.exe && !this.exe.exists())
      this.exe = null;
      
  } catch(e) {
    ExternalFilters.log(name + ": " + e);
  }
  return this;
}

ExternalFilter.prototype = {
  name: '',
  whitelist: null,
  exe: null,
  get valid() {
    return !!this.exe;
  },
  get enabled() {
    return this.valid && !!this.contentType;
  },
  
  get builtIn() {
    return ExternalFilters.isBuiltIn(this);
  },
  
  same: function(f) {
    return f.name == this.name;
  },
  
  _ct: '',
  _ctRx: /^$/,
  set contentType(s) {
    s = s || '';
    this._ct = s;
    delete this._ctRx;
    if (s) {
      var rx = this.parseContentType(s);
      if (rx) this._ctRx = rx;
    }
    return s;
  },
  
  get contentType() {
    return this._ct;
  },
  
  parseContentType: function(s) {
    try {
      return new RegExp(
                    /[\^\$\*\(\[\]\)\|\?]/.test(s)
                      ? s
                      : '^' + s.replace(/[^\w\/;]/g, "\\$1") + '$',
                    "i"
                  );
    } catch(e) {
      return null;
    }
  },
  
  isDomainException: function(d) {
    return this.whitelist && this.whitelist.source.split(/\s+/).indexOf("." + d) !== -1
  },
  
  addDomainException: function(d) {
    if (this.isDomainException(d)) return false;
    var wl = this.whitelist && this.whitelist.source || '';
    ExternalFilters.prefs.setCharPref(this.name + ".whitelist", wl.split(/\s+/).concat("." + d).join(" "));
    return true;
  },
  
  removeDomainException: function(d) {
    var wl = this.whitelist;
    if (!wl) return false;
    var list = wl.source.split(/\s+/);
    var fqd = "." + d;
    var pos = list.indexOf(fqd);
    if (pos < 0) return false;
    do {
      list.splice(pos, 1);
    } while((pos = list.indexOf(fqd)) !== -1);
    ExternalFilters.prefs.setCharPref(this.name + ".whitelist", list.join(" "));
    return true;
  },
  
  handle: function(traceableChannel, contentType, ctx, cached) {
    if (!(this.enabled && this._ctRx.test(contentType)))
      return false;
    
    if (!(this.whitelist && this.whitelist.test(traceableChannel.name))) {
      try {
        if (cached && traceableChannel instanceof CI.nsICachingChannel &&
            traceableChannel.cacheToken instanceof CI.nsICacheEntryDescriptor &&
            EFCacheSessions.isFiltered(traceableChannel.cacheToken, this.name)) {
          return true;
        }
      } catch(e) {
        // cache miss
      }
        
      new EFHandler(this, traceableChannel, ctx);
    }
    return true;
  }
}



function EFHandler(filter, traceableChannel, object) {
  this.filter = filter;
  this.channel = traceableChannel;
  this.object = object;
  this.originalListener = traceableChannel.setNewListener(this);
}

EFHandler.prototype = {
  _observers: [],
  
  outFile: null,
  cleanFile: null,
  outStream: null,
  bufSize: 0x8000,
  ctx: null,
  statusCode: 0,
  
  processed: false,
  
  caching: false,
  cacheEntry: null,
  offlineCacheEntry: null,
  
 
  
  process: function() {
    this.originalListener.onStartRequest(this.channel, this.ctx);
    try {
      this.outStream.flush();
      this.outStream.close();
      
      this.overwriteCache(this.loadAndCache);
      
      ExternalFilters.log("Running " + this.filter.exe.path + " on " + this.channel.name);
      
      this.cleanFile = ExternalFilters.createTempFile();
      var p = ExternalFilters.createProcess();
      p.init(this.filter.exe);
      var origin = '';
      try {
        origin = this.object.ownerDocument.defaultView.location.href;
      } catch(e) {
      }
      var args = [this.outFile.path, this.cleanFile.path, origin, this.channel.name];
      p.runAsync(args, args.length, this, true);
      this._observers.push(this); // anti-gc kung-fu death grip
      
    } catch(e) {
      this.abort(e);
    } 
  },
  
  abort: function(e) {
    ExternalFilters.log("Aborting " + this.channel.name + ": " + e);
    this.channel.cancel(Components.results.NS_ERROR_ABORT);
    this.overwriteCache(null);
    this.cleanup();
  },
  
  onCacheWrite: null,
  
  nukeCache: function(ce) {
    ce.openOutputStream(0).close();
    ce.markValid();
  },
  
  loadAndCache: function() {
     if (this.processed &&
        (!this.caching ||
          this.cacheEntry &&
            (this.offlineCacheEntry ||
              !this.channel.cacheForOfflineUse))
        ) {        
      new EFFilePassthru(this);
    }
  },

  overwriteCache: function(writerCallback) {
    var ch = this.channel;
    if (!(ch instanceof CI.nsICachingChannel)) return false;
    
    this.onCacheWrite = writerCallback || this.nukeCache;
    
    try {

      let ce = ch.cacheToken;
      if (!(ce instanceof CI.nsICacheEntryDescriptor && ce.isStreamBased()))
        return false;
      
      try {
        if (ch.isFromCache()) return false;
      } catch(e) {
        ExternalFilters.log("[" + ch.name + "].isFromCache() " + e);
      }
      
      this.caching = true;
      
      new EFCacheHandler(this, ce, ce.clientID, ce.storagePolicy);
       
      if (ch.cacheForOfflineUse) {
        new EFCacheHandler(this, ce, ch.offlineCacheClientID);
      }
      
      return true;
    } catch(e) {
      ExternalFilters.log(e);
    }
    return false;
  },
  
  forCache: function(callback) {
    if (this.cacheEntry) callback(this.cacheEntry);
    if (this.offlineCacheEntry) callback(this.offlineCacheEntry);
  },
  
  _finalizeCacheEntry: function(ce) {
    try {
      var h = ce.getMetaDataElement("response-head");
      ce.setMetaDataElement("response-head",
        h.replace(/^(Content-Length:\s*)\d+/mi, "$1" + ce.dataSize));
    } catch(e) {
      ExternalFilters.log(e);
    }
    ce.markValid();
    ce.close();
  },
  
  cleanup: function() {
    if (this.outFile) {
      this.outFile.remove(false);
      delete this.outFile;
    }
    if (this.cleanFile) {
      this.cleanFile.remove(false);
      delete this.cleanFile;
    }
    
    this.forCache(this._finalizeCacheEntry);

    delete this.cacheEntry;
    delete this.offlineCacheEntry;
  },
  
  onStartRequest: function(request, ctx) {
    var outFile = ExternalFilters.createTempFile();
    var os = CC["@mozilla.org/network/file-output-stream;1"]
      .createInstance(CI.nsIFileOutputStream);
    os.init(outFile, 0x02 | 0x08 | 0x22 /* write, create, truncate */, 384 /*0600*/, 0);
    var bos = CC["@mozilla.org/network/buffered-output-stream;1"]
      .createInstance(CI.nsIBufferedOutputStream);
    bos.init(os, this.bufSize);
    this.outStream = bos;
    this.outFile = outFile;
  },
  
  onDataAvailable: function(request, ctx, inStream, offset, count) {
    var outStream = this.outStream;
    while(count > 0)
      count -= outStream.writeFrom(inStream, count);
  },
 
  onStopRequest: function(request, ctx, statusCode) {
    this.ctx = ctx;
    this.statusCode = statusCode;
    this.process();
  },
  
  observe: function(subject, topic, data) {
    
    this._observers.splice(this._observers.lastIndexOf(this), 1);
    var p = subject;
    if (p instanceof CI.nsIProcess) {
      this.processed = true;
      switch(topic) {
        case "process-finished":
          if (!p.exitValue) {
            this.loadAndCache();
            break;
          }
        case "process-failed":
          // TODO: better error management and nuke cache entry
          this.abort("error #" + p.exitValue);
        break;
      }
    }
  },
  
  QueryInterface: xpcom_generateQI(
      [CI.nsITraceableChannel, CI.nsICacheListener,
       CI.nsIObserver, CI.nsISupportsWeakReference])
}

function EFFilePassthru(handler) {
    this.handler = handler;
    this.request = handler.channel;
    this.originalListener = handler.originalListener;
    
    for each(let ce in [handler.cacheEntry, handler.offlineCacheEntry]) {
      if (ce) {
        let tee = CC["@mozilla.org/network/stream-listener-tee;1"].
          createInstance(CI.nsIStreamListenerTee);
        tee.init(this.originalListener, ce.openOutputStream(0));
        this.originalListener = tee;
      }
    }
    
    // TODO: rewrite http://mxr.mozilla.org/mozilla-central/source/netwerk/cache/public/nsICacheEntryDescriptor.idl#86
    this.bytes = 0;
    var ch = IOS.newChannelFromURI(IOS.newFileURI(handler.cleanFile));
    ch.asyncOpen(this, handler.ctx);
}

EFFilePassthru.prototype = {
  onStartRequest: function(ch, ctx) {},

  onDataAvailable: function(ch, ctx, inStream, offset, count) {
    this.originalListener.onDataAvailable(this.request, ctx, inStream, offset, count);
  },
  
  
  onStopRequest: function(ch, ctx, statusCode) {
    ExternalFilters.log(this.request.name + " succesfully filtered");

    var handler = this.handler;
    this.originalListener.onStopRequest(this.request, ctx, handler.statusCode);        
    handler.cleanup();    
  },
  
  QueryInterface: xpcom_generateQI([CI.nsIStreamListener])
}


function EFCacheHandler(handler, ce, clientID, storagePolicy) {
  this.handler = handler;
  this.expirationTime = ce.expirationTime;
  this.securityInfo = ce.securityInfo;
  this.metaData = {};
  ce.visitMetaData(this);
  
  if (typeof(storagePolicy) == "undefined")
    storagePolicy = EFCacheSessions.OFFLINE_POLICY;

  EFCacheSessions.getSession(clientID, storagePolicy)
    .asyncOpenCacheEntry(ce.key, EFCacheSessions.WRITE_ACCESS, this);
}

EFCacheHandler.prototype = {
 
  
  visitMetaDataElement: function(key, value) {
    this.metaData[key] = value;
    return true;
  },
  
  onCacheEntryAvailable : function(ce, accessGranted, status) {
    var handler = this.handler;
    
    if (Components.isSuccessCode(status) && handler.onCacheWrite) {
      
      ce.setExpirationTime(this.expirationTime);
      
      if (this.securityInfo) ce.setSecurityInfo(this.securityInfo);
      
      let md = this.metaData;
      for (let key in md) {
        ce.setMetaDataElement(key, md[key]);
      }
      
      if (ce.storagePolicy == EFCacheSessions.OFFLINE_POLICY) {
        handler.offlineCacheEntry = ce;
      } else {
        handler.cacheEntry = ce;
      }
      
      EFCacheSessions.setFiltered(ce, handler.filter.name);
      
      handler.onCacheWrite(ce);
    }
  },

  QueryInterface: xpcom_generateQI([CI.nsICacheListener, CI.nsICacheMetaDataVisitor])
}


var EFCacheSessions = {
  FILTER_MD_KEY: "noscript-external-filter",
  WRITE_ACCESS: CI.nsICache.ACCESS_WRITE,
  READ_ACCESS: CI.nsICache.ACCESS_READ,
  OFFLINE_POLICY: CI.nsICache.STORE_OFFLINE,
  
  nsICacheEntryDescriptor: CI.nsICacheEntryDescriptor,
  
  get cacheService() {
    delete this.cacheService;
    return this.cacheService = CC["@mozilla.org/network/cache-service;1"]
        .getService(CI.nsICacheService)
  },
  
  _sessions: {},
  getSession: function(clientID, storagePolicy) {
    const sk = clientID + "#" + storagePolicy;
    if (!(sk in this._sessions)) {
      this._sessions[sk] = this.cacheService.createSession(clientID, storagePolicy, true);
    }
    return this._sessions[sk];
  },
  
  setFiltered: function(ce, filterName) {
    ce.setMetaDataElement(this.FILTER_MD_KEY, filterName);
  },
  isFiltered: function(ce, filterName) {
    return ce.getMetaDataElement(this.FILTER_MD_KEY) == filterName;
  },
  
  purge: function() {
    const whitelists =  ExternalFilters.whitelists;
    if (whitelists) {
      this.whitelists = whitelists;
      const t = Date.now();
      
      this._entries = [];
      this.cacheService.visitEntries(this);
      this._entries.forEach(this._open, this);
      delete this._entries;
      
      ExternalFilters.log("Cache purged in " + (Date.now() - t) + "ms");
    }
  },
  
  _open: function(ce) {
    try {
      this.getSession(ce.clientID, ce.storagePolicy)
            .asyncOpenCacheEntry(ce.key, this.READ_ACCESS, this);
    } catch(e) {
      // already purged?
    }
  },
  
  visitDevice: function(deviceID, deviceInfo) {
    return true;
  },
  visitEntry: function(deviceID, ce) {
    this._entries.push({ // we must clone ce, since it appears to be a reused stub
      key: ce.key,
      clientID: ce.clientID,
      storagePolicy: ce.storagePolicy
    });
    return true;
  },
  
  onCacheEntryAvailable: function(ce, accessGranted, status) {
    try {
      if (accessGranted == this.READ_ACCESS && ce instanceof this.nsICacheEntryDescriptor) {
        try {
          const filterName = ce.getMetaDataElement(this.FILTER_MD_KEY);
          if (filterName) {
            const wl = this.whitelists[filterName];
            if (wl && wl.test(ce.key)) {
              ExternalFilters.log("Dooming cache entry " + ce.key);
              ce.doom();
              return;
            }
          }
        } catch(e) {
          // meta data not found
        }
      } else {
        ExternalFilters.log(ce.key + ": MAYDAY!!!");
      }
      ce.markValid();
    } catch(e) {
      ce.close();
    }
  },
  
  QueryInterface: xpcom_generateQI([CI.nsICacheListener, CI.nsICacheVisitor])
}
