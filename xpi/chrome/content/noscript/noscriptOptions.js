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

g_ns=new NoScript();
g_urlList=null;
g_jsglobal=null;
g_urlText=null;
g_addButton=null;
g_removeButton=null;
function nso_init() {
  if(g_ns.uninstalling) { // this should never happen! 
    window.close();
    return;
  }
  g_urlText=document.getElementById("urlText");
  g_urlList=document.getElementById("urlList");
  g_jsglobal=document.getElementById("jsglobal");
  g_addButton=document.getElementById("addButton");
  g_removeButton=document.getElementById("removeButton");
  g_urlList.removeItemAt(0);
  const sites=g_ns.sites;
  for(var j=0, len=sites.length; j<len; j++) {
    g_urlList.appendItem(sites[j],sites[j]);
  }
  g_jsglobal.setAttribute("checked",g_ns.jsEnabled);
  nso_urlListChanged();
}

function nso_urlListChanged() {
  g_removeButton.setAttribute("disabled",g_urlList.selectedCount==0);
}

function nso_urlChanged() {
  var url=g_urlText.value;
  if(url.match(/\s/)) url=g_urlText.value=url.replace(/\s/g,'');
  var addEnabled=url.length>0 && (url=g_ns.getSite(url))!=null;
  if(addEnabled) {
    for(var j=g_urlList.getRowCount(); j-->0;) {
      if(g_urlList.getItemAtIndex(j).value==url) {
        addEnabled=false;
        break;
      }
    }
  }
  g_addButton.setAttribute("disabled",!addEnabled);
}

function nso_allow() {
  var site=g_ns.getSite(g_urlText.value);
  g_urlList.appendItem(site,site);
  nso_urlListChanged();
}

function nso_remove() {
  const selectedItems=g_urlList.selectedItems;
  for(var j=selectedItems.length; j-->0;) {
    g_urlList.removeItemAt(g_urlList.getIndexOfItem(selectedItems[j]));
  }
}

function nso_save() {
  g_ns.jsEnabled=g_jsglobal.getAttribute("checked")=="true";
  const sites=[];
  for(var j=g_urlList.getRowCount(); j-->0;) {
    sites[sites.length]=g_urlList.getItemAtIndex(j).value;
  }
  g_ns.sites=sites;
}

