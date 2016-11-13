Components.utils.import("resource://gre/modules/Services.jsm");
let console = Services.console;

let scope = {
  log: function(msg) {
    console.logStringMessage(msg);
  }
}
if (Services.appinfo.processType == Services.appinfo.PROCESS_TYPE_CONTENT) {
  Services.scriptloader.loadSubScript("chrome://noscript/content/e10sChild.js", scope);

} else {
  // nothing to do exclusively in the parent process yet...
}
