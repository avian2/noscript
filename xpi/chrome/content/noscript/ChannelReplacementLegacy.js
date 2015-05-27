function CtxCapturingListener(tracingChannel, captureObserver) {
  this.originalListener = tracingChannel.setNewListener(this);
  this.captureObserver = captureObserver;
}
CtxCapturingListener.prototype = {
  originalListener: null,
  originalCtx: null,
  onStartRequest: function(request, ctx) {
    this.originalCtx = ctx;
    if (this.captureObserver) {
      this.captureObserver.observeCapture(request, this);
    }
  },
  onDataAvailable: function(request, ctx, inputStream, offset, count) {},
  onStopRequest: function(request, ctx, statusCode) {},
  QueryInterface: xpcom_generateQI([Ci.nsIStreamListener])
}

function RedirectCallback(channelReplacement) {
  this.channelReplacement = channelReplacement;
}

RedirectCallback.prototype = {
  references: 0,
  async: false,
  vetoed: false,
  _autoPending: false,
  QueryInterface: xpcom_generateQI([Ci.nsIAsyncVerifyRedirectCallback]),
  notifySink: function(sink) {
    let { oldChannel: oldChan, channel: newChan, REDIRECT_FLAGS: flags } = this.channelReplacement;
    this._notifying = true;
    this.references++;
    try {
      sink.asyncOnChannelRedirect(oldChan, newChan, flags, this);
    } catch (e) {
      this.vetoed = true;
    } finally {
      this._notifying = false;
      if (this.references > 0) this.async = true;
      else if (!this._autoPending) {
        Thread.asap(this._autoCallback, this);
        this._autoPending = true;
      }
    }
  },
  onRedirectVerifyCallback: function(result) {
    if (!Components.isSuccessCode(result)) this.vetoed = this.channelReplacement.realRedirect;
    if (--this.references === 0 && this.async)
      this._callback();
  },
  _autoCallback: function() {
    if (!this.async) this._callback();
  },
  _callback: function() {
    if (!this.vetoed)this.channelReplacement.openNew();
  }
};

ChannelReplacement.useRedirectTo = false;
ChannelReplacement.runWhenPending = function(channel, callback) {
  if (channel.isPending()) {
    callback();
    return false;
  } else {
    new LoadGroupWrapper(channel, callback);
    return true;
  }
};


