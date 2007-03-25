function NoscriptUtil() {}

NoscriptUtil.prototype={
  chromeBase: "chrome://noscript/content/",
  chromeName: "noscript",
  _service: null, 
  get service() {
    if(this._service) return this._service;
    var s=null;
    for(var attempt=1; attempt<=2;attempt++) {
      try {
       s=Components.classes["@maone.net/noscript-service;1"
          ].getService(Components.interfaces.nsISupports).wrappedJSObject;
       break;
      } catch(ex) {
        dump(ex.message);
        window.navigator.plugins.refresh();
      }
    }
    if(s!=null) s.init();
    return this._service=s;
  }
,
  _strings: null,
  get strings() {
    return this._strings?this._strings
      :this._strings=document.getElementById(this.chromeName+"-strings");  
  }
,
  _stringsFB: null,
  get stringsFB() {
    return this._stringsFB?this._stringsFB
      :this._stringsFB=document.getElementById(this.chromeName+"-stringsFB");  
  }
,
  _stringFrom: function(bundle,key,parms) {
    try {
      return parms?bundle.getFormattedString(key,parms):bundle.getString(key);
    } catch(ex) {
      return null;
    }
  }
,
  getString: function(key,parms) {
    var s=this._stringFrom(this.strings,key,parms);
    return s?s:this._stringFrom(this.stringsFB,key,parms);
  }
,
  openOptionsDialog: function() {
    window.open(this.chromeBase+this.chromeName+"Options.xul",this.chromeName+"Options",
          "chrome,dialog,centerscreen,alwaysRaised");  
  }
,
  openAboutDialog: function() {
    window.open(this.chromeBase+"about.xul",this.chromeName+"About",
      "chrome,dialog,centerscreen");
  }
};

var noscriptUtil=new NoscriptUtil();
