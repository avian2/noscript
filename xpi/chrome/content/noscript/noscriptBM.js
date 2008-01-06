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

var noscriptBM = {
  openOneBookmarkOriginal: null,
  openOneBookmark: function (aURI, aTargetBrowser, aDS) {
    var ncNS = typeof(gNC_NS) == "undefined" ? ( typeof(NC_NS) == "undefined" ?
      "http://home.netscape.com/NC-rdf#" : NC_NS ) : gNC_NS;
    const url = BookmarksUtils.getProperty(aURI, ncNS+"URL", aDS);
    
    var openCallback = function(url) {
      noscriptBM.openOneBookmarkOriginal.apply(BookmarksCommand, [aURI, aTargetBrowser, aDS]);
    };
  
    if(!noscriptBM.handleBookmark(url, openCallback)) {
      openCallback();
    }
  },
  
  handleURLBarCommandOriginal: null,
  handleURLBarCommand: function() {
    if(!(window.gURLBar && gURLBar.value))
      return;
    var shortcut = gURLBar.value;
    var jsrx = /\s*javascript:/i;
    var originalArguments = arguments;
    callback = function() { noscriptBM.handleURLBarCommandOriginal.apply(window, originalArguments); };
    if(window.getShortcutOrURI && (shortcut.indexOf(" ") > 0  && !jsrx.test(shortcut) || shortcut.indexOf(":") < 0)) {
      var url = getShortcutOrURI(shortcut, {});
      if(jsrx.test(url) && noscriptBM.handleBookmark(url, callback))
        return;
    }
    callback();
  },

  handleBookmark: function(url, openCallback) {
    return noscriptUtil.service.handleBookmark(url, openCallback);
  },
  
  patchPCMethod: function(m) {
    if(m in PlacesController.prototype) {
      // Dirty eval hack due to Tab Mix Plus conflict: http://tmp.garyr.net/forum/viewtopic.php?t=8052
      PlacesController.prototype[m] = eval(PlacesController.prototype[m].toSource()
        .replace(/\bPlacesUtils\.checkURLSecurity\(/, 'noscriptBM.checkURLSecurity('))
    }
  },
  
  checkURLSecurity: function(node) {
    var patch = arguments.callee;
    if(!PlacesUtils.checkURLSecurity(node)) return false;
    if(patch._reentrant) return true;
    try {
      patch._reentrant = true;
      const url = node.uri;
      node = null;
      var self = this;
      return !noscriptBM.handleBookmark(url, function(url) {
        patch.caller.apply(self, patch.caller.arguments);
        self = null;
      });
    } finally {
      arguments.callee._reentrant = false;
    }
  },
  
  onLoad: function(ev) {
    ev.currentTarget.removeEventListener("load", arguments.callee, false);
    if(!noscriptUtil.service) return;
 
    if(window.BookmarksCommand) { // patch bookmark clicks
      noscriptBM.openOneBookmarkOriginal = BookmarksCommand.openOneBookmark;
      BookmarksCommand.openOneBookmark = noscriptBM.openOneBookmark;
    }
    
    if(window.handleURLBarCommand) { // patch URLBar for keyword-triggered bookmarklets
      noscriptBM.handleURLBarCommandOriginal = window.handleURLBarCommand;
      window.handleURLBarCommand = noscriptBM.handleURLBarCommand;
    }
      
    if(typeof window.PlacesController == "function") {
      window.setTimeout(function() {
        var methods = ["openSelectedNodeIn", "openSelectedNodeWithEvent"];
        for(var j = methods.length; j-- > 0;)
          noscriptBM.patchPCMethod(methods[j]);
      }, 0);
    }
  }
};

window.addEventListener("load", noscriptBM.onLoad, false);

