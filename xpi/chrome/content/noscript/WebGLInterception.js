var WebGLInterception = {
  sites: {},
  handler(ev) {
    WebGLInterception.record(ev.target, ns.getSite(ev.target.documentURI || ev.target.ownerDocument.documentURI), true);
  },
  record(ctx, site, fromDOM) {
    ns.tagForReplacement(ctx, {
      url: site,
      site: site,
      originSite: site,
      mime: "WebGL"
    });
    let doc = ctx.ownerDocument || ctx;
    if (fromDOM) {
      let ds = DOM.getDocShellForWindow(doc.defaultView);
      if (ds.isLoadingDocument) { // prevent fallback redirection from hiding us
        let sites = this.sites;
        sites[site] = doc.documentURI;
        doc.defaultView.addEventListener("load", () => delete sites[site], false);
      }
    }
    ns.recordBlocked(doc.defaultView, site, site);
  },
  get interceptionDef() {
    delete this.interceptionDef;
    return (this.interceptionDef = function() {
      var proto = HTMLCanvasElement.prototype;
      var getContext = proto.getContext;
      proto.getContext = function(type) {
        if (type && type.toString().indexOf("webgl") !== -1) {
          var ev = this.ownerDocument.createEvent("Events");
          ev.initEvent("NoScript:WebGL", true, false);
          (this.parentNode ? this : this.ownerDocument)
            .dispatchEvent(ev);
          return null;
        }
        return getContext.call(this, "2d");
      };
    }.toSource() + "()");
  },
  reloadAllowed(docShell) {
    let curURL = docShell.currentURI.spec;
    let site = ns.getSite(curURL);
    if (site in this.sites) {
      let url = this.sites[site];
      delete this.sites[site];
      if (url !== curURL) {
        docShell.loadURI(url, Ci.nsIWebNavigation.LOAD_FLAGS_NONE, null, null, null);
        return true;
      }
    }
    return false;
  },
  hook(doc, site) {
    if (!(ns.isAllowedObject(site, "WebGL", site, site) || ns.isAllowedMime("WebGL", site))) {
      doc.addEventListener("NoScript:WebGL", this.handler, false, true);
      if (site in this.sites) {
        this.record(doc, site);
      }
      return this.interceptionDef;
    }
    return null;
  }
};
