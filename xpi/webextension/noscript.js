"use strict";

{
  let policy = null;

  var ns = {
    running: false,

    start(settings = null) {
      if (this.running) return;
      this.running = true;
      if (settings) policy = new Policy(settings);
      this.notify("STARTED");
    },

    stop() {
      if (!this.running) return;
      this.running= false;
      WebRequest.stop();
      this.notify("STOPPED");
    },

    async retrievePolicy() {
      return this.policy || (this.policy = new Policy(await browser.storage.get("policy")));
    },

    isJSEnabled(urlString) {
      return this.retrievePolicy().isAllowed(urlString, "script");
    },

    notify(msg) {
      if (window.legacyPort) {
        browser.runtime.sendMessage(msg);
      }
    },

    log(msg) {
      console.log(msg);
    },
  };
}

if (window.legacyPort) {
  ns.log("HYBRID WebExtension");
  ns.notify("READY");
} else {
  ns.log("PURE WebExtension");
  browser.storage.local.get(null, items => console.log(`NoScript imported preferences: ${JSON.stringify(items)}`));
  ns.start();
}
ns.log("NoScript WebExt Ready");

