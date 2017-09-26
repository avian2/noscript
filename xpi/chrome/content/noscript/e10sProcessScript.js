Components.utils.import("resource://gre/modules/Services.jsm");

if (Services.appinfo.processType == Services.appinfo.PROCESS_TYPE_CONTENT) {
  Components.utils.import(`chrome://noscript/content/importer.jsm`);
  Services.scriptloader.loadSubScript(NO_CACHE(`e10sChild.js`), {});
} else {
  // nothing to do exclusively in the parent process yet...
}
