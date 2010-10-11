
(function() {
  
  var ClearClickHandlerLegacy = {  
     // the following is apparently correct and easy, but it suffers of HUGE rounding issues
    _getZoomFromBrowser: function(browser) {
      try {
        return this._zoom = browser.markupDocumentViewer && browser.markupDocumentViewer.fullZoom || 1;
      } catch(e) {
        return this._zoom;
      }
    },
    
    // this one is more complex but much more precise than getZoomForBrowser()
    _getZoomFromDocument: function(d) {
      
      var root = d.documentElement;
      var o = d.createElementNS(HTML_NS, "div");
      var s = o.style;
      s.top = "400000px";
      s.position = "absolute";
      s.display = "block";
    
      root.appendChild(o);
      var oBox = d.getBoxObjectFor(o);
      var rootBox = d.getBoxObjectFor(root);
      var zoom = (oBox.screenY - rootBox.screenY) / o.offsetTop;
      root.removeChild(o);
      return this._zoom = zoom > 0 ? zoom : this._zoom;
    },
  
    getBox: function(o, d, w) {
      var zoom = this._zoom || 1;
      if (!d) d = o.ownerDocument;
      if (!w) w = d.defaultView;
        
      var b = d.getBoxObjectFor(o); // TODO: invent something when boxObject is missing or failing
      var c = d.getBoxObjectFor(d.documentElement);
      var p;
      var r = {
        width: b.width, height: b.height,
        screenX: b.screenX, screenY: b.screenY
      };
      
      const ns = this.ns;
      var verbose = ns.consoleDump & LOG_CLEARCLICK;
      
      r.x = (r.screenX - c.screenX) / zoom;
      r.y = (r.screenY - c.screenY) / zoom;
      
      var dx;
      // here we do our best to improve on lousy boxObject horizontal behavior when line breaks are involved
      // (it reports the width of the whole line, but x is referred to the first text node offset)
      if ("getBoundingClientRect" in o) {
        c = o.getBoundingClientRect(); // bounding rect, if available, does the right thing with left position
        
        if (verbose) ns.dump("Rect: " + c.left + "," + c.top + "," + c.right + "," + c.bottom);
        
        // boxObject.x "knows" scrolling, but on clientRect.left we must accumulate scrollX until first fixed object or viewport (documentElement)
        var fixed, scrollX;
        dx = Math.round(c.left) - r.x;
        var s = w.getComputedStyle(o, '');
        dx += parseInt(s.borderLeftWidth) || 0 + parseInt(s.paddingLeft) || 0 + w.scrollX;
      
      } else {
        // ugly hack for line-breaks without boundClient API
        dx = 0;
        p = b.parentBox;
        if (p) {
          var pb = d.getBoxObjectFor(p);
          if (verbose) dump("Parent: " + pb.x + "," + pb.y + "," + pb.width + "," + pb.height);
          if (b.x + r.width - pb.x - pb.width >= r.width / 2) {
            dx = -(b.x - (pb.width - r.width));
          }
        }
      }
      
      
      r.screenX += dx * zoom;
      r.x += dx;
      
     
      if (verbose) ns.dump(o + r.toSource() + " -- box: " + b.x + "," + b.y);
      return r;
    },
    
    
    _constrain: function(box, axys, dim, max, vp, center, zoom) {
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
        box[scr] += bStart * zoom;
        
      }
  
      if (l > max) {
        // resize
        if (center) {
          var halfMax = Math.round(max / 2);
          var nn = center - halfMax;
          if (nn > n && center + halfMax > n + l) nn = (n + l) - max;        
          box[axys] = nn;
          box[scr] += (nn - n) * zoom;
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
        box[scr] += d * zoom;
      }
  
    },
   
    checkObstruction: function(o, ctx) {
      var d = o.ownerDocument;
      var dElem = d.documentElement;
      
      var w = d.defaultView;
      var top = w.top;
      var browser = DOM.findBrowserForNode(top);
      
      var c = this.createCanvas(browser.ownerDocument);
      var gfx = c.getContext("2d");
      
      var bg = this.getBG(w);
  
  
      var bgStyle;
      var box, curtain;
      
      var frame, frameClass, frameStyle, objClass, viewer;
      
      var docPatcher = new DocPatcher(this.ns, o, w);
      
      var sheet = null;
      
      var img1 = null, img2 = null, tmpImg = null;
      
      function snapshot(w, x, y) {
        gfx.drawWindow(w, Math.round(x), Math.round(y), c.width, c.height, bg);
        return c.toDataURL();
      }
      
      function snapshots(x1, y1, x2, y2) {
        img1 = null;
        try {
          if (objClass) docPatcher.clean(true);
          img1 = snapshot(w, x1, y1);
        } catch(ex) {
          throw ex;
        } finally {
          docPatcher.clean(false);
        }
        img2 = tmpImg = snapshot(top, x2, y2);
        return (img1 != img2); 
      }
      var sd = this._NO_SCROLLBARS;
  
      try {
            
        var zoom = this._getZoomFromBrowser(browser);
        if (zoom != 1) zoom = this._getZoomFromDocument(d);
        
        docPatcher.linkAlertHack(true);
        docPatcher.fbPresenceHack(true);
        
        try {
          docPatcher.opaque(true);
          
          var fbPresence; // hack for Facebooks's fixed positioned widget
          
          if (ctx.isEmbed) { // objects and embeds
            if (this.ns.getPref("clearClick.plugins", true)) {
              var docShell = browser.docShell;
              viewer = docShell.contentViewer && false;
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
          
          var clientHeight = w.innerHeight - sd.h;
          var clientWidth =  w.innerWidth - sd.w;
          // print(dElem.clientWidth + "," +  dElem.clientHeight + " - "  + w.innerWidth + "," + w.innerHeight);
          
          if (!ctx.isEmbed) {
            curtain = d.createElementNS(HTML_NS, "div");
            with (curtain.style) {
              top = left = "0px";
              
              width = (clientWidth + w.scrollX) + "px";
              height = (clientHeight + w.scrollY) + "px";
    
              padding = margin = borderWidth = MozOutlineWidth = "0px";
              position = "absolute";
              zIndex = "99999999";
              
              background = this.rndColor();
            }
            frameStyle = w.parent.getComputedStyle(frame, '');
          }     
          
          if (curtain && frame) {
            dElem.appendChild(curtain);
          }
          
          var maxWidth = Math.max(Math.min(this.maxWidth, clientWidth * zoom), Math.min(this.minWidth, dElem.offsetWidth)) / zoom ;
          var maxHeight = Math.max(Math.min(this.maxHeight, clientHeight * zoom), Math.min(this.minHeight, dElem.offsetHeight)) / zoom;
    
          box = this.getBox(o, d, w);
          
          // expand to parent form if needed
          var form = o.form;
          var formBox = null;
          if (frame && !ctx.isEmbed && (form || (form = this.findParentForm(o)))) {
    
            formBox = this.getBox(form, d, w);
            if (!(formBox.width && formBox.height)) { // some idiots put <form> as first child of <table> :(
              formBox = this.getBox(form.offsetParent || form.parentNode, d, w);
              if (!(formBox.width && formBox.height)) {
                formBox = this.getBox(form.parentNode.offsetParent || o.offsetParent, d, w);
              }
            }
      
            if (formBox.width && formBox.height) {
              ctx.x = ctx.x || box.x + box.width;
              ctx.y = ctx.y || box.y + box.height;
              box = formBox;
              var delta;
              if (box.x < 0) {
                box.screenX -= box.x * zoom;
                box.x = 0;
              }
              if (box.y < 0) {
                box.screenY -= box.y * zoom;
                box.y = 0;
              }
              if (box.x + Math.min(box.width, maxWidth) < ctx.x) {
                box.width = Math.min(box.width, maxWidth);
                delta = ctx.x + 4 - box.width - box.x;
                box.x += delta;
                box.screenX += delta * zoom;
               
              }
              if (box.y + Math.min(box.height, maxHeight) < ctx.y) {
                box.height = Math.min(box.height, maxHeight);
                delta = ctx.y + 4 - box.height - box.y;
                box.y += delta;
                box.screenY += delta * zoom;
              }
              o = form;
            }
          }
    
          bgStyle = dElem.style.background;
          dElem.style.background = bg;
          
          // clip, slide in viewport and trim
          
          var vp = { 
            x: w.scrollX, 
            y: w.scrollY, 
            width: Math.max(w.innerWidth - sd.w, 32), 
            height: Math.max(w.innerHeight - sd.h, 24), // www.blogger.com top bar is 30 pixel high
            frame: frame
          };
  
          if (ctx.isEmbed) { // check in-page vieport
            vp.frame = null;
            vp.x = Math.max(vp.x, box.x);
            vp.y = Math.max(vp.y, box.y);
            vp.width = Math.min(vp.width, box.width);
            vp.height = Math.min(vp.height, box.height);
            
            for(form = o; form = form.parentNode;) {
    
              if ((form.offsetWidth < box.width || form.offsetHeight < box.height) &&
                  w.getComputedStyle(form, '').overflow != "visible") {
                
                // check if we're being fooled by some super-zoomed applet
                if (box.width / 4 <= form.offsetWidth && box.height / 4 <= form.offsetHeight) {
                  formBox = this.getBox(form, d, w);
                  
                  if (box.x < formBox.x) {
                    box.x = formBox.x;
                    box.screenX = formBox.screenX;
                  }
                  if (box.y < formBox.y) { 
                    box.y = formBox.y;
                    box.screenY = formBox.screenY;
                  }
                  if (box.width + box.x > formBox.width + formBox.x) box.width = Math.max(this.minWidth, form.clientWidth - (box.x - formBox.x));
                  if (box.height + box.y > formBox.height + formBox.y) box.height = Math.max(this.minHeight, form.offsetHeight - (box.y - formBox.y));
                }
                break;
              }
            }
          } else if (!(sd.w || sd.h)) { // no scrollbars
            if (!sd.w) {
              vp.x = 0;
              vp.width = curtain.offsetWidth;
            }
            if (!sd.h) {
              vp.y = 0;
              vp.height = curtain.offsetHeight;
            }
          }
          
          box.oX = box.x;
          box.oY = box.y;
          box.oW = box.width;
          box.oH = box.height;
          
          // print("Fitting " + box.toSource() + " in " + vp.toSource() + " - zoom: " + zoom + " - ctx " + ctx.x + ", " + ctx.y + " - max " + maxWidth + ", " + maxHeight);
    
          this._constrain(box, "x", "width", maxWidth, vp, ctx.x, zoom);
          this._constrain(box, "y", "height", maxHeight, vp, ctx.y, zoom);
          // print(box.toSource());     
          
          c.width = box.width;
          c.height = box.height;
          
          
          if (this.ns.consoleDump & LOG_CLEARCLICK) this.ns.dump("Snapshot at " + box.toSource() + " + " + w.pageXOffset + ", " + w.pageYOffset);
          
          
          
          img1 = snapshot(w, box.x, box.y);
        
        } finally {
          docPatcher.clean(false);
        }
      
  
        var rootElement = top.document.documentElement;
        var rootBox = this.getBox(rootElement, top.document, top);
        
        var offsetX = (box.screenX - rootBox.screenX) / zoom;
        var offsetY = (box.screenY - rootBox.screenY) / zoom;
        var ret = true;
        var tmpImg;
        
        const offs = ctx.isEmbed ? [0] : [0, -1, 1, -2, 2, -3, -3];
  
        checkImage:
        for each(var x in offs) {
          for each(var y in offs) {
            tmpImg = snapshot(top, offsetX + x * zoom, offsetY + y * zoom);
            if (img1 == tmpImg) {
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
          
          if (o.nextSibling) {
            o.parentNode.insertBefore(curtain, o.nextSibling);
          } else {
            o.parentNode.appendChild(curtain);
          }
          
          ret = snapshots(box.x, box.y, offsetX, offsetY);
        }
        
        if (ret && ctx.isEmbed && ("x" in ctx) && c.width > this.minWidth && c.height > this.minHeight) {
          c.width = this.minWidth;
          c.height = this.minHeight;
          for each(x in [Math.max(ctx.x - this.minWidth, box.oX), Math.min(ctx.x, box.oX + box.oW - this.minWidth)]) {
            for each(y in [Math.max(ctx.y - this.minHeight, box.oY), Math.min(ctx.y, box.oY + box.oH - this.minHeight)]) {
              ret = snapshots(x, y, offsetX + (x - box.x), offsetY + (y - box.y));
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
        
        if (ctx.debug) {
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
            }
            snapshots(box.x, box.y, offsetX, offsetY);
          }
          
          ctx.img =
          {
            src: img1,
            altSrc: img2,
            width: c.width,
            height: c.height
          }
        }
      
      } finally {
        if (ctx.isEmbed) docPatcher.blankPositioned(false);
        
        if (curtain && curtain.parentNode) curtain.parentNode.removeChild(curtain);
        if (typeof(bgStyle) == "string") dElem.style.background = bgStyle;
       
        docPatcher.opaque(false);
        docPatcher.linkAlertHack(false);
        docPatcher.fbPresenceHack(false);
        
        if (objClass) objClass.reset();
        if (frameClass) frameClass.reset();
        if (viewer) viewer.enableRendering = true;
      }
      
      return ret;
   
    }  
  };

  for (var p in ClearClickHandlerLegacy) {
    ClearClickHandler.prototype[p] = ClearClickHandlerLegacy[p];
  }

})()
