function getNoscriptService() {
  var ns=null;
  for(var attempt=1; attempt<=2;attempt++) {
    try {
     ns=Components.classes["@maone.net/noscript-service;1"
        ].getService(Components.interfaces.nsISupports).wrappedJSObject;
     break;
    } catch(ex) {
      dump(ex.message);
      window.navigator.plugins.refresh();
    }
  }
  if(ns!=null) ns.init();
  return ns;
}