ChannelReplacement.prototype = {
  listener: null,
  context: null,
  oldChannel: null,
  channel: null,
  window: null,
  suspended: false,
  REDIRECT_FLAGS: Ci.nsIChannelEventSink.REDIRECT_INTERNAL,

  _redirectCallback: null,
  _ctxCapturingListener: null,

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
    if (!(chan instanceof Ci.nsITraceableChannel))
      throw this._unsupportedError;

    let self = this;

    if ("nsIAsyncVerifyRedirectCallback" in Ci) {
      this._redirectCallback = new RedirectCallback(this);
    }

    newURI = newURI || chan.URI;

    var newChan = IOS.newChannelFromURI(newURI);

    this.oldChannel = chan;
    this.channel = newChan;

    // porting of http://lxr.mozilla.org/mozilla-central/source/netwerk/base/src/nsBaseChannel.cpp#69

    var loadFlags = chan.loadFlags;

    if (chan.URI.schemeIs("https"))
      loadFlags &= ~chan.INHIBIT_PERSISTENT_CACHING;


    newChan.loadGroup = chan.loadGroup;
    newChan.notificationCallbacks = chan.notificationCallbacks;
    newChan.loadFlags = loadFlags | newChan.LOAD_REPLACE;

    if ("nsIPrivateBrowsingService" in Ci &&
         chan instanceof Ci.nsIPrivateBrowsingService && chan.isChannelPrivate &&
         newChan instanceof Ci.nsIPrivateBrowsingService && !newChan.isChannelPrivate)
      newChan.setPrivate(true);

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
      }
      newChan.requestMethod = chan.requestMethod;
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
      if ("forceAllowThirdPartyCookie" in newChan)
        newChan.forceAllowThirdPartyCookie = chan.forceAllowThirdPartyCookie;
      if ("allowSpdy" in newChan)
        newChan.allowSpdy = chan.allowSpdy;
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

  _onChannelRedirect: function() {
    const oldChan = this.oldChannel;
    const newChan = this.channel;

    if (this.realRedirect) {
      if (oldChan.redirectionLimit === 0) {
        oldChan.cancel(NS_ERROR_REDIRECT_LOOP);
        throw NS_ERROR_REDIRECT_LOOP;
      }
    } else newChan.redirectionLimit += 1;



    // nsHttpHandler::OnChannelRedirect()

    const CES = Ci.nsIChannelEventSink;

    this._notifySink(Cc["@mozilla.org/netwerk/global-channel-event-sink;1"].getService(CES));
    var sink;

    for (let cess = ns.categoryManager.enumerateCategory("net-channel-event-sinks");
          cess.hasMoreElements();
        ) {
      sink = cess.getNext();
      if (sink instanceof CES)
        this._notifySink(sink);
    }
    sink = IOUtil.queryNotificationCallbacks(oldChan, CES);
    if (sink) this._notifySink(sink);

    // ----------------------------------

    newChan.originalURI = oldChan.originalURI;

    sink = IOUtil.queryNotificationCallbacks(oldChan, Ci.nsIHttpEventSink);
    if (sink) sink.onRedirect(oldChan, newChan);
  },

  _notifySink: function(sink) {
    const flags = this.REDIRECT_FLAGS;
    const oldChan = this.oldChannel;
    const newChan = this.channel;
    try {
      sink instanceof Ci.nsISupports;
      if ("onChannelRedirect" in sink) sink.onChannelRedirect(oldChan, newChan, flags);
      else if ("asyncOnChannelRedirect" in sink) {
        if (this._redirectCallback) {
          this._redirectCallback.notifySink(sink);
        } else {
          sink.asyncOnChannelRedirect(oldChan, newChan, flags, null);
        }
      } else {
        ABE.log("Unexpected: asyncOnChannelRedirect not found, instanceof nsIChannelEventSink = " + (sink instanceof Ci.nsIChannelEventSink) + "\n" +
                sink + "\n" + (new Error().stack));
      }
    } catch(e) {
      if (e.toString().indexOf("(NS_ERROR_DOM_BAD_URI)") !== -1 && oldChan.URI.spec !== newChan.URI.spec) {
        let oldURL = oldChan.URI.spec;
        try {
          oldChan.URI.spec = newChan.URI.spec;
          this._notifySink(sink);
        } catch(e1) {
          throw e;
        } finally {
          oldChan.URI.spec = oldURL;
        }
      } else if (e.message.indexOf("(NS_ERROR_NOT_AVAILABLE)") === -1) throw e;
    }
  },


  replace: function(realRedirect, callback) {
    let self = this;
    let oldChan = this.oldChannel;
    this.realRedirect = !!realRedirect;
    if (typeof(callback) !== "function") {
      callback = this._defaultCallback;
    }
    ChannelReplacement.runWhenPending(oldChan, function() {
      if (oldChan.status) return; // channel's doom had been already defined

      self._ctxCapturingListener = new CtxCapturingListener(oldChan, self);
      self.loadGroup = oldChan.loadGroup;

      oldChan.loadGroup = null; // prevents the wheel from stopping spinning


      if (self._redirectCallback) { // Gecko >= 2
        // this calls asyncAbort, which calls onStartRequest on our listener
        oldChan.cancel(NS_BINDING_REDIRECTED);
        if (!self._redirectCallback.vetoed) {
          self.suspend(); // believe it or not, this will defer asyncAbort() notifications until resume()
          callback(self);
        }
      } else {
        // legacy (Gecko < 2)
        self.observeCapture = function() {
          self.open = self._redirect;
          callback(self);
        }
        oldChan.cancel(NS_BINDING_REDIRECTED);
      }


    });
  },

  observeCapture: function() {
    this._redirect();
  },

  _defaultCallback: function(replacement) {
    replacement.open();
  },

  open: function() {
    this.resume(); // this triggers asyncAbort and the listeners in cascade
  },
  _redirect: function() {
    let oldChan = this.oldChannel,
      newChan = this.channel,
      overlap;

    if (!(this.window && (overlap = ABERequest.getLoadingChannel(this.window)) && overlap !== oldChan)) {
      try {
        if (ABE.consoleDump && this.window) {
          ABE.log("Opening delayed channel: " + oldChan.name + " - (current loading channel for this window " + (overlap && overlap.name) + ")");
        }

        oldChan.loadGroup = this.loadGroup;

        this._onChannelRedirect();
        if (!this._redirectCallback) {
          this.openNew();
        }

      } catch (e) {
        ABE.log(e);
      }
    } else {
      if (ABE.consoleDump) {
        ABE.log("Detected double load on the same window: " + oldChan.name + " - " + (overlap && overlap.name));
      }
    }

    this.dispose();
  },


  openNew: function() {
    let newChan = this.channel;
    let ccl = this._ctxCapturingListener;

    newChan.asyncOpen(ccl.originalListener, ccl.originalCtx);

    if ("nsIRedirectResultListener" in Ci) {
      // Bug 1153256
      let vetoHook = IOUtil.queryNotificationCallbacks(
                      this.oldChannel,
                      Ci.nsIRedirectResultListener);
      if (vetoHook) vetoHook.onRedirectResult(true);
    }

    if (this.window && this.window != IOUtil.findWindow(newChan)) {
      // late diverted load, unwanted artifact, abort
      IOUtil.abort(newChan);
    } else {
      // safe browsing hook
      if (this._classifierClass)
        this._classifierClass.createInstance(Ci.nsIChannelClassifier).start(newChan, true);
    }



  },

  suspend: function() {
    if (!this.suspended) {
      this.oldChannel.suspend();
      this.suspended = true;
    }
  },
  resume: function() {
    if (this.suspended) {
      this.suspended = false;
      try {
        this.oldChannel.resume();
      } catch (e) {}
    }
  },

  dispose: function() {
    this.resume();
    if (this.loadGroup) {
      try {
        this.loadGroup.removeRequest(this.oldChannel, null, NS_BINDING_REDIRECTED);
      } catch (e) {}
      this.loadGroup = null;
    }

  }
};

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
