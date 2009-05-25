/***** BEGIN LICENSE BLOCK *****

NoScript - a Firefox extension for whitelist driven safe JavaScript execution
Copyright (C) 2004-2009 Giorgio Maone - g.maone@informaction.com

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA

***** END LICENSE BLOCK *****/


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
    
    var locked = ns.locked;
    for each (widget in ["urlText","urlList", "jsglobal", "addButton", "removeButton", "importButton", "exportButton"]) {
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
    
    this.autoAllowGroup = new ConditionalGroup(ns, "autoAllow", 0);
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
    this.jarEx = new  RegExpController(
        "jarEx", 
        ns.rxParsers.multi,
        ns.getPref("forbidJarDocumentsExceptions"));
    
    // hide incompatible options
    if(top.opener && top.opener.noscriptOverlay && !top.opener.noscriptOverlay.getNotificationBox()) {
      // Moz/SeaMonkey, no notifications
      $("fx-notifications").setAttribute("hidden", "true");
    }
    
    ["clearClick", "opacizeObject"].forEach(function(c) {
      var pref = ns.getPref(c);
      Array.forEach($(c + "Opts").getElementsByTagName("checkbox"), function(cbx) {        
        cbx.setAttribute("checked", !(pref & parseInt(cbx.getAttribute("value"))) ? "false" : "true");
      });
    });
    
    if (!ns.clearClickHandler.isSupported(document))
      ["clearClickOpts", "opt-clearClick.prompt"].forEach(function(id) {
        $(id).setAttribute("hidden", "true"); // Fx <= 1.5
      });
    
    
    if (!ns.placesSupported) {
      $("opt-placesPrefs").setAttribute("hidden", "true");
    }
    
    if (ns.canSerializeConf) this.initSerializeButtons();
    
    // $("policy-tree").view = policyModel;
    window.sizeToContent();
    
    this.addButton.setAttribute("enabled", "false");
    this.removeButton.setAttribute("enabled", "false");
  },
  
  
  initSerializeButtons: function() {
    var ref = document.documentElement.getButton("extra2");
    ["import", "export"].forEach(function(s) {
      var original = $(s + "Button");
      var b = original.cloneNode(false);
      original.accessKey = "";
      
      b.id = s + "DButton";
      b.className = ref.className;
      b.setAttribute("oncommand", "nsopt." + s + "Conf()");
      ref.parentNode.insertBefore(b, ref);
    });
  },
  
  importConf: function() {
    this.chooseFile(
      this.buttonToTitle("importButton"),
      "Open",
      function(f) {
        ns.restoreConf(ns.readFile(f)) && nsopt.reload();
      }
    );
  },
  exportConf: function() {
    this.save();
    this.chooseFile(
      this.buttonToTitle("exportButton"),
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
      ns.setPref(prefName, box.value);
    });
    
    ["clearClick", "opacizeObject"].forEach(function(c) {
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
    this.toggleGroup.persist();
    
    ns.setPref("allowHttpsOnly", $("sel-allowHttpsOnly").selectedIndex);
    
    var exVal = this.xssEx.getValue();
    if(this.xssEx.validate() || !/\S/.test(exVal)) 
      ns.setPref("filterXExceptions", exVal);
    var exVal = this.jarEx.getValue();
    if(this.jarEx.validate() || !/\S/.test(exVal)) 
      ns.setPref("forbidJarDocumentsExceptions", exVal);
    
    if (this.tempRevoked) {
      ns.resetAllowedObjects();
    }
    
    var global = this.jsglobal.getAttribute("checked") == "true";
    var untrustedSites = this.untrustedSites;
    var trustedSites = this.trustedSites;
    var tempSites = this.tempSites;
    var gTempSites = this.gTempSites;
    
    if (ns.consoleDump) ns.dump("Saving whitelist: " + trustedSites.sitesString);
    
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
    var visIdx = ul.getIndexOfFirstVisibleRow();
    var lastIdx = visIdx + ul.getNumberOfVisibleRows();
    const selectedItems = ul.selectedItems;
    
    if(selectedItems.length == 1) {
      var site = selectedItems[0].value;
      if(!ns.isMandatory(site)) {
        ul.removeItemAt(ul.getIndexOfItem(selectedItems[0]));
        this.trustedSites.remove(site, true);
      }
      return;
    }
    
    var removed = [];
    for(var j = selectedItems.length; j-- > 0;) {
      if(!ns.isMandatory(site = selectedItems[j].value)) {
        removed.push(site);
      }
    }
    this.trustedSites.remove(removed, true); // keepUp
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
      const cc = Components.classes;
      const ci = Components.interfaces;
      const IFP = ci.nsIFilePicker;
      const fp = cc["@mozilla.org/filepicker;1"].createInstance(IFP);
      
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
    ns.writeFile(file, 
      this.trustedSites.sitesList.join("\n") + 
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
  }

}
