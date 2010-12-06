var PlacesPrefs = {
  
  QueryInterface: xpcom_generateQI([CI.nsINavBookmarkObserver, CI.nsISupportsWeakReference]),
  bmsvc: CC["@mozilla.org/browser/nav-bookmarks-service;1"].getService(CI.nsINavBookmarksService),
  annsvc: CC["@mozilla.org/browser/annotation-service;1"].getService(CI.nsIAnnotationService),

  LEGACY_NAME: "* NoScript Configuration",
  NAME: "[NoScript]",
  PROP: "bookmarkProperties/description",
  
  dump: function(msg) {
    if (ns.consoleDump) ns.dump("Bookmark-Sync - " + msg);
  },
  
  get uri() {
    delete this.uri;
    var tpl = '<h1>%title%</h1><p>%message%</p>';
    for each(var l in ["title", "message"]) {
      tpl = tpl.replace('%' + l + '%', ns.getString("bookmarkSync." + l).replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    }
    return this.uri = IOS.newURI(
      'data:text/html;charset=UTF-8,' + encodeURIComponent(tpl.replace(/\b(Weave)\b/, '<a href="http://labs.mozilla.com/projects/weave/">$1</a>')
      .replace(/\b(XMarks(\s+extension)?)\b/i, '<a href="https://addons.mozilla.org/en-US/firefox/addon/2410">$1</a>'))
    , null, null);
  },
  
  init: function() {
    this.wrappedJSObject = this;
    this.bmsvc.addObserver(this, false);
  },
  
  dispose: function(ns) {
    this.bmsvc.removeObserver(this, false);
  },
  
  onItemAdded: function(aItemId, aFolder, aIndex) {
    this.sync(aItemId, aFolder, '');
  },
  onItemChanged: function(aBookmarkId, aProperty, aIsAnnotationProperty, aValue) {
    if (aProperty == "uri" || aIsAnnotationProperty && aProperty == this.PROP)
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
  onBeforeItemRemoved: function() {},
  
  _lastId: -1,
  _lastFolderId: -1,
  
  _trans: false,
  _doTransaction: function(callback, args) {
    if (!ns.getPref("placesPrefs")) return;
    
    if (this._trans) return;
    var t = Date.now();
    var ret = false;
    try { 
      this._trans = true;
      this.bmsvc.runInBatchMode({ runBatched: function(pp) { ret = callback.apply(pp.wrappedJSObject, args); } }, this);
    } catch(e) {
      this.dump("Transaction failed: " + e);
    } finally {
      this._trans = false;
      if (ret) this.dump("Transaction done in " + (Date.now() - t) + "ms");
    }
  },
  
  sync: function(id, folderId, url) {
    if (url && !/^(?:https:\/\/void\.noscript\.|data:[\s\S]*%7B[\s\S]*%7D)/.test(url)) return;
    this._doTransaction(this._syncInternal, [id, folderId, url]);
  },

  _syncInternal: function(id, folderId, url) {
    var svc = this.bmsvc;
    try {
      var name = svc.getItemTitle(id);
      if (name != this.NAME && name != this.LEGACY_NAME) return false;
      if (!folderId) folderId = svc.getFolderIdForItem(id);
      name = svc.getItemTitle(folderId);
      if (name != this.NAME && name != this.LEGACY_NAME) return false;
      
      if (id != this._lastId) {
        if (this._lastId > -1) svc.removeItem(this._lastId);
        if (name == this.NAME) this._lastId = id;
      }
      
      if (folderId != this._lastFolderId) {
        if (this._lastFolderId > -1) svc.removeFolder(this._lastFolderId);
        if (name == this.NAME) this._lastFolderId = this.id;
      }

      legacy = true;
      
      var uri = (url || folderId) && svc.getBookmarkURI(id) || null;
      if (uri && (uri instanceof CI.nsIURL) && uri.host == 'void.noscript.net') {
        // legacy querystring + hash parsing, see 1.9.2
        var qs = uri.query.replace(/^\?/, '').split("&");
        var couple;
        for each (var parm in qs) {
          couple = parm.split("=");
          ns.setPref(couple[0], decodeURIComponent(couple[1]));
        }
        ns.policyPB.setCharPref("sites", decodeURIComponent(uri.ref));
        
        
      } else {
        var data = null;
        if (uri) {
          var conf = decodeURIComponent(uri.path).match(/\{[\s\S]*\}/);
          if (conf) data = { conf: conf && conf[0], ts: '' };
        }
        
        data = data || this.getData(id);
        
        if (!(data && data.conf)) return false;
        
        if (data.ts) legacy = false;
        
        this._load(data);

      }
      
      if (legacy) this._trans = false; // force conversion
      
      ns.savePrefs();
      
      this.dump("Retrieve");
      return true;
    
    } catch(e) {
      this.dump("Retrieve error: " + e);
    }
    return false;
  },
  
  _load: function(data) {
    if (data.ts) ns.setPref("placesPrefs.ts", data.ts);
    return ns.restoreConf(data.conf);
  },
  
  save: function() {
    this._doTransaction(this._saveInternal, []);
  },

  _saveInternal: function() {
    var id = -1;
    var svc = this.bmsvc;
    try {

      var oldData;
      
      if (this._lastId > -1) try {
        oldData = this.getData(this._lastId);
        if (oldData) id = this._lastId;
      } catch (missingBookmark) {}
      
      if (id < 1) {
        var parentId = svc.bookmarksMenuFolder;
        var folderId = svc.getChildFolder(parentId, this.NAME);
        
        if (folderId < 1) {
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
      
      if (id > -1) {
        oldData = oldData || this.getData(id);
        if (oldData && oldData.ts != ns.getPref("placesPrefs.ts")) {
          var date = new Date();
          date.setTime(oldData.ts.substring(1));
          if (CC["@mozilla.org/embedcomp/prompt-service;1"
            ].getService(CI.nsIPromptService).confirm(DOM.mostRecentBrowserWindow,
              ns.getString("bookmarkSync.title"), ns.getString("bookmarkSync.confirm", [date.toLocaleString()]))
          ) {
            this._load(oldData);
            ns.savePrefs();
            return false;
          }
        }
      }
      
      
      var conf = ns.serializeConf();
      
      var uri = this.uri;
      
      if (id > -1) {
        if (oldData && oldData.conf == conf) return true;
        var oldURI = svc.getBookmarkURI(id);
        if (!uri.equals(oldURI)) svc.changeBookmarkURI(id, uri);
      } else {
        id = svc.insertBookmark(folderId, uri, 0, this.NAME);
      }
      
      this.setData(id, { ts: '#' + Date.now(), conf: conf });
      
      
      this._lastId = id;
      
      this.dump("Persist");
      return true;
    
    } catch(e) {
      this.dump("Persist error: " + e);
    }
    return true;
  },
  
  _getRawData: function(id) {
    try {
      return this.annsvc.getItemAnnotation(id, this.PROP);
    } catch(e) {
      return null;
    }
  },
  _setRawData: function(id, value) {    
    this.annsvc.setItemAnnotation(id, this.PROP, value, 0, this.annsvc.EXPIRE_NEVER);
    this.bmsvc.setItemLastModified(id, (new Date()).getTime() * 1000);
  },
  
  getData: function(id) {
    var raw = this._getRawData(id);
    var match = raw && raw.match(/^NoScript_Conf(#\d+)#(\{[\s\S]+\})/);
    return match && { ts: match[1], conf: match[2] };
  },
  
  setData: function(id, value) {
    this._setRawData(id, "NoScript_Conf" + value.ts + "#" + value.conf);
    ns.setPref("placesPrefs.ts", value.ts);
  }

}