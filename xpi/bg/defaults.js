'use strict';

ns.local = (async () => {
  let defaults = {
    local: {
      debug: false,
      showCtxMenuItem: true,
      showCountBadge: true,
    },
    sync: {
      "global": false,
      "xss": true,
      "clearclick": true
    }
  }

  for (let [k, v] of Object.entries(defaults)) {
    let store = await Storage.get(k, k);
    if (k in store) {
      Object.assign(v, store[k]);
    }
    v.storage = k;
  }

  Object.assign(ns, defaults);

  // dynamic settings
  if (!ns.local.uuid) {
    await include("/lib/uuid.js");
    ns.local.uuid = uuid();
    ns.save(ns.local);
  }

  return ns.local;
})();
