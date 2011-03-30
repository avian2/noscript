function AddressMatcher(s) {
  this.source = s;
  this.rx = this.parse(s);
}
AddressMatcher.create = function(s) {
  return s && new AddressMatcher(s);
}

AddressMatcher.prototype = {
  rx: null,
  networks: null,
  netMatching: false,
  
  _universal: { test: function(s) { return true; } },
  
  _specRx: /^((?:ht|f)tps?:\/*)([^\/]*)/i,
  test:  function(u) {
    if (!this.rx) return false;
    
    let spec = this._specRx.exec(u);

    if (spec) {
        let host = spec[2];
        let atPos = host.indexOf("@");
        if (atPos > -1) {
            host = host.substring(atPos + 1);
            u = spec[1] + host + u.substring(spec[0].length);
        }
        // handle IDN
        if (host.substring(0, 4) === "xn--") {
          try {
            if (this.rx.test(spec[1] + DNS.idn.convertACEtoUTF8(host) + spec.input.substring(spec[0].length))) 
              return true;
          } catch (e) {}
        }
    }
    
    return this.rx.test(u);
  },
  
  testURI: function(uri) this.test(uri.spec),
  
  _networkTest: function(uri, canDoDNS, allIPs) {
    var res = this.rx && this.rx.test(uri.spec || uri);
    if (res || !canDoDNS) return res;
    
    if (!uri.spec) {
      uri = IOS.newURI(uri, null, null);
    }
    try {
      var host = uri.host
      if (!host) return false;
      if (Network.isNet(host))
        return this.testIP(host);
      
      var dnsRecord = DNS.resolve(host);
      if (dnsRecord && dnsRecord.valid) 
        return allIPs ? dnsRecord.entries.every(this.testIP, this)
                      : dnsRecord.entries.some(this.testIP, this);
    } catch(e) {
      dump(e + "\n");
    }
    return false;
  },
  
  testIP: function(ip) {
     return this.networks.some(function(n) n.test(ip));
  },
  
  parse: function(s) {
    try {
      var universal = false;
      var rxs = s && s.split(/\s+/).map(function(p) {      
        if (p === '*') {
          universal = true;
        }
       
        if (universal || !/\S+/.test(p)) return null;
        
        if (Network.isNet(p)) {
          var net;
          if (!this.netMatching) {
            this.netMatching = true;
            this.test = this.testURI = this._networkTest;
            this.networks = [net = new Network(p)];
          } else {
            this.networks.push(net = new Network(p));
          }
          
          if (p.indexOf("/") > -1 || (net.ipv4 ? net.mask < 32 : net.mask < 128))
            return null; // is a whole network, using IP for URL doesn't make sense
          
          if (p.indexOf(":") > -1)
            p = "[" + p + "]"; // prepare IPv6 URL host
        }
        
        if(!/[^\w\-\[\]/:%@;&#\?\.\*]/.test(p)) {
         
          // either simple or glob
          const hasPath = /^(?:\w+:\/\/|)[^\/]+\//.test(p);
          const hasScheme = /^[a-z][\w\-]+:(?:\/+|[^/]*\D|$)/.test(p);

          p = p.replace(/[\.\?\-]/g, "\\$&"); // escape special regexp chars

          if (!hasScheme) { // adjust for no protocol
            if (p.substring(0, 2) === '\\.') {
              // al_9x's proposed syntactic sugar to match both *.x.y and x.y
              p = "(?:[^/]+\\.)?" + p.substring(2); 
            }
            p = "[a-z]\\w+://" + p;
          }

          if (!hasPath &&
              p.substring(p.length - 1) != ':' // unless scheme-only
            ) {
            // adjust for no path
             p += "(?::\\d+)?(?:[/\\?#]|$)";
          }
          
          if (!/\*/.test(p)) {
            // simple "starts with..." site matching
            return '^' + p;
          }
          
          // glob matching
          if (hasPath) p += '$'; 

          return '^' + p.replace(/\*/g, '.*?').replace(/^([^\/:]+:\/*)\.\*/, "$1[^/]*");
        } 
        // raw regexp!
        try {
         new RegExp(p); // check syntax
        } catch(e) {
          dump("Illegal regexp in AddressMatcher: " + p + " -- " + e + "\n");
          return null;
        }
        return p;
      }, this).filter(function(p) { return p !== null; });

      if (universal) {
        this.test = this._universal.test;
        return this._universal;
      }
      return rxs.length ? new RegExp(rxs.join("|")) : null;
    } catch(e) {
      dump("Illegal AddressMatcher: " + s + " -- " + e + "\n");
      return null;
    }
  }
};

