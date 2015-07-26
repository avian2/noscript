Components.utils.import("resource://gre/modules/Services.jsm");
let console = Services.console;

let scope = {
  log: function(msg) {
    console.logStringMessage(msg);
  }
}
if (Services.appinfo.processType == Services.appinfo.PROCESS_TYPE_CONTENT) {
  Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
    .getService(Components.interfaces.mozIJSSubScriptLoader)
    .loadSubScript("chrome://noscript/content/childScript.js", scope);

} else {
  // nothing to do exclusively in the parent process yet...
}
