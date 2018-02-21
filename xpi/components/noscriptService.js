Components.utils.import("resource://gre/modules/Services.jsm");
Services.scriptloader.loadSubScript("chrome://noscript/content/loader.js", this);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

INCLUDE("Main");

Main.bootstrap();

function NSGetFactory(cid) {
  if (cid.toString() === SERVICE_ID) {
    return ns;
  }
  throw Cr.NS_ERROR_FACTORY_NOT_REGISTERED;
}
