{
  let scope = {};
  Cu.import("resource://gre/modules/BackgroundPageThumbs.jsm", scope);

  let bpt = scope.BackgroundPageThumbs;

  if (!bpt._NoScript_) {
    let patched = bpt._NoScript_ = {};
    let patch = (name, f) => {
      patched[name] = bpt[name];
      bpt[name] = f;
    };
    patch("capture",  function() {
      Cu.import("resource://gre/modules/PageThumbs.jsm", scope);
      let PageThumbs = scope.PageThumbs;
      let e = PageThumbs._prefEnabled;
      if (!ns.getPref("bgThumbs.allowed")) {
        PageThumbs._prefEnabled = () => false;
      }
      try {
        bpt._NoScript_.capture.apply(bpt, arguments);
      } finally {
        PageThumbs._prefEnabled = e;
      }
    });
    
    bpt._destroyBrowser();

    patch("_ensureBrowser", function() {
      if (!this._thumbBrowser) {
        this._NoScript_._ensureBrowser.apply(this, arguments);
        if (this._thumbBrowser && ns.getPref("bgThumbs.disableJS"))
          this._thumbBrowser.messageManager.loadFrameScript(
            "data:text/javascript,docShell.allowJavascript = false", false);
      }
    });

    ns.onDisposal(() => {
      let patched = bpt._NoScript_;
      if (!patched) return;
      for(let name of Object.keys(patched)) {
        bpt[name] = patched[name];
      }
      delete bpt._NoScript_;
    });
  }
   
}
