var legacyPort;
try {
  legacyPort = browser.runtime.connect({name: "legacy"});
  legacyPort.onMessage.addListener(msg => {
    switch(msg.type) {

      case "start":
        ns.start(msg.data);
      break;

      case "stop":
        ns.stop();
      break;

      case "saveData":
        browser.storage.local.set(msg.data);
        console.log("NoScript preferences backed on the WebExtension side");
      break;

      case "dumpData":
        browser.storage.local.get(null, items => console.log(items));
      break;
    }
  });
} catch(e) {
  legacyPort = null;
}