function Network(s) {
  this.src = s;
  var parts = s.split("/");
  var addr = parts[0];
  var smask;
  
  if (!this._isIPV4(addr))
    this.ipv4 = false;
  
  if (parts.length > 1) {
    this.mask = parseInt(parts[1]);
    
    var defMask = this.ipv4 ? 32 : 128;
    
    if (this.mask != defMask) {
      if (this.mask > defMask) this.mask = defMask;
      else {
        if (this.ipv4) this.ipv4Mask = this._maskToBits(this.mask, 32)
        else this.ipv6Mask = this._maskToBits(this.mask, 128);
      }
    }
  } else if (!this.ipv4) {
    this.mask = 128;
  }
  this.addr = this.ipv4 ? this._parseIPV4(addr) : this._parseIPV6(addr) ;
}

Network._netRx = /^(?:(?:\d+\.){1,3}\d*|[0-9af:]*:[0-9af:]*:[0-9af:]*)(:?\/\d{1,3})?$/i;
Network.isNet = function(s) {
  return this._netRx.test(s);
}

Network.prototype = {
  ipv4: true,
  mask: 32,
  ipv4Mask: 0xffffffff,
  ipv6Mask: [0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff],
  
  _isIPV4: function(addr) {
    return addr.indexOf(":") < 0;
  },
  _maskToBits: function(mask, length) {
    var smask = "", j = 0;
    for(; j < mask; j++) smask += "1";
    for(; j < length; j++) smask += "0";
    if (length <= 32)
      return parseInt(smask, 2);
    var ret = [];

    for(j = 0; j < length; j += 32) {
      ret.push(parseInt(smask.substring(j, j + 32), 2));
    }
    return ret;
  },
  
  test: function(addr) {
    addr = this.parse(addr);
    if (typeof(addr) === "number")
      return this.addr === addr;
    
    if (typeof(this.addr) === "number") return false;   
    for (var j = this.addr.length; j-- > 0;) {
      if (addr[j] !== this.addr[j]) return false;
    }
    return true;
  },
  
  parse: function(addr) {
    return this._isIPV4(addr) ? this._parseIPV4(addr) : this._parseIPV6(addr);
  },
  _parseIPV6: function(addr) {
    var parts = addr.split(":");
    var s = '', c, k, dz = false;
    for (var j = 0, len = parts.length; j < len; j++) {
      c = parts[j];
      if (c.length === 0 && !dz) {
        dz = true;
        for (k = 9 - len; k-- >0;) s += "0000";
      } else {
        s += "0000".substring(c.length) + c;
      }
    }

    var ret = [0, 0, 0, 0];
    var pos;
    for (j = 4; j-- > 0; ) {
      pos = j * 8;
      ret[j] = parseInt(s.substring(pos, pos + 8), 16) & this.ipv6Mask[j];
    }
    return ret;
  },
  _pows: [0x1000000, 0x10000, 0x100, 1],
  _parseIPV4: function(addr) {
    var parts = addr.split(".");
    var ret = 0, byt3;
    for (var j = parts.length; j-- > 0;) {
      byt3 = parseInt(parts[j], 10);
      if (byt3) {
        if (byt3 > 255) byt3 = 255;
        ret += byt3 * this._pows[j];
      } else if (j == parts.length - 1 && parts[j] == '') {
        parts.pop();
      }
    }
    if (parts.length < 4 && this.mask == 32 && typeof (this.addr) == "undefined") {
      this.mask = parts.length * 8;
      this.ipv4Mask = this._maskToBits(this.mask, 32);
    }
    return ret & this.ipv4Mask;
  },
  
  toString: function() {
    return this.src;
  }
};