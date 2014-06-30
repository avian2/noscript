var JSURL = {
  JS_VERSION: "1.8",
  load: function(url, document) {
    this._run(document, url.substring("javascript:".length)
      .replace(/(?:%[0-9a-f]{2})+/gi, function(m) {
        try {
          return decodeURIComponent(m);
        } catch (e) {}
        return unescape(m);
      }));
  },
  
  _patch: (function() {
      (function patchAll(w) {
        if (!w || w.open && w.open._bypass)
          return w;
        
        var d = w.document;
        
        function op(data) {
          var code = "Object.getPrototypeOf(document)." + 
             (typeof(data) === "string"
               ? 'write.call(document, ' + JSON.stringify(data) + ')'
               : 'open.call(document)'
             );
          var s = d.createElement("script");
          s.appendChild(d.createTextNode(code));
          var p = d.documentElement;
          p.appendChild(s);
          p.removeChild(s);
          if (d.write === Object.getPrototypeOf(d).write) {
            patchAll(w);
          }
        }
        function patch(o, m, f) {
            var saved = o[m];
            f._restore = function() { o[m] = saved };
            f._bypass = saved;
            o[m] = f;
        }
        
        patch(d, "open", function() { op(null) });
        patch(d, "write", function(s) {
            op(typeof(s) === "string" ? s : "" + s); 
        });
        patch(d, "writeln", function(s) { this.write(s + "\n") });
        
        patch(w, "open", function() {
          return patchAll(w.open._bypass.apply(w, arguments));  
        });
        
        return w;
      })(window);
  }).toSource() + "()",
  _restore: (function() {  
     var d = window.document;     
     d.writeln._restore();
     d.write._restore();
     d.open._restore();  
  }).toSource() + "()",
  
  _run: function(document, code) {
    var w = document.defaultView;
    var p = document.nodePrincipal;
    var s =  new Cu.Sandbox(CSP.isBlocked(w) ? [p] : p, {
        sandboxName: "NoScript::JSURL@" + document.documentURI,
        sandboxPrototype: w,
        wantXrays: false,
      });
    var e = function(script)  Cu.evalInSandbox("with(window) {" + script + "}", s, JSURL.JS_VERSION);
    e(this._patch);
    var ret;
    try {
        ret = e(code);   
        if (typeof(ret) !== "undefined" &&
            !DOM.getDocShellForWindow(w).isLoadingDocument) {
          s._ret_ = ret;
          e("window.location.href = 'javascript:' + JSON.stringify('' + this._ret_)");
          delete s._ret_;
          Thread.yieldAll();
        }
    } catch (e) {
        try { w.console.error("" + e) } catch(consoleError) { Cu.reportError(e) }
    } finally {
      try { e(this._restore) } catch(e) {}
    }
  },
  
}