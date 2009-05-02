var PlacesPrefs = {
  
  QueryInterface: xpcom_generateQI([CI.nsINavBookmarkObserver, CI.nsISupportsWeakReference, CI.nsISupports]),
  bmsvc: CC["@mozilla.org/browser/nav-bookmarks-service;1"].getService(CI.nsINavBookmarksService),
  // hsvc: CC["@mozilla.org/browser/nav-history-service;1"].getService(CI.nsINavHistoryService),
  json: CC["@mozilla.org/dom/json;1"].createInstance(CI.nsIJSON),
  
  LEGACY_NAME: "* NoScript Configuration",
  NAME: "[NoScript]",
  
  get uriTemplate() {
    delete this.uriTemplate;
    var t = '<h1>%title%</h1><p>%message%</p><hr />';
    for each(var l in ["title", "message"]) {
      t = t.replace('%' + l + '%', this.ns.getString("bookmarkSync." + l).replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    }
    return this.uriTemplate = 'data:text/html;charset=UTF-8,' + encodeURIComponent(t.replace(/\b(Weave)\b/, '<a href="http://labs.mozilla.com/projects/weave/">$1</a>')
      .replace(/\b(XMarks(\s+extension)?)\b/i, '<a href="https://addons.mozilla.org/en-US/firefox/addon/2410">$1</a>')) + '%DATA%';
  },
  
  init: function(ns) {
    this.ns = ns;
    this.bmsvc.addObserver(this, true);
  },
  
  onItemAdded: function(aItemId, aFolder, aIndex) {
    this.sync(aItemId, aFolder);
  },
  onItemChanged: function(aBookmarkId, aProperty, aIsAnnotationProperty, aValue) {
    this.sync(aBookmarkId, null, aValue);
  },
  onItemRemoved: function(id, folderId, index) {
    if (id == this._lastId || id == this._lastFolderId) {
      this._lastId = this._lastFolderId = -1;
    }
  },
  onBeginUpdateBatch: function() {},  
  onEndUpdateBatch: function() {},
  onItemVisited: function() {},
  onItemMoved: function() {},
  
  _lastVal: null,
  _lastId: -1,
  _lastFolderId: -1,
  
  sync: function(id, folderId, val) {
    if (this._saving) return;
    
    if (val) {
     if (!/^(?:https:\/\/void\.noscript\.|data:)/.test(val) || this._lastVal == val) return;
    } else if (!folderId) return;

   
    var ns = this.ns;
    var svc = this.bmsvc;
    var t = new Date().getTime();
    try {
      var name = svc.getItemTitle(id);
      if (name != this.NAME && name != this.LEGACY_NAME) return;
      if (!folderId) folderId = svc.getFolderIdForItem(id);
      name = svc.getItemTitle(folderId);
      if (name != this.NAME && name != this.LEGACY_NAME) return;
      this._lastVal = val;
    
      var uri = svc.getBookmarkURI(id);

      if (id != this._lastId) {
        if (this._lastId > -1) svc.removeItem(this._lastId);
        if (name == this.NAME) this._lastId = id;
      }
      
      if (folderId != this._lastFolderId) {
        if (this._lastFolderId > -1) svc.removeFolder(this._lastFolderId);
        if (name == this.NAME) this._lastFolderId = this.id;
      }
      
      this._saving = true;
      try {
      
        if ((uri instanceof CI.nsIURL) && uri.host == 'void.noscript.net') {
          // legacy querystring + hash parsing, see 1.9.2
          var qs = uri.query.replace(/^\?/, '').split("&");
          var couple;
          for each (var parm in qs) {
            couple = parm.split("=");
            ns.setPref(couple[0], decodeURIComponent(couple[1]));
          }
          ns.policyPB.setCharPref("sites", decodeURIComponent(uri.ref));
        } else {
          // JSON parsing, 1.9.2.1 and above
          var data = this.json.decode(decodeURIComponent(uri.path).match(/\{[\s\S]*\}/)[0]);
          var prefs = data.prefs;
          for (var key in prefs) ns.setPref(key, prefs[key]); 
          ns.policyPB.setCharPref("sites", data.whitelist);
        }
        ns.savePrefs();
      } finally {
        this._saving = false;
      }
      if (ns.consoleDump) ns.dump("Preferences Bookmark-Sync done in " + (new Date().getTime() - t) + "ms");
    } catch(e) {
      if (ns.consoleDump) ns.dump("Bookmark-Sync error: " + e);
    }
  },
  
  _saving: false,
  save: function() {
    // http://developer.mozilla.org/en/nsINavBookmarksService
    if (this._saving) return;
    this._saving = true;
    var t = new Date().getTime();
    var id = -1;
    var ns = this.ns;
    var svc = this.bmsvc;
    try {

      var oldURI = null;
      
      if (this._lastId) try {
        oldURI = svc.getBookmarkURI(this._lastId);
        if (oldURI.schemeIs("data"))
          id = this._lastId;
      } catch(missingBookmark) {}
      
      if (id < 0) {
        var parentId = svc.bookmarksMenuFolder;
        var folderId = svc.getChildFolder(parentId, this.NAME);
        
        if (folderId == 0) {
          try {
            svc.removeFolder(svc.getChildFolder(parentId, this.LEGACY_NAME));
          } catch(missingLegacy) {}
          folderId = svc.createFolder(parentId, this.NAME, -1);
        }
        
        this._lastFolderId = folderId;
        try {
          id = svc.getIdForItemAt(folderId, 0);
        } catch(e) {
          id = -1;
        }
      }
      
      var exclude = ["version"];
      var prefs = {};
      for each (var key in ns.prefs.getChildList("", {})) {
        if (exclude.indexOf(key) < 0) {
          prefs[key] = ns.getPref(key);
        }
      }
      var jsonText = this.json.encode({ prefs: prefs, whitelist: ns.policyPB.getCharPref("sites") });
      var uri = ns.siteUtils.ios.newURI(this.uriTemplate.replace('%DATA%', encodeURIComponent(jsonText)), null, null);
      
      if (id > -1) {
        oldURI = oldURI || svc.getBookmarkURI(id);
        if (uri.equals(oldURI)) return;
        svc.changeBookmarkURI(id, uri);
      } else {
        id = svc.insertBookmark(folderId, uri, 0, this.NAME);
      }
      this._lastId = id;
      
      if (ns.consoleDump) ns.dump("Preferences Bookmark-Persist done in " + (new Date().getTime() - t) + "ms");
    } catch(e) {
      if (ns.consoleDump) ns.dump("Bookmark-Persist error: " + e);
    } finally {
      this._saving = false;
    }
  }
}