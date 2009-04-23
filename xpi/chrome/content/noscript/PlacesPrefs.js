var PlacesPrefs = {
  
  QueryInterface: xpcom_generateQI([CI.nsINavBookmarkObserver, CI.nsISupportsWeakReference, CI.nsISupports]),
  bmsvc: CC["@mozilla.org/browser/nav-bookmarks-service;1"].getService(CI.nsINavBookmarksService),
  // hsvc: CC["@mozilla.org/browser/nav-history-service;1"].getService(CI.nsINavHistoryService),
  // json: CC["@mozilla.org/dom/json;1"].createInstance(CI.nsIJSON),
  
  NAME: "* NoScript Configuration",
  uriPrefix: "https://void.noscript.net/?",
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
  
  onBeginUpdateBatch: function() {},  
  onEndUpdateBatch: function() {},
  onItemRemoved: function() {},
  onItemVisited: function() {},
  onItemMoved: function() {},
  
  _lastVal: null,
  _lastId: -1,
  _lastFolderId: -1,
  
  sync: function(id, folderId, val) {
    if (this._saving) return;
    
    if (val) {
     if (this._lastVal == val || val.indexOf(this.uriPrefix) != 0) return;
    } else if (!folderId) return;

    this._lastVal = val;
    var ns = this.ns;
    var svc = this.bmsvc;
    var t = new Date().getTime();
    try {
      var name = svc.getItemTitle(id);
      if (name != this.NAME) return;
      if (!folderId) folderId = svc.getFolderIdForItem(id);
      name = svc.getItemTitle(folderId);
      if (name != this.NAME) return;
      
      var uri = svc.getBookmarkURI(id);
      if (!(uri instanceof CI.nsIURL)) return;
      
      if (id != this._lastId) {
        if (this._lastId > -1) svc.removeItem(this._lastId);
        this._lastId = id;
      }
      
      if (folderId != this._lastFolderId) {
        if (this._lastFolderId > -1) svc.removeFolder(this._lastFolderId);
        this._lastFolderId = this.id;
      }
      var qs = uri.query.replace(/^\?/, '').split("&");
      var couple;
      
      this._saving = true;
      try {
        for each (var parm in qs) {
          couple = parm.split("=");
          ns.setPref(couple[0], decodeURIComponent(couple[1]));
        }
        ns.policyPB.setCharPref("sites", decodeURIComponent(uri.ref));

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
    var ns = this.ns;
    try {
      var svc = this.bmsvc;
      const folderName = this.NAME;
      const bookmarkName = folderName;
      
      var parentId = svc.bookmarksMenuFolder;
      var folderId = svc.getChildFolder(parentId, folderName);
      
      if (folderId == 0) {
        folderId = svc.createFolder(parentId, folderName, -1);
      }
      
      this._lastFolderId = folderId;
      var qs = [];
      var exclude = ["version"];
      
      for each (var key in ns.prefs.getChildList("", {})) {
        if (exclude.indexOf(key) < 0) {
          qs.push(key + "=" + encodeURIComponent(ns.getPref(key)));
        }
      }
      
      var query = qs.join("&");
      var hash =  encodeURIComponent(ns.policyPB.getCharPref("sites"));
      var ios = Components.classes["@mozilla.org/network/io-service;1"]
                         .getService(Components.interfaces.nsIIOService);
      var uri = ios.newURI(this.uriPrefix + query + "#" + hash, null, null);
      
      try {
        id = svc.getIdForItemAt(folderId, 0);
      } catch(e) {
        id = 0;
      }
      if (id > 0) {
        var oldUri = svc.getBookmarkURI(id);
        if (uri.equals(oldUri)) return;
        svc.changeBookmarkURI(id, uri);
      } else {
        id = svc.insertBookmark(folderId, uri, 0, bookmarkName);
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