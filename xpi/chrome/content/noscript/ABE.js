// Depends on: ChanUtil

const ABE = {
  checkFrameOpt: function(w, chan) {
    try {
      if (!w) {
        var ph = ChanUtil.extractFromChannel(chan, "noscript.policyHints", true);
        w = ph[3].self || ph[3].ownerDocument.defaultView;
      }
      
      switch (chan.getResponseHeader("X-FRAME-OPTIONS").toUpperCase()) {
        case "DENY":
          return true;
        case "SAMEORIGIN":
          return chan.URI.prePath != w.top.location.href.match(/^https?:\/\/[^\/]*/i)[0];
      }
    } catch(e) {}
    return false;
  }
}

