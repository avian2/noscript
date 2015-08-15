function ClearClickHandler(ns) {
  this.ns = ns;
  if (ns.geckoVersionCheck("1.9.2") < 0) {
    INCLUDE("ClearClickHandlerLegacy");
  }
}

ClearClickHandler.prototype = {

  uiEvents: ["mousedown", "mouseup", "click", "dblclick", "drop", "keydown", "keypress", "keyup", "blur"],

  rapidFire: {
    events: ["keydown", "mousedown", "mouseover"],
    quarantine: 800,
    site: null,
    ts: 0,
    mouse: false,
    lastOver: { x: 0, y: 0, site: '', ts: 0 },

    check: function(ev, site, ts) {
      const type = ev.type;

      let mouse = false, over = false;
      switch(type[0]) {
        case 'c': case 'm':
          mouse = true;
          over = type === "mouseover";
        case 'k':
        break;

        default:
          return false;
      }

      // ns.log(ev.type + " " + ev.target + "@" + site + " <- " + this.site + " -- " + ev.timeStamp)

      let lo = this.lastOver;

      if (this.mouse === mouse) {
        if (site !== this.site) {
          let contentRx = /^(?:(?:ht|f)tps?|data|javascript|feed):/i;
          if (contentRx.test(this.site) &&
              (contentRx.test(site) || !contentRx.test(ev.target.ownerDocument.defaultView.top.location.href))
              ) {

            if (lo.site && lo.site !== site && (ts - lo.ts) < this.quarantine) {
              let d = ev.target.ownerDocument;
              let w = d.defaultView;
              let de = d.documentElement;
              let width = de.clientWidth;
              let height = de.clientHeight;
              let top = w.mozInnerScreenY + w.scrollY + de.offsetTop;
              let left = w.mozInnerScreenX + w.scrollX + de.offsetLeft;
              // ns.log("HOVER " + ev.target + "@" + lo.site + ", " + top + ", " + left + ", " + (top + height) + ", " + (left + width) + " - " + lo.y + ", " + lo.x );
              if (lo.x > left && lo.x - left < width && lo.y > top && lo.y - top < height) {
                this.ts = ts;
                // ns.log("HOVER TS " + ts);
              }
              lo.site = '';
            }

            if (over) {
               if (ts - lo.ts < this.quarantine) return false;
            } else {
                if (ts - this.ts < this.quarantine) {
                  if (!lo.site) this.ts = ts - this.quarantine / 2;
                  return ns.getPref("clearClick.rapidFireCheck");
                }
            }

          }
        }
      } else this.mouse = mouse;

      this.site = site;

      if (over) {
        if (!ev.target.contentWindow) {
          lo.site = site;
          lo.ts = ts;
          let w = ev.target.ownerDocument.defaultView;
          lo.x = ev.pageX + w.mozInnerScreenX;
          lo.y = ev.pageY + w.mozInnerScreenY;
        }
      } else {
        if (mouse) {
          lo.site = '';
        }
        this.ts = ts;
      }
      return false;
    }
  },

  install: function(browser) {

    var doc = browser.ownerDocument;
    if (!("__ClearClick__" in doc)) {
      doc.__ClearClick__ = true;
      for each(let et in this.rapidFire.events)
        doc.addEventListener(et, this, true);
    }

    var ceh = browser.docShell.chromeEventHandler;
    var l = this._listener;
    for each(var et in this.uiEvents) ceh.addEventListener(et, this, true);
  },


  exceptions: null,

  sameSiteParents: function(w) {
    const ns = this.ns;
    var site = ns.getSite(w.location.href);
    if (site == "about:blank") site = "";
    var parentSite;
    for(var p = w.parent; p != w; w = p, p = w.parent) {
      parentSite = ns.getSite(p.location.href);
      if (!site || /^(?:chrome|resource|about):/.test(parentSite)) {
        site = parentSite;
        continue;
      }
      if (site != parentSite) return false;
    }
    if (ns.consoleDump & LOG_CLEARCLICK) ns.dump("ClearClick skipping, same site parents for " + site);
    return true;
  },

  appliesHere: function(url) {
    const ns = this.ns;
    return ns.appliesHere(ns.clearClick, url) &&
      !(this.exceptions && this.exceptions.test(url));
  },

  checkSubexception: function(url) {
    return this.subexceptions && this.subexceptions.test(url);
  },

  _whitelist: {},
  whitelistLen: 0,
  isWhitelisted: function(w) {

    var l = this._whitelist[w.location.href];
    if (!l) return false;

    var pp = [];
    for(var p = w.parent; p != w; w = p, p = w.parent) {
      pp.push(p.location.href);
    }
    return l.indexOf(pp.join(" ")) > -1;
  },

  whitelist: function(w) {
    if (this.isWhitelisted(w)) return;
    var u = w.location.href;

    var pp = [];
    for(var p = w.parent; p != w; w = p, p = w.parent) {
      pp.push(p.location.href);
    }

    var l;
    if (u in this._whitelist) l = this._whitelist[u];
    else {
      l = this._whitelist[u] = [];
      this.whitelistLen++;
    }

    l.push(pp.join(" "));
  },
  resetWhitelist: function() {
    this._whitelist = {};
    this.whitelistLen = 0;
  },

  isEmbed: function(o) (o instanceof Ci.nsIDOMHTMLObjectElement || o instanceof Ci.nsIDOMHTMLEmbedElement)
                        && !o.contentDocument && ns.getExpando(o, "site") != ns.getSite(o.ownerDocument.documentURI),

  swallowEvent: function(ev) {
    ev.cancelBubble = true;
    ev.stopPropagation();
    ev.preventDefault();
  },

  _zoom: 1,


  getBox: function(o, d, w) {
    if (!d) d = o.ownerDocument;
    if (!w) w = d.defaultView;
    var c = o.getBoundingClientRect();
    var x = c.left, y = c.top; // this is relative to the view port, just like mozInnerScreen*

    return {
      x: x + w.scrollX, y: y + w.scrollY, // add scroll* to make it absolute
      width: c.width, height: c.height,
      screenX: w.mozInnerScreenX + x, screenY: w.mozInnerScreenY + y
    }
  },


  getBG: function(w) {
    var bg = w.document.body && w.getComputedStyle(w.document.body, '').backgroundColor || "#fff";
    return bg == "transparent" ? w != w.parent && this.getBG(w.parent) || "#fff" : bg;
  },

  _constrain: function(box, axys, dim, max, vp, center) {
    var d;
    var scr = "screen" + axys.toUpperCase();
    // trim bounds to take in account fancy overlay borders
    var l = box[dim];
    var n = box[axys];

    if (vp.frame && center && l < vp[dim]) { // expand to viewport if possible
      l = vp[dim];
    }

    if (l > 6) {
      var bStart = Math.floor(l * .1) // 20% border
      var bEnd = bStart;
      if (bStart + n > center) {
        bStart = center - n;
      } else if (l + n - center < bEnd) {
        bEnd = l + n - center;
      }
      box[dim] = (l -= (bStart + bEnd));
      box[axys] = (n += bStart);
      box[scr] += bStart;

    }

    if (l > max) {
      // resize
      if (center) {
        var halfMax = Math.round(max / 2);
        var nn = center - halfMax;
        if (nn > n && center + halfMax > n + l) nn = (n + l) - max;
        box[axys] = nn;
        box[scr] += (nn - n);
        n = nn;
      }
      l = box[dim] = max;
    }
    // slide into viewport
    var vpn = vp[axys];
    d = (n < vpn)
        ? vpn - n
        : (n + l) > (vpn + vp[dim])
          ? (vpn + vp[dim]) - (n + l)
          : 0;

    if (d) {
      n = (box[axys] += d);
      box[scr] += d;
    }

  },

  get canvas() {
    delete this.__proto__.canvas;
    const impl = Cc["@mozilla.org/xul/xul-document;1"].createInstance(Ci.nsIDOMDocument).implementation;
    return this.__proto__.canvas = (("createHTMLDocument" in impl)
      ? impl.createHTMLDocument("")
      : impl.createDocument(
        HTML_NS, "html", impl.createDocumentType(
          "html", "-//W3C//DTD HTML 4.01 Transitional//EN", "http://www.w3.org/TR/html4/loose.dtd"
        ))
      ).createElementNS(HTML_NS, "canvas");
  },

  _semanticContainersRx: /^(?:p|quote|ul|ol|dir|pre|table)$/i,
  isSemanticContainer: function(o) this._semanticContainersRx.test(o.tagName) && o.ownerDocument.URL.indexOf("view-source") !== 0,

  forLog: function(o) {
    return o.tagName + "/" + (o.tabIndex || 0);
  },

  handleEvent: function(ev) {

    const o = ev.target;
    const d = o.ownerDocument;
    if (!d) return;

    if (d === ev.currentTarget || // chrome source, see rapidFire installation
        ev.button || // right or middle click
        ev.keyCode && // special keys, e.g. for UI navigation
        (ev.ctrlKey || ev.metaKey || ev.altKey || ev.keyCode < 48 && ev.keyCode !== 13 && ev.keyCode !== 32)
      ) {
      this.rapidFire.ts = 0;
      // this.ns.log("Reset global event tracking");
      if (d === ev.currentTarget || ev.keyCode) return;
    }


    const w = d.defaultView;
    if (!w) return;

    const ns = this.ns;

    const top = w.top;
    const topURL = top.document.documentURI;

    var isEmbed;
    var ts = Date.now();

    if (this.rapidFire.check(ev, d.documentURIObject.prePath, ts)) {
      this.swallowEvent(ev);
      ns.log("[NoScript ClearClick] Swallowed event " + ev.type + " on " +
             d.documentURI + " (rapid fire from " + this.rapidFire.site +
             " in "  + (ts - this.rapidFire.ts) + "ms)", true);
      return;
    }

    if (ev.type === "mouseover") return;

    if (!("__clearClickUnlocked" in top))
      top.__clearClickUnlocked = !this.appliesHere(topURL);

    if (top.__clearClickUnlocked) return;

    if (!("__clearClickUnlocked" in o)) {

      o.__clearClickUnlocked =
        o === d.documentElement || o === d.body || // key event on empty region
        this.isSemanticContainer(o) ||
        !(isEmbed = this.isEmbed(o)) && // plugin embedding?
          (w == top ||
            ("__clearClickUnlocked" in w
              ? w.__clearClickUnlocked
              : (w.__clearClickUnlocked = this.isWhitelisted(w))
            ) ||
            this.sameSiteParents(w) // cross-site document?
          ) ||
          isEmbed && ns.isClickToPlay(o) ||
          ns.getPluginExtras(o) && ns.getPref("confirmUnblock") || // Just enabled from NS placeholder after prompt?
           this.checkSubexception(isEmbed && (o.src || o.data) || w.location.href)
    }

    if (o.__clearClickUnlocked || w.__clearClickUnlocked) return;

    var p = ns.getExpando(o, "clearClickProps", {});
    var verbose = ns.consoleDump & LOG_CLEARCLICK;
    var etype = ev.type;
    if (verbose) ns.dump(o.tagName + ", " + etype + ", " + p.toSource());

    var obstructed, ctx, primaryEvent;
    try {
      if (etype == "blur") {
        if(/click|key/.test(p.lastEtype)) {
          if (verbose) ns.dump("ClearClick: resetting status on " + this.forLog(o) + " for " + etype);
          if (p.unlocked) p.unlocked = false;
        }
        return;
      }
      if (p.unlocked) return;

      ctx = /mouse|drop/.test(etype)
                && { x: ev.pageX, y: ev.pageY, debug: ev.ctrlKey && ev.button == 1 && ns.getPref("clearClick.debug") }
                || {};
      isEmbed =  (typeof(isEmbed) === "boolean" ? isEmbed : this.isEmbed(o)) // && ns.isWindowlessObject(o);
      if (!(isEmbed || w.frameElement)) return;
      ctx.isEmbed = isEmbed;
      primaryEvent = /^(?:(?:mouse|key)down|drop)$/.test(etype) ||
          // submit button generates a syntethic click if any text-control receives [Enter]: we must consider this "primary"
             etype == "click" && ev.screenX == 0 && ev.screenY == 0 && ev.pageX == 0 && ev.pageY == 0 && ev.clientX == 0 && ev.clientY == 0 && ev.target.form &&
            ((ctx.box = this.getBox(ev.target, d, w)).screenX * ctx.box.screenY != 0) ||
          // allow infra-document drag operations and tabulations
          etype != "blur" && top.__clearClickDoc == d && (top.__clearClickProps.unlocked || top.__clearClickProps.lastEtype == "blur");

      obstructed = (primaryEvent || !("obstructed" in p))
        ? p.obstructed = this.checkObstruction(o, ctx)
        : p.obstructed; // cache for non-primary events
    } catch(e) {
      ns.dump(e);
      obstructed = true;
    } finally {
      p.lastEtype = etype;
      top.__clearClickProps = p;
      top.__clearClickDoc = d;
    }

    var quarantine = ts - (p.ts || 0);

    if (verbose) ns.dump("ClearClick: " + ev.target.tagName + " " + etype +
       "(s:{" + ev.screenX + "," + ev.screenY + "}, p:{" + ev.pageX + "," + ev.pageY + "}, c:{" + ev.clientX + "," + ev.clientY +
       ", w:" + ev.which + "}) - obstructed: " + obstructed + ", check time: " + (Date.now() - ts) + ", quarantine: " + quarantine +
       ", primary: " + primaryEvent + ", ccp:" + (top.__clearClickProps && top.__clearClickProps.toSource()));

    var unlocked = !obstructed && primaryEvent && quarantine > 3000;

    if (unlocked) {
      if (verbose) ns.dump("ClearClick: unlocking " + ev.target.tagName + " " + etype);
      p.unlocked = true;
    } else {

      this.swallowEvent(ev);
      ns.log("[NoScript ClearClick] Swallowed event " + etype + " on " + this.forLog(o) + " at " + w.location.href, true);
      var docShell = DOM.getDocShellForWindow(w);
      var loading = docShell && (docShell instanceof Ci.nsIWebProgress) && docShell.isLoadingDocument;
      if (!loading) {
        p.ts = ts;
        if (primaryEvent && ctx.img && ns.getPref("clearClick.prompt") && !this.prompting) {
          try {
            this.prompting = true;
            var params = {
              url: ctx.isEmbed && (o.src || o.data) || o.ownerDocument.URL,
              pageURL: w.location.href,
              topURL: topURL,
              img: ctx.img,
              locked: false,
              pageX: ev.pageX,
              pageY: ev.pageY,
              zoom: this._zoom
            };
            DOM.findBrowserForNode(w).ownerDocument.defaultView.openDialog(
              "chrome://noscript/content/clearClick.xul",
              "noscriptClearClick",
              "chrome, dialog, dependent, centerscreen, modal",
              params);
            if (!params.locked) {
              w.__clearClickUnlocked = o.__clearClickUnlocked = true
              this.whitelist(w);
            }
          } finally {
            this.prompting = false;
          }
        }
      }
    }
  },

  findParentForm: function(o) {
    var ftype = Ci.nsIDOMHTMLFormElement;
    while((o = o.parentNode)) {
      if (o instanceof ftype) return o;
    }
    return null;
  },


  rndColor: function() {
    var c = Math.round(Math.random() * 0xffffff).toString(16);
    return "#" + ("000000".substring(c.length)) + c;
  },


  maxWidth: 350,
  maxHeight: 200,
  minWidth: 160,
  minHeight: 100,
  _NO_SCROLLBARS: {w: 0, h: 0},
  computeScrollbarSizes: function(window, dElem, body) {
    var fw = window.innerWidth, fh = window.innerHeight;

    if (body && body.ownerDocument.compatMode == "BackCompat") {
      dElem = body;
    }

    var dw = dElem.clientWidth, dh = dElem.clientHeight;
    var w = Math.min(fw, dw), h = Math.min(fh, dh);

    var zoom = window.QueryInterface(Ci.nsIInterfaceRequestor)
            .getInterface(Ci.nsIDOMWindowUtils).screenPixelsPerCSSPixel;

    return { w: (fw - w) * zoom, h: (fh - h) * zoom };
  },

  checkObstruction: function(o, ctx) {
    var d = o.ownerDocument;
    var w = d.defaultView;
    if (!(ctx.isEmbed || d instanceof Ci.nsIDOMHTMLDocument)) {
      o = w.frameElement;
      d = o.ownerDocument;
      w = d.defaultView;
      ctx.isEmbed = true;
    }

    var dElem = d.documentElement;

    var top = w.top;
    var browser = DOM.findBrowserForNode(top);

    if (!browser) return false; // some extensions, e.g. FoxTab, cause this

    var c = this.canvas;
    var gfx = c.getContext("2d");

    var bg = this.getBG(w);

    var bgStyle;
    var box, rootBox, curtain, woi;

    var frame, frameClass, objClass;

    var docPatcher = new DocPatcher(this.ns, o, w);

    var sheet = null;

    var img1 = null, img2 = null, tmpImg = null;

    function Snapshot(w, x, y) {
      gfx.drawWindow(w, Math.round(x), Math.round(y), c.width, c.height, bg);
      if (woi && w == top && rootBox) {
        gfx.fillStyle = bg;
        for each (let b in woi)
          gfx.fillRect(b.screenX - rootBox.screenX - x, b.screenY - rootBox.screenY - y, b.width, b.height);
      }
      this.imageData = gfx.getImageData(0, 0, c.width, c.height);
    }

    Snapshot.prototype = {
      THRESHOLD: ns.getPref("clearClick.threshold") / 100,
      resembles: function(other) {
        if (other === null) return false;

        let buf1 = this.imageData.data;
        let buf2 = other.imageData.data;
        let diff = 0, eq = 0;
        const w = this.imageData.width;
        const h = this.imageData.height;
        const tot = w * h;
        const maxDiff = Math.round(tot * this.THRESHOLD);
        const minEq = tot - maxDiff;
        let resembles = true;
        resembles_loop:
        for (let x = 0; x < w; x++) {
          for (let y = 0; y < h; y++) {
            let p = (y * w + x) * 4;
            let r1 = buf1[p], r2 = buf2[p],
                g1 = buf1[++p], g2 = buf2[p],
                b1 = buf1[++p], b2 = buf2[p];
            if (r1 !== r2 || g1 !== g2 || b1 !== b2) {
              if (++diff > maxDiff) {
                resembles = false;
                break resembles_loop;
              }
            } else if (++eq > minEq) {
              break resembles_loop;
            }
          }
        }
        if (ns.consoleDump & LOG_CLEARCLICK) {
          ns.dump("Diff: " + diff + " / Tot: " + tot + "(maxDiff = " + maxDiff + ")");
        }
        return resembles;
      },
      toURL: function(imageData) {
        gfx.putImageData(imageData || this.imageData, 0, 0);
        return c.toDataURL();
      }
    }

    function compareSnapshots(x1, y1, x2, y2) {
      img1 = null;
      try {
        if (objClass) {
          docPatcher.clean(true);
        }
        if (curtain && !curtain.parentNode) {
          if (o.nextSibling) {
            o.parentNode.insertBefore(curtain, o.nextSibling);
          } else {
            o.parentNode.appendChild(curtain);
          }
        }
        img1 = new Snapshot(w, x1, y1);
      } catch(ex) {
        throw ex;
      } finally {
        docPatcher.clean(false);
      }
      img2 = tmpImg = new Snapshot(top, x2, y2);
      return ret && !img1.resembles(img2);
    }

    var sd = this._NO_SCROLLBARS;

    try {

      docPatcher.linkAlertHack(true);
      docPatcher.fbPresenceHack(true);
      docPatcher.abpTabsHack(true);
      docPatcher.trafficLightHack(true);
      try {
        docPatcher.opaque(true);

        var fbPresence; // hack for Facebooks's fixed positioned widget

        if (ctx.isEmbed) { // objects and embeds
          if (this.ns.getPref("clearClick.plugins", true)) {
            objClass = new ClassyObj(o);
            objClass.append(" __noscriptBlank__");
            docPatcher.blankPositioned(true);
            docPatcher.clean(true);
          } else {
            DOM.addClass(o, "__noscriptOpaqued__");
          }
        }

        if ((frame = w.frameElement)) {
          frameClass = new ClassyObj(frame);
          DOM.removeClass(frame, "__noscriptScrolling__");
          sd = this.computeScrollbarSizes(w, dElem, d.body);

        }

        let clientHeight = w.innerHeight - sd.h;
        let clientWidth =  w.innerWidth - sd.w;
        // print(dElem.clientWidth + "," +  dElem.clientHeight + " - "  + w.innerWidth + "," + w.innerHeight);

        if (!ctx.isEmbed) {
          curtain = d.createElementNS(HTML_NS, "div");
          with (curtain.style) {
            top = left = "0px";

            width = (clientWidth + w.scrollX) + "px";
            height = (clientHeight + w.scrollY) + "px";

            padding = margin = borderWidth = MozOutlineWidth = "0px";
            position = "absolute";
            zIndex = DOM.maxZIndex;

            background = this.rndColor();
          }
        }

        let maxWidth = Math.max(Math.min(this.maxWidth, clientWidth), sd.w ? 0 : Math.min(this.minWidth, dElem.offsetWidth), 8);
        let maxHeight = Math.max(Math.min(this.maxHeight, clientHeight), sd.h ? 0 : Math.min(this.minHeight, dElem.offsetHeight, 8));

        for (;;) {
            box = this.getBox(o, d, w);
            if (box.width > 0 && box.height > 0) break;
            o = o.parentNode;
            if (!o) return false;
        }

        // expand to parent form if needed
        var form = o.form;
        if (frame && !ctx.isEmbed && (form || (form = this.findParentForm(o)))) {

          let formBox = this.getBox(form, d, w);
          if (!(formBox.width && formBox.height)) { // some idiots put <form> as first child of <table> :(
            formBox = this.getBox(form.offsetParent || form.parentNode, d, w);
            if (!(formBox.width && formBox.height)) {
              formBox = this.getBox(form.parentNode.offsetParent || o.offsetParent, d, w);
            }
          }

          if (formBox.width && formBox.height) {
            // form has layout, recenter to show as much as possible
            ctx.x = ctx.x || box.x + box.width;   // use mouse coordinates or
            ctx.y = ctx.y || box.y + box.height; // rightmost widget position

            box = formBox; // the form is our new reference

            var delta;

            // move inside the viewport if needed
            if (box.x < 0) {
              box.screenX -= box.x;
              box.x = 0;
            }
            if (box.y < 0) {
              box.screenY -= box.y;
              box.y = 0;
            }

            // is our center out of the form?
            if (box.x + Math.min(box.width, maxWidth) < ctx.x) {
              box.width = Math.min(box.width, maxWidth);
              delta = ctx.x + 4 - box.width - box.x;
              box.x += delta;
              box.screenX += delta;

            }
            if (box.y + Math.min(box.height, maxHeight) < ctx.y) {
              box.height = Math.min(box.height, maxHeight);
              delta = ctx.y + 4 - box.height - box.y;
              box.y += delta;
              box.screenY += delta;
            }

            // recenter to the form
            ctx.x = box.x + box.width / 2;
            ctx.y = box.y + box.height / 2;

            o = form;
          }
        }

        bgStyle = dElem.style.background;
        dElem.style.background = bg;

        // clip, slide in viewport and trim

        var vp = {
          x: w.scrollX,
          y: w.scrollY + 3, // 3 pixels grace for box shadows cast from above a frame, like in the FB header
          width: Math.max(w.innerWidth - sd.w, 32),
          height: Math.max(w.innerHeight - sd.h - 3, 16), // Facebook like buttons are 20 pixel high
          frame: frame
        };

        var rtlOffset = 0;

        if (ctx.isEmbed) { // check in-page vieport
          vp.frame = null;
          vp.x = Math.max(vp.x, box.x);
          vp.y = Math.max(vp.y, box.y);
          vp.width = Math.min(vp.width, box.width);
          vp.height = Math.min(vp.height, box.height);

          for(let ancestor = o; ancestor = ancestor.parentNode;) {

            if ((ancestor.offsetWidth < box.width || ancestor.offsetHeight < box.height) &&
                w.getComputedStyle(ancestor, '').overflow != "visible") {

              // check if we're being fooled by some super-zoomed applet
              if (box.width / 4 <= ancestor.offsetWidth && box.height / 4 <= ancestor.offsetHeight) {
                let ancestorBox = this.getBox(ancestor, d, w);

                if (box.x < ancestorBox.x) {
                  box.x = ancestorBox.x;
                  box.screenX = ancestorBox.screenX;
                }
                if (box.y < ancestorBox.y) {
                  box.y = ancestorBox.y;
                  box.screenY = ancestorBox.screenY;
                }
                if (box.width + box.x > ancestorBox.width + ancestorBox.x) box.width = Math.max(this.minWidth, ancestor.clientWidth - (box.x - ancestorBox.x));
                if (box.height + box.y > ancestorBox.height + ancestorBox.y) box.height = Math.max(this.minHeight, ancestor.offsetHeight - (box.y - ancestorBox.y));
              }
              break;
            }
          }
        } else {

          // correct x offsets according to left scrollbars if needed
          try {
            var adaptiveScrollerSide = false;
            switch(this.ns.prefService.getIntPref("layout.scrollbar.side")) {
              case 1:
                adaptiveScrollerSide = true;
              case 0:
                if (!adaptiveScrollerSide && this.ns.prefService.getIntPref("bidi.direction") != 2)
                  break;
              case 3:
                vp.x += this._scrollerCorrect(w, adaptiveScrollerSide);
                rtlOffset = this._scrollerCorrect(top, adaptiveScrollerSide);
            }
          } catch(e) {
            if (ns.consoleDump & LOG_CLEARCLICK) ns.dump(e);
          }

        }

        // clip viewport intersecting with scrolling parents

        const CLIP_MIN = 64;
        var clip = this._clip(o.parentNode, frame ? this.getBox(frame) : box);
        if (clip.h != 0) {
          if (vp.height + clip.h >= CLIP_MIN) vp.height += clip.h;
          else vp.height = CLIP_MIN;
          if (maxHeight + clip.h >= CLIP_MIN) maxHeight += clip.h;
          else maxHeight = CLIP_MIN;
        }
        if (clip.w != 0) {
          if (vp.width + clip.w >= CLIP_MIN) vp.width += clip.w;
            else vp.width = CLIP_MIN;
            if (maxWidth + clip.w >= CLIP_MIN) maxWidth += clip.w;
            else maxWidth = CLIP_MIN;
        }
        vp.x += clip.x;
        vp.y += clip.y;

        // Fit in viewport

        box.oX = box.x;
        box.oY = box.y;
        box.oW = box.width;
        box.oH = box.height;

        // print("Fitting " + box.toSource() + " in " + vp.toSource() + " - ctx " + ctx.x + ", " + ctx.y + " - max " + maxWidth + ", " + maxHeight);

        this._constrain(box, "x", "width", maxWidth, vp, ctx.x);
        this._constrain(box, "y", "height", maxHeight, vp, ctx.y);
        // print(box.toSource());



        c.width = box.width;
        c.height = box.height;

        woi = this.findWindowedRects(ctx.isEmbed ? o : w.frameElement);

        if (this.ns.consoleDump & LOG_CLEARCLICK) this.ns.dump("Snapshot at " + box.toSource() + " + " + w.pageXOffset + ", " + w.pageYOffset);

        if (curtain && frame) {
          dElem.appendChild(curtain);
        }

        img1 = new Snapshot(w, box.x, box.y);

      } finally {
        docPatcher.clean(false);
      }


      var rootElement = top.document.documentElement;
      rootBox = this.getBox(rootElement, top.document, top);


      var offsetY = (box.screenY - rootBox.screenY);
      var offsetX = (box.screenX - rootBox.screenX) + rtlOffset;

      var ret = true;
      var tmpImg;

      const offs = ctx.isEmbed ? [0] : [0, -1, 1, -2, 2, -3, -3];

      checkImage:
      for each(let x in offs) {
        for each(let y in offs) {
          tmpImg = new Snapshot(top, offsetX + x, offsetY + y);
          if (img1.resembles(tmpImg)) {
            ret = false;
            break checkImage;
          }
          if (!img2) img2 = tmpImg;
        }
      }

      if (ret && !curtain && ctx.isEmbed) {
        curtain = d.createElementNS(HTML_NS, "div");
        if (docPatcher) curtain.className = docPatcher.shownCS;
        with (curtain.style) {
          // we expand by 1 pixel in order to avoid antialias effects on the edge at zoom != 1 (GMail Flash attachment)
          top = (o.offsetTop - 1) + "px";
          left = (o.offsetLeft -1) + "px";
          width = (o.offsetWidth +2) + "px";
          height = (o.offsetHeight +2) + "px";
          position = "absolute";
          zIndex = w.getComputedStyle(o, '').zIndex;
          background = this.rndColor();
        }

        ret = compareSnapshots(box.x, box.y, offsetX, offsetY);
      }

      if (ret && ctx.isEmbed && ("x" in ctx) && c.width > this.minWidth && c.height > this.minHeight) {
        c.width = this.minWidth;
        c.height = this.minHeight;
        for each(x in [Math.max(ctx.x - this.minWidth, box.oX), Math.min(ctx.x, box.oX + box.oW - this.minWidth)]) {
          for each(y in [Math.max(ctx.y - this.minHeight, box.oY), Math.min(ctx.y, box.oY + box.oH - this.minHeight)]) {
            ret = compareSnapshots(x, y, offsetX + (x - box.x), offsetY + (y - box.y));
            if (!ret) {
              offsetX += (x - box.x);
              offsetY += (y - box.y);
              box.x = x;
              box.y = y;
              break;
            }
          }
          if (!ret) break;
        }
      }

      if (ctx.debug || this.checkCursor(ctx.isEmbed ? o : frame)) {
        ret = true;
        img2 = tmpImg;
      }

      if (ret) {

        if (curtain) {

          if (ctx.debug) {

            if (docPatcher.cleanSheet) {
              curtain.id = "curtain_" + DOM.rndId();
              docPatcher.cleanSheet += " #" + curtain.id + " { opacity: .4 !important }";
            }

            curtain.style.opacity = ".4"

          } else {
            curtain.parentNode.removeChild(curtain);
            curtain = null;
          }
          compareSnapshots(box.x, box.y, offsetX, offsetY);
        }

        ctx.img =
        {
          src: img1.toURL(),
          altSrc: img2.toURL(),
          width: c.width,
          height: c.height
        }
      }

    } finally {
      if (ctx.isEmbed) docPatcher.blankPositioned(false);


      if (curtain && curtain.parentNode) curtain.parentNode.removeChild(curtain);
      if (typeof(bgStyle) == "string") dElem.style.background = bgStyle;

      docPatcher.opaque(false);
      docPatcher.trafficLightHack(false);
      docPatcher.abpTabsHack(false);
      docPatcher.fbPresenceHack(false);
      docPatcher.linkAlertHack(false);

      if (objClass) objClass.reset();
      if (frameClass) frameClass.reset();
    }

    return ret;

  },

  checkCursor: function(o) {
    let w = o.ownerDocument.defaultView;
    for(; o && o instanceof Ci.nsIDOMHTMLElement; o = o.parentNode) {
      try {
        let cursor = w.getComputedStyle(o, ':hover').cursor;
        if (cursor === "none" || cursor.indexOf("url(") !== -1) return true;
      } catch (e) {}
    }
    return w.frameElement && this.checkCursor(w.frameElement);
  },

  _clip: function(parent, box) {
    const MIN = 64;

    // backtrack all the overflow~="auto|scroll" parent elements and clip

    var pw = parent.ownerDocument.defaultView;

    var current, cbox;
    var dw = 0, dh = 0, dx = 0, dy = 0;

    var bx = box.screenX;
    var by = box.screenY;
    var bw = box.width;
    var bh = box.height;

    const ELEMENT = Ci.nsIDOMElement;

    while(parent) {

      current = parent;
      switch (pw.getComputedStyle(current, '').overflow) {
        case "auto" : case "scroll":
        cbox = this.getBox(current);

        d = cbox.screenY - by;
        if (d > 0) {
          dy += d;
          dh -= d;
          by += d;
          bh -= d;
        }
        d = cbox.screenX - bx;
        if (d > 0) {
          dx += d;
          dw -= d;
          bx += d;
          bw -= d;

        }
        d = by + bh - (cbox.screenY + current.clientHeight);
        if (d > 0) {
          if (cbox.height - current.clientHeight < 10) // compensate for miscalculated scrollbars bug
            d += 20;
          dh -= d;
          bh -= d;
        }
        d = bx + bw - (cbox.screenX + current.clientWidth);
        if (d > 0) {
          if (cbox.width - current.clientWidth < 10) // compensate for miscalculated scrollbars bug
            d += 20;
          dw -= d;
          bw -= d;
        }
      }
      parent = current.parentNode;
      if (parent instanceof ELEMENT) continue;
      parent = pw.frameElement;
      if (parent) pw = parent.ownerDocument.defaultView;
    }

    return { x: dx, y: dy, w: dw, h: dh };
  },

  _scrollerCorrect: function(w, adaptive) {
    return (adaptive && w.getComputedStyle(w.document.body || w.document.documentElement, '').direction != 'rtl')
      ? 0
      : w.innerWidth - w.document.documentElement.clientWidth;
  },

  _offsetParents: function(p) {
    let pp = [];
    for (; p; p = p.offsetParent) pp.push(p);
    return pp;
  },

  get _ignoreWindowedZ() {
    delete this.__proto__._ignoreWindowedZ;
    return this.__proto__._ignoreWindowedZ = ns.geckoVersionCheck("10.0") < 0;
  },
  findWindowedRects: function(el) {
    const tags = ["object", "embed"];
    var woi = null;

    while(el) {
      let d = el.ownerDocument;
      let w = d.defaultView;
      let elPP = this._offsetParents(el);
      try {
        for each (let t in tags) {
          let oo = d.getElementsByTagName(t);
          for (let i = oo.length; i-- > 0;) {
            let o = oo[i];
            if (o != el && !ns.isWindowlessObject(o)) {
              let oPP = this._offsetParents(o);
              for (let j = elPP.length, k = oPP.length; j-- > 0 && k-- > 0;) {
                let p1 = elPP[j], p2 = oPP[k];
                if (p1 != p2) {
                  let s1 = w.getComputedStyle(p1, '');
                  let s2 = w.getComputedStyle(p2, '');

                  if (s2.display != 'none' && s2.visibility != 'hidden' &&
                      (this._ignoreWindowedZ ||
                        (s2.position != 'static' &&
                         (s1.position == 'static'  ||
                            (parseInt(s1.zIndex, 10) || 0) <= (parseInt(s2.zIndex, 10) || 0)))
                      )
                    ) {
                    (woi || (woi = [])).push(this.getBox(o, d, w));
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        ns.log(e);
      }
      el = w.frameElement;
    }
    return woi;
  }
}

function ClassyObj(o) {
  this.o = o;
  if (o.hasAttribute("class")) this.c = o.className;
}
ClassyObj.prototype = {
  o: null,
  c: null,
  append: function(newC) {
    try {
      this.o.className = this.c ? this.c + newC : newC;
    } catch(e) {}
  },
  reset: function() {
    try {
      if (this.c == null) this.o.removeAttribute("class");
      else this.o.className = this.c;
    } catch(e) {}
  }
}

function DocPatcher(ns, o, w) {
  this.ns = ns;
  this.o = o;
  this.win = w;
  this.top = w.top;
  this.shownCS = " __noscriptShown__" + DOM.rndId();
}

DocPatcher.prototype = {

  collectAncestors: function(o) {
    var res = [];
    for(; o && o.hasAttribute; o = o.parentNode) res.push(new ClassyObj(o));
    return res;
  },

  getRect: function(o, d) {
    return (this.getRect = ("getBoundingClientRect" in o)
     ? function(o) { return o.getBoundingClientRect() }
     : function(o, d) {
      var b = d.getBoxObjectFor(o);
      var x = o.x, y = o.y;
      return {
        left: x,
        top: y,
        right: x + o.width,
        bottom: y + o.height
      };
     })(o, d)
  },

  collectPositioned: function(d) {
    var t = Date.now();
    const w = d.defaultView;
    const res = [];
    var s = null, p = '', n = null;

    const r = this.o.getBoundingClientRect();
    const top = r.top;
    const bottom = r.bottom;
    const left = r.left;
    const right = r.right;

    var c = '', b = null;
    var hasPos = false;
    const posn = [];

    const tw = d.createTreeWalker(d, Ci.nsIDOMNodeFilter.SHOW_ELEMENT, null, false);
    for (var n = null; (n = tw.nextNode());) {
      b = n.getBoundingClientRect();
      if (b.bottom < top || b.top > bottom ||
          b.right < left || b.left > right)
        continue;

      s = w.getComputedStyle(n, '');
      p = s.position;
      if (p == "absolute" || p == "fixed") {
        c = " __noscriptPositioned__";
        n.__noscriptPos = hasPos = true;
        posn.push(n);
      } else {
        hasPos = hasPos && n.parentNode.__noscriptPos;
        if (!hasPos) continue;
        c = '';
        n.__noscriptPos = true;
        posn.push(n);
      }

      if (s.backgroundImage != "none" || s.backgroundColor != "transparent") {
        c += " __noscriptBlank__";
      };


      if (c) {
        res.push(n = new ClassyObj(n));
        n.append(c);
      }
    }

    for each(n in posn) n.__noscriptPos = false;

    if(ns.consoleDump & LOG_CLEARCLICK) ns.dump("DocPatcher.collectPositioned(): " + (Date.now() - t));
    return res;
  },

  collectOpaqued: function(o, oo) {
    if (!oo) oo = { opacity: 1, res: [] };

    var w = o.ownerDocument.defaultView;

    var opacity;
    var co = null;
    for(; o && o.hasAttribute; o = o.parentNode) {
      opacity = parseFloat(w.getComputedStyle(o, '').opacity);
      if (opacity < 1) {
        if ((oo.opacity *= opacity) < .3) return []; // too much combined transparency!
        oo.res.push(new ClassyObj(o));
      }
    }

    o = w.frameElement;
    return o ? this.collectOpaqued(o, oo) : oo.res;
  },

  forceVisible: function(co) { // TODO: I cause too much reflow, please CHECK ME!
    co.append(this.shownCS);
  },

  forceOpaque: function(co) {
    co.append(" __noscriptJustOpaqued__");
  },

  resetClass: function(co) {
    co.reset();
  },

  _ancestors: null,
  _cleanSheetHandle: null,
  clean: function(toggle) {
    if (toggle) {
      if (!this._ancestors) {
        this.cleanSheet = "body * { visibility: hidden !important } body ." + this.shownCS.substring(1) + " { visibility: visible !important; opacity: 1 !important }";
        this._ancestors = this.collectAncestors(this.o);
      }
      this._ancestors.forEach(this.forceVisible, this);
      this._cleanSheetHandle = this.applySheet(this.cleanSheet);
    } else if (this._ancestors) {
      this._ancestors.forEach(this.resetClass);
      this.removeSheet(this._cleanSheetHandle);
    }
  },

  _positioned: null,
  _blankSheetHandle: null,
  blankSheet: ".__noscriptPositioned__ * { color: white !important; border-color: white !important; }",
  blankPositioned: function(toggle) {
    if (toggle) {
      this._positioned = this.collectPositioned(this.o.ownerDocument);
      this._blankSheetHandle = this.applySheet(this.blankSheet);
    } else if (this._positioned) {
      this._positioned.forEach(this.resetClass);
      this.removeSheet(this._blankSheetHandle);
    }
  },

  _opaqued: null,
  opaque: function(toggle) {
    if (toggle) {
      this._opaqued = this._opaqued || this.collectOpaqued(this.o);
      this._opaqued.forEach(this.forceOpaque);
    } else if (this._opaqued) {
      this._opaqued.forEach(this.resetClass);
    }
  },


  applySheet: function(sheetHandle) {
    this.ns.updateStyleSheet(sheetHandle, true);
    return sheetHandle;
  },
  removeSheet: function(sheetHandle) {
    this.ns.updateStyleSheet(sheetHandle, false);
  },

  trafficLightHack: function(toggle) {
    const ID = "tll_hui_container";
    if (!(toggle && this.top.document.getElementById(ID))) return;

    delete this.__proto__.trafficLightHack;
    try {
      Cc["@mozilla.org/chrome/chrome-registry;1"]
        .getService(Ci.nsIChromeRegistry)
        .convertChromeURL(IOS.newURI("chrome://trafficlight/content", null, null));
    } catch(e) {
      this.__proto__.trafficLightHack = DUMMY_FUNC;
      return;
    }
    this.__proto__._trafficLightHackToogle = false;
    this.__proto__.trafficLightHack = function(toggle) {
      var w = this.top;
      var d = w.document;
      var c = d.getElementById(ID);
      if (!toggle) {
        if (this._trafficLightHackToggle) {
          c.style.visibility = "visible";
          this._trafficLightHackToggle = false;
        }
        return;
      }
      if (w.getComputedStyle(c, '').visibility !== "visible") return;

      for each(let n in Array.push(c, c.getElementsByTagName("*"))) {
        if (n.getBoundingClientRect().bottom > 50) return;
      }
      c.style.visibility = "hidden";
      this._trafficLightHackToggle = true;
    }
    this.trafficLightHack(toggle);
  },

  _linkAlertBox: null,
  linkAlertHack: function(toggle) {
    try {
      var w = this.top;
      var d = w.document;
      if (toggle) {
        let box = d.getElementById("linkalert-box");
        if (!box || box.style.display) return;
        let imgs = box.getElementsByTagName("img");
        if (imgs.length > 5) return;
        for (let j = imgs.length; j-- > 0;) {
          let img = imgs[j];
          if (!/^(?:chrome:\/\/linkalert\/skin\/|(?:moz\-icon|file):\/\/)/.test(img.src) || img.naturalWidth == 0 ||
            img.offsetWidth > 32 || img.offsetHeight > 32) return;
        }
        box.style.display = "none";
        this._linkAlertBox = box;
      } else {
        if (this._linkAlertBox) {
          this._linkAlertBox.style.display = "";
          this._linkAlertBox = null;
        }
      }
    } catch (e) {}
  },

  _fbPresence: null,
  fbPresenceHack: function(toggle) {
    if (toggle) {
      try {
        if (this.top.location.host == "apps.facebook.com") {
          var fbPresence = this.top.document.getElementById("presence");
          if (fbPresence) {
            fbPresence._ccVisibility = fbPresence.style.visibility;
            fbPresence.style.visibility = "hidden";
            this._fbPresence = fbPresence;
          }
        }
      } catch(e) {}
    } else if (this._fbPresence) {
      this._fbPresence.style.visibility = this._fbPresence._ccVisibility;
    }
  },

  _abpTabs: null,
  get _abpTabsObj() {
    delete this.__proto__._abpTabsObj;
    var tobj;
    try {
      tobj = Cc["@mozilla.org/adblockplus;1"].getService().wrappedJSObject.objTabs;
    } catch(e) {
      try {
        let baseURL = Cc["@adblockplus.org/abp/private;1"].getService(Ci.nsIURI);
        let x = {};
        Cu.import(baseURL.spec + "ObjectTabs.jsm", x);
        tobj = (x.objectMouseEventHander.__parent__ || Cu.getGlobalForObject(x.objectMouseEventHander)).objTabs;
      } catch (e) {
        tobj = null;
      }
    }
    return this.__proto__._abpTabsObj = tobj;
  },

  abpTabsHack: function(toggle) {
    let visibleClass, hiddenClass;
    try {
      let tobj = this._abpTabsObj;
      if (tobj) {
        hiddenClass = tobj.objTabClassHidden;
        if (!hiddenClass) return;
        visibleClasses = [tobj.objTabClassVisibleTop, tobj.objTabClassVisibleBottom];
      }
    } catch(e) {
    }
    delete this.__proto__.abpTabsHack;
    this.__proto__.abpTabsHack =
      hiddenClass
      ? function(toggle) {
          try {
            let document = this.top.document;
            if (toggle) {
              let tabs = [];
              for each(let c in visibleClasses) {

                Array.forEach(document.getElementsByClassName(c), function(t) {
                  let co = new ClassyObj(t);
                  t.className = hiddenClass;
                  tabs.push(co);
                });
              }
              this._abpTabs = tabs;
            } else {
              for each(let co in this._abpTabs) {
                co.reset();
              }
            }
          } catch(e) {
            Cu.reportError(e);
          }
        }
      : DUMMY_FUNC;
    this.abpTabsHack(toggle);
  }
};


["clearClick", "clearClick.exceptions", "clearClick.subexceptions"].forEach(function(p) {
  try {
    ns.syncPrefs(ns.prefs, p);
  } catch(e) {
    ns.dump(e.message + ":" + e.stack + " setting " + p + "\n");
  }
});
