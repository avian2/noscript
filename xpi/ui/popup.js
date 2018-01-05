'use strict';

addEventListener("unload", e => {
  if (!UI.initialized) {
    browser.runtime.sendMessage({
      type: "openStandalonePopup"
    });
  }
});
(async () => {

  try {
    let tabId;
    let sitesUI;
    let pendingReload = false;
    let isBrowserAction = true;
    let tab = (await browser.tabs.query({
      windowId: browser.windows ?
        (await browser.windows.getLastFocused({windowTypes: ["normal"]})).id
        : null,
      active: true
    }))[0];

    if (!tab || tab.id === -1) {
      log("No tab found to open the UI for");
      close();
    }
    if (tab.url === document.URL) {
      isBrowserAction = false;
      try {
        tabId = parseInt(document.URL.match(/#.*\btab(\d+)/)[1]);
      } catch (e) {
        close();
      }
      addEventListener("blur", close);
    } else {
      tabId = tab.id;
    }

    await UI.init(tabId);

    let optionsButton = document.querySelector("#options");
    optionsButton.onclick = () => {
      browser.runtime.openOptionsPage();
      close();
    };

    let closeButton = document.querySelector("#close");
    closeButton.title = _("Close");
    closeButton.onclick = () => close();

    let reloadButton = document.querySelector("#reload");
    reloadButton.title = _("Reload");
    reloadButton.onclick = () => reload();

    let tempAllowPageButton = document.querySelector("#temp-allow-page");
    tempAllowPageButton.onclick = () => {
      sitesUI.tempAllowAll();
    }

    let revokeTempButton = document.querySelector("#revoke-temp");
    revokeTempButton.onclick = () => {
      sitesUI.revokeTemp();
      close();
    }

    let mainFrame = UI.seen && UI.seen.find(thing => thing.request.type === "main_frame");
    if (!mainFrame) {
      if (/^https?:/.test(tab.url) && !tab.url.startsWith("https://addons.mozilla.org/")) {
        document.body.classList.add("disabled");
        document.querySelector("#content").textContent = _("freshInstallReload");
        let buttons = document.querySelector("#buttons");
        let b = document.createElement("button");
        b.textContent = _("OK");
        b.onclick = reloadButton.onclick = () => {
          reload();
          close();
        }
        buttons.appendChild(b);
        b = document.createElement("button");
        b.textContent = _("Cancel");
        b.onclick = () => close();
        buttons.appendChild(b);
        return;
      }
      browser.runtime.openOptionsPage();
      close();
      return;
    }
    debug("Seen: %o", UI.seen);
    let justDomains = false; // true;

    sitesUI = new UI.Sites();

    sitesUI.onChange = () => {
      pendingReload = true
    };
    initSitesUI();
    UI.onSettings = initSitesUI;



    function initSitesUI() {
      pendingReload = false;
      let {
        typesMap
      } = sitesUI;
      typesMap.clear();
      let policySites = UI.policy.sites;
      let domains = new Map();

      function urlToLabel(url) {
        let {
          origin
        } = url;
        let match = policySites.match(url);
        if (match) return match;
        if (domains.has(origin)) {
          if (justDomains) return domains.get(origin);
        } else {
          let domain = tld.getDomain(url.hostname);
          domain = url.protocol === "https:" ? Sites.secureDomainKey(domain) : domain;
          domains.set(origin, domain);
          if (justDomains) return domain;
        }
        return origin;
      }
      let seen = UI.seen;
      let parsedSeen = seen.map(thing => Object.assign({
          type: thing.policyType
        }, Sites.parse(thing.request.url)))
        .filter(parsed => parsed.url && parsed.url.origin !== "null");

      let sitesSet = new Set(
        parsedSeen.map(parsed => parsed.label = urlToLabel(parsed.url))
      );
      if (!justDomains) {
        for (let domain of domains.values()) sitesSet.add(domain);
      }
      let sites = [...sitesSet];
      for (let parsed of parsedSeen) {
        sites.filter(s => parsed.label === s || domains.get(parsed.url.origin) === s).forEach(m => {
          let siteTypes = typesMap.get(m);
          if (!siteTypes) typesMap.set(m, siteTypes = new Set());
          siteTypes.add(parsed.type);
        });
      }

      sitesUI.mainUrl = new URL(mainFrame.request.url)
      sitesUI.mainSite = urlToLabel(sitesUI.mainUrl);
      sitesUI.mainDomain = tld.getDomain(sitesUI.mainUrl.hostname);

      sitesUI.render(document.getElementById("sites"), sites);
    }

    function reload() {
      if (sitesUI) sitesUI.clear();
      browser.tabs.reload(tabId);
      pendingReload = false;
    }

    function close() {
      if (isBrowserAction) {
        window.close();
      } else {
        //browser.windows.remove(tab.windowId);
        browser.tabs.remove(tab.id);
      }
    }

    let {
      onCompleted
    } = browser.webNavigation;

    let loadSnapshot = sitesUI.snapshot;
    let onCompletedListener = navigated => {
      if (navigated.tabId === tabId) {
        UI.pullSettings();
      }
    };
    onCompleted.addListener(onCompletedListener, {
      url: [{
        hostContains: sitesUI.mainDomain
      }]
    });
    addEventListener("unload", e => {
      onCompleted.removeListener(onCompletedListener);
      debug("pendingReload", pendingReload);
      if (pendingReload) {
        UI.updateSettings({
          policy: UI.policy,
          reloadAffected: true,
        });
      }
    }, true);
  } catch (e) {
    error(e, "Can't open popup");
    close();
  }



})();
