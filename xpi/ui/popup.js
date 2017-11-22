'use strict';
(async () => {
  try {
    let tabId = (await browser.tabs.query({
      currentWindow: true,
      active: true
    }))[0].id;
    await UI.init(tabId);
    let justDomains = true;

    let policy = UI.policy;
    let policySites = policy.sites;
    let sitesUI = new UI.Sites(policy);
    let seen = UI.seen;
    debug("Seen in popup", seen);
    if (!seen) {
      browser.runtime.openOptionsPage();
      window.close();
      return;
    }

    let optionsButton = document.querySelector("#options");
    optionsButton.onclick = () => {
      browser.runtime.openOptionsPage();
      this.close();
    };

    let closeButton = document.querySelector("#close");
    closeButton.title = _("Close");
    closeButton.onclick = () => this.close();

    let reloadButton = document.querySelector("#reload");
    reloadButton.title = _("Reload");
    reloadButton.onclick = () => reload();

    let tempAllowPageButton = document.querySelector("#temp-allow-page");
    tempAllowPageButton.onclick = () => {
      if (sitesUI.tempAllowAll()) {
        reload();
      }
    }

    let revokeTempButton = document.querySelector("#revoke-temp");
    revokeTempButton.onclick = () => {
      sitesUI.revokeTemp();
      window.close();
    }
    let {
      typesMap
    } = sitesUI;

    function urlToLabel(url) {
      let {origin} = url;
      let match = policySites.match(origin);
      if (match) return match;
      if (!justDomains) return origin;
      let domain = tld.getDomain(url.hostname);
      return url.protocol === "https:" ? Sites.secureDomainKey(domain) : domain;
    }

    let sites = [...new Set(
      seen.map(thing => Object.assign({
        type: thing.policyType
      }, Sites.parse(thing.request.url)))
      .filter(parsed => parsed.url && parsed.url.origin !== "null")
      .map(parsed => urlToLabel(parsed.url))
    )];
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

    sitesUI.onChange = () => {
      if (sitesUI.dirty) UI.updateSettings({
        policy
      });
    };

    function reload() {
      sitesUI.clear();
      browser.webNavigation.onCompleted.addListener(navigated => {
        if (navigated.tabId === tabId) {
          window.location.reload();
        }
      }, {url: [{hostContains: sitesUI.mainDomain}]});
      browser.tabs.reload();
      browser.extension.getViews({
          type: "tab"
        })
        .filter(w => /\/options.html/.test(w.location.pathname))
        .forEach(w => w.location.reload());
    }

    addEventListener("beforeunload", async e => {
      UI.updateSettings({
        policy
      });
      if (sitesUI.dirty) {
        reload();
      }
    }, true);
  } catch (e) {
    error(e, "Can't open popup");
    window.close();
  }



})();
