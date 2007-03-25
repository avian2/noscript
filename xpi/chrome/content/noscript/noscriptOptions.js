/***** BEGIN LICENSE BLOCK *****

NoScript - a Firefox extension for whitelist driven safe JavaScript execution
Copyright (C) 2004-2005 Giorgio Maone - g.maone@informaction.com

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

const g_serv=noscriptUtil.service;
var g_urlList=null;
var g_jsglobal=null;
var g_urlText=null;
var g_addButton=null;
var g_removeButton=null;
var g_dom2=/^(?:http[s]?|file):\/\/([^\.\?\/#,;:\\\@]+(:?\.[^\.\?\/#,;:\\\@]+$|$))/; // 2nd level domain hack
var g_policySites=null;

function nso_init() {
  if(g_serv.uninstalling) { // this should never happen! 
    window.close();
    return;
  }
  g_urlText=document.getElementById("urlText");
  g_urlList=document.getElementById("urlList");
  g_jsglobal=document.getElementById("jsglobal");
  g_addButton=document.getElementById("addButton");
  g_removeButton=document.getElementById("removeButton");
  
  g_policySites=g_serv.jsPolicySites.clone();
  nso_populateUrlList();
  g_jsglobal.setAttribute("checked",g_serv.jsEnabled);
  
  var pingCbx =  document.getElementById("mozopt-browser.send_pings");
  if(pingCbx.getAttribute("label").indexOf("Allow ") == 0) { 
    pingCbx.setAttribute("label", noscriptUtil.getString("allowLocal", ["<a ping...>"]));
    document.getElementById("opt-noping")
            .setAttribute("label", noscriptUtil.getString("forbidLocal", ["<a ping...>"]));
  }
  
  visitCheckboxes(
    function(prefName, inverse, checkbox, mozilla) {
      try {
        var val = mozilla ? g_serv.prefService.getBoolPref(prefName) : g_serv.getPref(prefName);
        checkbox.setAttribute("checked",inverse ? !val: val);
      } catch(ex) {}
    }
  );

  document.getElementById("opt-showTemp").setAttribute("label", noscriptUtil.getString("allowTemp",["[...]"]));
  
  document.getElementById("opt-notify.hide").setAttribute("label",
           noscriptUtil.getString("notifyHide", [g_serv.getPref("notify.hideDelay",3)]));
   
  nso_setSample(g_serv.getPref("sound.block"));
  
  // internationalization hack for "Allow bookmarks" vs "Allow via bookmarks" afterthought :(
  const optBookmarks = document.getElementById("opt-allowBookmarks");
  const lbl1 = optBookmarks.getAttribute("label");
  var lbl2;
  if(/^Allow sites/.test(lbl1) && 
    !/^Allow sites/.test(lbl2 = document.getElementById("lbl-allowBookmarks").getAttribute("value"))) {
    optBookmarks.setAttribute("label", lbl2);
  }
}

function nso_urlListChanged() {
  const selectedItems=g_urlList.selectedItems;
  var removeDisabled=true;
  for(var j=selectedItems.length; j-->0;) {
    if(selectedItems[j].getAttribute("disabled")!="true") {
      removeDisabled=false;
      break;
    }
  } 
  g_removeButton.setAttribute("disabled", removeDisabled);
  nso_urlChanged();
}

function nso_urlChanged() {
  var url=g_urlText.value;
  if(url.match(/\s/)) url=g_urlText.value=url.replace(/\s/g,'');
  var addEnabled=url.length>0 && (url=g_serv.getSite(url)) ;
  if(addEnabled) {
    var match=url.match(g_dom2);
    if(match) url=match[1];
    url=g_policySites.matches(url);
    if( !(addEnabled = !url) ) {
      nso_ensureVisible(url);
    }
  }
  g_addButton.setAttribute("disabled",!addEnabled);
}

function nso_populateUrlList() {
  const sites=g_policySites.sitesList;
  for(var j=g_urlList.getRowCount(); j-->0; g_urlList.removeItemAt(j));
  var site,item;
  
  var match,k,len;
  for(j=0, len=sites.length; j<len; j++) {
    site=sites[j];
    // skip protocol+2ndlevel domain URLs
    if(match=site.match(g_dom2)) {
      item=match[1];
      for(k=sites.length; k-->0;) {
        if(sites[k]==item) {
          item=null;
          break;
        }
      }
      if(!item) continue;
    }
    item=g_urlList.appendItem(site,site);
    if(g_serv.isPermanent(site)) { 
      item.setAttribute("disabled","true");
    } 
    item.style.fontStyle=g_serv.isTemp(site)?"italic":"normal";
  }
  nso_urlListChanged();
}

function nso_ensureVisible(site) {
  var item;
  for(var j=g_urlList.getRowCount(); j-->0;) {
    if((item=g_urlList.getItemAtIndex(j)).getAttribute("value")==site) {
      g_urlList.ensureElementIsVisible(item);
    }
  }
}

function nso_allow() {
  const site=g_serv.getSite(g_urlText.value);
  g_policySites.add(site);
  nso_populateUrlList();
  nso_ensureVisible(site);
  g_addButton.setAttribute("disabled","true");
}



function nso_remove() {
  const selectedItems=g_urlList.selectedItems;
  var site;
  for(var j=selectedItems.length; j-->0;) {
    if(!g_serv.isPermanent(site=selectedItems[j].getAttribute("value"))) {
      g_urlList.removeItemAt(g_urlList.getIndexOfItem(selectedItems[j]));
      g_policySites.remove(site);
    }
  }
}

function nso_save() {
  visitCheckboxes(
    function(prefName, inverse, checkbox, mozilla) {
      if(checkbox.getAttribute("collapsed")!="true") {
        const checked=checkbox.getAttribute("checked")=="true";
        const requestedVal = inverse ? !checked : checked;
        
        if(mozilla) {
          try {
            g_serv.prefService.setBoolPref(prefName, requestedVal);
          } catch(ex) {}
          return;
        }
        
        const prevVal = g_serv.getPref(prefName);
        if(requestedVal != prevVal) {
          g_serv.setPref(prefName, requestedVal);
        }
      }
    }
  );
  const serv=g_serv;
  const global=g_jsglobal.getAttribute("checked")=="true";
  serv.safeCapsOp(function() {
    serv.setJSEnabled(g_policySites.sitesList,true,true);
    serv.jsEnabled=global;
  });
  
  g_serv.setPref("sound.block",nso_getSample());
}

function nso_chooseSample() {
   const title="NoScript - "+document.getElementById("sampleChooseButton").getAttribute("label");
   try {
    const cc=Components.classes;
    const ci=Components.interfaces;
    const fp = cc["@mozilla.org/filepicker;1"].createInstance(ci.nsIFilePicker);
    
    fp.init(window,title, ci.nsIFilePicker.modeOpen);
    fp.appendFilter(noscriptUtil.getString("audio.samples"),"*.wav");
    fp.filterIndex=0;
    const ret=fp.show();
    if (ret==ci.nsIFilePicker.returnOK || ret==ci.nsIFilePicker.returnReplace) {
      nso_setSample(fp.fileURL.spec);
      nso_play();
    }
  } catch(ex) {
    g_serv.prompter.alert(window,title,ex.message);
  }
}

function nso_setSample(url) {
  if(!url) {
    url="chrome://noscript/skin/block.wav";
  }
  document.getElementById("sampleURL").value=url;
}
function nso_getSample() {
  return document.getElementById("sampleURL").value;
}
function nso_play() {
  g_serv.playSound(nso_getSample(),true);
}


function nso_buttonToTitle(op) {
  return 
}

function nso_impexp(callback) {
  const op=callback.name.replace(/nso_/,'');
  const title="NoScript - "+document.getElementById(op+"Button").getAttribute("label");
  try {
    const cc=Components.classes;
    const ci=Components.interfaces;
    const fp = cc["@mozilla.org/filepicker;1"].createInstance(ci.nsIFilePicker);
    
    fp.init(window,title, op=="import"?ci.nsIFilePicker.modeOpen:ci.nsIFilePicker.modeSave);
    fp.appendFilters(ci.nsIFilePicker.filterText);
    fp.appendFilters(ci.nsIFilePicker.filterAll);
    fp.filterIndex=0;
    fp.defaultExtension=".txt";
    const ret=fp.show();
    if (ret==ci.nsIFilePicker.returnOK || ret==ci.nsIFilePicker.returnReplace) {
      callback(fp.file);
    }
    
  } catch(ex) {
    g_serv.prompter.alert(window,title,ex.message);
  }
}


function nso_import(file) {
  if(typeof(file)=="undefined") return nso_impexp(nso_import);
  g_policySites.sitesString += "\n" + g_serv.readFile(file);
  nso_populateUrlList();
  return null;
}

function nso_export(file) {
  if(typeof(file)=="undefined") return nso_impexp(nso_export);
  g_serv.writeFile(file,g_policySites.sitesList.join("\n"));
  return null;
}


function visitCheckboxes(callback) {
  const rxOpt=/^(inv|moz|)opt-(.*)/;
  var j,checkbox,match;
  const opts=document.getElementsByTagName("checkbox");
  for(j=opts.length; j-->0;) {
    checkbox=opts[j];
    if(match=checkbox.id.match(rxOpt)) {
      callback(match[2],match[1]=="inv",checkbox,match[1]=="moz");
    }
  }
}



