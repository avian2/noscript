// Cc, Ci, Cu should be already defined by tree-copy.js

var ns = noscriptUtil.service;

var nsopt = {


  dom2: /^(?:http[s]?|file):\/\/([^\.\?\/#,;:\\\@]+(:?\.[^\.\?\/#,;:\\\@]+$|$))/,
  utils: null,
  whitelistURLs: [],
  init: function() {

    if(ns.uninstalling) { // this should never happen!
      window.close();
      return;
    }

    ns.optionsDialogRef = Components.utils.getWeakReference(window);

    this.utils = new UIUtils(ns);
    this.utils.resumeTabSelections();

    abeOpts.init();

    var locked = ns.locked;
    for each (var widget in ["urlText","urlListDisplay", "jsglobal", "addButton", "removeButton", "importButton", "exportButton"]) {
      this[widget] = $(widget);
      if(locked) this[widget].disabled = true;
    }
     // forbid <a ping>
    var pingCbx = $("mozopt-browser.send_pings");
    if(pingCbx.getAttribute("label").indexOf("Allow ") == 0) {
      pingCbx.setAttribute("label", noscriptUtil.getString("allowLocal", ["<a ping...>"]));
      $("opt-noping")
              .setAttribute("label", noscriptUtil.getString("forbidLocal", ["<a ping...>"]));
    }

    this.trustedSites = ns.jsPolicySites.clone();
    this.untrustedSites = ns.untrustedSites.clone();
    this.tempSites = ns.tempSites.clone();
    this.gTempSites = ns.gTempSites.clone();

    this.urlListDisplay.boxObject.QueryInterface(Ci.nsITreeBoxObject);
    this.populateUrlList();

    this.jsglobal.checked = ns.jsEnabled;

    this.utils.visitCheckboxes(function(prefName, inverse, checkbox, mozilla) {
        try {
          var val = mozilla ? ns.prefService.getBoolPref(prefName) : ns.getPref(prefName);
          checkbox.setAttribute("checked", inverse ? !val : val);
          if(ns.prefService.prefIsLocked(mozilla ? prefName : "noscript." + prefName)) {
            checkbox.setAttribute("disabled", true);
          }
        } catch(ex) {}
      }
    );

    this.utils.visitTextboxes(function(prefName, box) {
      box.value = ns.getPref(prefName);
    });

    $("opt-showPermanent").setAttribute("label", noscriptUtil.getString("allowLocal", ["[...]"]));
    $("opt-showTemp").setAttribute("label", noscriptUtil.getString("allowTemp", ["[...]"]));
    $("opt-showDistrust").setAttribute("label", noscriptUtil.getString("distrust", ["[...]"]));
    $("opt-showGlobal").setAttribute("label", noscriptUtil.getString("allowGlobal"));

    var notifyHideLabels = noscriptUtil.getString("notifyHide").split("%S");
    $("opt-notify.hide").setAttribute("label", notifyHideLabels[0]);
    $("notifyDelayLabel").setAttribute("value", notifyHideLabels[1]);
    $("notifyDelay").value = ns.getPref("notify.hideDelay", 5);

    this.soundChooser.setSample(ns.getPref("sound.block"));

    this.autoAllowGroup = new ConditionalGroup(ns, "autoAllow", 1);
    this.toggleGroup = new ConditionalGroup(ns, "toolbarToggle", 3);

    var val = ns.getPref("allowHttpsOnly", 0);
    $("sel-allowHttpsOnly").selectedIndex = (val < 0 || val > 2) ? 0 : val;

    var shortcut = ns.getPref("keys.toggle");
    if(shortcut) {
      shortcut = shortcut.replace(/VK_([^\.]*).*/g, "$1").replace(/\s+/g, '+').replace(/_/g, ' ');
      var shortcutLabel = $("toolbarToggle-shortcut");
      shortcutLabel.value = "(" + shortcut + ")";
      shortcutLabel.removeAttribute("hidden");
    }

    this.utils.syncGroup($("opt-secureCookies"));

    this.xssEx = new RegExpController(
        "xssEx",
        ns.rxParsers.multi,
        ns.getPref("filterXExceptions"));

    // hide incompatible options
    let browserWin = ns.dom.mostRecentBrowserWindow;

    if (browserWin) {
      if (!browserWin.document.getElementById("noscript-statusIcon"))
        $("opt-statusIcon").setAttribute("hidden", "true");

      if(browserWin.noscriptOverlay && !browserWin.noscriptOverlay.getNotificationBox())
        $("fx-notifications").setAttribute("hidden", "true");
    }

    ["clearClick"].forEach(function(c) {
      var pref = ns.getPref(c);
      Array.forEach($(c + "Opts").getElementsByTagName("checkbox"), function(cbx) {
        cbx.setAttribute("checked", !(pref & parseInt(cbx.getAttribute("value"))) ? "false" : "true");
      });
    });


    if (!ns.placesSupported)
      $("opt-placesPrefs").setAttribute("hidden", "true");

    if (!ns.supportsCAPS) {
      $("opt-allowClipboard").setAttribute("collapsed", "true");
    }

    this.initExtraButtons();

    this.addButton.setAttribute("enabled", "false");
    this.removeButton.setAttribute("enabled", "false");

    this.toggleHoverUI();



    window.sizeToContent();
  },

  dispose: function() {
    abeOpts.dispose();
  },

  initExtraButtons: function() {
    this.utils.moveButtonsDown("donateButton", "", "importConfButton", "exportConfButton");
  },


  donate: function() {
    noscriptUtil.openDonate("options");
  },

  importConf: function() {
    this.chooseFile(
      this.buttonToTitle("importConfButton"),
      "Open",
      function(f) {
        ns.restoreConf(ns.readFile(f)) && nsopt.reload();
      }
    );
  },
  exportConf: function() {
    this.save();
    this.chooseFile(
      this.buttonToTitle("exportConfButton"),
      "Save",
      function(f) {
        ns.writeFile(f, ns.serializeConf(true));
      }
    );
  },

  reset: function() {

    if(!noscriptUtil.prompter.confirm(window,
          noscriptUtil.getString("reset.title"),
          noscriptUtil.getString("reset.warning"))
      ) return;

    ns.resetDefaults();
    this.reload();
  },

  reload: function() {
    this.utils.persistTabSelections();
    var op = top.opener;
    if(op && op.noscriptUtil) {
      op.setTimeout(function() {
          op.noscriptUtil.openOptionsDialog();
      }, 10);
    }
    window.close();
  },

  save: function() {
    /*
    if (!$("abeRuleset-errors").hidden) {
      let p = noscriptUtil.prompter;
      if (p.confirmEx(window,
          noscriptUtil.getString("ABE.syntaxError"),
          $("abeRuleset-errors").value,
          p.BUTTON_TITLE_SAVE * p.BUTTON_POS_0 +
            p.BUTTON_TITLE_DONT_SAVE * p.BUTTON_POS_1 +
            p.BUTTON_POS_1_DEFAULT,
          null, null, null, null, {}) === 1
        )
      return false;
    }
    */
    this.utils.visitCheckboxes(
      function(prefName, inverse, checkbox, mozilla) {
        if(checkbox.getAttribute("collapsed")!="true") {
          const checked = checkbox.getAttribute("checked") == "true";
          const requestedVal = inverse ? !checked : checked;

          if(mozilla) {
            try {
              ns.prefService.setBoolPref(prefName, requestedVal);
            } catch(ex) {}
            return;
          }

          const prevVal = ns.getPref(prefName);
          if(requestedVal != prevVal) {
            ns.setPref(prefName, requestedVal);
          }
        }
      }
    );


    this.utils.visitTextboxes(function(prefName, box) {
      if (box.value != ns.getPref(prefName)) {
        ns.setPref(prefName, box.value);
      }
    });

    ["clearClick"].forEach(function(c) {
      var pref = 0;
      Array.forEach($(c + "Opts").getElementsByTagName("checkbox"), function(cbx) {
        if (cbx.checked) pref = pref | parseInt(cbx.getAttribute("value"));
      });
      ns.setPref(c, pref);
    });


    ns.setPref("notify.hideDelay", parseInt($("notifyDelay").value) ||
              ns.getPref("notify.hideDelay", 5));

    ns.setPref("sound.block", this.soundChooser.getSample());

    this.autoAllowGroup.persist();

    if (!(ns.getPref("hoverUI.excludeToggling") && $("opt-hoverUI").checked)) {
      this.toggleGroup.persist();
    }

    ns.setPref("allowHttpsOnly", $("sel-allowHttpsOnly").selectedIndex);

    var exVal = this.xssEx.getValue();
    if(this.xssEx.validate() || !/\S/.test(exVal))
      ns.setPref("filterXExceptions", exVal);

    if (this.tempRevoked) {
      ns.resetAllowedObjects();
    }

    var global = this.jsglobal.getAttribute("checked") == "true";
    var untrustedSites = this.untrustedSites;
    var trustedSites = this.trustedSites;
    var tempSites = this.tempSites;
    var gTempSites = this.gTempSites;

    ns.safeCapsOp(function(ns) {
      if(ns.untrustedSites.sitesString != untrustedSites.sitesString
          || ns.jsPolicySites.sitesString != trustedSites.sitesString
          || ns.tempSites.sitesString != tempSites.sitesString
          || ns.gTempSites.sitesString != gTempSites.sitesString) {
        ns.untrustedSites.sitesString = untrustedSites.sitesString;
        ns.persistUntrusted();
        if (ns.usingCAPS) {
          ns.setPref("temp", tempSites.sitesString);
          ns.setPref("gtemp", gTempSites.sitesString);
        } else {
          ns.tempSites.sitesString = tempSites.sitesString
          ns.gTempSites.sitesString = gTempSites.sitesString
        }
        ns.setJSEnabled(trustedSites.sitesList, true, true);
      }
      ns.jsEnabled = global;
    });
    return true;
  },

  urlListChanged: function(dontUpdate) {
    const selectedItems = noscriptTreeCc.getSelectedItems(this.urlListDisplay, this.whitelistURLs);
    var removeDisabled = true;
    for(var j = selectedItems.length; j-- > 0;) {
      if(!selectedItems[j].mandatory) {
        removeDisabled = false;
        break;
      }
    }
    this.removeButton.setAttribute("disabled", removeDisabled);
    $("revokeButton")
      .setAttribute("disabled", this.tempRevoked ||
          !(this.tempSites.sitesString || this.gTempSites.sitesString || ns.objectWhitelistLen));
    if (!dontUpdate) nsWhitelistTreeView.updateTree();
    this.urlChanged();
  },

  openInfo: function(ev) {
    if (ev.button === 1) {
      setTimeout(function() {
        const selectedItems = noscriptTreeCc.getSelectedItems(nsopt.urlListDisplay, nsopt.whitelistURLs);
        const domains = [];
        for (let j = selectedItems.length; j-- > 0;) {
          let site = selectedItems[j].value;
          let d = site.indexOf(":/") > 0 ? ns.getDomain(site) : site;
          if (d && domains.indexOf(d) === -1) domains.push(d);
        }
        domains.forEach(noscriptUtil.openInfo, noscriptUtil);
      }, 0); // delayed to let middle-click autoselect the underlying item
    }
  },

  copyUrlListSel: function() {
    noscriptTreeCc.doCopy(this.urlListDisplay, "", " ");
  },

  urlChanged: function() {
    var url = this.urlText.value;
    if(url.match(/\s/)) url = this.urlText.value = url.replace(/\s/g,'');
    var addEnabled = url.length > 0 && (url = ns.getSite(url)) ;
    if(addEnabled) {
      var match = url.match(this.dom2);
      if(match) url = match[1];
      url = this.trustedSites.matches(url);
      if(!(addEnabled = !url)) {
        this.ensureVisible(url);
      }
    }
    this.addButton.setAttribute("disabled", !addEnabled);
  },

  notifyHideDelay: {
    onInput: function(txt) {
      if(/\D/.test(txt.value)) txt.value = txt.value.replace(/\D/, "");
    },
    onChange: function(txt) {
      txt.value = parseInt(txt.value) || ns.getPref("notify.hideDelay", 5);
    }
  },

  ensureVisible: function(site) {
    for(var j = nsWhitelistTreeView.rowCount; j-- > 0;) {
      if(nsWhitelistTreeView.getCellText(j) == site) {
        this.urlListDisplay.boxObject.ensureRowIsVisible(j);
      }
    }
  },

  populateUrlList: function() {
    const policy = this.trustedSites;
    const sites = this.trustedSites.sitesList;
    this.whitelistURLs = [];
    const dom2 = this.dom2;
    var site, item;
    var match, k, len;
    var tempSites = this.gTempSites.clone();
    tempSites.add(this.tempSites.sitesList);
    var tempMap = this.tempSites.sitesMap;
    for(j = 0, len = sites.length; j < len; j++) {
      site = sites[j];
      // skip protocol + 2nd level domain URLs
      if((match = site.match(dom2)) && policy.matches(item = match[1]))
        continue;

      item = {value:site};
      if(ns.isMandatory(site)) {
        item.mandatory = true;
      }
      item.temp = site in tempMap;
      this.whitelistURLs.push(item);
    }
    this.urlListDeselectAll();
    this.urlListChanged();
  },

  allow: function() {
    const site = ns.getSite(this.urlText.value);
    this.trustedSites.add(site);
    this.tempSites.remove(site, true, true); // see noscriptService#eraseTemp()
    this.gTempSites.remove(site, true, true);

    this.untrustedSites.remove(site, false, !ns.mustCascadeTrust(site, false));
    this.populateUrlList();
    this.ensureVisible(site);
    this.addButton.setAttribute("disabled", "true");
  },

  remove: function() {
    const ul = this.urlListDisplay;
    const selectedItems = noscriptTreeCc.getSelectedItems(ul, this.whitelistURLs);
    var visIdx = ul.boxObject.getFirstVisibleRow();
    var lastIdx = visIdx + ul.boxObject.getPageLength();




    var removed = [];
    for(var j = selectedItems.length; j-- > 0;) {
      if(!ns.isMandatory(site = selectedItems[j].value)) {
        removed.push(site);
      }
    }
    if (!removed.length) return;

    this.trustedSites.remove(removed, true); // keepUp
    this.tempSites.remove(removed, true, true); // see noscriptService#eraseTemp()
    this.gTempSites.remove(removed, true, true);

    this.populateUrlList();

  },

  urlListDeselectAll: function() {
    this.urlListDisplay.view.selection.clearSelection();
  },

  tempRevoked: false,
  revokeTemp: function() {
    this.trustedSites.remove(this.tempSites.sitesList, true, true);
    this.trustedSites.remove(this.gTempSites.sitesList, true, true);
    this.untrustedSites.add(this.gTempSites.sitesList);
    this.trustedSites.add(ns.mandatorySites.sitesList);
    this.tempSites.sitesString = "";
    this.gTempSites.sitesString = "";
    this.tempRevoked = true;
    this.populateUrlList();
  },

  _soundChooser: null,
  get soundChooser() {
    return this._soundChooser ||
      (this._soundChooser =
        new SoundChooser(
        "sampleURL",
        this.buttonToTitle("sampleChooseButton"),
        ns,
        "chrome://noscript/skin/block.wav"
      ));
  },


  chooseFile: function(title, mode, callback) {
    try {
      const IFP = Ci.nsIFilePicker;
      const fp = Cc["@mozilla.org/filepicker;1"].createInstance(IFP);

      fp.init(window, title, IFP["mode" + mode]);

      try {
        fp.displayDirectory = ns.prefs.getComplexValue("exportDir", Ci.nsILocalFile);
      } catch (e) {
        fp.displayDirectory = Cc["@mozilla.org/file/directory_service;1"]
                              .getService(Ci.nsIDirectoryServiceProvider)
                              .getFile("Home", {});
      }
      fp.defaultExtension = "txt";
      const ret = fp.show();
      if(ret == IFP.returnOK ||
          ret == IFP.returnReplace) {
        callback.call(nsopt, fp.file);
      }
      try {
        ns.prefs.setComplexValue("exportDir", Ci.nsILocalFile, fp.displayDirectory);
      } catch (e) {}
    } catch(ex) {
      noscriptUtil.prompter.alert(window, title, ex.toString());
    }
  },


  importExport: function(op) {
    this.chooseFile(
      this.buttonToTitle(op + "Button"),
      op == "import" ? "Open" : "Save",
      this[op + "List"]
    );
  },

  importList: function(file) {
    var all = ns.readFile(file).replace(/\s+/g, "\n");
    var untrustedPos = all.indexOf("[UNTRUSTED]");
    if(untrustedPos < 0) {
      this.trustedSites.sitesString += "\n" + all;
    } else {
      this.trustedSites.sitesString += "\n" + all.substring(0, untrustedPos);
      this.untrustedSites.sitesString += all.substring(all.indexOf("\n", untrustedPos + 2));
    }
    this.untrustedSites.remove(this.trustedSites.sitesList, false, true);
    this.populateUrlList();
    return null;
  },

  exportList: function(file) {
    var list = ns.getPermanentSites(this.trustedSites, this.tempSites);
    list.remove(ns.mandatorySites.sitesList, true, true);
    ns.writeFile(file, list.sitesList.join("\n") +
      "\n[UNTRUSTED]\n" +
      this.untrustedSites.sitesList.join("\n")
    );
    return null;
  },

  buttonToTitle: function(btid) {
    return "NoScript - " + $(btid).getAttribute("label");
  },

  toggleHoverUI: function(cbx) {
    if (ns.getPref("hoverUI.excludeToggling")) {
      let cbx = $("cbx-toolbarToggle");
      if ($("opt-hoverUI").checked) {
        if (!cbx.disabled) {
          this._savedToolbarToggleStatus = cbx.checked;
          cbx.disabled = true;
          cbx.checked = false;
          this.toggleGroup.changed();
        }
      } else {
        if (cbx.disabled) {
          cbx.disabled = false;
          cbx.checked = this._savedToolbarToggleStatus;
        }
      }
    }
  }

}

var ABE = ns.ABE;

var abeOpts = {
  selectedRS: null,
  _map: {__proto__: null},
  errors: false,
  QueryInterface: ns.wan.QueryInterface, // dirty hack, we share the same observer ifaces

  init: function() {
    this.list = $("abeRulesets-list");
    this.populate();

    this.updateWAN(ns.wan.ip);
    const OS = ns.os;
    OS.addObserver(this, ns.wan.IP_CHANGE_TOPIC, true);
    OS.addObserver(this, ABE.RULES_CHANGED_TOPIC, true);
  },

  dispose: function() {
    const OS = ns.os;
    OS.removeObserver(this, ns.wan.IP_CHANGE_TOPIC);
    OS.removeObserver(this, ABE.RULES_CHANGED_TOPIC);
  },

  observe: function(subject, topic, data) {
    if (topic === ns.wan.IP_CHANGE_TOPIC) this.updateWAN(data);
    else if (topic === ABE.RULES_CHANGED_TOPIC) {
      this.populate();
      this.errors = false;
    }
  },

  updateWAN: function(ip) {
    $("opt-ABE.wanIpAsLocal").label = ns.getString("ABE.wanIpAsLocal", [ip || "???"]);
  },

  reset: function() {
    ABE.resetDefaults();
  },
  input: function() {
    abeOpts.dirty = abeOpts.list.selectedItem;
  },
  changed: function(i) {
    let current = i || this.list.selectedItem;

    if (current && this.dirty) {

      let name = current.value;
      let source = $("abeRuleset-text-container").selectedPanel.value;
      let ruleset = ABE.createRuleset(name, source);
      if (ruleset.errors && this.dirty) {
        this.dirty = null;
        let p = noscriptUtil.prompter;
        if (p.confirmEx(window,
            noscriptUtil.getString("ABE.syntaxError"),
            ruleset.errors.join("\n"),
            p.BUTTON_TITLE_SAVE * p.BUTTON_POS_0 +
              p.BUTTON_TITLE_DONT_SAVE * p.BUTTON_POS_1 +
              p.BUTTON_POS_1_DEFAULT,
            null, null, null, null, {}) === 1
          ) {
          this.sync();
          return;
        }
      }
      this.dirty = null;
      ABE.storeRuleset(name, source);
    }
  },

  _populating: false,
  populate: function() {
    if (this._populating) return;
    this._populating = true;
    this.errors = false;
    this.dirty = null;
    try {
      const map = {__proto__: null};
      var l = this.list;
      for(var j = l.getRowCount(); j-- > 0; l.removeItemAt(j)) {
        try {
          let rc = $("abeRuleset-text-container");
          rc.removeChild(rc.lastChild);
        }
        catch (e) { /* no textboxes present to remove, ignore */ }
      }
      var rulesets = ABE.rulesets;
      var selItem = null;
      if (rulesets) {
        var sel = this.selectedRS && this.selectedRS.name || "USER";
        this.selectedRS = null;
        var i, name;
        for each (var rs in rulesets) {
          name = rs.name;
          map[name] = rs;
          i = l.appendItem(name, name);
          if (rs.disabled) i.setAttribute("disabled", "true");
          if (sel == name) selItem = i;
          if (rs.errors) {
            i.className = "noscript-error";
            this.errors = rs.errors;
          }
          let textbox = document.createElement("textbox");
          let textboxAttributes = {
            "flex":"5",
            "multiline":"true",
            "wrap":"off",
            "onchange":"abeOpts.changed()",
            "oninput":"abeOpts.input(this)",
            "value":rs.source
          };
          for (let a in textboxAttributes) { textbox.setAttribute(a, textboxAttributes[a]); }
          $("abeRuleset-text-container").appendChild(textbox);
        }
      }
      this._map = map;
      l.selectedItem = selItem;
      this.sync();
    } finally {
      this._populating = false;
    }
  },

  selected: function(i) {
    if (this.dirty) {
      let selIndex = this.list.selectedIndex;
      this.changed(this.dirty);
      this.list.selectedIndex = selIndex;
    }
    if (!this._populating) this.sync();
    this.dirty = null;
  },

  select: function(rs) {
    var name = rs && rs.name || rs;
    if (!name) return;
    var l = this.list;
    if (l.selectedItem && l.selectedItem.value == name) return;

    for(var j = l.getRowCount(), i; j-- > 0;) {
      i = l.getItemAtIndex(j);
      if (i.value == name) {
        l.selectedItem = i;
        break;
      }
    }
  },

  sync: function() {
    var selItem = this.list.selectedItem;

    var rs = null;
    if (selItem) {
      this.selectedRS = rs = this._map[selItem.value];
    } else {
      this.selectedRS = null;
    }

    $("abeEnable-button").disabled = ! ($("abeDisable-button").disabled = !rs || rs.disabled);
    $("abeRefresh-button").disabled = this.list.getRowCount() == 0;
    $("abeRuleset-text-container").setAttribute("selectedIndex", this.list.selectedIndex);

    var text = $("abeRuleset-text-container").selectedPanel;
    text.className = selItem && selItem.className || '';
    text.disabled = !selItem || selItem.disabled;
    text.value = rs && rs.source;

    text = $("abeRuleset-errors");
    if (rs && rs.errors) {
      this.ShowHideABEError(false);
      text.value = rs.errors.join("\n");
    }
    else {
      this.ShowHideABEError(true);
      text.value = "";
    }
  },

  refresh: function() {
    ABE.refresh();
  },

  ShowHideABEError: function(hidden) {
    for each (let n in document.getElementsByClassName("abe-error-element")) {
      n.hidden = hidden;
    }
  },

  toggle: function(enabled) {
    var selItem = this.list.selectedItem;
    var rs = this.selectedRS;
    if (!(rs && selItem && rs.name == selItem.value)) return;
    if ((rs.disabled = !enabled)) {
      selItem.setAttribute("disabled", "true");
    } else {
      selItem.removeAttribute("disabled");
    }
    ns.setPref("ABE.disabledRulesetNames", ABE.disabledRulesetNames);
    this.sync();
  }

}

var nsWhitelistTreeView = {
  rowCount: nsopt.whitelistURLs.length,
  getCellText: function(r, c) { return nsopt.whitelistURLs[r].value; },
  setTree: function(treebox){ this.treebox = treebox; },
  isContainer: function(row){ return false; },
  isSeparator: function(row){ return false; },
  isSorted: function(){ return true; },
  getLevel: function(row){ return 0; },
  getImageSrc: function(row,col){ return null; },
  getRowProperties: function(row,props) {
    // ??? need to set multicol manually for some reason
    if (props) {
      let aserv=Cc["@mozilla.org/atom-service;1"].getService(Ci.nsIAtomService);
      props.AppendElement(aserv.getAtom("multicol"));
    }
    else { return "multicol" }
  },
  getCellProperties: function(row,col,props) {
    var psl = [];
    if (nsopt.whitelistURLs[row].temp) psl.push("temp");
    if (nsopt.whitelistURLs[row].mandatory) psl.push("mandatory");
    if (psl.length == 0) return;
    if (props) {
      let aserv=Cc["@mozilla.org/atom-service;1"].getService(Ci.nsIAtomService);
      for each (let s in psl) props.AppendElement(aserv.getAtom(s));
    }
    else { return psl.join(" ") }
  },
  getColumnProperties: function(colid,col,props){},
  cycleHeader: function(col){},

  // Custom properties and methods
  updateTree: function() {
    var r = nsopt.urlListDisplay.boxObject.getFirstVisibleRow();
    nsWhitelistTreeView.rowCount = nsopt.whitelistURLs.length;
    $("urlListDisplay").view = nsWhitelistTreeView;
    nsopt.urlListDisplay.boxObject.scrollToRow(r);
  },
};
