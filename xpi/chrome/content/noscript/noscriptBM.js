/***** BEGIN LICENSE BLOCK *****

NoScript - a Firefox extension for whitelist driven safe JavaScript execution
Copyright (C) 2004-2009 Giorgio Maone - g.maone@informaction.com

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
  handleURLBarCommand: function() { // Fx 3.0 command bar interception
    if(!(window.gURLBar && gURLBar.value))
      return;
   
    var originalArguments = arguments;
    var callback = function() { noscriptBM.handleURLBarCommandOriginal.apply(window, originalArguments); };
    
    var shortcut = gURLBar.value;
    var jsrx = /^\s*(?:data|javascript):/i;
    var isJS = jsrx.test(shortcut);
    var allowJS = noscriptUtil.service.getPref("allowURLBarJS", true);
    
    if (isJS && allowJS) {
      if(noscriptUtil.service.executeJSURL(shortcut, callback)) return;
    } else if (window.getShortcutOrURI && (shortcut.indexOf(" ") > 0  && !isJS || shortcut.indexOf(":") < 0)) {
      var url = getShortcutOrURI(shortcut, {});
      if(jsrx.test(url) && noscriptBM.handleBookmark(url, callback))
        return;
    }
    
    callback();
  },
  
  loadURI: function() { // Fx 3.1 command bar interception
    return (window.gURLBar && window.gURLBar.handleCommand && window.gURLBar.handleCommand == arguments.callee.caller) 
           ? noscriptBM.handleURLBarCommand.apply(window, arguments)
           : noscriptBM.handleURLBarCommandOriginal.apply(window, arguments);
  },

  handleBookmark: function(url, openCallback) {
    return noscriptUtil.service.handleBookmark(url, openCallback);
  },
  
  patchPlacesMethod: function(k, m) {
    if(m in k) {
      // Dirty eval hack due to Tab Mix Plus conflict: http://tmp.garyr.net/forum/viewtopic.php?t=8052
      k[m] = eval(k[m].toSource()
        .replace(/\b\w+\.checkURLSecurity\(/, 'noscriptBM.checkURLSecurity('))
    }
  },
  
  checkURLSecurity: function(node) {
    var patch = arguments.callee;
    if(!noscriptBM.placesUtils.checkURLSecurity(node)) return false;
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
      patch._reentrant = false;
    }
  },
  
  onLoad: function(ev) {
    ev.currentTarget.removeEventListener("load", arguments.callee, false);
    if(!noscriptUtil.service) return;
    
    // patch bookmark clicks
    if(window.BookmarksCommand && !noscriptBM.openOneBookmarkOriginal) { 
      noscriptBM.openOneBookmarkOriginal = BookmarksCommand.openOneBookmark;
      BookmarksCommand.openOneBookmark = noscriptBM.openOneBookmark;
    }
    
    // patch URLBar for keyword-triggered bookmarklets
    if(window.handleURLBarCommand && !noscriptBM.handleURLBarCommandOriginal) { // Fx 3.0
      noscriptBM.handleURLBarCommandOriginal = window.handleURLBarCommand;
      window.handleURLBarCommand = noscriptBM.handleURLBarCommand;
    } else { // Fx 3.1
      noscriptBM.handleURLBarCommandOriginal = window.loadURI;
      window.loadURI = noscriptBM.loadURI;
    }
    var pu = window.PlacesUIUtils || window.PlacesUtils || false;
    if (typeof(pu) == "object" && !noscriptBM.placesUtils) {
      noscriptBM.placesUtils = pu;
      window.setTimeout(function() {
        var methods = ["openNodeIn", "openSelectedNodeWithEvent"];
        for each (method in methods)
          noscriptBM.patchPlacesMethod(pu, method);
      }, 0);
    }
  }
};

window.addEventListener("load", noscriptBM.onLoad, false);

