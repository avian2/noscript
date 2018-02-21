'use strict';

var EXPORTED_SYMBOLS = ["UISync"];

let { interfaces: Ci, classes: Cc, utils: Cu, results: Cr } = Components;

const messages = ["NoScript:reload", "NoScript:reloadAllowedObjects",
                  "NoScript:executeJSURL",
                  "NoScript:purgeRecent", "NoScript:forceSync",
                  "NoScript:unload"];

function UISync(ctx) {
  this.ctx = ctx;
  this.listeners = [];
  this.wire();
  this.scheduleSync();
}

UISync.prototype = {
  eraser: {
    tapped: null,
    delKey: false,
  },

  addListener(type, handler, ...opts) {
    this.ctx.addEventListener(type, handler, ...opts);
    this.listeners.push({type, handler, opts});
  },
  removeListeners() {
    let ctx = this.ctx;
    let ns = ctx.ns;
    for(let {type, handler, opts} of this.listeners) {
      if (ns.consoleDump) ns.dump(`Removing listener ${type}, ${uneval(handler)}, ${uneval(opts)}`);
      ctx.removeEventListener(type, handler, ...opts);
    }
  },

  _wired: false,
  wire() {
    this._wired = true;
    let ctx = this.ctx;
    let ns = ctx.ns;
    let eraser = this.eraser;

    this.addListener("DOMWindowCreated", () => this.sync());
    this.addListener("NoScript:syncUI", ev => {
       ev.stopPropagation();
       this.scheduleSync();
    }, true);
    this.addListener("DOMContentLoaded", ev => {
      this.onContentLoad(ev);
    }, true);
    this.addListener("pageshow", ev => {
      this.onPageShow(ev);
    }, true);
    this.addListener("pagehide", ev => {
      eraser.tapped = null;
      eraser.delKey = false;
      this.onPageHide(ev);
    }, true);

    
    this.addListener("keyup", ev => {
      let el = eraser.tapped;
      if (el && ev.keyCode === 46 &&
          ns.getPref("eraseFloatingElements")
        ) {
        eraser.tapped = null;
        eraser.delKey = true;
        let doc = el.ownerDocument;
        let w = doc.defaultView;
        if (w.getSelection().isCollapsed) {
          let root = doc.body || doc.documentElement;
          let posRx = /^(?:absolute|fixed)$/;
          do {
            if (posRx.test(w.getComputedStyle(el, '').position)) {
              (eraser.tapped = el.parentNode).removeChild(el);
              break;
            }
          } while ((el = el.parentNode) && el != root);
        }
      }
    }, true);

    this.addListener("mousedown", ev => {
      if (ev.button === 0) {
        eraser.tapped = ev.target;
        eraser.delKey = false;
      }
    }, true);

    this.addListener("mouseup", ev => {
      if (eraser.delKey) {
        eraser.delKey = false;
        ev.preventDefault();
        ev.stopPropagation();
      }
      eraser.tapped = null;
    }, true);

    let fixLinksHandler = ev => {
      if (!ns.getPref("fixLinks")) return;
      let doc = ev.target.ownerDocument;
      if (ns.isJSEnabled(ns.getDocSite(doc), doc.defaultView)) return;
      switch(ev.type) {
        case "click":
          ns.onContentClick(ev);
          break;
        case "change":
          ns.onContentChange(ev);
          break;
      }
    };
    this.addListener("click", fixLinksHandler, true);
    this.addListener("change", fixLinksHandler, true);
    if (ns.implementToStaticHTML) {
      this.addListener("NoScript:toStaticHTML", ctx.ns.toStaticHTMLHandler, false, true);
    }
    for (let m of messages) {
      ctx.addMessageListener(m, this);
    }
    this.messages = messages;
    ns.clearClickHandler.install(ctx);
    if (ns.consoleDump && ctx.content && ctx.content.location)
      ns.dump(`Wired frame script at ${ctx.content.location.href}`);
  },

  unwire() {
    if (!this._wired) return;
    this._wired = false;
    let ctx = this.ctx;
    let ns = ctx.ns;

    ns.clearClickHandler.uninstall(ctx);
    for (let m of this.messages) {
      try {
        ctx.removeMessageListener(m, this);
      } catch (e) {
      }
    }
    this.removeListeners();
    if (ns.consoleDump && ctx.content && ctx.content.location)
      ns.dump(`Unwired frame script at ${ctx.content.location.href}`);
  },

  receiveMessage: function(msg) {
    let ctx = this.ctx;
    let ns = ctx.ns;
    if (ns.consoleDump) try {
      ns.dump(`Received message ${msg.name} ${uneval(msg.data)}`);
    } catch (e) {}
    switch(msg.name) {
      case "NoScript:reload":
        let { innerWindowID, snapshots, reloadPolicy, mustReload } = msg.data;
        ns.reload(msg.target, snapshots, mustReload, reloadPolicy, innerWindowID);
      break;
      case "NoScript:reloadAllowedObjects":
        ns.reloadAllowedObjectsChild(msg.target, msg.data.mime);
      break;
      case "NoScript:executeJSURL":
        {
          let browser = msg.target;
          let {url, callbackId, fromURLBar} = msg.data;
          let openCallback = ns.IPC.child.callback(callbackId);
          ns.executeJSURLInContent(browser, browser.content, url, openCallback, fromURLBar);
        }
        break;
      case "NoScript:resetClearClickTimeout":
        ns.clearClickHandler.rapidFire.ts = 0;
      break;
      case "NoScript:purgeRecent":
        ns.recentlyBlocked = [];
      case "NoScript:forceSync":
        this.sync();
      break;
      case "NoScript:unload":
        this.unwire();
      break;
    }
  },

  _syncScheduled: false,
  scheduleSync() {
    if (this._syncScheduled) return;
    this.ctx.ns.delayExec(() => this.sync(), 500);
    this._syncScheduled = true;
  },
  sync() {
    this._syncScheduled = false;
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
    this.ctx.sendAsyncMessage("NoScript:notifyMetaRefresh", info);
  },

  onContentLoad(ev) {
    var doc = ev.originalTarget;
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
  },

  onPageShow(ev) {
    let d = ev.originalTarget;
    if (d.defaultView) {
      try {
        if (ev.persisted) {
          this.toggleObjectsVisibility(d, true);
        }
      } catch(e) {}
    }
    let ns = this.ctx.ns;
    ns.setExpando(d, "domLoaded", true);
    ns.dump(`Sync on pageshow ${d.URL}`);
    this.sync();
  },
  onPageShowNS(ev) {
    let w = ev.currentTarget;
    w.setTimeout(() => this.ctx.ns.detectJSRedirects(w.document), 50);
  },
  onPageHide(ev) {
    let d = ev.originalTarget;
    if (d.defaultView) {
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
