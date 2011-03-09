Profiler = {
  watchlist: { NoScript: ns, requestWatchdog: RequestWatchdog.prototype,
      InjectionChecker: InjectionChecker, ABE: ABE, IOUtil: IOUtil, DNS: DNS},
  data: {},
  reset: function() this.data = {},
  
  instrument: function(b) {
    const oo = this.watchlist;
    const pf = "profiler.function";
    for (let v in oo) {
      let o = oo[v]
      for (let n in o) {
        let f = o[n];
        if (typeof f == "function") {
          if (b) {
            if (pf in f) continue;
              let key = v + "." + n;
              let patched = function() {
                let t = Date.now();
                let r = f.apply(this, arguments);
                let pdata = Profiler.data;
                let data = pdata[key] || (pdata[key] = {count: 0, time: 0, min: 120000, max: 0});
                data.count++;
                data.time += t = (Date.now() - t);
                if (t > data.max) data.max = t;
                if (t < data.min) data.min = t;
                return r;
              }
              patched[pf] = f;
              o[n] = patched;
              dump(key + "\n");
          } else {
            if (pf in f) o[n] = f[pf];
          }
        }
      }
    }
  },
  
  report: function(count) {
    if (arguments.length === 0) count = 20;
    dump("\n\n\nProfiler Report");
    let ar = [];
    for (let [call, data] in Iterator(this.data)) {
      data.avg = Math.round(data.time / data.count * 1000) / 1000;
      ar.push({call: call, data: data});
    }
    function cmp(a,b) a > b ? - 1: a < b ? 1 : 0;
    ar.sort(function(a, b) cmp(a.data.time, b.data.time));
    for each(let l in ar) {
      dump(l.call + ": " + l.data.toSource() + "\n");
      if (count-- <= 0) break;
    }
  },
  
  gc: function() {
    DOM.mostRecentBrowserWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
      .getInterface(Components.interfaces.nsIDOMWindowUtils)
      .garbageCollect();
  }
}


