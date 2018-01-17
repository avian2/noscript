 var ns = (() => {
   'use strict';

   const popupURL = browser.extension.getURL("/ui/popup.html");
   let popupFor = tabId => `${popupURL}#tab${tabId}`;

   async function init() {
     let policyData = (await Storage.get("sync", "policy")).policy;
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
     await XSS.start(); // we must start it anyway to initialize sub-objects
     if (!ns.sync.xss) {
       XSS.stop();
     }
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
         url: popupURL,
         width: 800,
         height: 600,
         type: "panel"
       });
     },

     togglePermissions() {},
     install() {


       if ("command" in browser) {
         // keyboard shortcuts
         browser.commands.onCommand.addListener(cmd => {
           if (cmd in Commands) {
             Commands[cmd]();
           }
         });
       }

       // wiring main UI
       let ba = browser.browserAction;
       if ("setIcon" in ba) {
        //desktop
         ba.setPopup({popup: popupURL});
       } else {
         // mobile
         ba.onClicked.addListener(async tab => {
           try {
             await browser.tabs.remove(await browser.tabs.query({url: popupURL}));
           } catch (e) {
           }
           await browser.tabs.create({url: popupFor(tab.id)});
         });
       }
     }
   }

   var MessageHandler = {
     responders: {

       async updateSettings(settings, sender) {
         Settings.update(settings);
       },
       async broadcastSettings({
         tabId = -1
       }) {
         let policy = ns.policy.dry(true);
         let seen = tabId !== -1 ? await ns.collectSeen(tabId) : null;
         let xssUserChoices = await XSS.getUserChoices();
         browser.runtime.sendMessage({
           type: "settings",
           policy,
           seen,
           xssUserChoices,
           local: ns.local,
           sync: ns.sync,
         });
       },

       exportSettings(m, sender, sendResponse) {
         sendResponse(Settings.export());
         return false;
       },

       async importSettings({data}) {
         return await Settings.import(data);
       },

       async openStandalonePopup() {
         let win = await browser.windows.getLastFocused({
           windowTypes: ["normal"]
         });
         let [tab] = (await browser.tabs.query({
           lastFocusedWindow: true,
           active: true
         }));

         if (!tab || tab.id === -1) {
           log("No tab found to open the UI for");
           return;
         }
         browser.windows.create({
           url: popupFor(tab.id),
           width: 800,
           height: 600,
           top: win.top + 48,
           left: win.left + 48,
           type: "panel"
         });
       }
     },
      onMessage(m, sender, sendResponse) {
       let {
         type
       } = m;
       let {
         responders
       } = MessageHandler;


       if (type && (type = type.replace(/^NoScript\./, '')) in responders) {
         return responders[type](m, sender, sendResponse);
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
       wr.onBeforeRequest.addListener(waitForPolicy, {
         urls: ["<all_urls>"]
       }, ["blocking"]);
       await initializing;
       wr.onBeforeRequest.removeListener(waitForPolicy);

       await include("/bg/Settings.js");
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
         await Storage.set("sync", {
           policy: this.policy.dry()
         });
         await browser.webRequest.handlerBehaviorChanged()
       }
       return this.policy;
     },



     async save(obj) {
       if (obj && obj.storage) {
         let toBeSaved = {
           [obj.storage]: obj
         };
         Storage.set(obj.storage, toBeSaved);
       }
       return obj;
     },

     async collectSeen(tabId) {

       try {
         let seen = Array.from(await browser.tabs.sendMessage(tabId, {
           type: "collect"
         }, {
           frameId: 0
         }));
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
