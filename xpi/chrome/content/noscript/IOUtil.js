var IOUtil = {
  asyncNetworking: true,
  proxiedDNS: 0,

  attachToChannel(channel, key, data) {
    if (channel instanceof Ci.nsIWritablePropertyBag2) {
      channel.setPropertyAsInterface(key, data);
    }
    return data;
  },
  extractFromChannel(channel, key, remove = false) {
    if (channel instanceof Ci.nsIPropertyBag2) {
      let p = channel.get(key);
      if (p) {
        if (remove && (channel instanceof Ci.nsIWritablePropertyBag)) channel.deleteProperty(key);
        if (p.wrappedJSObject) return p.wrappedJSObject;
        p instanceof Ci.nsIURL || p instanceof Ci.nsIURI;
        return p;
      }
    }
    return null;
  },

  reqData(req, key, remove = false) {
    let data = IOUtil.extractFromChannel(req, key, remove);
    if (data) return data.wrappedJSObject;
    if (remove) return null;
    
    data = {};
    data.wrappedJSObject = data;
    return IOUtil.attachToChannel(req, key, data);
  },

  extractInternalReferrer: function(channel) {
    if (channel instanceof Ci.nsIPropertyBag2) {
      const key = "docshell.internalReferrer";
      if (channel.hasKey(key))
        try {
          return channel.getPropertyAsInterface(key, Ci.nsIURL);
        } catch(e) {}
    }
    return null;
  },
  extractInternalReferrerSpec: function(channel) {
    var ref = this.extractInternalReferrer(channel);
    return ref && ref.spec || null;
  },

  getProxyInfo: function(channel) {
    return Ci.nsIProxiedChannel && (channel instanceof Ci.nsIProxiedChannel)
    ? channel.proxyInfo
    : Cc["@mozilla.org/network/protocol-proxy-service;1"]
        .getService(Ci.nsIProtocolProxyService)
        .resolve(channel.URI, 0);
  },


  canDoDNS: function(channel) {
    if (!channel || IOS.offline) return false;

    var proxyInfo = this.getProxyInfo(channel);
    switch(this.proxiedDNS) {
      case 1:
        return !(proxyInfo && (proxyInfo.flags & Ci.nsIProxyInfo.TRANSPARENT_PROXY_RESOLVES_HOST));
      case 2:
        return true;
      default:
        return !proxyInfo || proxyInfo.type == "direct";
    }

  },

  abort: function(channel) {
    if (ns.consoleDump) ns.dump("Aborting " + channel.name + " @ " + new Error().stack);
    channel.cancel(Cr.NS_ERROR_ABORT);
    this.resumeParentChannel(channel, true);
  },

  _suspendedChannelsMap: new Map(),
  _suspendedChannelId: 1,
  resumeParentChannel(channelOrID, abort = false) {
    let id;
    if (channelOrID instanceof Ci.nsIChannel) {
      id = ns.reqData(channelOrID).requestID;
    } else {
      id = channelOrID;
    }
    if (id) {
      if (IPC.parent) {
        let map = this._suspendedChannelsMap;
        if (map.has(id)) {
          let channel = map.get(id).get();
          map.delete(id);
          if (channel) {
            try {
              if (abort) {
                this.abort(channel);
              }
              channel.resume();
            } catch(e) {
              ns.dump(e);
            }
          }
        }
      } else {
        Services.cpmm.sendSyncMessage(IPC_P_MSG.RESUME, {id, abort });
      }
    }
  },
  suspendChannel(channel) {
    let map = this._suspendedChannelsMap;
    let reqData = ns.reqData(channel);
    let id = reqData.requestID;
    if (!id) {
      id = reqData.requestID = this._suspendedChannelId++;
    }
    map.set(id, Cu.getWeakReference(channel));
    channel.suspend();
  },

  isMediaDocOrFrame(channel, contentType) {
    try {
      let cpType = channel.loadInfo.externalContentPolicyType;
      if (cpType === 7 || (cpType === 6 &&
          /^(?:video|audio|application)\//i.test(contentType === undefined ? channel.contentType : contentType))) {
        try {
          return !/^attachment\b/i.test(req.getResponseHeader("Content-disposition"));
        } catch(e) {
        }
        return true;
      }
    } catch (e) {
    }
    return false;
  },

  findWindow: function(channel) {
    for (var cb  of [channel.notificationCallbacks,
                       channel.loadGroup && channel.loadGroup.notificationCallbacks]) {
      if (cb instanceof Ci.nsIInterfaceRequestor) {
        if (Ci.nsILoadContext) try {
        // For Gecko 1.9.1
          return cb.getInterface(Ci.nsILoadContext).associatedWindow;
        } catch(e) {}

        try {
          // For Gecko 1.9.0
          return cb.getInterface(Ci.nsIDOMWindow);
        } catch(e) {}
      }
    }
    return null;
  },

  findBrowser: function(channel) {
    try {
      let b = channel.notificationCallbacks.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsILoadContext).topFrameElement;
      if (b) return b;
    } catch (e) {
    }
    return DOM.findBrowserForNode(this.findWindow(channel));
  },

  _protocols: {}, // caching them we gain a 33% speed boost in URI creation :)
  newURI: function(url, originCharset, baseUri) {
    try {
      let scheme =  url.substring(0, url.indexOf(':'));
      return (this._protocols[scheme] ||
        (this._protocols[scheme] =
          Cc["@mozilla.org/network/protocol;1?name=" + scheme]
          .getService(Ci.nsIProtocolHandler)))
        .newURI(url, originCharset, baseUri);
    } catch(e) {
      return IOS.newURI(url, originCharset, baseUri);
    }
  },

  newChannel: function(url, originCharset, baseUri, loadingNode, loadingPrincipal, triggeringPrincipal, securityFlags, contentPolicyType) {
    return ("newChannel2" in IOS)
      ? (this.newChannel = this.newChannel2).apply(this, arguments)
      : IOS.newChannel(url, originCharset, baseUri);
  },
  newChannel2: function(url, originCharset, baseUri, loadingNode, loadingPrincipal, triggeringPrincipal, securityFlags, contentPolicyType) {
    return IOS.newChannel2(url, originCharset, baseUri, loadingNode, loadingPrincipal, triggeringPrincipal, securityFlags, contentPolicyType);
  },

  unwrapURL: function(url) {
    try {
      if (!(url instanceof Ci.nsIURI))
        url = this.newURI(url);

      switch (url.scheme) {
        case "view-source":
          return this.unwrapURL(url.spec.replace(/^.*?:/, ''));
        case "feed":
        case "pcast":
          let u = url.spec.substring(url.scheme.length + 1);
          if (u.substring(0, 2) == '//') u = "http:" + u;
          return this.unwrapURL(u);
        case "wyciwyg":
          return this.unwrapURL(url.path.replace(/^\/\/\d+\//, ""));
        case "jar":
          if (url instanceof Ci.nsIJARURI)
            return this.unwrapURL(url.JARFile);
      }
    }
    catch (e) {}

    return url;
  },


  get _channelFlags() {
    delete this._channelFlags;
    const constRx = /^[A-Z_]+$/;
    const ff = {};
    [Ci.nsIHttpChannel, Ci.nsICachingChannel].forEach(function(c) {
      for (var p in c) {
        if (constRx.test(p)) ff[p] = c[p];
      }
    });
    return this._channelFlags = ff;
  },
  humanFlags: function(loadFlags) {
    var hf = [];
    var c = this._channelFlags;
    for (var p in c) {
      if (loadFlags & c[p]) hf.push(p + "=" + c[p]);
    }
    return hf.join("\n");
  },

  queryNotificationCallbacks: function(chan, iid) {
    var cb;
    try {
      cb = chan.notificationCallbacks.getInterface(iid);
      if (cb) return cb;
    } catch(e) {}

    try {
      return chan.loadGroup && chan.loadGroup.notificationCallbacks.getInterface(iid);
    } catch(e) {}

    return null;
  },


  anonymizeURI: function(uri, cookie) {
    if (uri instanceof Ci.nsIURL) {
      uri.query = this.anonymizeQS(uri.query, cookie);
    } else return this.anonymizeURL(uri, cookie);
    return uri;
  },
  anonymizeURL: function(url, cookie) {
    var parts = url.split("?");
    if (parts.length < 2) return url;
    parts[1] = this.anonymizeQS(parts[1], cookie);
    return parts.join("?");
  },

  _splitName: (nv) => nv.split("=")[0],
  _qsRx: /[&=]/,
  _anonRx: /(?:auth|s\w+(?:id|key)$)/,
  anonymizeQS: function(qs, cookie) {
    if (!qs) return qs;
    if (!this._qsRx.test(qs)) return '';

    var cookieNames, hasCookies;
    if ((hasCookies = !!cookie)) cookieNames = cookie.split(/\s*;\s*/).map(this._splitName)

    let parms = qs.split("&");
    for (let j = parms.length; j-- > 0;) {
      let nv = parms[j].split("=");
      let name = nv[0];
      if (this._anonRx.test(name) || cookie && cookieNames.indexOf(name) > -1)
        parms.splice(j, 1);
    }
    return parms.join("&");
  },

  get TLDService() {
    delete this.TLDService;
    return (this.TLDService = Cc["@mozilla.org/network/effective-tld-service;1"].getService(Ci.nsIEffectiveTLDService));
  }

};
