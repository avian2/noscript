{
  let legacyPort = browser.runtime.connect({name: "legacy"});
  if (legacyPort) legacyPort.onMessage.addListener(msg => {
    switch(msg.type) {

      case "start":
        ns.start(msg.data);
      break;

      case "stop":
        ns.stop();
      break;

      case "saveData":
        browser.storage.local.set(msg.data);
      break;

      case "dumpData":
        browser.storage.local.get(null, items => console.log(items));
      break;
    }
  });
}
