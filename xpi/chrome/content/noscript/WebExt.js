var WebExt = {
  enabled: false,
  started: false,
  running: false,
  port: null,
};

try {

  const addonId = EXTENSION_ID;
  const {
    AddonManager,
  } = Components.utils.import("resource://gre/modules/AddonManager.jsm", {});

  AddonManager.getAddonByID(addonId, addon => {
    const baseURI = addon.getResourceURI("/");
    const {
      LegacyExtensionsUtils,
    } = Components.utils.import("resource://gre/modules/LegacyExtensionsUtils.jsm");

    const embeddedWebExtension = LegacyExtensionsUtils.getEmbeddedExtensionFor({
      id: addonId, resourceURI: baseURI,
    });
    WebExt.enabled = true;
    embeddedWebExtension.startup().then(({browser}) => {
      WebExt.started = true;
      ns.dump(`${addonId} - embedded webext started`);
      browser.runtime.onMessage.addListener(msg => {
        WebExt.running = true;
        ns.dump(`${addonId} - received message from embedded webext ${msg}`);
      });
      browser.runtime.onConnect.addListener(port => {
        ns.dump(`${addonId} - webext connected`);
        WebExt.port = port;
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
