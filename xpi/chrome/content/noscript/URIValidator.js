const URIValidator = {
  
  QueryInterface: xpcom_generateQI([CI.nsIObserver, CI.nsISupportsWeakReference]),
  
  // returns false if absolute URI is not valid, undefined if it cannot be validated (i.e. no validator is found for this scheme) 
  validate: function(uriSpec) {
    if (!uriSpec) return false;
    var parts = uriSpec.split(":");
    if (parts.length < 2) return false;
    var scheme = parts.shift().toLowerCase();
    if (!scheme) return false;
    var validator = this.validators[scheme];
    try {
      // using unescape rather than decodeURI for a reason:
      // many external URL (e.g. mailto) default to ISO8859, and we would fail,
      // but on the other hand rules marking as invalid non-null high unicode chars are unlikely (let's hope it) 
      return validator && validator.test(unescape(parts.join(":"))); 
    } catch(e) {
      return false;
    }
  },
  
  get validators() {
    delete this.validators;
    this._init();
    return this.validators;
  },
  
  prefs: null,
  _init: function() {
    this.validators = {};
    this.prefs = CC["@mozilla.org/preferences-service;1"].getService(CI.nsIPrefService)
      .getBranch("noscript.urivalid.").QueryInterface(CI.nsIPrefBranch2);
    for each(var key in this.prefs.getChildList("", {})) {
      this.parseValidator(key);
    }
    this.prefs.addObserver("", this, true);
  },
  parseValidator: function(key) {
    try {
      this.validators[key] = new RegExp("^" + this.prefs.getCharPref(key) + "$");
    } catch(e) {
      delete this.validators[key];
    }
  },
  observe: function(prefs, topic, key) {
    this.parseValidator(key);
  }
};