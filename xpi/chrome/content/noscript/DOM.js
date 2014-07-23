const DOM = {
  
  maxZIndex: "99999999",
  
  confirm: function(s) {  // for interactive debugging purposes
    return this.mostRecentBrowserWindow.confirm(s);
  },
   
  findBrowser: function(chrome, win) {
    
    var overlay = chrome.noscriptOverlay;
    if (!overlay) return null;
    
    var browser = overlay.currentBrowser;
    if (browser.contentWindow == win) return browser;
    
    var browsers = overlay.browsers;
    if (!browsers) return null;
    
    for (var j = browsers.length; j-- > 0;) {
      browser = browsers[j];
      if (browser.contentWindow == win) return browser;
    }
    
    return null;
  },
  
  findWindow: function(ctx) {
    if (!(ctx instanceof Ci.nsIDOMWindow)) {
      if (ctx instanceof Ci.nsIDOMDocument) {
        ctx = ctx.defaultView;
      } else if(ctx instanceof Ci.nsIDOMNode) {
        ctx = ctx.ownerDocument.defaultView;
      } else return null; 
    }
    return ctx;
  },
  
  findBrowserForNode: function(ctx) {
    if (!ctx) return null;
    var bi = null;
    try {
      ctx = this.findWindow(ctx);
      if (!ctx) return null;
      try {
        ctx = Cu.lookupMethod(ctx, "top")();
      } catch(e) {
        ctx = ctx.top;
      }
      var bi = this.createBrowserIterator(this.getChromeWindow(ctx));
      
      for (var b; b = bi.next();) {
        try {
          if (b.contentWindow == ctx) return b;
        } catch(e) {}
      }
    } catch(e) {
    } finally {
      if (bi) bi.dispose();
      ctx = null;
    }
   
    return null;
  },
  
  getDocShellForWindow: function(window) {
    try {
      return window.QueryInterface(Ci.nsIInterfaceRequestor)
                   .getInterface(Ci.nsIWebNavigation)
                   .QueryInterface(Ci.nsIDocShell);
    } catch(e) {
      return null;
    }
  },
    
  getChromeWindow: function(window) {
    try {
      return this.getDocShellForWindow(window.top)
        .QueryInterface(Ci.nsIDocShellTreeItem).rootTreeItem
        .QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIDOMWindow).window;
    } catch(e) {
      return null;
    }
  },
  
  get windowMediator() {
    delete this.windowMediator;
    return this.windowMediator = Cc['@mozilla.org/appshell/window-mediator;1']
                  .getService(Ci.nsIWindowMediator);
  },
  
  get browserWinURI() {
    let uri = this.browserWinChromeURI;
    if (!uri) return null;
    delete this.browserWinURI;
    return this.browserWinURI = uri.schemeIs("chrome")
      ? Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIChromeRegistry).convertChromeURL(uri)
      : uri;
  },
  get browserWinChromeURI() {
    let w = this.mostRecentBrowserWindow;
    if (!w) return null;
    delete this.browserWinChromeURI;
    return this.browserWinChromeURI = w.document.documentURIObject;
  },
  
  browserWinType: 'navigator:browser',
  perWinType: function(delegate) {
    var wm = this.windowMediator;
    var w = null;
    var aa = Array.slice(arguments, 0);
    for each(var type in ['navigator:browser', 'emusic:window', 'Songbird:Main']) {
      aa[0] = type;
      w = delegate.apply(wm, aa);
      if (w) {
        this.browserWinType = type;
        break;
      }
    }
    return w;
  },
  
  get mostRecentBrowserWindow() this.windowMediator.getMostRecentWindow(this.browserWinType, true) ||
      this.perWinType(this.windowMediator.getMostRecentWindow, true),
  get windowEnumerator()  this.windowMediator.getZOrderDOMWindowEnumerator(this.browserWinType, true) ||
    this.perWinType(this.windowMediator.getZOrderDOMWindowEnumerator, true),
    
  createBrowserIterator: function(initialWin) new BrowserIterator(initialWin),
  
  addClass: function(e, c) {
    var cur = e.className;
    if (cur) {
      var cc = cur.split(/\s+/);
      if (cc.indexOf(c) > -1) return;
      cc.push(c);
      e.className = cc.join(" ");
    } else e.className += " " + c;
  },
  removeClass: function(e, c) {
    var cur = e.className;
    if (cur) {
      var cc = cur.split(/\s+/);
      for (var pos; (pos = cc.indexOf(c)) > -1;)
        cc.splice(pos, 1);
      
      e.className = cc.join(" ");
    }
  },
  toggleClass: function(e, c, add) {
    if (typeof add == "undefined")
      add = !this.hasClass(e, c);
    if (add) this.addClass(e, c);
    else this.removeClass(e, c);
    return add;
  },
  hasClass: function(e, c) {
    var cur = e.className;
    return cur && cur.split(/\s+/).indexOf(c) > -1;
  },
  
  _idCounter: Math.round(Math.random() * 9999),
  rndId: function() {
    return Date.now().toString(32) + "_" + (this._idCounter++).toString(32) + "_" + Math.round(Math.random() * 9999999).toString(32);
  },
  
  elementContainsPoint: function(el, p) {
    var rect = el.getBoundingClientRect();
    return p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
  }
};

function BrowserIterator(initialWin) {
  if (!initialWin) {
    initialWin = DOM.mostRecentBrowserWindow;
  }
  this.currentWin = this.initialWin = initialWin;
  this.initPerWin();
}
BrowserIterator.prototype = {
 
  initPerWin: function() {
    var w = this.currentWin;
    var overlay;
    if (w) {
      if (w.wrappedJSObject) w = w.wrappedJSObject;
      overlay = ("noscriptOverlay" in w) ? w.noscriptOverlay : null;
    } else overlay = null;
    
    if (overlay) {
      this.browsers = overlay.browsers;
      this.currentTab = overlay.currentBrowser;
    } else  {
      this.currentTab = this.currentWin = null;
      this.browsers = [];
    }
    this.mostRecentTab = this.currentTab;
    this.curTabIdx = 0;
  },
  
  next: function() {
    var ret = this.currentTab;
    this.currentTab = null;
    if (ret != null) return ret.wrappedJSObject || ret;
    if(!this.initialWin) return null;
    if (this.curTabIdx >= this.browsers.length) {
      if (!this.winEnum) {
        this.winEnum = DOM.windowEnumerator;
      }
      if (this.winEnum.hasMoreElements()) {
        this.currentWin = this.winEnum.getNext();
        if (this.currentWin != this.initialWin){
           this.initPerWin();
        }
        return this.next();
      } else {
        this.dispose();
        return null;
      }
    }
    this.currentTab = this.browsers[this.curTabIdx++];
    if (this.currentTab == this.mostRecentTab) this.next();
    return this.next();
  },
  dispose: function() {
    if (!this.initialWin) return; // already disposed;
    this.initialWin = 
      this.currentWin = 
      this.browsers = 
      this.currentTab = 
      this.mostRecentTab = 
      this.winEnum = 
      null;
  },
  
  find: function(filter) {
    try {
      for (var b; b = this.next();) {
        if (filter(b)) {
          return b;
        }
      }
    } finally {
      this.dispose();
      filter = null;
    }
    return null;
  }
};
