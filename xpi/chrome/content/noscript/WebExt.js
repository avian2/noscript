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

    embeddedWebExtension.startup().then(({browser}) => {
      ns.dump(`${addonId} - embedded webext started`);
      browser.runtime.onMessage.addListener(msg => {
        ns.dump(`${addonId} - received message from embedded webext ${msg}`);
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
