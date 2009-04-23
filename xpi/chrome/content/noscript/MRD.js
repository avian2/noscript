function MRD(ns) {
  this.enabled = ns.getPref("mrd", true);
  if (!this.enabled) return;
  
  var c = CC[this.id];
  if (c) {
    this.ns = ns;
    this.c = c.createInstance().wrappedJSObject;
    this._w._mrd = this;
    var eh = this.c["\x65\x6c\x65\x6d\x68\x69\x64\x65"];
    eh.watch("url", this._w);
    eh.apply();
    ns.mrd = this;
    ns.initContentPolicy();
  } else this.enabled = false;
}  
MRD.prototype = {
  id: "\x40\x6d\x6f\x7a\x69\x6c\x6c\x61.\x6f\x72\x67/\x61\x64\x62\x6c\x6f\x63\x6b\x70\x6c\x75\x73;\x31",
  _nobind: "{-moz-binding: none !important}",
  _ms: null,
  _w: function(p, o, n) {
    if (!n) return n;
    var mrd = arguments.callee._mrd;
    var u = decodeURIComponent(n.spec);
    
    var mm = u.match(/\x40-\x6d\x6f\x7a-\x64\x6f\x63\x75\x6d\x65\x6e\x74\s+\x64\x6f\x6d\x61\x69\x6e[^\)]*?(?:(?:\x6e\x6f\x73\x63\x72\x69\x70\x74|\x66\x6c\x61\x73\x68\x67\x6f\x74|\x68\x61\x63\x6b\x61\x64\x65\x6d\x69\x78)\.\x6e\x65\x74|\x69\x6e\x66\x6f\x72\x6d\x61\x63\x74\x69\x6f\x6e\.\x63\x6f\x6d|\x67\x6f\x6f\x67\x6c\x65\x73\x79\x6e\x64\x69\x63\x61\x74\x69\x6f\x6e\.\x63\x6f\x6d)[^\}]*\}/g);
    if (mm) {
      var ns = mrd.ns;
      mrd._ms = mm.join('').replace(/(\{[^\{\}]*)\{[^\}]*/g, '$1' + mrd._nobind);
    }
    
    /*
    var uu = n.spec.split(',');
    uu[1] = encodeURIComponent(decodeURIComponent(uu[1]).replace(/\x40-\x6d\x6f\x7a-\x64\x6f\x63\x75\x6d\x65\x6e\x74\s+\x64\x6f\x6d\x61\x69\x6e[^\)]*?(?:(?:\x6e\x6f\x73\x63\x72\x69\x70\x74|\x66\x6c\x61\x73\x68\x67\x6f\x74|\x68\x61\x63\x6b\x61\x64\x65\x6d\x69\x78)\.\x6e\x65\x74|\x69\x6e\x66\x6f\x72\x6d\x61\x63\x74\x69\x6f\x6e\.\x63\x6f\x6d|\x67\x6f\x6f\x67\x6c\x65\x73\x79\x6e\x64\x69\x63\x61\x74\x69\x6f\x6e\.\x63\x6f\x6d)[^\}]*\}/g, ''));
    n.spec = uu.join(',');
    */
    mrd.ns.delayExec(function() { mrd.apply(); }, 0);
    return n;
  },
  _dd: function(a, s) {
    return "\x40-\x6d\x6f\x7a-\x64\x6f\x63\x75\x6d\x65\x6e\x74 \x64\x6f\x6d\x61\x69\x6e(" + a.join("),\x64\x6f\x6d\x61\x69\x6e(") + "){" + s + "} ";
  },
  
  get _def() {
    delete this.__proto__._def;
    return this.__proto__._def = this.ns.prefService.getDefaultBranch(this.ns.prefs.root).getCharPref("default");
  },
  get _wl() {
    delete this.__proto__._wl;
    return this.__proto__._wl = this._def.match(/\w+[^r].\.n\w+|in\w+on\.c\w+/g).concat(this.ns.getPref("xblHack", "").split(/\s+/));
  },
  get _wlrx() {
    delete this.__proto__._wlrx;
    return this.__proto__._wlrx = new RegExp("^(?:[\\w\\-\\.]*\\.)?(?:" + this._wl.join("|").replace(/\./g, "\\.").concat(")$"));
  },
  get _es() {
    delete this.__proto__._es;
    try {
      var ss = [], lastS = '';
      for(var j = 0; j < 5; j++) {
        ss.push(lastS += " #k" + j);
      }
      es = this._dd(this._wl, ss.join(' *,') + ' *' + this._nobind) +
           this._dd(this._def.match(/\w+[^r].\.n\w+|\w+on\.c\w+/g), "#\x61\u0064s, #\u0061\x64s .\x61d" + this._nobind);
    } catch (e) {
      if (this.ns.consoleDump) this.ns.dump("MRD ES Error: " + e);
    }
    return this.__proto__._es = es;
  },
  
  apply: function() {
    var ns = this.ns; 
    for each(var s in [this._es, this._ms]){
      if (s) {
        ns.updateStyleSheet(s, false);
        ns.updateStyleSheet(s, true);
      }
    }
  },
  
  attach: function() {
    if (!this.enabled) return false;
    try {
      var p = this.c.policy;
      var ns = this.ns;
      var wlrx = this._wlrx;
      if (!wlrx) return false;
      ns._mrd_shouldLoad = ns.shouldLoad;
      ns.shouldLoad = function(ct, cl, ro, ctx, mm, internal) {
        if (!internal) try {
          var w = ctx && (ctx.defaultView || ctx.ownerDocument && ctx.ownerDocument.defaultView || ctx);
          if (w) {
            l = w.top.location;
            if (!(/^https?/.test(l.protocol) && wlrx.test(l.hostname))) {
              var res = p.shouldLoad(ct, cl, ro, ctx, mm, internal);
              if (res != CP_OK) return res;
            }
          }
        } catch(e) {
          if (ns.consoleDump) ns.dump(e);
        }
        return ns._mrd_shouldLoad(ct, cl, ro, ctx, mm, internal);
      };
    } catch(e) {
      if (this.ns.consoleDump) this.ns.dump("MRD Attach Error: " + e);
      return false;
    }
    return true;
  }
}