function CtxCapturingListener(tracingChannel, onCapture) {
  this.originalListener = tracingChannel.setNewListener(this);
  this.onCapture = onCapture;
}
CtxCapturingListener.prototype = {
  originalListener: null,
  originalCtx: null,
  onStartRequest: function(request, ctx) {
    this.originalCtx = ctx;
    if (this.onCapture) this.onCapture(request, ctx);
  },
  onDataAvailable: function(request, ctx, inputStream, offset, count) {},
  onStopRequest: function(request, ctx, statusCode) {},
  QueryInterface: xpcom_generateQI([Ci.nsIStreamListener])
}

function ChannelReplacement(chan, newURI, newMethod) {
  return this._init(chan, newURI, newMethod);
}

ChannelReplacement.supported = "nsITraceableChannel" in Ci;

ChannelReplacement.prototype = {
  listener: null,
  context: null,
  oldChannel: null,
  channel: null,
  window: null,
  
  
  get _unsupportedError() {
    return new Error("Can't replace channels without nsITraceableChannel!");
  },
  
  get _classifierClass() {
    delete this.__proto__._classifierClass;
    return this.__proto__._classifierClass = Cc["@mozilla.org/channelclassifier"];
  },
  
  _autoHeadersRx: /^(?:Host|Cookie|Authorization)$|Cache|^If-/,
  visitHeader: function(key, val) {
    try {
      // we skip authorization and cache-related fields which should be automatically set
      if (!this._autoHeadersRx.test(key)) this.channel.setRequestHeader(key, val, false);
    } catch (e) {
      dump(e + "\n");
    }
  },
  
  _init: function(chan, newURI, newMethod) {
    if (!(ChannelReplacement.supported && chan instanceof Ci.nsITraceableChannel))
      throw this._unsupportedError;
  
    newURI = newURI || chan.URI;
    
    var newChan = IOS.newChannelFromURI(newURI);
    
    this.oldChannel = chan;
    this.channel = newChan;
    
    // porting of http://mxr.mozilla.org/mozilla-central/source/netwerk/protocol/http/src/nsHttpChannel.cpp#2750
    
    var loadFlags = chan.loadFlags;
    if (chan.URI.schemeIs("https"))
      loadFlags &= ~chan.INHIBIT_PERSISTENT_CACHING;
    
    
    newChan.loadGroup = chan.loadGroup;
    newChan.notificationCallbacks = chan.notificationCallbacks;
    newChan.loadFlags = loadFlags | newChan.LOAD_REPLACE;
    
    if (!(newChan instanceof Ci.nsIHttpChannel))
      return this;
    
    // copy headers
    chan.visitRequestHeaders(this);

    if (!newMethod || newMethod === chan.requestMethod) {
      if (newChan instanceof Ci.nsIUploadChannel && chan instanceof Ci.nsIUploadChannel && chan.uploadStream ) {
        var stream = chan.uploadStream;
        if (stream instanceof Ci.nsISeekableStream) {
          stream.seek(stream.NS_SEEK_SET, 0);
        }
        
        try {
          let ctype = chan.getRequestHeader("Content-type");
          let clen = chan.getRequestHeader("Content-length");
          if (ctype && clen) {
            newChan.setUploadStream(stream, ctype, parseInt(clen, 10));
          }
        } catch(e) {
          newChan.setUploadStream(stream, '', -1);
        }
        
        newChan.requestMethod = chan.requestMethod;
      }
    } else {
      newChan.requestMethod = newMethod;
    }
    
    if (chan.referrer) newChan.referrer = chan.referrer;
    newChan.allowPipelining = chan.allowPipelining;
    newChan.redirectionLimit = chan.redirectionLimit - 1;
    if (chan instanceof Ci.nsIHttpChannelInternal && newChan instanceof Ci.nsIHttpChannelInternal) {
      if (chan.URI == chan.documentURI) {
        newChan.documentURI = newURI;
      } else {
        newChan.documentURI = chan.documentURI;
      }
    }
    
    if (chan instanceof Ci.nsIEncodedChannel && newChan instanceof Ci.nsIEncodedChannel) {
      newChan.applyConversion = chan.applyConversion;
    }
    
    // we can't transfer resume information because we can't access mStartPos and mEntityID :(
    // http://mxr.mozilla.org/mozilla-central/source/netwerk/protocol/http/src/nsHttpChannel.cpp#2826
    
    if ("nsIApplicationCacheChannel" in Ci &&
      chan instanceof Ci.nsIApplicationCacheChannel && newChan instanceof Ci.nsIApplicationCacheChannel) {
      newChan.applicationCache = chan.applicationCache;
      newChan.inheritApplicationCache = chan.inheritApplicationCache;
    }
    
    if (chan instanceof Ci.nsIPropertyBag && newChan instanceof Ci.nsIWritablePropertyBag) 
      for (var properties = chan.enumerator, p; properties.hasMoreElements();)
        if ((p = properties.getNext()) instanceof Ci.nsIProperty)
          newChan.setProperty(p.name, p.value);

    if (chan.loadFlags & chan.LOAD_DOCUMENT_URI) {
      this.window = IOUtil.findWindow(chan);
    }
    
    return this;
  },
  
  _onChannelRedirect: function(trueRedir) {
    var oldChan = this.oldChannel;
    var newChan = this.channel;
    
    if (trueRedir) {
      if (oldChan.redirectionLimit === 0) {
        oldChan.cancel(NS_ERROR_REDIRECT_LOOP);
        throw NS_ERROR_REDIRECT_LOOP;
      }
    } else newChan.redirectionLimit += 1;
    
    
    
    // nsHttpHandler::OnChannelRedirect()

    const CES = Ci.nsIChannelEventSink;
    const flags = CES.REDIRECT_INTERNAL;
    this._callSink(
      Cc["@mozilla.org/netwerk/global-channel-event-sink;1"].getService(CES),
      oldChan, newChan, flags);
    var sink;
    
    for (let cess = ns.categoryManager.enumerateCategory("net-channel-event-sinks");
          cess.hasMoreElements();
        ) {
      sink = cess.getNext();
      if (sink instanceof CES)
        this._callSink(sink, oldChan, newChan, flags);
    }
    sink = IOUtil.queryNotificationCallbacks(oldChan, CES);
    if (sink) this._callSink(sink, oldChan, newChan, flags);
    
    // ----------------------------------
    
    newChan.originalURI = oldChan.originalURI;
    
    sink = IOUtil.queryNotificationCallbacks(oldChan, Ci.nsIHttpEventSink);
    if (sink) sink.onRedirect(oldChan, newChan);
  },
  
  _callSink: function(sink, oldChan, newChan, flags) {
    try { 
      if ("onChannelRedirect" in sink) sink.onChannelRedirect(oldChan, newChan, flags);
      else sink.asyncOnChannelRedirect(oldChan, newChan, flags, this._redirectCallback);
    } catch(e) {
      if (e.message.indexOf("(NS_ERROR_NOT_AVAILABLE)") === -1) throw e;
    }
  },
  
  get _redirectCallback() {
    delete this.__proto__._redirectCallback;
    return this.__proto__._redirectCallback = ("nsIAsyncVerifyRedirectCallback" in Ci)
    ? {
        QueryInterface: xpcom_generateQI([Ci.nsIAsyncVerifyRedirectCallback]),
        onRedirectVerifyCallback: function(result) {}
      }
    : null;
  },
  
  replace: function(isRedir, callback) {
    let self = this;
    let oldChan = this.oldChannel;
    this.isRedir = !!isRedir;
    if (typeof(callback) !== "function") {
      callback = this._defaultCallback;
    }
    IOUtil.runWhenPending(oldChan, function() {
      if (oldChan.status) return; // channel's doom had been already defined
      
      let ccl = new CtxCapturingListener(oldChan,
        function() {
          try {
            callback(self._replaceNow(isRedir, this))
          } catch (e) {
            self.dispose();
          }
        });
      self.loadGroup = oldChan.loadGroup;
      oldChan.loadGroup = null; // prevents the wheel from stopping spinning
      // this calls asyncAbort, which calls onStartRequest on our listener
      oldChan.cancel(NS_BINDING_REDIRECTED); 
    });
  },
  
  _defaultCallback: function(replacement) {
    replacement.open();
  },
  
  _replaceNow: function(isRedir, ccl) {
    let oldChan = this.oldChannel;
    oldChan.loadGroup = this.loadGroup;
    
    this._onChannelRedirect(isRedir);
    
    // dirty trick to grab listenerContext
   
    this.listener = ccl.originalListener;
    this.context = ccl.originalCtx;
    return this;
  },
  
  open: function() {
    let oldChan = this.oldChannel,
      newChan = this.channel,
      overlap;
    
    if (!(this.window && (overlap = ABERequest.getLoadingChannel(this.window)) !== oldChan)) {
      try {
        if (ABE.consoleDump && this.window) {
          ABE.log("Opening delayed channel: " + oldChan.name + " - (current loading channel for this window " + (overlap && overlap.name) + ")");
        }

        newChan.asyncOpen(this.listener, this.context);
        
        if (this.window && this.window != IOUtil.findWindow(newChan)) { 
          // late diverted load, unwanted artifact, abort
          IOUtil.abort(newChan);
        } else {
          // safe browsing hook
          if (this._classifierClass)
            this._classifierClass.createInstance(Ci.nsIChannelClassifier).start(newChan, true);
        }
      } catch (e) {}
    } else {
      if (ABE.consoleDump) {
        ABE.log("Detected double load on the same window: " + oldChan.name + " - " + (overlap && overlap.name));
      }
    }
    
    this.dispose();
  },
  
  dispose: function() {
    if (this.loadGroup) {
      try {
        this.loadGroup.removeRequest(this.oldChannel, null, NS_BINDING_REDIRECTED);
      } catch (e) {}
      this.loadGroup = null;
    }

  }
}

