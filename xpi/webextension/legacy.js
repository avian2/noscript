var legacyPort;
try {
  let oldBackupCleared = false;
  legacyPort = browser.runtime.connect({name: "legacy"});
  legacyPort.onMessage.addListener(msg => {
    switch(msg.type) {
      case "saveData":
        let backup = msg.data;
        browser.storage.local.set({legacyBackup: backup}).then(() => {
          console.log("NoScript preferences backup on the WebExtension side");
          if (!oldBackupCleared) {
            oldBackupCleared = true;
            browser.storage.local.remove(Object.keys(backup)).then(() => {
              console.log("Old format backup (pre-5.1) cleared");
            }, (e) => {
              console.error(e);
            });

          }
        }, (e) => {
          console.error("NoScript failed to back up non-default preference in WebExtension! %o", e);
        });
        
      break;

      case "dumpData":
        browser.storage.local.get(null, items => console.log(JSON.stringify(items)));
      break;
    }
  });
  browser.runtime.sendMessage("Hybrid WebExtension NoScript Ready");
} catch(e) {
  legacyPort = null;
  console.error(e);
}

