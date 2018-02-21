'use strict';

var EXPORTED_SYMBOLS = ["FrameScript"];

const { utils: Cu, interfaces: Ci, classes: Cc } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const SERVICE_READY = "NoScript.ServiceReady";
const SERVICE_DISPOSE = "NoScript.Dispose";

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
    if (this.uiSync) return;
   
    let ctx = this.ctx;
    this.pasteHandler = new PasteHandler(ctx);
    this.uiSync = new UISync(ctx);
    ctx.addMessageListener("NoScript:unload", this);
    Services.obs.addObserver(this, SERVICE_DISPOSE, true);
    let ns = ctx.ns;
    if (ns.consoleDump && ctx.content && ctx.content.location)
      ns.dump(`Framescript initialized in ${ctx.content.location.href}`);
  },
  observe(subj, topic, data) {
    switch(topic) {
      case SERVICE_READY:
        this.init();
        break;
      case SERVICE_DISPOSE:
        this.dispose();
        break;
    }
  },
  receiveMessage(m) {
    if (m.name === "NoScript:unload") {
      this.dispose();
    }
  },
  dispose() {
    if (!this.uiSync) return;
    this.pasteHandler.dispose();
    this.uiSync.unwire();
    this.uiSync = this.pasteHandler = null;
    let ctx = this.ctx;
    let ns = ctx.ns;
    if (ns.consoleDump && ctx.content && ctx.content.location)
      this.ctx.ns.dump(`Framescript disposed in ${this.ctx.content.location.href}`);
  }
};
