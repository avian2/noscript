var EXPORTED_SYMBOLS = ["FrameScript"];

const Cu = Components.utils;

Cu.import("chrome://noscript/content/PasteHandler.jsm");
Cu.import("chrome://noscript/content/UISync.jsm");

function FrameScript(ctx) {
  Object.defineProperty(ctx, "ns", {
    get: function() {
      try {
        let ns = Components.classes["@maone.net/noscript-service;1"].getService().wrappedJSObject;
        delete this.ns;
        return (this.ns = ns);
      } catch(e) {
        Cu.reportError(e);
        return null;
      }
    },
    configurable: true,
    enumerable: true
  });

  this.ctx = ctx;
  new PasteHandler(ctx);
  ctx.uiSync = new UISync(ctx);
}

FrameScript.prototype = {

}
