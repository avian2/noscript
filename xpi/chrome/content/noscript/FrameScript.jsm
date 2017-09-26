'use strict';

var EXPORTED_SYMBOLS = ["FrameScript"];

const { utils: Cu, interfaces: Ci, classes: Cc } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const SERVICE_READY = "NoScript:ServiceReady";

Cu.import("chrome://noscript/content/importer.jsm");
let IMPORT = IMPORT_FOR(this);
IMPORT("PasteHandler");
IMPORT("UISync");

function FrameScript(ctx) {
  Object.defineProperty(ctx, "ns", {
    get: function() {
      try {
        const CTRID  = "@maone.net/noscript-service;1";
        if (CTRID in Cc) {
          let ns = Cc[CTRID].getService().wrappedJSObject;
          delete this.ns;
          return (this.ns = ns);
        }
      } catch(e) {
        Cu.reportError(e);
      }
      return null;
    },
    configurable: true,
    enumerable: true
  });

  this.ctx = ctx;

  if (ctx.ns) {
    this.init();
  } else {
    Services.obs.addObserver(this, SERVICE_READY, true);
  }
}

FrameScript.prototype = {
  QueryInterface: XPCOMUtils.generateQI(
    [Ci.nsIObserver, Ci.nsISupportsWeakReference]),
  init() {
    let ctx = this.ctx;
    new PasteHandler(ctx);
    ctx.uiSync = new UISync(ctx);
    ctx.ns.dump(`Framescript initialized in ${ctx.content.location.href}`);
  },
  observe(subj, topic, data) {
    this.init();
    Services.obs.removeObserver(this, SERVICE_READY);
  }
};
