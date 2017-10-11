var WebExt = {
  enabled: false,
  started: false,
  running: false,
  port: null,
  saveData(json = ns.conf2JSON(true)) {
    this.tell("saveData", json);
  },
  start(policy = null) {
    this.tell("start", policy);
  },
  stop() {
    this.tell("stop");
  },
  tell(type, data) {
    if (this.port) try {
      this.port.postMessage({ type, data });
    } catch (e) {
      if (!/\bdead object\b/.test(e.message)) { // normal on uninstall
        Cu.reportError(e);
      }
    }
  },

  init(embeddedWebExtension) {
    WebExt.enabled = true;
    embeddedWebExtension.startup().then(({browser}) => {
      WebExt.started = true;
      ns.dump(`Embedded webext started`);
      browser.runtime.onMessage.addListener(msg => {
        switch(msg) {
          case "STARTED":
            WebExt.running = true;
            break;
          case "STOPPED":
            WebExt.running = false;
            break;
        }
        ns.dump(`Received message from embedded webext ${msg}`);
      });
      browser.runtime.onConnect.addListener(port => {
        ns.dump(`Webext connected`);
        WebExt.port = port;
        WebExt.saveData();
        WebExt.stop();
      });
    }).catch(err => {
      Components.utils.reportError(
        `Embedded webext startup failed: ${err.message} ${err.stack}\n`
      );
    });
  },
};
