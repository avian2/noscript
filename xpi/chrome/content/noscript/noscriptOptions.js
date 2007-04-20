/***** BEGIN LICENSE BLOCK *****

NoScript - a Firefox extension for whitelist driven safe JavaScript execution
Copyright (C) 2004-2007 Giorgio Maone - g.maone@informaction.com

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



var nsopt = {
  
  serv: noscriptUtil.service,
  dom2: /^(?:http[s]?|file):\/\/([^\.\?\/#,;:\\\@]+(:?\.[^\.\?\/#,;:\\\@]+$|$))/,
  utils: null,
  init: function() {
    const ns = this.serv; 
    if(ns.uninstalling) { // this should never happen! 
      window.close();
      return;
    }
    
    this.utils = new UIUtils(this.serv);
    this.utils.resumeTabSelections();
    
    const widgets = ["urlText", "urlText","urlList","jsglobal","addButton","removeButton"];
    for(var j = widgets.length; j-- > 0;) 
      this[widgets[j]] = document.getElementById(widgets[j]); 
    
    this.trustedSites = ns.jsPolicySites.clone();
    this.untrustedSites = ns.untrustedSites.clone();
    this.populateUrlList();
    
    this.jsglobal.checked = ns.jsEnabled;
    
    // forbid <a ping>
    var pingCbx = document.getElementById("mozopt-browser.send_pings");
    if(pingCbx.getAttribute("label").indexOf("Allow ") == 0) { 
      pingCbx.setAttribute("label", noscriptUtil.getString("allowLocal", ["<a ping...>"]));
      document.getElementById("opt-noping")
              .setAttribute("label", noscriptUtil.getString("forbidLocal", ["<a ping...>"]));
    }
    
    this.utils.visitCheckboxes(function(prefName, inverse, checkbox, mozilla) {
        try {
          var val = mozilla ? ns.prefService.getBoolPref(prefName) : ns.getPref(prefName);
          checkbox.setAttribute("checked",inverse ? !val : val);
        } catch(ex) {}
      }
    );
    
    document.getElementById("opt-showTemp").setAttribute("label", noscriptUtil.getString("allowTemp", ["[...]"]));
    document.getElementById("opt-showDistrust").setAttribute("label", noscriptUtil.getString("distrust", ["[...]"]));
    document.getElementById("opt-showGlobal").setAttribute("label", noscriptUtil.getString("allowGlobal"));
  
    document.getElementById("opt-notify.hide").setAttribute("label",
           noscriptUtil.getString("notifyHide", [ns.getPref("notify.hideDelay", 3)]));
       
    this.soundChooser.setSample(ns.getPref("sound.block"));
    
    this.autoAllowGroup = new ConditionalGroup(ns, "autoAllow", 0);
    this.toggleGroup = new ConditionalGroup(ns, "toolbarToggle", 3);
    
    var shortcut = ns.getPref("keys.toggle");
    if(shortcut) {
      shortcut = shortcut.replace(/VK_([^\.]*).*/g, "$1").replace(/\s+/g, '+').replace(/_/g, ' ');
      var shortcutLabel = document.getElementById("toolbarToggle-shortcut");
      shortcutLabel.value = "(" + shortcut + ")";
      shortcutLabel.removeAttribute("hidden");
    }
    
    this.xssEx = new RegExpController(
        "xssEx", 
        ns.rxParsers.multi,
        ns.getPref("filterXExceptions"));

    // document.getElementById("policy-tree").view = policyModel;
    window.sizeToContent();
      
  },
  

  save: function() {
    const ns = this.serv;
    
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
    
    ns.setPref("sound.block", this.soundChooser.getSample());
    
    this.autoAllowGroup.persist();
    this.toggleGroup.persist();
    
    var xssEx = this.xssEx.getValue(true);
    if(xssEx) ns.setPref("filterXExceptions", xssEx);
    
    
    var global = this.jsglobal.getAttribute("checked") == "true";
    var untrustedSites = this.untrustedSites;
    var trustedSites = this.trustedSites;
    ns.safeCapsOp(function() {
      ns.untrustedSites.sitesString = untrustedSites.sitesString;
      ns.setJSEnabled(trustedSites.sitesList, true, true);
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
    this.urlChanged();
  },
  
  urlChanged: function() {
    var url = this.urlText.value;
    if(url.match(/\s/)) url = this.urlText.value = url.replace(/\s/g,'');
    var addEnabled = url.length > 0 && (url=this.serv.getSite(url)) ;
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
    const ns = this.serv;
    for(var j = ul.getRowCount(); j-- > 0; ul.removeItemAt(j));
    const dom2 = this.dom2;
    var site, item;
    var match, k, len;
    for(j = 0, len = sites.length; j < len; j++) {
      site = sites[j];
      // skip protocol + 2nd level domain URLs
      if((match = site.match(dom2)) && policy.matches(item = match[1])) 
        continue;
      
      item = ul.appendItem(site, site);
      if(ns.isPermanent(site)) { 
        item.setAttribute("disabled", "true");
      }
      item.style.fontStyle = ns.isTemp(site) ? "italic" : "normal";
    }
    this.urlListChanged();
  },
  
  allow: function() {
    const site = this.serv.getSite(this.urlText.value);
    this.trustedSites.add(site);
    this.untrustedSites.remove(site);
    this.populateUrlList();
    this.ensureVisible(site);
    this.addButton.setAttribute("disabled", "true");
  },
  
  remove: function() {
    const ns = this.serv;
    const ul = this.urlList;
    var visIdx = ul.getIndexOfFirstVisibleRow();
    var lastIdx = visIdx + ul.getNumberOfVisibleRows();
    const selectedItems = ul.selectedItems;
    
    if(selectedItems.length == 1) {
      if(!ns.isPermanent(site = selectedItems[0].value)) {
        ul.removeItemAt(ul.getIndexOfItem(selectedItems[0]));
      }
      return;
    }
    
    var removed = [];
    for(var j = selectedItems.length; j-- > 0;) {
      if(!ns.isPermanent(site = selectedItems[j].value)) {
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
  
  _soundChooser: null,
  get soundChooser() {
    return this._soundChooser || 
      (this._soundChooser = 
        new SoundChooser(
        "sampleURL", 
        this.buttonToTitle("sampleChooseButton"),
        noscriptUtil.service,
        "chrome://noscript/skin/block.wav"
      ));
  },
  
  
  importExport: function(op) {
    const title = this.buttonToTitle(op + "Button");
    try {
      const cc=Components.classes;
      const ci=Components.interfaces;
      const fp = cc["@mozilla.org/filepicker;1"].createInstance(ci.nsIFilePicker);
      
      fp.init(window,title, op == "import"?ci.nsIFilePicker.modeOpen:ci.nsIFilePicker.modeSave);
      fp.appendFilters(ci.nsIFilePicker.filterText);
      fp.appendFilters(ci.nsIFilePicker.filterAll);
      fp.filterIndex = 0;
      fp.defaultExtension = ".txt";
      const ret=fp.show();
      if(ret == ci.nsIFilePicker.returnOK || 
          ret == ci.nsIFilePicker.returnReplace) {
        this[op](fp.file);
      }
    } catch(ex) {
      noscriptUtil.prompter.alert(window, title, ex.toString());
    }
  },
  
  import: function(file) {
    if(typeof(file)=="undefined") return this.importExport("import");
    var all = this.serv.readFile(file);
    var untrustedPos = all.indexOf("\n[UNTRUSTED]\n");
    if(untrustedPos < 0) {
      this.trustedSites.sitesString += "\n" + all;
      this.untrustedSites.remove(this.trustedSites.sitesList);
    } else {
      this.trustedSites.sitesString += "\n" + all.substring(0, untrustedPos);
      this.untrustedSites.siteString += all.substring(all.indexOf("\n", untrustedPos + 2));
    }
    this.untrustedSites.remove(this.trustedSites.sitesList);
    this.populateUrlList();
    return null;
  },
  
  export: function(file) {
    if(typeof(file)=="undefined") return this.importExport("export");
    this.serv.writeFile(file, 
      this.trustedSites.sitesList.join("\n") + 
      "\n[UNTRUSTED]\n" +
      this.untrustedSites.sitesList.join("\n")
    );
    return null;
  },
  
  
  
  buttonToTitle: function(btid) {
    return "NoScript - " + document.getElementById(btid).getAttribute("label");
  }
}

/*
function Site(url, perm, temp, disabled) {
  this.url = url;
  this.perm = perm;
  this.temp = temp;
  this.disabled = disabled;
}

Site.prototype = {
  get status() { return this.perm ? "TRUSTED" : "UNTRUSTED" }
}

Site.sort = function(array, field, descending) {
  array.sort(function(a,b) {
    var res;
    if(field in a) {
      if(field in b) {
        a = a[field]; b = b[field];
        res =a < b ? -1 : a > b ? 1 : 0;
      } else {
        res = 1;
      }
    } else {
      res=(field in b)? -1 : 0;
    }
    return descending ? -res : res;
  });
  this.currentSorting.field = field;
  this.currentSorting.descending = descending;
  return array;
}

Site.currentSorting = { field: 'url', descending: false };

var policyModel = {
  data: [],
  get rowCount() { return this.data.length;  },
  
  _getColName: function(col) {
    if(!col) return null;
    const id=(col && col.id)?col.id:col;
    var pos = id.lastIndexOf("-");
    return id.substring(pos + 1);
  },
  getCellText: function(row, col) {
    var colName = this._getColName(col);
    if(!colName) return "";
    return this.data[row][colName];
  },
  //setCellText: function(row, column, text) {},
  setTree: function(treeBox) { this.treeBox = treeBox; },
  isContainer: function(index) { return false; },
  isSeparator: function(index) { return false; }, 
  isSorted: function() {},
  getLevel: function(index) { return 0; },
  getImageSrc: function(row, col) {
   return null;
  },
  getCellProperties: function(row, col, props) {},
  getColumnProperties: function(column, elem, prop) {}, 
  getRowProperties: function(row, props) { },

  isContainerOpen: function(index) { },
  isContainerEmpty: function(index) { return false; },
  canDropOn: function(index) { return false; },
  canDropBeforeAfter: function(index, before) { return false; },
  drop: function(row, orientation) { return false; },
  
  getParentIndex: function(index) { return 0; },
  hasNextSibling: function(index, after) { return false; },
  getProgressMode: function(row, column) { },
  getCellValue: function(row, column) { },
  toggleOpenState: function(index) { },
  cycleHeader: function(col, elem) { 
    if(!elem) {
      elem=col.element;
    }
    const colName = this._getColName(col);
    const descending = elem.getAttribute("sortDirection") == "ascending";
    elem.setAttribute("sortDirection", descending ? "descending" : "ascending");
    Sitesort(this.data, colName, descending);
    this.treeBox.invalidate();
  },
  selectionChanged: function() {  
    this._messageSelected(this.data[this.selection.currentIndex]);
  },
  
  cycleCell: function(row, column) { },
  isEditable: function(row, column) { return false; },
  performAction: function(action) { },
  performActionOnRow: function(action, row) { },
  performActionOnCell: function(action, row, column) { }
};
*/


