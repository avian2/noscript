function Strings(chromeName) {
  this.chromeName = chromeName;
}

Strings.wrap = function(s, count) s.replace(new RegExp("\\w{" + (parseInt(count) || 20) + "}", 'g'), "$&\u200B");

Strings.prototype = {
  bundles: {},
  getBundle: function(path) {
    if (path in this.bundles) return this.bundles[path];
    try {
      return this.bundles[path] = 
        Cc["@mozilla.org/intl/stringbundle;1"]
                  .getService(Ci.nsIStringBundleService)
                  .createBundle("chrome://" + this.chromeName +  "/" + path +
                                "/" + this.chromeName + ".properties");
    } catch(ex) {
      return this.bundles[path] = null;
    }
  },
  
 
  _stringFrom: function(bundle, name, parms) {
    try {
      return parms ? bundle.formatStringFromName(name, parms, parms.length) : bundle.GetStringFromName(name);
    } catch(ex) {
      return null;
    }
  }
,
  getString: function(name, parms) {
    var s = this._stringFrom(this.getBundle("locale"), name, parms);
    return s || name;
  }
}