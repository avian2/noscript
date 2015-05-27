function ChannelReplacement(chan, newURI, newMethod) {
  return this._init(chan, newURI, newMethod);
}

if ("REFERRER_POLICY_ORIGIN" in Ci.nsIHttpChannel) {
  // "modern" HTTPChanel, we can use redirectTo()
  ChannelReplacement.useRedirectTo = true;
  ChannelReplacement.runWhenPending = function(channel, callback) {
    callback();
  };

  ChannelReplacement.prototype = {
    _init: function(chan, newURI, newMethod) {
      this.oldChannel = this.channel = chan;
      this.newURI = newURI || chan.URI;
      this.newMethod = newMethod;
       if (chan.loadFlags & chan.LOAD_DOCUMENT_URI) {
         this.window = IOUtil.findWindow(chan);
       }

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
      if (!realRedirect) chan.redirectionLimit += 1;
      chan.redirectTo(this.newURI);
      chan.suspend();
      if (typeof callback === "function") callback(this);
      else this.open();
    },
    open: function() {
      this.channel.resume();
    }
  };
} else {
  INCLUDE("ChannelReplacementLegacy");
}
