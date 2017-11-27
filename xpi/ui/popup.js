'use strict';

addEventListener("unload", e => {
  if (!UI.initialized) {
    browser.runtime.sendMessage({type: "openStandalonePopup"});
  }
});
(async () => {
  try {
    let tabId;
    let isBrowserAction = true;
    let tab = (await browser.tabs.query({
      windowId: (await browser.windows.getLastFocused({windowTypes: ["normal"]})).id,
      active: true
    }))[0];

    if (!tab || tab.id === -1) {
      log("No tab found to open the UI for");
      close();
    }
    if (tab.url === document.URL) {
      isBrowserAction = false;
      try {
        tabId = parseInt(new URL(document.URL).searchParams.get("tabId"))
      } catch (e) {
        close();
      }
      addEventListener("blur", close);
    } else tabId = tab.id;

    await UI.init(tabId);
    debug("tabId: %s - %o", tabId, UI);
    if (!UI.seen) {
      browser.runtime.openOptionsPage();
      close();
      return;
    }

    let justDomains = false; // true;
    let sitesUI = new UI.Sites();
    let pendingReload = false;
    sitesUI.onChange = () => { pendingReload = true };
    initSitesUI();
    UI.onSettings = initSitesUI;

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

    function initSitesUI() {
      pendingReload = false;
      let {typesMap} = sitesUI;
      typesMap.clear();
      let policySites = UI.policy.sites;
      let domains = new Map();
      function urlToLabel(url) {
        let {origin} = url;
        let match = policySites.match(origin);
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

      let sitesSet  = new Set(
        seen.map(thing => Object.assign({
          type: thing.policyType
        }, Sites.parse(thing.request.url)))
        .filter(parsed => parsed.url && parsed.url.origin !== "null")
        .map(parsed => urlToLabel(parsed.url))
      );
      if (!justDomains) {
        for (let domain of domains.values()) sitesSet.add(domain);
      }
      let sites = [...sitesSet];
      for (let thing of seen) {
        let url = thing.request.url;
        sites.filter(s => url === s || url.startsWith(`${s}/`)).forEach(m => {
          let siteTypes = typesMap.get(m);
          if (!siteTypes) typesMap.set(m, siteTypes = new Set());
          siteTypes.add(thing.policyType);
        });
      }

      sitesUI.mainUrl = new URL(seen.find(thing => thing.request.type === "main_frame").request.url)
      sitesUI.mainSite = urlToLabel(sitesUI.mainUrl);
      sitesUI.mainDomain = tld.getDomain(sitesUI.mainUrl.hostname);

      sitesUI.render(document.getElementById("sites"), sites);
    }

    function reload() {
      sitesUI.clear();
      browser.tabs.reload(tabId);
      pendingReload = false;
    }

    function close() {
      if (isBrowserAction) {
        window.close();
      } else {
        browser.windows.remove(tab.windowId);
      }
    }

    let {onCompleted} = browser.webNavigation;

    let loadSnapshot = sitesUI.snapshot;
    let onCompletedListener = navigated => {
      if (navigated.tabId === tabId) {
        UI.pullSettings();
      }
    };
    onCompleted.addListener(onCompletedListener, {url: [{hostContains: sitesUI.mainDomain}]});
    addEventListener("beforeunload", e => {
      onCompleted.removeListener(onCompletedListener);
      if (pendingReload) {
         UI.updateSettings({
          policy: UI.policy, reloadAffected: true,
        });
      }
    }, true);
  } catch (e) {
    error(e, "Can't open popup");
    close();
  }



})();
