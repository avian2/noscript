const ChanUtil = (function() {
  
  function nsISupportWrapper(wrapped) {
  this.wrappedJSObject = wrapped;
  }
  nsISupportWrapper.prototype = {
    QueryInterface: xpcom_generateQI([CI.nsISupports])
  }
  
  
  return {
    
    attachToChannel: function(channel, key, requestInfo) {
      if (channel instanceof CI.nsIWritablePropertyBag2) 
        channel.setPropertyAsInterface(key, new nsISupportWrapper(requestInfo));
    },
    extractFromChannel: function(channel, key, preserve) {
      if (channel instanceof CI.nsIPropertyBag2) {
        try {
          var requestInfo = channel.getPropertyAsInterface(key, CI.nsISupports);
          if (requestInfo) {
            if(!preserve && (channel instanceof CI.nsIWritablePropertyBag)) channel.deleteProperty(key);
            return requestInfo.wrappedJSObject;
          }
        } catch(e) {}
      }
      return null;
    },
  
    extractInternalReferrer: function(channel) {
      if (channel instanceof CI.nsIPropertyBag2) try {
        return channel.getPropertyAsInterface("docshell.internalReferrer", CI.nsIURL);
      } catch(e) {}
      return null;
    },
    extractInternalReferrerSpec: function(channel) {
      var ref = this.extractInternalReferrer(channel);
      return ref && ref.spec || null;
    }
  };
  
})();