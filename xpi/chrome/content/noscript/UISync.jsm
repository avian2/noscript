var EXPORTED_SYMBOLS = ["UISync"];

let { interfaces: Ci, classes: Cc, utils: Cu, results: Cr } = Components;

const HTMLDocument = Ci.nsIDOMHTMLDocument;
const messages = ["NoScript:reload", "NoScript:reloadAllowedObjects"];

function UISync(ctx) {
  this.ctx = ctx;
  this.wire();
  let ns = ctx.ns;
  ns.clearClickHandler.install(ctx);
}

UISync.prototype = {
  wire: function() {
    let ctx = this.ctx;
    ctx.addEventListener("NoScript:contentLoad", ev => {
       ev.stopPropagation();
       this.sync();
    }, true);
    ctx.addEventListener("DOMContentLoaded", ev => {
      this.onContentLoad(ev);
    }, true);
    ctx.addEventListener("pageshow", ev => {
      this.onPageShow(ev);
    }, true);
    ctx.addEventListener("pagehide", ev => {
      this.onPageHide(ev);
    }, true);
    for (let m of messages) {
      ctx.addMessageListener(m, this);
    }
  },

  unwire: function() {
    for (let m of messages) {
      ctx.removeMessageListener(m, this);
    }
  },

  receiveMessage: function(msg) {
    this.ctx.ns.log(`Received message ${msg.name} ${msg.data.toSource()}`);
    let ctx = this.ctx;
    switch(msg.name) {
      case "NoScript:reload":
        let { reloadPolicy, snapshots } = msg.data;
        ctx.ns.reload(msg.target, reloadPolicy, snapshots);
      break;
      case "NoScript:reloadAllowedObjects":
        ctx.ns.reloadAllowedObjects(msg.target, msg.data.mime);
      break;
      case "NoScript:resetClearClickTimeout":
        ctx.ns.clearClickHandler.re
    }
  },

  sync() {
    let ctx = this.ctx;
    let sites = ctx.ns.getSites(this.ctx);
    if (sites.pluginExtras && sites.pluginExtras.length) {
      sites.pluginExtras = sites.pluginExtras.map(
        pes => pes.length ? pes.map(pe => {
          if (pe.placeholder || pe.document) {
            pe = Object.assign({}, pe);
            if (pe.placeholder) pe.placeholder = { parentNode: !!pe.placeholder.parentNode };
            if (pe.document) pe.document = true;
          }
          return pe;
        }) : pes
      );
    }
    try {
      ctx.sendAsyncMessage("NoScript:syncUI", sites);
    } catch (ex) {
      ctx.ns.dump(ex);
      ctx.ns.dump(sites.toSource());
    }
  },

  notifyMetaRefresh(info) {
    ctx.sendAsyncMessage("NoScript:notifyMetaRefresh", info);
  },

  onContentLoad(ev) {
    var doc = ev.originalTarget;
    if (doc instanceof HTMLDocument) {
      let w = doc.defaultView;
      if (w) {
        let ns = this.ctx.ns;
        ns.setExpando(doc, "domLoaded", true);
        if (w === w.top) {
          let url = doc.URL;
          let jsBlocked = /^https?:/.test(url) && !ns.isJSEnabled(ns.getSite(url), w);
          if (jsBlocked) {
            ns.processMetaRefresh(doc, this.notifyMetaRefresh);
            w.addEventListener("pageshow", ev => this.onPageShowNS(ev), false);
          }
        } else {
          ns.frameContentLoaded(w);
        }
        this.sync();
      }
    }
  },

  onPageShow(ev) {
    let d = ev.originalTarget;
    if (d instanceof HTMLDocument) {
      try {
        if (ev.persisted) {
          this.toggleObjectsVisibility(d, true);
        }
      } catch(e) {}
      this.sync();
    }
  },
  onPageShowNS(ev) {
    let w = ev.currentTarget;
    w.setTimeout(() => this.ctx.ns.detectJSRedirects(w.document), 50);
  },
  onPageHide(ev) {
    let d = ev.originalTarget;
    if (d instanceof HTMLDocument) {
      this.toggleObjectsVisibility(d, false);
    }
    this.sync();
  },

  _tags: ["object", "embed"],
  toggleObjectsVisibility(d, v) {
    var ns = this.ctx.ns;
    var rx = ns.hideOnUnloadRegExp;
    if (!rx) return;
    var callback = v ? showObject : hideObject;
    var params = {
      document: d,
      mimeRx: rx,
      classRx: ns.hideObjClassNameRx,
      className: ns.hideObjClassName,
    };
    let aa = null;
    for (let t  of this._tags) {
      let oo = d.getElementsByTagName(t);
      let j = oo.length;
      if (j) {
        aa = aa || [oo[--j]];
        while(j-- > 0) {
          aa.push(oo[j]);
        }
      }
    }
    if (aa) {
      for (let j = aa.length; j-- > 0;) {
        callback(params, aa[j]);
      }
    }
  },

};

function hideObject(p, o) {
  if (!p.mimeRx.test(o.type)) return;

  var r = p.document.createElement("object");
  r.style.width = o.offsetWidth + "px";
  r.style.height = o.offsetHeight + "px";
  r.style.display = "inline-block";
  o.className += " " + p.className;
  o.parentNode.insertBefore(r, o);
}

function showObject(p, o) {
  var cs = o.className;
  cs = cs.replace(p.classRx, '');
  if (cs != o.className) {
    o.className = cs;
    var r = o.previousSibling;
    if (r instanceof HTMLObjectElement) {
      r.parentNode.removeChild(r);
    }
  }
}
