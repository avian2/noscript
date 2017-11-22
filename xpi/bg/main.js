 var ns = (() => {
  'use strict';

  async function init() {
    let policyData = (await browser.storage.sync.get("policy")).policy;
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
    await XSS.init();
  };


  var MessageHandler = {
    responders: {
      async fetchPolicy() {
        return ns.policy.dry(true);
      },
      async updateSettings(settings) {
        let {policy, xssWhitelist} = settings;
        if (xssWhitelist) await XSS.Exceptions.setXssWhitelist(policy.XSSWhitelist);
        if (policy) {
          ns.policy = new Policy(policy);
          await ns.savePolicy();
        }
        let oldDebug = ns.local.debug;
        for (let storage of ["local", "sync"]) {
          if (settings[storage]) {
            ns.save(ns[storage] = setting[storage])
          }
        }
        if (ns.local.debug !== oldDebug) {
          await include("/lib/log.js");
          if (oldDebug) debug = () => {};
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
        await browser.storage.sync.set({policy: this.policy.dry()});
        await browser.webRequest.handlerBehaviorChanged()
      }
      return this.policy;
    },



    async save(obj) {
      if (obj && obj.storage) {
        await browser.storage[obj.storage].set({[obj.storage]: obj});
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
      }

      return null;
    },
  };
})();

ns.start();
