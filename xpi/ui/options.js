'use strict';
(async () => {
  await UI.init();
  browser.browserAction.disable((await browser.tabs.getCurrent()).id);

  let policy = UI.policy;

  let version = browser.runtime.getManifest().version;
  document.querySelector("#version").textContent = _("Version", version);
  // simple general options
  opt("global", o => {
    if (o) {
      policy.enforced = !o.checked;
      UI.updateSettings({policy});
    }
    return !policy.enforced;
  });
  opt("xss");

  {
    let a = document.querySelector("#xssFaq a");
    a.onclick = e => {
      e.preventDefault();
      browser.tabs.create({
        url: a.href
      });
    }
    let button = document.querySelector("#btn-delete-xss-whitelist");
    let whitelist = UI.xssWhitelist;
    button.disabled = Object.keys(whitelist).length === 0;
    button.onclick = () => {
      UI.updateSettings({
        xssWhitelist: {}
      });
      button.disabled = true
    };

  }

  opt("clearclick");
  opt("debug", "local", b => {
    document.body.classList.toggle("debug", b);
    if (b) updateRawPolicyEditor();
  });

  // SITE UI
  let sitesUI = new UI.Sites(policy); {
    sitesUI.onChange = () => {
      UI.updateSettings({policy});
      if (UI.local.debug) {
        updateRawPolicyEditor();
      }
    };
    let sites = policy.sites;
    sitesUI.render(document.getElementById("sites"), sites);

    let newSiteForm = document.querySelector("#form-newsite");
    let newSiteInput = newSiteForm.newsite;
    let button = newSiteForm.querySelector("button");
    let canAdd = s => policy.get(s).siteMatch === null;

    let validate = () => {
      let site = newSiteInput.value.trim();
      button.disabled = !(Sites.isValid(site) && canAdd(site));
      sitesUI.filterSites(site);
    }
    validate();
    newSiteInput.addEventListener("input", validate);

    newSiteForm.addEventListener("submit", e => {
      e.preventDefault();
      e.stopPropagation();
      let site = newSiteInput.value.trim();
      let valid = Sites.isValid(site);
      if (valid && canAdd(site)) {
        policy.set(site, policy.TRUSTED);
        newSiteInput.value = "";
        sitesUI.populate(policy.sites);
        sitesUI.highlight(site);
      }
    }, true);
  }


  // UTILITY FUNCTIONS

  async function opt(name, storage = "sync", onchange) {
    let input = document.querySelector(`#opt-${name}`);
    if (!input) {
      debug("Checkbox not found %s", name);
      return;
    }
    if (typeof storage === "function") {
      input.onchange = e => storage(input);
      input.checked = storage(null);
    } else {
      let obj = UI[storage];
      input.checked = obj[name];
      if (onchange) onchange(input.checked);
      input.onchange = async () => {
        obj[name] = input.checked;
        await UI.updateSettings({storage: obj});
        if (onchange) onchange(obj[name]);
      }
    }
  }


  function updateRawPolicyEditor() {
    if (!UI.local.debug) return;

    // RAW POLICY EDITING (debug only)
    let policyEditor = document.getElementById("policy");
    policyEditor.value = JSON.stringify(policy.dry(true), null, 2);
    if (!policyEditor.onchange) policyEditor.onchange = (e) => {
      try {
        let ed = e.currentTarget
        policy = new Policy(JSON.parse(ed.value));
        UI.updateSettings({policy});
        siteUI.populate(policy.sites);
        ed.className = "";
      } catch (e) {
        error(e);
        ed.className = "error";
      }
    }
  }
})();
