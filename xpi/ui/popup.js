'use strict';
 (async () => {
  try {
    await UI.init();

    let optionsButton = document.querySelector("#options");
    optionsButton.title = _("Options");
    optionsButton.onclick = () => {
      browser.runtime.openOptionsPage();
      this.close();
    };

    let closeButton = document.querySelector("#close");
    closeButton.title = _("Close");
    closeButton.onclick = () => this.close();

    let reloadButton = document.querySelector("#reload");
    reloadButton.title = _("Reload");
    reloadButton.onclick = () => browser.tabs.reload();


    let policy = ns.policy;
    let policySites = policy.sites;
    let sitesUI = new UI.Sites(policy);
    let tabs = await browser.tabs.query({currentWindow: true, active: true});
    let seen = await ns.collectSeen(tabs[0].id);
    if (!seen) {
      browser.runtime.openOptionsPage();
      window.close();
      return;
    }
    debug("Seen", seen.toSource());
    let {typesMap} = sitesUI;
    let sites = [... new Set(
      seen.map(thing => Object.assign({type: thing.policyType}, Sites.parse(thing.request.url)))
      .filter(parsed => parsed.url && parsed.url.origin !== "null")
      .map(parsed =>  policySites.has(parsed.siteKey) &&  parsed.siteKey || parsed.url.origin)
    )];
   for (let thing of seen) {
     let url = thing.request.url;
     sites.filter(s => url === s || url.startsWith(`${s}/`)).forEach(m => {
       let siteTypes = typesMap.get(m);
       if (!siteTypes) typesMap.set(m, siteTypes = new Set());
       siteTypes.add(thing.policyType);
     });
   }
    sitesUI.mainSite = new URL(seen.find(thing => thing.request.type === "main_frame").request.url).origin;
    sitesUI.render(document.getElementById("sites"), sites);

    sitesUI.onChange = () => {
      if (sitesUI.dirty) ns.savePolicy();
    };

    addEventListener("unload", async e => {
      ns.savePolicy();
      if (sitesUI.dirty) {
        bg.browser.tabs.reload();
        browser.extension.getViews({type: "tab"})
          .filter(w => /\/options.html/.test(w.location.pathname))
          .forEach(w => w.location.reload());
      }
    }, true);
  } catch(e) {
    error(e, "Can't open popup");
    window.close();
  }
})();