function LoadGroupWrapper(channel, callback) {
  this._channel = channel;
  this._inner = channel.loadGroup;
  this._callback = callback;
  channel.loadGroup = this;
}
LoadGroupWrapper.prototype = {
  QueryInterface: xpcom_generateQI([Ci.nsILoadGroup]),
  
  get activeCount() {
    return this._inner ? this._inner.activeCount : 0;
  },
  set defaultLoadRequest(v) {
    return this._inner ? this._inner.defaultLoadRequest = v : v;
  },
  get defaultLoadRequest() {
    return this._inner ? this._inner.defaultLoadRequest : null;
  },
  set groupObserver(v) {
    return this._inner ? this._inner.groupObserver = v : v;
  },
  get groupObserver() {
    return this._inner ? this._inner.groupObserver : null;
  },
  set notificationCallbacks(v) {
    return this._inner ? this._inner.notificationCallbacks = v : v;
  },
  get notificationCallbacks() {
    return this._inner ? this._inner.notificationCallbacks : null;
  },
  get requests() {
    return this._inner ? this._inner.requests : this._emptyEnum;
  },
  
  addRequest: function(r, ctx) {
    this.detach();
    if (this._inner) try {
      this._inner.addRequest(r, ctx);
    } catch(e) {
      // addRequest may have not been implemented
    }
    if (r === this._channel)
      try {
        this._callback(r, ctx);
      } catch (e) {}
  },
  removeRequest: function(r, ctx, status) {
    this.detach();
    if (this._inner) this._inner.removeRequest(r, ctx, status);
  },
  
  detach: function() {
    if (this._channel.loadGroup) this._channel.loadGroup = this._inner;
  },
  _emptyEnum: {
    QueryInterface: xpcom_generateQI([Ci.nsISimpleEnumerator]),
    getNext: function() { return null; },
    hasMoreElements: function() { return false; }
  }
};
