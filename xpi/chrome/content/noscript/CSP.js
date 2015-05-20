var CSP = {
  HEADER_NAME: "Content-Security-Policy",
  HEADER_VALUE: "script-src 'none'",

  block: function(window) {
    window._blockedByCSP = true;
    let doc = window.document;
    if (doc.documentElement === null) return;
    let meta = doc.createElement("meta");
    meta.setAttribute("http-equiv", this.HEADER_NAME);
    meta.setAttribute("content", this.HEADER_VALUE);
    doc.documentElement.appendChild(meta);
    doc.removeChild(meta);
  },
  isBlocked: function(window) window && window._blockedByCSP,
  observe: function(subject, topic, data) {
    let window = subject.defaultView;
    if (this.isBlocked(window)) {
       this.block(window);
    }
  },
  QueryInterface: xpcom_generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference])
}

OS.addObserver(CSP, "document-element-inserted", true);
