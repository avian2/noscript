function ChannelReplacement(chan, newURI, newMethod) {
  return this._init(chan, newURI, newMethod);
}

ChannelReplacement.runWhenPending = function(channel, callback) {
  callback();
};

ChannelReplacement.prototype = {
  _init: function(chan, newURI, newMethod) {
    this.oldChannel = this.channel = chan;
    this.newURI = newURI || chan.URI;
    this.newMethod = newMethod;
    return this;
  },
  replace: function(realRedirect, callback) {
    let chan = this.channel;
    if (!this.newURI.equals(chan.URI)) {
      realRedirect = true;
    }
    if (this.newMethod && this.newMethod !== chan.requestMethod) {
      chan.requestMethod = this.newMethod;
      realRedirect = true;
    }

    let forceRedirect = !realRedirect;
    if (forceRedirect) {
      chan.redirectionLimit += 1;
    } else {
      let loadInfo = chan.loadInfo;
      if (loadInfo) {
        let type = loadInfo.externalContentPolicyType || loadInfo.contentPolicyType;
        forceRedirect = type === 11 || type === 12;
      }
    }

    if (forceRedirect) {
      let ncb = chan.notificationCallbacks;
      if (ncb) {
        try {
          let ces = ncb.getInterface(Ci.nsIChannelEventSink);
          if (ces) {
            INCLUDE("ForcedRedirectionCallback");
            chan.notificationCallbacks = new NCBWrapper(ncb, new CESDelegate(ces));
          }
        } catch (e) {
          // notificationCallbacks might not implement nsIChannelEventSink, e.g. in live bookmarks
        }
      }
    }


    chan.redirectTo(this.newURI);
    chan.suspend();
    if (typeof callback === "function") callback(this);
    else this.open();
  },
  open: function() {
    this.channel.resume();
  }
};
