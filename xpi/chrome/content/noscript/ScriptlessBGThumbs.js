{
  let scope = {};
  Cu.import("resource://gre/modules/BackgroundPageThumbs.jsm", scope);
  

  let bpt = scope.BackgroundPageThumbs;
  if (!bpt._NoScript_capture) {
    bpt._NoScript_capture = bpt.capture;
    bpt.capture = function(url, options) {
      Cu.import("resource://gre/modules/PageThumbs.jsm", scope);
      let PageThumbs = scope.PageThumbs;
      let e = PageThumbs._prefEnabled;
      if (!ns.getPref("bgThumbs.allowed")) {
        PageThumbs._prefEnabled = function() false;
      }
      try {
        bpt._NoScript_capture.apply(bpt, arguments);
      } finally {
        PageThumbs._prefEnabled = e;
      }
    };
    
    bpt._destroyBrowser();

    bpt._NoScript_ensureBrowser = bpt._ensureBrowser;
    bpt._ensureBrowser = function() {
      if (!this._thumbBrowser) {
        this._NoScript_ensureBrowser();
        if (this._thumbBrowser && ns.getPref("bgThumbs.disableJS"))
          this._thumbBrowser.messageManager.loadFrameScript(
            "data:text/javascript,docShell.allowJavascript = false", false);
      }
    }
  }
}