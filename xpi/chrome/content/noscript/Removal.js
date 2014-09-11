var Removal = {
  init: function() {
    try {
      Cu.import("resource://gre/modules/AddonManager.jsm");
      AddonManager.addAddonListener(this);
    } catch (e) {}
  },
  
  onUninstalling: function(addon, needsRestart) {
    this.prompt(addon, true);
  },
  onDisabling: function(addon, needsRestart) {
    this.prompt(addon, false);
  },
  
  prompt: function(addon, uninstalling) {
    if (addon.id === EXTENSION_ID && !ns.jsEnabled && ns.getPref("removalWarning", true)) {
      let alwaysAsk = { value: true };
      try {
        let p = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
        switch (p.confirmEx(
          DOM.mostRecentBrowserWindow, // in nsIDOMWindow  aParent,
          ns.getString("removal.title"), // in wstring aDialogTitle,
          ns.getString("removal.message"),           // in wstring aText,
          p.BUTTON_POS_0 * p.BUTTON_TITLE_IS_STRING +
          p.BUTTON_POS_1 * p.BUTTON_TITLE_CANCEL +
          p.BUTTON_POS_2 * p.BUTTON_TITLE_IS_STRING, // in unsigned long aButtonFlags,
          ns.getString("removal.yes"), // in wstring aButton0Title,
          null, // in wstring aButton1Title,
          ns.getString("removal.no"), // in wstring aButton2Title,
          ns.getString("alwaysAsk"), // in wstring aCheckMsg,
          alwaysAsk // inout boolean aCheckState
        )) {
          case 0: return; // YES, remove!
          case 2: // NO (globally allow instead)
            ns.jsEnabled = true;
            ns.savePrefs();
            ns.reloadWhereNeeded();
            break;
          default: // CANCEL
            alwaysAsk.value = true;
        }
        addon.userDisabled = false;
        if (("cancelUninstall" in addon)) {
          addon.cancelUninstall();
        } else if (uninstalling) {
          ns.log("Unexpected: uninstalling but no cancel method?");
        }
      } catch (e) {
        Cu.reportError(e);
      } finally {
        if (!alwaysAsk.value) {
          ns.setPref("removalWarning", false);
        }
      }
    }
  }
}

Removal.init();
