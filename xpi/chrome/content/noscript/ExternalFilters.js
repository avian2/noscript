var ExternalFilters = {
  _filters: [],
  enabled: false,
  
  register: function(f) {
    this._filters.push(f);
    this.enabled = true;
  },
  
  get ioUtil() {
    delete this.ioUtil;
    return this.ioUtil = CC["@mozilla.org/io-util;1"].getService(CI.nsIIOUtil);
  },
  
  get tmpDir() {
    delete this.tmpDir;
    let tmpDir =
      CC["@mozilla.org/file/directory_service;1"]
        .getService(CI.nsIProperties)
        .get("TmpD", CI.nsILocalFile);
    return this.tmpDir = tmpDir;
  },
  
  createTempFile: function() {
    let tf = this.tmpDir.clone();
    tf.append(Math.round(Math.random() * 99999999).toString(16));
    tf.createUnique(tf.FILE_TYPE, 0600);
    return tf;
  },
  
  handle: function(channel, extraType) {
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
          if (f.handle(channel, contentType))
            return true;
        }
      }
    }
    
    return false;
  },
  
  log: function(msg) {
    dump("[NoScript EF] " + msg + "\n");
  },
  
  testSetup: function() {
    if (!this._filters.length)
      new ExternalFilter("Blitzableiter",
                         "G:\\Install\\Blitzableiter.rev125.binary\\Blitzableiter.exe",
                         "shockwave|futuresplash"
                        );
  }
}


function ExternalFilter(name, exe, contentType, whitelist) {
  this.name = name;
  
  if (exe instanceof CI.nsIFile) {
    this.exe = exe;
  } else {
    this.exe = CC["@mozilla.org/file/local;1"].createInstance(CI.nsILocalFile);
    this.exe.initWithPath(exe);
  };
  
  this.contentType = contentType instanceof RegExp
    ? contentType
    : new RegExp(/[\^\$\*\(\[\]\)\|\?]/.test(contentType)
                  ? contentType
                  : '^' + contentType.replace(/[^\w\/\;\+]/g, "\\$1") + '$',
                  "i"
                );
  
  ExternalFilters.register(this);
}

ExternalFilter.prototype = {
  handle: function(traceableChannel, contentType) {
    if (this.contentType.test(contentType)) {
      new EFHandler(this, traceableChannel);
      return true;
    }
    return false;
  }
}



function EFHandler(filter, traceableChannel) {
  this.filter = filter;
  this.channel = traceableChannel;
  this.originalListener = traceableChannel.setNewListener(this);
}

EFHandler.prototype = {
  _observers: [],
  
  outFile: null,
  cleanFile: null,
  outStream: null,
  bufSize: 0x8000,
  request: null,
  ctx: null,
  statusCode: 0,
  
  process: function() {
    this.originalListener.onStartRequest(this.request, this.ctx);
    try {
      this.outStream.flush();
      this.outStream.close();
      
      ExternalFilters.log("Running " + this.filter.exe.path + " on " + this.request.name);
      
      this.cleanFile = ExternalFilters.createTempFile();
      var p = CC["@mozilla.org/process/util;1"]
                .createInstance("nsIProcess2" in CI ? CI.nsIProcess2 : CI.nsIProcess);
      p.init(this.filter.exe);
      var args = [this.outFile.path, this.cleanFile.path];
      p.runAsync(args, args.length, this, true);
      this._observers.push(this); // anti-gc kung-fu death grip
    } catch(e) {
      this.abort(e);
    } 
  },
  
  abort: function(e) {
    ExternalFilters.log("Aborting " + this.request.name + ": " + e);
    this.request.cancel(Components.results.NS_ERROR_ABORT);
    this.cleanup();
  },
  
  cleanup: function() {
    if (this.outFile) this.outFile.remove(false);
    if (this.cleanFile) this.cleanFile.remove(false);
  },
  
  onStartRequest: function(request, ctx) {
    var outFile = ExternalFilters.createTempFile();
    var os = CC["@mozilla.org/network/file-output-stream;1"]
      .createInstance(CI.nsIFileOutputStream);
    os.init(outFile, 0x02 | 0x08 | 0x22 /* write, create, truncate */, 0600, 0);
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
    this.request = request;
    this.ctx = ctx;
    this.statusCode = statusCode;
    this.process();
  },
  
  observe: function(subject, topic, data) {
    this._observers.splice(this._observers.lastIndexOf(this), 1);
    var p = subject;
    if (p instanceof CI.nsIProcess) {
      switch(topic) {
        case "process-finished":
          if (!p.exitValue) {
            new EFFilePassthru(this);
            break;
          }
        case "process-failed":
          // TODO: better error management and nuke cache entry
          this.abort("error #" + p.exitValue);
        break;
      }
    }
  },
  
  QueryInterface: xpcom_generateQI([CI.nsITraceableChannel, CI.nsIObserver, CI.nsISupportsWeakReference, CI.nsISupports])
}

function EFFilePassthru(handler) {
    this.handler = handler;
    this.request = handler.request;
    this.originalListener = handler.originalListener;
    // TODO: rewrite http://mxr.mozilla.org/mozilla-central/source/netwerk/cache/public/nsICacheEntryDescriptor.idl#86
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
    this.handler.cleanup();
    this.originalListener.onStopRequest(this.request, ctx, this.handler.statusCode);
  },
  
  QueryInterface: function (aIID) {
    if (aIID.equals(CI.nsIStreamListener) ||
        aIID.equals(CI.nsISupports)) {
        return this;
    }
    throw Components.results.NS_NOINTERFACE;
  }
}
