"use strict";

{
  let policy = null;

  var ns = {
    running: false,

    start(settings = null) {
      if (this.running) return;
      this.running = true;
      if (settings) policy = new Policy(settings);

      browser.runtime.sendMessage("STARTED");
    },

    stop() {
      if (!this.running) return;
      this.running= false;
      WebRequest.stop();
      browser.runtime.sendMessage("STOPPED");
    },

    async retrievePolicy() {
      return this.policy || (this.policy = new Policy(await browser.storage.get("policy")));
    },

    isJSEnabled(urlString) {
      return this.retrievePolicy().isAllowed(urlString, "script");
    },

  };
}

ns.start();
browser.runtime.sendMessage("READY");
console.log("NoScript WebExt Ready");

