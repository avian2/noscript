var SafeSync = {

  async get(keys) {
    try {
      return await browser.storage.sync.get(keys);
    } catch (e) {
      debug(e, "Sync disabled? Falling back to local storage");
    }
    return await browser.storage.local.get(keys);
  },

  async set(obj) {
    try {
      return await browser.storage.sync.set(obj);
    } catch (e) {
      debug(e, "Sync disabled? Falling back to local storage");
    }
    return await browser.storage.local.set(obj);
  }

}
