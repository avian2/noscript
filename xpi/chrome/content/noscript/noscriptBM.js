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
  var node = this._activeView.selectedURINode;
  if (!node) return;
  const url = node.uri;
  node = null;
  var openCallback = function(url) { 
    oldMethod.apply(PlacesController, args); 
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
  if(m in PlacesController) {
    var oldMethod = PlacesController[m];
    PlacesController[m] = function() { _noScript_PC_genericPatch.call(this, oldMethod, arguments); };
  }
}

function _noScript_BM_install() {
  if(window.BookmarksCommand) {
    BookmarksCommand._noScript_BM_openOneBookmark_original = BookmarksCommand.openOneBookmark;
    BookmarksCommand.openOneBookmark = _noScript_BM_openOneBookmark;
  }
  if(window.PlacesController) {
    var methods = ["mouseLoadURI", "openLinkInNewWindow", "openLinkInNewTab", "openLinkInCurrentWindow"];
    var m;
    for(var j = methods.length; j-- > 0;) {
      _noScript_patchPCMethod(methods[j]);
    }
  }
  window.setTimeout(function() { window.removeEventListener("load", _noScript_BM_install, false); }, 0);
}

window.addEventListener("load", _noScript_BM_install, false);


