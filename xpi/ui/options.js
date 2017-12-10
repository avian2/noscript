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

  opt("auto", o => {
    if (o) {
      policy.autoAllowTop = o.checked;
      UI.updateSettings({policy});
    }
    return policy.autoAllowTop;
  });

  opt("xss");

  {
      let button = document.querySelector("#btn-reset");
      button.onclick = async () => {
        if (confirm(_("reset.warning"))) {
          policy = new Policy();
          await UI.updateSettings({policy});
          window.location.reload();
        }
      }

      let fileInput = document.querySelector("#file-import");
      fileInput.onchange = () => {
        let fr = new FileReader();
        fr.onload = async () => {
          try {
            await UI.importSettings(fr.result);
          } catch (e) {
            error(e, "Importing settings %s", fr.result);
          }
          location.reload();
        }
        fr.readAsText(fileInput.files[0]);
      }

      button = document.querySelector("#btn-import");
      button.onclick = () => fileInput.click();

      document.querySelector("#btn-export").onclick = () => UI.exportSettings();
  }

  {
    let a = document.querySelector("#xssFaq a");
    a.onclick = e => {
      e.preventDefault();
      browser.tabs.create({
        url: a.href
      });
    }
    let button = document.querySelector("#btn-delete-xss-choices");
    let choices = UI.xssUserChoices;
    button.disabled = Object.keys(choices).length === 0;
    button.onclick = () => {
      UI.updateSettings({
        xssUserChoices: {}
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
  let sitesUI = new UI.Sites();
  {
    sitesUI.onChange = () => {
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
        UI.updateSettings({policy});
        newSiteInput.value = "";
        sitesUI.populate(policy.sites);
        sitesUI.highlight(site);
        SitesUI.onChange();
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
        await UI.updateSettings({[storage]: obj});
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
      let ed = e.currentTarget
      try {
        policy = new Policy(JSON.parse(ed.value));
        UI.updateSettings({policy});
        sitesUI.populate(policy.sites);
        ed.className = "";
        document.getElementById("policy-error").textContent = "";
      } catch (e) {
        error(e);
        ed.className = "error";
        document.getElementById("policy-error").textContent = e.message;
      }
    }
  }
})();
