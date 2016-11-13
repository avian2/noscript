var IPC = {
  MSG_CALL: "NoScript:remoteCall",
  registry: null,
  autoSync(obj, objName, methods) {
    if (!this.registry) this.registry = new Map();
    this.registry.set(objName, {
      reference: obj,
      methods: new Set(methods),
    });

    for (let method of methods) {
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
    switch(m.name) {
      case IPC.MSG_CALL:
        // ns.log(`Received ${m.name}, ${JSON.stringify(m.data)}`);
        let { objName, method, args } = m.data;
        IPC.call(objName, method, args);
        return true;
    }
    return false;
  },
};
