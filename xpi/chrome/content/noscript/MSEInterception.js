var MSEInterception = {
  sites: {},
  handler(ev) {
    if (typeof ns === "undefined") {
      ev.currentTarget.removeEventListener(ev.type, argument.callee, true);
      return;
    }
    let target = ev.target;
    let mime = ev.detail.mime;
    let doc = target.ownerDocument || target;
    let url = doc.documentURI;
    let site = ns.getSite(url);
    if (ns.forbidMedia && ns.contentBlocker && !(ns.isAllowedObject(url, mime, site, site) || ns.isAllowedMime(mime, site))) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.detail.blocked = true;
      MSEInterception.record(target, url, site, mime, true);
    }
  },
  record(ctx, url, site, mime, fromDOM) {
    let data = {
      url,
      site,
      originSite: site,
      mime
    };
    ns.tagForReplacement(ctx, data);
    ns.countObject(ctx, url);
    let doc = ctx.ownerDocument || ctx;
    if (fromDOM) {
      let ds = DOM.getDocShellForWindow(doc.defaultView);
      if (ds.isLoadingDocument) { // prevent fallback redirection from hiding us
        let sites = this.sites;
        sites[site] = data;
        doc.defaultView.addEventListener("load", () => delete sites[site], false);
      }
    }
    ns.recordBlocked(url, site);
  },

  get interceptionDef() {
    delete this.interceptionDef;
    return (this.interceptionDef = function() {
      let urlMap = new WeakMap();
      let createObjectURL = URL.createObjectURL;
      URL.createObjectURL = function(o, ...args) {
        let url = createObjectURL.call(this, o, ...args);
        if (o instanceof MediaSource) {
          let urls = urlMap.get(o);
          if (!urls) urlMap.set(o, urls = new Set());
          urls.add(url);
        }
        return url;
      };
      let proto = MediaSource.prototype;
      let addSourceBuffer = proto.addSourceBuffer;
      proto.addSourceBuffer = function(mime, ...args) {
        let ms = this;
        let urls = urlMap.get(ms);
        let me = Array.from(document.querySelectorAll("video,audio")).find(e => e.srcObject === ms || urls && urls.has(e.src));
        let exposedMime = `${mime} (MSE)`;
        let ev = new CustomEvent("NoScript:MSE", {cancelable: true, detail: { mime: exposedMime, blocked: false }});
      
        (me || document).dispatchEvent(ev);

        if (ev.detail.blocked) {
          throw new Error(`${exposedMime} blocked by NoScript`);
        }
        return addSourceBuffer.call(ms, mime, ...args);
      };
    }.toSource() + "()");
  },
  reloadAllowed(docShell) {
    let curURL = docShell.currentURI.spec;
    let site = ns.getSite(curURL);
    if (site in this.sites) {
      let {url} = this.sites[site];
      delete this.sites[site];
      if (url !== curURL) {
        docShell.loadURI(url, Ci.nsIWebNavigation.LOAD_FLAGS_NONE, null, null, null);
        return true;
      }
    }
    return false;
  },
  hook(doc, site) {
    let url = doc.documentURI;
    if (!(ns.isAllowedObject(url, "MSE", site, site) || ns.isAllowedMime("MSE", url))) {
      DOM.getFrameMM(doc.defaultView).addEventListener("NoScript:MSE", this.handler, true, true);
      if (site in this.sites) {
        let data = this.sites[site];
        this.record(doc, data.url, data.site, data.mime);
      }
      return this.interceptionDef;
    }
    return null;
  }
};
