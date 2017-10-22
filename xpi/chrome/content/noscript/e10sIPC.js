var IPC_MSG = {
  SYNC: "NoScript:syncUI",
  NOTIFY_META: "NoScript:notifyMetaRefresh",
  CLEARCLICK_WARNING: "NoScript:clearClickWarning",
},
IPC_P_MSG = {
  SERVICE_READY: "NoScript:ServiceReady",
  LOAD_SURROGATE: "NoScript:loadSurrogate",
  CALL: "NoScript:remoteCall",
  RESUME: "NoScript:resume",
  GET_PREF: "NoScript:getPref",
  GET_SNAPSHOT: "NoScript:getSnapshot",
  CALLBACK: "NoScript:callback",
}

var IPC = {
  logger: null,
  log(...args) {
    if (this.logger) {
      args[0] = `[${this.parent ? 'P' : 'C'}] ${args[0]}`;
      this.logger(...args);
    }
  },
  registry: null,
  autoSync(obj, objName, methods) {
    if (!this.registry) this.registry = new Map();
    this.registry.set(objName, {
      reference: obj,
      methods: new Set(methods),
    });

    for (let m of methods) {
      let method = m; // hack needed in Fx < 50
      if (!(method in obj)) {
        ns.log(`method ${method} not found in ${objName}\n`);
      }
      let func = obj[method];
      if (func._autoSynced) continue;
      (obj[method] = (...args) => {
        let stack = Components.stack;
        let caller = stack.caller;
        if (caller.name !== "call" || stack.filename !== caller.filename) {
          let process = IPC.parent || IPC.child;
          process.remote(objName, method, args);
        }
        return func.apply(obj, args);
      })._autoSynced = true;
    }
    return true;
  },
  call(objName, method, args) {
    let {reference, methods} = this.registry.get(objName);
    if (methods.has(method)) {
      reference[method].apply(reference, args);
    }
  },

  receiveMessage(m) {
    if (this.logger) this.log(`Received message ${m.name} - ${JSON.stringify(m.data)}`);
    switch(m.name) {
      case IPC_P_MSG.CALL:
        let { objName, method, args } = m.data;
        IPC.call(objName, method, args);
        return true;
    }
    return false;
  },
};
