var WebExt = {
  enabled: false,
  started: false,
  running: false,
  port: null,
  saveData(json = ns.conf2JSON()) {
    this.tell("saveData", json);
  },
  start(policy = null) {
    this.tell("start", policy);
  },
  stop() {
    this.tell("stop");
  },
  tell(type, data) {
    if (this.port) {
      this.port.postMessage({ type, data });
    }
  }
};

try {

  const addonId = EXTENSION_ID;
  const {
    AddonManager,
  } = Components.utils.import("resource://gre/modules/AddonManager.jsm", {});

  AddonManager.getAddonByID(addonId, addon => {
    const baseURI = addon.getResourceURI("/");
    try {
      const {
        LegacyExtensionsUtils,
      } = Components.utils.import("resource://gre/modules/LegacyExtensionsUtils.jsm");
    } catch (e) {
      return; // Hybrid WebExtensions not supported here
    }
    const embeddedWebExtension = LegacyExtensionsUtils.getEmbeddedExtensionFor({
      id: addonId, resourceURI: baseURI,
    });
    WebExt.enabled = true;
    embeddedWebExtension.startup().then(({browser}) => {
      WebExt.started = true;
      ns.dump(`${addonId} - embedded webext started`);
      browser.runtime.onMessage.addListener(msg => {
        switch(msg) {
          case "STARTED":
            WebExt.running = true;
            break;
          case "STOPPED":
            WebExt.running = false;
            break;
        }
        ns.dump(`${addonId} - received message from embedded webext ${msg}`);
      });
      browser.runtime.onConnect.addListener(port => {
        ns.dump(`${addonId} - webext connected`);
        WebExt.port = port;
        WebExt.saveData();
        WebExt.stop();
      });
    }).catch(err => {
      Components.utils.reportError(
        `${addonId} - embedded webext startup failed: ${err.message} ${err.stack}\n`
      );
    });
  });
} catch (e) {
  Cu.reportError(e);
}
