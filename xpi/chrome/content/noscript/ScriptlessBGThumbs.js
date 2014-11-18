{
  let scope = {};
  Cu.import("resource://gre/modules/BackgroundPageThumbs.jsm", scope)

  let bpt = scope.BackgroundPageThumbs;
  if (!bpt._eb) {
    bpt._eb = bpt._ensureBrowser;
    bpt._destroyBrowser();
  
    bpt._ensureBrowser = function() {
      if (!this._thumbBrowser) {
        this._eb();
        if (this._thumbBrowser) this._thumbBrowser.messageManager.loadFrameScript(
          "data:text/javascript,docShell.allowJavascript = false", false);
      }
    }
  }
}