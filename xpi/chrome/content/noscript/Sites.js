const SiteUtils = new function() {
  const _domainPattern = this.domainPattern = /^[\w\u0080-\uffff][\w\-\.\u0080-\uffff]*$/;
  this.ios = IOS;  
  this.uriFixup = CC["@mozilla.org/docshell/urifixup;1"].getService(CI.nsIURIFixup);
  
  function sorter(a, b) {
    if (a == b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    const dp = _domainPattern;
    return dp.test(a) ?
        (dp.test(b) ? (a < b ? -1 : 1) : -1)
      : (dp.test(b) ? 1 : a < b ? -1 : 1);
  }
  
  this.sort = function(ss) {
    return ss.sort(sorter);
  };
  
  this.getSite = function(url) {
    if (!url || 
        url.charCodeAt(0) < 33  && // needs trimming
        !(url = url.replace(/^\s*(.*?)\s*$/, '$1'))) {
      return "";
    }
    
    if (url.indexOf(":") == -1) {
      return this.domainMatch(url);
    }
    
    var scheme;
    try {
      scheme = this.ios.extractScheme(url).toLowerCase();
      switch (scheme) {
        case "http": case "https": // commonest case first
          break;
        case "javascript": case "data": 
          return "";
        case "about":
          return url.split(/[\?#]/, 1)[0];
        case "chrome":
          return "chrome:";
      }
      scheme += ":";
      if (url == scheme) return url;
    } catch(ex) {
      return this.domainMatch(url);
    }
    try {
      let uri = this.uriFixup.createExposableURI( // fix wyciwyg: and zaps userpass
                IOUtil.unwrapURL(url) // unwrap JAR and view-source uris
      ); 
      
      try  {
        return uri.prePath;
      } catch(exNoPrePath) {
        scheme = uri.scheme;
        let host = uri.spec.substring(scheme.length);
        return /^\/\/[^\/]/.test(host) && (host = this.domainMatch(host.replace(/^\/\/([^\/]+).*/, "$1")))
          ? scheme + "//" + host
          : scheme;
      }
    } catch(ex) {
      return "";
    }
  };
  
  this.list2set = function(sl) {
    // kill duplicates
    var prevSite = "";
    var site;
    for (var j = sl.length; j--> 0;) {
      site = sl[j];
      if ((!site) || site == prevSite) { 
        sl.splice(j, 1);
      } else {
        prevSite = site;
      }
    }
    return sl;
  };
  
  this.sortedSet = function(sl) {
    return this.list2set(this.sort(sl));
  }
  
  this.splitString = function(s) {
    return s && /\S/.test(s) && s.split(/\s+/) || [];
  };
  
  this.domainMatch = function(url) {
     const m = url.match(this.domainPattern);
     return m ? m[0].toLowerCase() : "";
  };
  
  this.sanitizeList = function(sl) {
    for (var j = sl.length; j-- > 0; ) {
      sl[j] = this.getSite(sl[j]);
    }
    return sl;
  };
  
  this.sanitizeMap = function(sm) {
    var site;
    delete sm[""];
    for (var url in sm) {
      site = this.getSite(url);
      if (site != url) {
        if (site) sm[site] = sm[url];
        delete sm[url];
      }
    }
    return sm;
  };
  
  this.sanitizeString = function(s) {
    return this.set2string(this.string2set(s)); 
  };
  
  this.string2set = function(s) {
    return this.sortedSet(this.sanitizeList(this.splitString(s)));
  };
  
  this.set2string = function(ss) {
    return ss.join(" ");
  };
  
  this.crop = function(url, width, max) {
    width = width || 100;
    if (url.length < width) return url;
    
    max = max || 2000;
    if (max > width && url.length > max) {
        return this.crop(url.substring(0, max / 2)) + "\n[...]\n" + 
          this.crop(url.substring(url.length - max / 2));
    }
    
    var parts = [];
   
    while (url.length > width) {
      parts.push(url.substring(0, width));
      url = url.substring(width);
    }
    parts.push(url);
    return parts.join("\n");
  };
}

function PolicySites(sitesString) {
  if (sitesString) this.sitesString = sitesString;
}
PolicySites.prototype = {
  clone: function() {
    return new PolicySites(this.sitesString);
  }
,
  equals: function(other) {
    return other && (this.sitesString == other.sitesString);
  }
,
  _sitesString: "",
  get sitesString() {
    return this._sitesString;
  },
  set sitesString(s) {
    s = SiteUtils.sanitizeString(s);
    if (s != this._sitesString) {
      this._sitesString = s;
      this._sitesMap = null;
      this._sitesList = null;
    }
    return s;
  }
,
  _sitesList: null,
  get sitesList() {
    return this._sitesList ? this._sitesList : this._sitesList = SiteUtils.splitString(this.sitesString);
  },
  set sitesList(sl) {
    this.sitesString = SiteUtils.set2string(SiteUtils.sortedSet(SiteUtils.sanitizeList(sl)));
    return this.sitesList;
  }
,
  _sitesMap: null,
  get sitesMap() {
    if (!this._sitesMap) {
      const sm = {__proto__: null};
      const sl = SiteUtils.splitString(this.sitesString);
      if (sl) {
        for (var j = sl.length; j-- > 0;) {
          sm[sl[j]] = true;
        }
      }
      this._sitesMap = sm;
    }
    return this._sitesMap;
  },
  set sitesMap(sm) {
    sm = sm ? SiteUtils.sanitizeMap(sm) : {__proto__: null};
    var sl = [];
    for (var s in sm) {
      sl.push(s);
    }
    
    this._sitesString = SiteUtils.set2string(SiteUtils.sort(sl));
    this._sitesList = null;
    return this._sitesMap = sm;
  }
,
  fromPref: function(pref, name) {
    if (!this.settingPref) {
      try {
        this.sitesString = pref.getCharPref(name || "sites")
          .replace(/[^\u0000-\u007f]+/g, function($0) { return decodeURIComponent(escape($0)) });
      } catch(e) {
        this.siteString = "";
        return false;
      }
    }
    return true;
  }
,
  settingPref: false,
  toPref: function(pref, name) {
    if (!name) name = "sites";
    if (pref.prefIsLocked(name)) {
      this.fromPref(pref);
      return;
    }
    var change;
    var s = this.sitesString.replace(/[^\u0000-\u007f]+/g,function($0) { return unescape(encodeURIComponent($0)) });
    try {
      change = s != pref.getCharPref(name);
    } catch(ex) {
      change = true;
    }
    
    if (change) {
      this.settingPref = true;
      try {
        pref.setCharPref(name, s);
      } finally {
        this.settingPref = false;
      }
    }
  }
,
  // returns the shortest match for a site, or "" if no match is found
  matches: function(site) {
    if (!site) return "";
    const sm = this.sitesMap;
    var match;
    var dots; // track "dots" for fix to 2nd level domain policy lookup flaw 
    var pos = site.indexOf(':') + 1;
    if (pos > 0 && (pos == site.length || site[pos] == '/')) {
      if (sm[match = site.substring(0, pos)]) return match; // scheme match
      if (++pos >= site.length || site[pos] != '/') return "";
      match = site.substring(pos + 1);
      dots = 0;
    } else {
      match = site;
      dots = 1;
    }

    var submatch;
    for (pos = match.lastIndexOf('.'); pos > 0; dots++) {
      pos = match.lastIndexOf('.', pos - 1);
      if ((dots || pos > -1) && sm[submatch = match.substring(pos + 1)]) {
        return submatch; // domain/subdomain match
      }
    }
    
    if (sm[match]
        && (dots > 1 || sm[site]) // strict CAPS-style matching
        ) return match; // host match
    return sm[site] ? site : ""; // full match
  }
,


  _remove: function(site) {
    const sm = this.sitesMap;
    delete sm[site];
    if (site.indexOf(":") < 0 && site.indexOf(".") == site.lastIndexOf(".")) {
      // base domain hack
      delete sm["http://" + site];
      delete sm["https://" + site];
      delete sm["file://" + site];
      delete sm["ftp://" + site];
    }
  },
  remove: function(sites, keepUp, keepDown) {
    if (!sites) return false;
    if (!(typeof(sites) == "object" && "push" in sites)) 
      return this.remove([sites], keepUp, keepDown);
    keepUp = keepUp || false;
    keepDown = keepDown || false;
    
    const sm = this.sitesMap;
    var change = false;
    var site, match;
    var tmp = keepDown ? null : new PolicySites();
    for (var j = sites.length; j-- > 0;) {
      site = sites[j];
      if (site[site.length - 1] != ":") { // not a scheme only site
        if (!keepUp) {
          while ((match = this.matches(site)) && site != match) { // remove ancestors
            this._remove(match);
            change = true;
          }
        }
        if (!keepDown) {
          tmp.sitesString = site;
          for (match in sm) { // remove descendants
            if (tmp.matches(match)) {
              if (site != match) delete sm[match];
              change = true;
            }
          }
          this._remove(site);
        }
      }
    
      if (site in sm) {
        this._remove(site);
        change = true;
      }
    }
    if (change) this.sitesMap = this._sitesMap;
    return change;
  },
  
  _add: function(site) {
    return (site in this.sitesMap ? false : this.sitesMap[site] = true);
  },
  
  add: function(sites) {
    if (!sites) return false;
    if (!(typeof(sites) == "object" && "push" in sites)) 
      return this.add([sites]);
    
    var change = false;
    var site;
    for (var j = sites.length; j-- > 0;) {
      site = sites[j];
      if (site.indexOf(":") < 0 && site.indexOf(".") == site.lastIndexOf(".")) {
        // base domain hack
        if(this._add("http://" + site)) change = true;
        if(this._add("https://" + site)) change = true;
      }
      if (this._add(site)) change = true;
    }
    if (change) this.sitesMap = this._sitesMap;
    return change;
  }
};
