INCLUDE("DNS");

const IO = {
  readFile: function(file) {
    const is = CC["@mozilla.org/network/file-input-stream;1"]
      .createInstance(CI.nsIFileInputStream );
    is.init(file ,0x01, 0400, null);
    const sis = CC["@mozilla.org/scriptableinputstream;1"]
      .createInstance(CI.nsIScriptableInputStream );
    sis.init(is);
    const res = sis.read(sis.available());
    is.close();
    return res;
  },
  writeFile: function(file, content) {
    const unicodeConverter = CC["@mozilla.org/intl/scriptableunicodeconverter"]
      .createInstance(CI.nsIScriptableUnicodeConverter);
    try {
      unicodeConverter.charset = charset ? charset : "UTF-8";
    } catch(ex) {
      unicodeConverter.charset = "UTF-8";
    }
    
    content = unicodeConverter.ConvertFromUnicode(content);
    const os = CC["@mozilla.org/network/file-output-stream;1"]
      .createInstance(CI.nsIFileOutputStream);
    os.init(file, 0x02 | 0x08 | 0x20, 0700, 0);
    os.write(content, content.length);
    os.close();
  }
};


function nsISupportWrapper(wrapped) {
  this.wrappedJSObject = wrapped;
}
nsISupportWrapper.prototype = {
  QueryInterface: xpcom_generateQI([CI.nsISupports])
}
  
const IOUtil = {
  asyncNetworking: true,
  proxiedDNS: 0,

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
  },
  
  getProxyInfo: function(channel) {
    return CI.nsIProxiedChannel && (channel instanceof CI.nsIProxiedChannel) 
    ? channel.proxyInfo
    : Components.classes["@mozilla.org/network/protocol-proxy-service;1"]
        .getService(Components.interfaces.nsIProtocolProxyService)
        .resolve(channel.URI, 0);
  },
  
  
  canDoDNS: function(channel) {
    if (!channel || IOS.offline) return false;
    
    var proxyInfo = this.getProxyInfo(channel);
    switch(this.proxiedDNS) {
      case 1:
        return proxyInfo && (proxyInfo.flags & CI.nsIProxyInfo.TRANSPARENT_PROXY_RESOLVES_HOST);
      case 2:
        return true;
      default:
        return !proxyInfo || proxyInfo.type == "direct";   
    }

  },
  
  
  findWindow: function(channel) {
    for each(var cb in [channel.notificationCallbacks,
                       channel.loadGroup && channel.loadGroup.notificationCallbacks]) {
      if (cb instanceof CI.nsIInterfaceRequestor) {
        try {
        // For Gecko 1.9.1
          return cb.getInterface(CI.nsILoadContext).associatedWindow;
        } catch(e) {}
        
        try {
          // For Gecko 1.9.0
          return cb.getInterface(CI.nsIDOMWindow);
        } catch(e) {}
      }
    }
    return null;
  },
  
  readFile: IO.readFile,
  writeFile: IO.writeFile,
  
  unwrapURL: function(url) {
    
    try {
      if (!(url instanceof CI.nsIURI))
        url = IOS.newURI(url, null, null);
      
      switch (url.scheme) {
        case "view-source":
          return this.unwrapURL(url.path);
        case "wyciwyg":
          return this.unwrapURL(url.path.replace(/^\/\/\d+\//, ""));
        case "jar":
          if (url instanceof CI.nsIJARURI)
            return this.unwrapURL(url.JARFile);
      }
    }
    catch (e) {}
    
    return url;
  },
  
  
  get _channelFlags() {
    delete this._channelFlags;
    var ff = {};
    [CI.nsIHttpChannel, CI.nsICachingChannel].forEach(function(c) {
      for (var p in c) {
        if (/^[A-Z_]+$/.test(p)) ff[p] = c[p];
      }
    });
    return this._channelFlags = ff;
  },
  humanFlags: function(loadFlags) {
    var hf = [];
    var c = this.channelFlags;
    for (var p in c) {
      if (loadFlags & c[p]) hf.push(p + "=" + c[p]);
    }
    return hf.join("\n");
  }
  
};

