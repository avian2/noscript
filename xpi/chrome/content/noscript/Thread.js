var Thread = {

  hostRunning: true,
  activeLoops: 0,

  spin: function(ctrl) {
    ctrl.startTime = ctrl.startTime || Date.now();
    ctrl.timeout = false;
    this.activeLoops++;
    this._spinInternal(ctrl);
    this.activeLoops--;
    ctrl.elapsed = Date.now() - ctrl.startTime;
    return ctrl.timeout;
  },

  _spinInternal: function(ctrl) {
    var t = ctrl.startTime;
    var maxTime = parseInt(ctrl.maxTime);
    if (maxTime) {
      while(ctrl.running && this.hostRunning) {
        this.yield();
        if (Date.now() - t > maxTime) {
          ctrl.timeout = true;
          ctrl.running = false;
          break;
        }
      }
    } else while(ctrl.running && this.hostRunning) this.yield();
  },

  yield: function() {
    this.current.processNextEvent(true);
  },

  yieldAll: function() {
    var t = this.current;
    while(t.hasPendingEvents()) t.processNextEvent(false);
  },

  get current() {
    delete this.current;
    var obj = "@mozilla.org/thread-manager;1" in Cc
      ? Cc["@mozilla.org/thread-manager;1"].getService()
      : Cc["@mozilla.org/thread;1"].createInstance(Ci.nsIThread);
    this.__defineGetter__("current", function() { return obj.currentThread; });
    return this.current;
  },

  get currentQueue() {
    delete this.currentQueue;
    var eqs = null;
    const CTRID = "@mozilla.org/event-queue-service;1";
    if (CTRID in Cc) {
      const IFace = Ci.nsIEventQueueService;
      eqs = Cc[CTRID].getService(IFace);
    }
    this.__defineGetter__("currentQueue", eqs
      ? function() { return eqs.getSpecialEventQueue(IFace.CURRENT_THREAD_EVENT_QUEUE); }
      : this.__lookupGetter__("current")
    );
    return this.currentQueue;
  },

  delay: function(callback, time = 0, self = null, args = DUMMY_ARRAY) {
    var timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    timer.initWithCallback({
      notify: this._delayRunner,
      context: { callback, args, self }
    }, time, 0);
  },

  dispatch: function(runnable) {
    this.current.dispatch(runnable, Ci.nsIEventTarget.DISPATCH_NORMAL);
  },

  asap: function(callback, self, args = DUMMY_ARRAY) {
    this.current.dispatch({
      run: function() {
        callback.apply(self, args);
      }
    }, Ci.nsIEventTarget.DISPATCH_NORMAL);
  },

  _delayRunner: function(timer) {
    var ctx = this.context;
    try {
      if (typeof Thread === "undefined") return;
      ctx.callback.apply(ctx.self, ctx.args);
    } finally {
      this.context = null;
      timer.cancel();
    }
  }

};
