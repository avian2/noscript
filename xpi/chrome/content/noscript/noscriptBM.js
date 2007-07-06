/***** BEGIN LICENSE BLOCK *****

NoScript - a Firefox extension for whitelist driven safe JavaScript execution
Copyright (C) 2004-2007 Giorgio Maone - g.maone@informaction.com

Contributors: 
  Hwasung Kim

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

function _noScript_BM_openOneBookmark(aURI, aTargetBrowser, aDS) {
  var ncNS = typeof(gNC_NS) == "undefined" ? ( typeof(NC_NS) == "undefined" ?
      "http://home.netscape.com/NC-rdf#" : NC_NS ) : gNC_NS;
  const url = BookmarksUtils.getProperty(aURI, ncNS+"URL", aDS);
  
  var openCallback = function(url) {
    BookmarksCommand._noScript_BM_openOneBookmark_original(aURI, aTargetBrowser, aDS);
  };
  
  if(!_noScript_handleBookmark(url, openCallback)) {
    openCallback();
  }
}

function _noScript_PC_genericPatch(oldMethod, args) {
  var node = this._view.selectedURINode;
  if (!node) return;
  const url = node.uri;
  node = null;
  var self = this;
  var openCallback = function(url) { 
    oldMethod.apply(self, args); 
  }
  if(!_noScript_handleBookmark(url, openCallback)) {
    openCallback(url);
  }
}

function _noScript_handleBookmark(url, openCallback) {
  if(!url) return true;
  const ns = noscriptUtil.service;
  const allowBookmarklets = !ns.getPref("forbidBookmarklets", false);
  const allowBookmarks = ns.getPref("allowBookmarks", false);
  if((!ns.jsEnabled) && 
    (allowBookmarks || allowBookmarklets)) {
    try {
      if(allowBookmarklets && url.toLowerCase().indexOf("javascript:") == 0) {
        var browserWindow =  Components.classes["@mozilla.org/appshell/window-mediator;1"]
            .getService(Components.interfaces.nsIWindowMediator)
            .getMostRecentWindow("navigator:browser");
        var browser = browserWindow.getBrowser().selectedBrowser;
        var site = ns.getSite(browserWindow.noscriptOverlay.srcDocument.documentURI);
        if(browser && !ns.isJSEnabled(site)) {
          var snapshot = ns.jsPolicySites.sitesString;
          try {
            ns.setJSEnabled(site, true);
            if(Components.utils && typeof(/ /) == "object") { // direct evaluation, after bug 351633 landing
              var sandbox = Components.utils.Sandbox(browserWindow.content);
              sandbox.window = browserWindow.content;
              sandbox.document = sandbox.window.document;
              Components.utils.evalInSandbox(
                "with(window) { " + decodeURIComponent(url.replace(/^javascript:/i, "")) + " }", sandbox);
            } else {
              openCallback(url);
            }
            return true;
          } finally {
            ns.flushCAPS(snapshot);
          }
        }
      } else if(allowBookmarks) {
        ns.setJSEnabled(ns.getSite(url), true);
      }
    } catch(silentEx) {
      dump(silentEx);
    }
  }
  return false;
}

function _noScript_patchPCMethod(m) {
  if(m in PlacesController.prototype) {
    var oldMethod = PlacesController.prototype[m];
    PlacesController.prototype[m] = function() { _noScript_PC_genericPatch.call(this, oldMethod, arguments); };
  }
}

function _noScript_BM_install(ev) {
  ev.currentTarget.removeEventListener("load", arguments.callee, false);
  if(window.BookmarksCommand) {
    BookmarksCommand._noScript_BM_openOneBookmark_original = BookmarksCommand.openOneBookmark;
    BookmarksCommand.openOneBookmark = _noScript_BM_openOneBookmark;
  }
  if(typeof window.PlacesController == "function") {
     var methods = ["openSelectedNodeIn"];
    for(var j = methods.length; j-- > 0;)
      _noScript_patchPCMethod(methods[j]);
  }
}
window.addEventListener("load", _noScript_BM_install, false);

