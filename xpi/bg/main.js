 var ns = (() => {
  'use strict';

  async function safeSyncGet(keys) {
    try {
      return await browser.storage.sync.get(keys);
    } catch (e) {
      debug(e, "Sync disabled? Falling back to local storage");
    }
    return await browser.storage.local.get(keys);
  }
  async function safeSyncSet(obj) {
    try {
      return await browser.storage.sync.set(obj);
    } catch (e) {
      debug(e, "Sync disabled? Falling back to local storage");
    }
    return await browser.storage.local.set(obj);
  }

  async function init() {
    let policyData = (await safeSyncGet("policy")).policy;
    if (policyData && policyData.DEFAULT) {
      ns.policy = new Policy(policyData);
    } else {
      await include("/legacy/Legacy.js");
      ns.policy = await Legacy.createOrMigratePolicy();
      ns.savePolicy();
    }

    await include("/bg/defaults.js");
    await ns.local;
    await include("/bg/RequestGuard.js");
    await RequestGuard.start();
    if (ns.sync.xss) await XSS.init();
    Commands.install();
  };

  var Commands = {
    async openPageUI() {
      let win = await browser.windows.getCurrent();
      if (win.type === "normal") {
        browser.browserAction.openPopup();
        return;
      }
      browser.windows.create({
        url: await browser.browserAction.getPopup({}),
          width: 800, height: 600, type: "panel"
      });
    },

    togglePermissions() {
    },
    install() {
      browser.commands.onCommand.addListener(cmd => {
        if (cmd in Commands) {
          Commands[cmd]();
        }
      });
    }
  }

  var MessageHandler = {
    responders: {

      async updateSettings(settings, sender) {
        let {policy, xssWhitelist} = settings;
        if (xssWhitelist) await XSS.Exceptions.setXssWhitelist(policy.XSSWhitelist);
        if (policy) {
          ns.policy = new Policy(policy);
          await ns.savePolicy();
          if (settings.reloadAffected) {
            browser.tabs.reload(settings.tabId);
          }
        }
        let oldDebug = ns.local.debug;
        for (let storage of ["local", "sync"]) {
          if (settings[storage]) {
            await ns.save(ns[storage] = setting[storage]);
          }
        }
        if (ns.local.debug !== oldDebug) {
          await include("/lib/log.js");
          if (oldDebug) debug = () => {};
        }
        if (ns.sync.xss) {
          XSS.init();
        } else {
          XSS.dispose();
        }
      },
      async broadcastSettings({tabId = -1}) {
        let policy = ns.policy.dry(true);
        let seen = tabId !== -1 ? await ns.collectSeen(tabId) : null;
        let xssWhitelist = await XSS.Exceptions.getWhitelist();
        browser.runtime.sendMessage({type: "settings",
          policy,
          seen,
          xssWhitelist,
          local: ns.local,
          sync: ns.sync,
        });
      },

      async openStandalonePopup() {
        let win = await browser.windows.getLastFocused({windowTypes: ["normal"]});
        let tab = (await browser.tabs.query({
          windowId: win.id,
          active: true
        }))[0];

        if (!tab || tab.id === -1) {
          log("No tab found to open the UI for");
          return;
        }
        browser.windows.create({
          url: await browser.browserAction.getPopup({}) + "?tabId=" + tab.id,
          width: 800, height: 600,
          top: win.top + 48, left: win.left + 48,
          type: "panel"});
      }
    },
    onMessage(m, sender, sendResponse) {
      let {type} = m;
      let {responders} = MessageHandler;


      if (type && (type = type.replace(/^NoScript\./, '')) in responders) {
        return responders[type](m, sender);
      } else {
        debug("Received unkown message", m, sender);
      }
      return false;
    },

    listen() {
      browser.runtime.onMessage.addListener(this.onMessage);
    },
  }



  return {
    running: false,
    policy: null,
    local: null,
    sync: null,

    async start() {
      if (this.running) return;
      this.running = true;

      let initializing = init();
      let wr = browser.webRequest;
      let waitForPolicy = async r => {
        try {
          await initializing;
        } catch (e) {
          error(e);
        }
      }
      wr.onBeforeRequest.addListener(waitForPolicy,
        {urls: ["<all_urls>"]},
        ["blocking"]
      );
      await initializing;
      wr.onBeforeRequest.removeListener(waitForPolicy);

      MessageHandler.listen();

      log("STARTED");

      this.devMode = (await browser.management.getSelf()).installType === "development";
      if (this.local.debug) {
        if (this.devMode) {
          include("/test/run.js");
        }
      } else {
        debug = () => {}; // suppress verbosity
      }
    },

    stop() {
      if (!this.running) return;
      this.running = false;
      RequestGuard.stop();
      log("STOPPED");
    },

    async savePolicy() {
      if (this.policy) {
        await safeSyncSet({policy: this.policy.dry()});
        await browser.webRequest.handlerBehaviorChanged()
      }
      return this.policy;
    },



    async save(obj) {
      if (obj && obj.storage) {
        let toBeSaved = {[obj.storage]: obj};
        if (obj.storage === "sync") {
          await safeSyncSet(toBeSaved);
        } else {
          await browser.storage.local.set(toBeSaved);
        }
      }
      return obj;
    },

    async collectSeen(tabId) {

      try {
        let seen = Array.from(await browser.tabs.sendMessage(tabId, {type: "collect"}, {frameId: 0}));
        debug("Collected seen", seen);
        return seen;
      } catch (e) {
        // probably a page where content scripts cannot run, let's open the options instead
        error(e, "Cannot collect noscript activity data");
      }

      return null;
    },
  };
})();

ns.start();
