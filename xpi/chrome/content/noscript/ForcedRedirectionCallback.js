
function NCBWrapper(delegator, delegate) {
  this.delegator = delegator;
  this.delegate = delegate;
}
NCBWrapper.prototype = {
  QueryInterface: function(iid) {
    if (Ci.nsIInterfaceRequestor.equals(iid)) {
      return this;
    }
    return this.delegator.QueryInterface(iid);
  },
  getInterface: function(iid) {
    try {
      return this.delegate.QueryInterface(iid);
    } catch (e) {}
    return this.delegator.getInterface(iid);
  }
}

function RCBDelegate(redirectCallback, label) {
  this.delegator = redirectCallback;
  this.label = label;
}
RCBDelegate.prototype = {
  QueryInterface: xpcom_generateQI([Ci.sIAsyncVerifyRedirectCallback]),
  onRedirectVerifyCallback: function(result) {
    try {
      if (result !== 0) ns.log("Overriding failed (" + result + ") redirect callback for " + this.label); // plugin failure is 2147500037
      this.delegator.onRedirectVerifyCallback(0);
    } catch (e) {
      ns.log(e);
    }
  }
}

function CESDelegate(ces) {
  this.delegator = ces;
}
CESDelegate.prototype = {
  QueryInterface: xpcom_generateQI([Ci.nsIChannelEventSink]),
  asyncOnChannelRedirect: function(oldChan, newChan, flags, callback) {
    let label = "plugin forced redirection";
    try {
     label = oldChan.loadInfo.contentPolicyType + ": " + oldChan.name + " -> " + newChan.name + " - " + flags;
    } catch (e) {
      ns.log(e);
    }
    let cb = new RCBDelegate(callback, label);
    try {
      this.delegator.asyncOnChannelRedirect(oldChan, newChan, Ci.nsIChannelEventSink.REDIRECT_INTERNAL, cb);
    } catch (e) {
      ns.log(e);
      throw e;
    } finally {
      oldChan.notificationCallbacks = newChan.notificationCallbacks = this.delegator;
    }
  }
};
