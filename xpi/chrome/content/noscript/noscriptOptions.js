const CC = Components.classes;
const CI = Components.interfaces;

var ns = noscriptUtil.service;

var nsopt = {
  

  dom2: /^(?:http[s]?|file):\/\/([^\.\?\/#,;:\\\@]+(:?\.[^\.\?\/#,;:\\\@]+$|$))/,
  utils: null,
  init: function() {

    if(ns.uninstalling) { // this should never happen! 
      window.close();
      return;
    }
    
   
    
    this.utils = new UIUtils(ns);
    this.utils.resumeTabSelections();
    
    abeOpts.init();
    EF.init();
    
    var locked = ns.locked;
    for each (var widget in ["urlText","urlList", "jsglobal", "addButton", "removeButton", "importButton", "exportButton"]) {
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
    
    if (ns.canSerializeConf) this.initExtraButtons();
    
    this.addButton.setAttribute("enabled", "false");
    this.removeButton.setAttribute("enabled", "false");
    
    this.toggleHoverUI();
    
    

    window.sizeToContent();
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
    
    EF.save();
    
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
        ns.setPref("temp", tempSites.sitesString);
        ns.setPref("gtemp", gTempSites.sitesString);
        
        ns.setJSEnabled(trustedSites.sitesList, true, true);
      }
      ns.jsEnabled = global;
    });
    return true;
  },
  
  urlListChanged: function() {
    const selectedItems = this.urlList.selectedItems;
    var removeDisabled = true;
    for(var j = selectedItems.length; j-- > 0;) {
      if(selectedItems[j].getAttribute("disabled") != "true") {
        removeDisabled = false;
        break;
      }
    }  
    this.removeButton.setAttribute("disabled", removeDisabled);
    $("revokeButton")
      .setAttribute("disabled", this.tempRevoked || 
          !(this.tempSites.sitesString || this.gTempSites.sitesString || ns.objectWhitelistLen));
    this.urlChanged();
  },
  
  openInfo: function(ev) {
    if (ev.button === 1) {
      setTimeout(function() {
        const selectedItems = nsopt.urlList.selectedItems;
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
    var item;
    const ul = this.urlList;
    for(var j = ul.getRowCount(); j-- > 0;) {
      if((item = ul.getItemAtIndex(j)).getAttribute("value") == site) {
        ul.ensureElementIsVisible(item);
      }
    }
  },
  
  populateUrlList: function() {
    const policy = this.trustedSites;
    const sites = this.trustedSites.sitesList;
    const ul = this.urlList;
    for(var j = ul.getRowCount(); j-- > 0; ul.removeItemAt(j));
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
      
      item = ul.appendItem(site, site);
      if(ns.isMandatory(site)) { 
        item.setAttribute("disabled", "true");
      }
      item.style.fontStyle = (site in tempMap) ? "italic" : "normal";
    }
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
    const ul = this.urlList;
    const selectedItems = ul.selectedItems;
    var visIdx = ul.getIndexOfFirstVisibleRow();
    var lastIdx = visIdx + ul.getNumberOfVisibleRows();
   
    
    
    
    
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
      
      
    if(selectedItems.length == 1) {
      if(removed.length == 1) {
        ul.removeItemAt(ul.getIndexOfItem(selectedItems[0]));  
      }
      return;
    }
    
    // TODO: hide flickering
    this.populateUrlList();
    try {
      var rowCount = ul.getRowCount();
      if(rowCount > lastIdx) {
        ul.scrollToIndex(visIdx);
      } else {
        ul.ensureIndexIsVisible(rowCount - 1);
      } 
    } catch(e) {}
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
      const IFP = CI.nsIFilePicker;
      const fp = CC["@mozilla.org/filepicker;1"].createInstance(IFP);
      
      fp.init(window,title, IFP["mode" + mode]);
      fp.appendFilters(IFP.filterText);
      fp.appendFilters(IFP.filterAll);
      fp.filterIndex = 0;
      fp.defaultExtension = ".txt";
      const ret = fp.show();
      if(ret == IFP.returnOK || 
          ret == IFP.returnReplace) {
        callback.call(nsopt, fp.file);
      }
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
  
  syncNsel: function(cbx) {
    var blockNSWB = $("opt-blockNSWB");
    if(cbx.checked) {
      blockNSWB.disabled = true;
      blockNSWB.checked = true;
    } else {
      blockNSWB.disabled = false;
    }
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
    
    if (!(ABE.legacySupport || ns.Thread.canSpin)) {
      var tab = $("nsopt-tabABE");
      if (tab.selected) {
        tab.parentNode.selectedIndex = 0;
      }
      tab.hidden = true;
      return;
    }
    
    this.list = $("abeRulesets-list");
    this.populate();
    this.updateWAN(ns.wan.ip);
    const OS = ns.os;
    OS.addObserver(this, ns.wan.IP_CHANGE_TOPIC, true);
    OS.addObserver(this, ABE.RULES_CHANGED_TOPIC, true);
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
  
  changed: function(text) {
    var i = this.list.selectedItem;
    if (i) ABE.storeRuleset(i.value, text.value);
  },
  
  _populating: false,
  populate: function() {
    this._populating = true;
    this.errors = false;
    try {
      const map = {__proto__: null};
      var l = this.list;
      for(var j = l.getRowCount(); j-- > 0; l.removeItemAt(j));
      var rulesets = ABE.rulesets;
      var selItem = null;
      if (rulesets) {
        var sel = this.selectedRS && this.selectedRS.name;
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
    if (!this._populating) this.sync();
  },
  
  select: function(rs) {
    var name = rs && rs.name;
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
    
    var text = $("abeRuleset-text");
    text.className = selItem && selItem.className || '';
    text.disabled = !selItem || selItem.disabled;
    text.value = rs && rs.source;
    
    text = $("abeRuleset-errors");
    if (rs && rs.errors) {
      text.hidden = false;
      text.value = rs.errors.join("\n");
    }
    else {
      text.hidden = true;
      text.value = "";
    }
  },
  
  refresh: function() {
    ABE.refresh();
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

var EF = {
  _dirty: false,
  _compare: function(a, b) { return a.name > b.name ? 1 : a.name < b.name ? -1 : 0; },
  currentFilter: null,
  get list() {
    delete this.list;
    return this.list = $("ef-list");
  },
  get filters() {
    delete this.filters;
    return this.filters = ns.externalFilters.cloneFilters();
  },
  
  init: function() {
    var tab = $("nsopt-tabEF");
    if (!ns.externalFilters.supported) {
      if (tab.selected) {
        tab.parentNode.selectedIndex = 0;
      }
      tab.hidden = true;
      return;
    }
    
    if (tab.selected) {
      this.populate();
    } else {
      tab.addEventListener("command", function(ev) {
        tab.removeEventListener("command", arguments.callee, false);
        EF.populate();
      }, false);
    }
  },
  
  populate: function() {
    const ef = ns.externalFilters;
    const list = this.list;
    const filters = this.filters;
    filters.sort(this._compare);
    list.removeAllItems();
    list.selectedItem = null;
    
    const filterName = ef.lastFilterName || filters[0] && filters[0].name; 
    
    filters.forEach(function(f) {
      var mi = list.appendItem(f.name);
      if (!f.valid) mi.setAttribute("class", "noscript-error");
      if (f.name == filterName) {
        list.selectedItem = mi;
        $("ef-exe").value = f.exe && f.exe.path || '';
        $("ef-type").value = f.contentType;
        $("ef-exceptions").value = f.whitelist && f.whitelist.source || '';
        this.currentFilter = f;
      }
    }, this);
    
    ["ef-remove", "ef-browse", "ef-type", "ef-exceptions"].map($).forEach(
      this.currentFilter
      ? function(el) { el && el.removeAttribute("disabled"); }
      : function(el) { el && el.setAttribute("disabled", "true"); }
    );
    
    if (this.currentFilter) {
      if (this.currentFilter.builtIn) {
        $("ef-remove").setAttribute("disabled", "true");
      } else {
        $("ef-remove").removeAttribute("disabled");
      }
    }
    this.validate();
  },
  
  onSelect: function(ev) {
    ns.externalFilters.lastFilterName = this.list.selectedItem && this.list.selectedItem.label;
    this.populate();
  },
  
  onTypeChange: function(ev) {
    if (!this.currentFilter) return;
    this.currentFilter.contentType = ev.target.value;
    this._dirty = true;
  },
  
  onExceptionsChange: function(ev) {
    if (this.currentFilter) {
      var node = ev.target;
      var wl = new ns.AddressMatcher(node.value);
      if (wl.rx || !node.value) {
        node.removeAttribute("class");
        this.currentFilter.whitelist = wl;
        this._dirty = true;
      } else {
        node.setAttribute("class", "noscript-error");
      }
    }
  },
  
  locateExe: function(f) {
    f = f || this.currentFilter;
    if (!f) return;
    
    const IFP = CI.nsIFilePicker;
    const fp = CC["@mozilla.org/filepicker;1"].createInstance(IFP);
      
    fp.init(window, ns.getString("ef.locateExe", [f.name]), IFP.modeOpen);
    fp.appendFilters(IFP.filterApps);
    fp.filterIndex = 0;
    const ret = fp.show();
    if (ret == IFP.returnOK) {
      var exe = fp.file;
      if (exe.exists() && exe.isExecutable()) {  
        f.exe = exe;
        $("ef-exe").value = exe.path;
        this._dirty = true;
      }
    }
    this.validate();
  },
  
  validate: function() {
    var mi = this.list.selectedItem;
    if (mi) {
      if (this.currentFilter && !this.currentFilter.valid && this.list.selectedItem) {
        mi.setAttribute("class", "noscript-error");
      } else {
        mi.removeAttribute("class");
        return true;
      }
    }
    return false;
  },
  
  create: function() {
    const ret = { value: "" };
    if(noscriptUtil.prompter.prompt(window, document.title,
          ns.getString("ef.newName"), ret, null, {}) && 
       /^[a-z]/i.test(ret.value)
       ) {
      
      const ef = ns.externalFilters;
      var f = ef.create(ret.value);
      if (!f.name) return;
      
      if (!this.filters.some(f.same, f)) {
        this.locateExe(f);
        if (!f.exe) return;
        this.filters.push(f);
      }
      
      ef.lastFilterName = f.name;
      this.populate();
    }
  },
  
  remove: function() {
    if (this.currentFilter &&
        noscriptUtil.prompter.confirm(window, document.title, ns.getString("confirm"))) {
      this.filters.splice(this.filter.indexOf(this.currentFilter), 1);
      this.populate();
    }
  },
  
  save: function() {
    if (this._dirty) ns.externalFilters.save(this.filters);
  }
}
